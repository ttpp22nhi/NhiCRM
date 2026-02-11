import pool from '../database.js'
import { v4 as uuidv4 } from 'uuid'

/**
 * Lấy danh sách deals
 * Phân quyền: Sales chỉ thấy deal của mình, Admin/Manager thấy tất cả
 */
export const getDeals = async (req, res) => {
  const { role, id: userId } = req.user
  const { customer_id, assigned_to, stage, status } = req.query // Filters

  try {
    let query = `
      SELECT 
        d.*,
        c.full_name as customer_full_name,
        c.phone as customer_phone,
        c.customer_id,
        e.full_name as assigned_employee_name,
        e.username as assigned_employee_username
      FROM deals d
      LEFT JOIN customers c ON d.customer_id = c.customer_id AND c.deleted_at IS NULL
      LEFT JOIN employees e ON d.assigned_to = e.employee_id
      WHERE 1=1
    `
    const params = []
    let paramIndex = 1

    // Phân quyền: Sales chỉ thấy deal của mình
    if (role === 'sales') {
      query += ` AND d.assigned_to = $${paramIndex++}`
      params.push(userId)
    } else if (assigned_to) {
      // Admin/Manager có thể lọc theo nhân viên
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

  try {
    // Validation
    if (!title) {
      return res.status(400).json({
        success: false,
        message: 'Tiêu đề deal là bắt buộc.'
      })
    }

    // Kiểm tra customer nếu có
    if (customer_id) {
      const customerCheck = await pool.query(
        'SELECT customer_id FROM customers WHERE customer_id = $1 AND deleted_at IS NULL',
        [customer_id]
      )
      if (customerCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Khách hàng không tồn tại hoặc đã bị xóa.'
        })
      }
    }

    // Xác định assigned_to
    let finalAssignedTo = assigned_to
    if (role === 'sales') {
      // Sales chỉ có thể tạo deal cho chính mình
      finalAssignedTo = userId
    } else if (!finalAssignedTo) {
      // Admin/Manager nếu không chỉ định thì gán cho chính mình
      finalAssignedTo = userId
    }

    // Kiểm tra assigned_to có tồn tại không
    if (finalAssignedTo) {
      const employeeCheck = await pool.query(
        'SELECT employee_id FROM employees WHERE employee_id = $1 AND is_active = true',
        [finalAssignedTo]
      )
      if (employeeCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Nhân viên được gán không tồn tại hoặc không hoạt động.'
        })
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
        expected_closing_date, assigned_to, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `

    const result = await pool.query(insertQuery, [
      dealId,
      customer_id || null,
      title.trim(),
      finalAmount,
      finalStage,
      'active',
      finalExpectedClosingDate,
      finalAssignedTo,
      now,
      now
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

  try {
    // Kiểm tra deal có tồn tại không
    const dealCheck = await pool.query(
      'SELECT * FROM deals WHERE deal_id = $1',
      [id]
    )

    if (dealCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Deal không tồn tại.'
      })
    }

    const deal = dealCheck.rows[0]

    // Phân quyền: Sales chỉ có thể cập nhật deal của mình
    if (role === 'sales' && deal.assigned_to !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền cập nhật deal này.'
      })
    }

    // Kiểm tra customer nếu có thay đổi
    if (customer_id && customer_id !== deal.customer_id) {
      const customerCheck = await pool.query(
        'SELECT customer_id FROM customers WHERE customer_id = $1 AND deleted_at IS NULL',
        [customer_id]
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
        'SELECT employee_id FROM employees WHERE employee_id = $1 AND is_active = true',
        [assigned_to]
      )
      if (employeeCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Nhân viên được gán không tồn tại hoặc không hoạt động.'
        })
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

    // Thêm deal_id vào cuối
    updateValues.push(id)

    const updateQuery = `
      UPDATE deals 
      SET ${updateFields.join(', ')}
      WHERE deal_id = $${paramIndex}
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
