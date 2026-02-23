import pool from '../database.js'
import { v4 as uuidv4 } from 'uuid'
import { getTenantId } from '../utils/tenantHelper.js'
import { getAccessScope, buildDealFilter } from '../services/permissionService.js'

/**
 * Lấy danh sách deals
 * Phân quyền động: getAccessScope(userId, 'deals', 'read')
 */
export const getDeals = async (req, res) => {
  const { id: userId } = req.user
  const { customer_id, assigned_to, stage, status } = req.query

  try {
    const tenantId = getTenantId(req)
    const access = await getAccessScope(userId, 'deals', 'read', tenantId)
    const { clause: accessClause, params: accessParams, paramIndex: paramIndexAfter } = buildDealFilter(access, 2)

    let params = [tenantId, ...accessParams]
    let paramIndex = paramIndexAfter

    let query = `
      SELECT 
        d.*,
        c.full_name as customer_full_name,
        c.phone as customer_phone,
        c.customer_id,
        e.full_name as assigned_employee_name,
        e.username as assigned_employee_username
      FROM deals d
      LEFT JOIN customers c ON d.customer_id = c.customer_id AND c.deleted_at IS NULL AND c.tenant_id = d.tenant_id
      LEFT JOIN employees e ON d.assigned_to = e.employee_id
      WHERE d.tenant_id = $1 AND (${accessClause})
    `

    if (assigned_to) {
      query += ` AND d.assigned_to = $${paramIndex++}`
      params.push(assigned_to)
    }

    // Filter theo customer_id
    if (customer_id) {
      query += ` AND d.customer_id = $${paramIndex++}`
      params.push(customer_id)
    }

    // Filter theo stage
    if (stage) {
      query += ` AND d.stage = $${paramIndex++}`
      params.push(stage)
    }

    // Filter theo status
    if (status) {
      query += ` AND d.status = $${paramIndex++}`
      params.push(status)
    }

    query += ' ORDER BY d.expected_closing_date ASC NULLS LAST, d.created_at DESC'

    const result = await pool.query(query, params)

    res.json({
      success: true,
      data: result.rows
    })
  } catch (error) {
    console.error('Lỗi getDeals:', error)
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi lấy danh sách deals.',
      error: error.message
    })
  }
}

/**
 * Tạo deal mới
 */
export const createDeal = async (req, res) => {
  const { role, id: userId } = req.user
  const { customer_id, title, amount, stage, expected_closing_date, assigned_to } = req.body
  const tenantId = getTenantId(req)

  try {
    if (!title) {
      return res.status(400).json({ success: false, message: 'Tiêu đề deal là bắt buộc.' })
    }

    if (customer_id) {
      const customerCheck = await pool.query(
        'SELECT customer_id FROM customers WHERE customer_id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
        [customer_id, tenantId]
      )
      if (customerCheck.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Khách hàng không tồn tại hoặc đã bị xóa.' })
      }
    }

    let finalAssignedTo = assigned_to
    if (role === 'sales') {
      finalAssignedTo = userId
    } else if (!finalAssignedTo) {
      finalAssignedTo = userId
    }

    if (finalAssignedTo) {
      const employeeCheck = await pool.query(
        'SELECT employee_id FROM employees WHERE employee_id = $1 AND tenant_id = $2 AND is_active = true',
        [finalAssignedTo, tenantId]
      )
      if (employeeCheck.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Nhân viên được gán không tồn tại hoặc không thuộc đơn vị của bạn.' })
      }
    }

    // Validate stage
    const validStages = ['tiep_can', 'tu_van', 'bao_gia', 'thuong_thao', 'thanh_cong']
    const finalStage = stage || 'tiep_can'
    if (!validStages.includes(finalStage)) {
      return res.status(400).json({
        success: false,
        message: 'Giai đoạn deal không hợp lệ.'
      })
    }

    // Validate amount
    const finalAmount = amount ? parseFloat(amount) : 0
    if (isNaN(finalAmount) || finalAmount < 0) {
      return res.status(400).json({
        success: false,
        message: 'Giá trị deal phải là số dương.'
      })
    }

    // Validate expected_closing_date
    let finalExpectedClosingDate = null
    if (expected_closing_date) {
      finalExpectedClosingDate = parseInt(expected_closing_date)
      if (isNaN(finalExpectedClosingDate) || finalExpectedClosingDate <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Ngày dự kiến đóng deal không hợp lệ.'
        })
      }
    }

    const dealId = uuidv4()
    const now = Date.now()

    const insertQuery = `
      INSERT INTO deals (
        deal_id, customer_id, title, amount, stage, status,
        expected_closing_date, assigned_to, tenant_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `
    const result = await pool.query(insertQuery, [
      dealId, customer_id || null, title.trim(), finalAmount, finalStage, 'active',
      finalExpectedClosingDate, finalAssignedTo, tenantId, now, now
    ])

    // Lấy thông tin đầy đủ với JOIN
    const fullQuery = `
      SELECT 
        d.*,
        c.full_name as customer_full_name,
        c.phone as customer_phone,
        e.full_name as assigned_employee_name,
        e.username as assigned_employee_username
      FROM deals d
      LEFT JOIN customers c ON d.customer_id = c.customer_id AND c.deleted_at IS NULL
      LEFT JOIN employees e ON d.assigned_to = e.employee_id
      WHERE d.deal_id = $1
    `

    const fullResult = await pool.query(fullQuery, [dealId])

    res.status(201).json({
      success: true,
      message: 'Tạo deal thành công!',
      data: fullResult.rows[0]
    })
  } catch (error) {
    console.error('Lỗi createDeal:', error)
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi tạo deal.',
      error: error.message
    })
  }
}

/**
 * Cập nhật deal (bao gồm chuyển stage)
 */
export const updateDeal = async (req, res) => {
  const { role, id: userId } = req.user
  const { id } = req.params
  const { title, amount, stage, status, expected_closing_date, assigned_to, customer_id } = req.body

  const tenantId = getTenantId(req)

  try {
    const dealCheck = await pool.query(
      'SELECT * FROM deals WHERE deal_id = $1 AND tenant_id = $2',
      [id, tenantId]
    )
    if (dealCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Deal không tồn tại.' })
    }
    const deal = dealCheck.rows[0]
    if (role === 'sales' && deal.assigned_to !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền cập nhật deal này.'
      })
    }

    // Kiểm tra customer nếu có thay đổi
    if (customer_id && customer_id !== deal.customer_id) {
      const customerCheck = await pool.query(
        'SELECT customer_id FROM customers WHERE customer_id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
        [customer_id, tenantId]
      )
      if (customerCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Khách hàng không tồn tại hoặc đã bị xóa.'
        })
      }
    }

    // Kiểm tra assigned_to nếu có thay đổi
    if (assigned_to && assigned_to !== deal.assigned_to) {
      // Sales không thể thay đổi assigned_to
      if (role === 'sales') {
        return res.status(403).json({
          success: false,
          message: 'Bạn không có quyền thay đổi người phụ trách deal.'
        })
      }

      const employeeCheck = await pool.query(
        'SELECT employee_id FROM employees WHERE employee_id = $1 AND tenant_id = $2 AND is_active = true',
        [assigned_to, tenantId]
      )
      if (employeeCheck.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Nhân viên được gán không thuộc đơn vị của bạn.' })
      }
    }

    // Validate stage nếu có
    if (stage) {
      const validStages = ['tiep_can', 'tu_van', 'bao_gia', 'thuong_thao', 'thanh_cong']
      if (!validStages.includes(stage)) {
        return res.status(400).json({
          success: false,
          message: 'Giai đoạn deal không hợp lệ.'
        })
      }
    }

    // Validate amount nếu có
    if (amount !== undefined) {
      const finalAmount = parseFloat(amount)
      if (isNaN(finalAmount) || finalAmount < 0) {
        return res.status(400).json({
          success: false,
          message: 'Giá trị deal phải là số dương.'
        })
      }
    }

    // Validate expected_closing_date nếu có
    let finalExpectedClosingDate = deal.expected_closing_date
    if (expected_closing_date !== undefined) {
      if (expected_closing_date === null || expected_closing_date === '') {
        finalExpectedClosingDate = null
      } else {
        finalExpectedClosingDate = parseInt(expected_closing_date)
        if (isNaN(finalExpectedClosingDate) || finalExpectedClosingDate <= 0) {
          return res.status(400).json({
            success: false,
            message: 'Ngày dự kiến đóng deal không hợp lệ.'
          })
        }
      }
    }

    // Validate status nếu có
    if (status) {
      const validStatuses = ['active', 'closed', 'cancelled']
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Trạng thái deal không hợp lệ.'
        })
      }
    }

    // Xây dựng query cập nhật
    const updateFields = []
    const updateValues = []
    let paramIndex = 1

    if (title !== undefined) {
      updateFields.push(`title = $${paramIndex++}`)
      updateValues.push(title.trim())
    }

    if (amount !== undefined) {
      updateFields.push(`amount = $${paramIndex++}`)
      updateValues.push(parseFloat(amount))
    }

    if (stage !== undefined) {
      updateFields.push(`stage = $${paramIndex++}`)
      updateValues.push(stage)
    }

    if (status !== undefined) {
      updateFields.push(`status = $${paramIndex++}`)
      updateValues.push(status)
    }

    if (expected_closing_date !== undefined) {
      updateFields.push(`expected_closing_date = $${paramIndex++}`)
      updateValues.push(finalExpectedClosingDate)
    }

    if (assigned_to !== undefined && role !== 'sales') {
      updateFields.push(`assigned_to = $${paramIndex++}`)
      updateValues.push(assigned_to)
    }

    if (customer_id !== undefined) {
      updateFields.push(`customer_id = $${paramIndex++}`)
      updateValues.push(customer_id || null)
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Không có trường nào để cập nhật.'
      })
    }

    // Thêm updated_at
    updateFields.push(`updated_at = $${paramIndex++}`)
    updateValues.push(Date.now())

    updateValues.push(id, tenantId)
    const updateQuery = `
      UPDATE deals 
      SET ${updateFields.join(', ')}
      WHERE deal_id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
      RETURNING *
    `
    const result = await pool.query(updateQuery, updateValues)

    // Lấy thông tin đầy đủ với JOIN
    const fullQuery = `
      SELECT 
        d.*,
        c.full_name as customer_full_name,
        c.phone as customer_phone,
        e.full_name as assigned_employee_name,
        e.username as assigned_employee_username
      FROM deals d
      LEFT JOIN customers c ON d.customer_id = c.customer_id AND c.deleted_at IS NULL
      LEFT JOIN employees e ON d.assigned_to = e.employee_id
      WHERE d.deal_id = $1
    `

    const fullResult = await pool.query(fullQuery, [id])

    res.json({
      success: true,
      message: 'Cập nhật deal thành công!',
      data: fullResult.rows[0]
    })
  } catch (error) {
    console.error('Lỗi updateDeal:', error)
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi cập nhật deal.',
      error: error.message
    })
  }
}
