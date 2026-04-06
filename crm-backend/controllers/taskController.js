import pool from '../database.js'
import { v4 as uuidv4 } from 'uuid'
import { getTenantId } from '../utils/tenantHelper.js'
import { updateDealTaskMetadata } from '../services/dealMetadataService.js'
import { generateDisplayCode } from '../services/displayCodeService.js'
import { getAssignableEmployeeIds } from '../services/assignableEmployeesService.js'
import { buildScopeCondition } from '../services/scopeService.js'

/**
 * Lấy danh sách tasks — theo phân cấp (tenant + director/manager/leader/sales)
 */
export const getTasks = async (req, res) => {
  const { role, id: userId } = req.user
  const { assigned_to: assignedToFilter } = req.query
  const tenantId = getTenantId(req)

  try {
    const { scopeClause, scopeParams } = await buildScopeCondition(tenantId, userId, role, 't.assigned_to')
    const params = [tenantId, ...scopeParams]
    let paramIndex = params.length + 1

    let query = `
      SELECT 
        t.*,
        c.full_name as customer_full_name,
        c.phone as customer_phone,
        c.customer_id,
        e.full_name as assigned_employee_name,
        e.username as assigned_employee_username
      FROM tasks t
      LEFT JOIN customers c ON t.customer_id = c.customer_id AND c.deleted_at IS NULL AND c.tenant_id = t.tenant_id
      LEFT JOIN employees e ON t.assigned_to = e.employee_id
      WHERE t.tenant_id = $1 AND (${scopeClause})
    `

    if (assignedToFilter) {
      query += ` AND t.assigned_to = $${paramIndex++}`
      params.push(assignedToFilter)
    }

    query += ' ORDER BY t.due_date ASC NULLS LAST, t.created_at DESC'

    const result = await pool.query(query, params)

    res.json({
      success: true,
      data: result.rows
    })
  } catch (error) {
    console.error('Lỗi getTasks:', error)
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi lấy danh sách tasks.',
      error: error.message
    })
  }
}

const taskSelectFields = `
  t.*,
  c.full_name as customer_full_name,
  c.phone as customer_phone,
  c.customer_id,
  e.full_name as assigned_employee_name,
  e.username as assigned_employee_username
`

/**
 * Lấy một task theo task_id — áp dụng scope phân cấp
 */
export const getTaskById = async (req, res) => {
  const { role, id: userId } = req.user
  const { id: taskId } = req.params
  const tenantId = getTenantId(req)

  try {
    const { scopeClause, scopeParams } = await buildScopeCondition(tenantId, userId, role, 't.assigned_to')
    const params = [tenantId, ...scopeParams, taskId]
    const taskIdParamIndex = 2 + scopeParams.length

    const query = `
      SELECT ${taskSelectFields}
      FROM tasks t
      LEFT JOIN customers c ON t.customer_id = c.customer_id AND c.deleted_at IS NULL AND c.tenant_id = t.tenant_id
      LEFT JOIN employees e ON t.assigned_to = e.employee_id
      WHERE t.tenant_id = $1 AND (${scopeClause}) AND t.task_id = $${taskIdParamIndex}
    `
    const result = await pool.query(query, params)
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy task.' })
    }
    res.json({ success: true, data: result.rows[0] })
  } catch (error) {
    console.error('Lỗi getTaskById:', error)
    res.status(500).json({ success: false, message: 'Lỗi hệ thống.', error: error.message })
  }
}

/**
 * Lấy task theo display_code — áp dụng scope phân cấp
 */
export const getTaskByDisplayCode = async (req, res) => {
  const { role, id: userId } = req.user
  const { display_code: displayCode } = req.query
  const tenantId = getTenantId(req)

  if (!displayCode || typeof displayCode !== 'string' || !displayCode.trim()) {
    return res.status(400).json({ success: false, message: 'Thiếu display_code.' })
  }

  const code = displayCode.trim()
  if (!/^TSK-\d{4}-\d{3}$/.test(code)) {
    return res.status(400).json({ success: false, message: 'Mã task không hợp lệ.' })
  }

  try {
    const { scopeClause, scopeParams } = await buildScopeCondition(tenantId, userId, role, 't.assigned_to')
    const params = [tenantId, ...scopeParams, code]
    const codeParamIndex = 2 + scopeParams.length

    const query = `
      SELECT ${taskSelectFields}
      FROM tasks t
      LEFT JOIN customers c ON t.customer_id = c.customer_id AND c.deleted_at IS NULL AND c.tenant_id = t.tenant_id
      LEFT JOIN employees e ON t.assigned_to = e.employee_id
      WHERE t.tenant_id = $1 AND (${scopeClause}) AND t.display_code = $${codeParamIndex}
    `
    const result = await pool.query(query, params)
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy task với mã này.' })
    }
    res.json({ success: true, data: result.rows[0] })
  } catch (error) {
    console.error('Lỗi getTaskByDisplayCode:', error)
    res.status(500).json({ success: false, message: 'Lỗi hệ thống.', error: error.message })
  }
}

/**
 * Tạo task mới
 */
export const createTask = async (req, res) => {
  const { role, id: userId } = req.user
  const { customer_id, title, due_date, priority, assigned_to, related_type, related_id } = req.body
  const tenantId = getTenantId(req)

  try {
    if (!title) {
      return res.status(400).json({ success: false, message: 'Tiêu đề task là bắt buộc.' })
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
        return res.status(404).json({ success: false, message: 'Nhân viên được gán không thuộc đơn vị của bạn.' })
      }
      const allowedIds = await getAssignableEmployeeIds(tenantId, userId, role)
      if (!allowedIds.includes(finalAssignedTo)) {
        return res.status(403).json({ success: false, message: 'Bạn không được phép gán task cho nhân viên này (vượt quyền phân cấp).' })
      }
    }

    const task_id = uuidv4()
    const now = Date.now()
    const finalDueDate = due_date ? parseInt(due_date) : null
    const finalRelatedType = (related_type === 'DEAL' || related_type === 'CUSTOMER') ? related_type : null
    const finalRelatedId = (finalRelatedType && related_id) ? String(related_id).trim() : null

    let parentDisplayCode = null
    if (finalRelatedType === 'DEAL' && finalRelatedId) {
      const dealRow = await pool.query(
        'SELECT display_code FROM deals WHERE deal_id = $1 AND tenant_id = $2',
        [finalRelatedId, tenantId]
      )
      if (dealRow.rows.length > 0 && dealRow.rows[0].display_code) {
        parentDisplayCode = dealRow.rows[0].display_code
      }
    }

    const displayCode = await generateDisplayCode('TSK', tenantId)

    const insertQuery = `
      INSERT INTO tasks (
        task_id, customer_id, title, due_date, priority, is_completed, created_at, assigned_to, tenant_id, related_type, related_id, display_code, parent_display_code
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `
    const values = [
      task_id, customer_id || null, title, finalDueDate, priority || 'medium', false, now, finalAssignedTo, tenantId,
      finalRelatedType, finalRelatedId, displayCode, parentDisplayCode
    ]

    const result = await pool.query(insertQuery, values)

    if (finalRelatedType === 'DEAL' && finalRelatedId) {
      updateDealTaskMetadata(finalRelatedId, tenantId).catch((e) => console.error('updateDealTaskMetadata:', e))
    }

    if (finalAssignedTo && finalAssignedTo !== userId) {
      try {
        const notificationId = uuidv4()
        await pool.query(
          `INSERT INTO public.notifications (
            notification_id, employee_id, type, title, message, is_read, tenant_id, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            notificationId,
            finalAssignedTo,
            'task_assigned',
            'Task mới được giao',
            `Bạn có task mới: "${title}"`,
            false,
            tenantId,
            now
          ]
        )
      } catch (notifError) {
        console.error('Lỗi tạo thông báo:', notifError)
        // Không throw error, chỉ log
      }
    }

    res.status(201).json({
      success: true,
      message: 'Tạo task thành công!',
      data: result.rows[0]
    })
  } catch (error) {
    console.error('Lỗi createTask:', error)
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi tạo task.',
      error: error.message
    })
  }
}

/**
 * Cập nhật task (chủ yếu để đánh dấu hoàn thành)
 * Khi hoàn thành, tự động tạo interaction
 */
export const updateTask = async (req, res) => {
  // Log request để debug
  console.log('=== updateTask Request ===')
  console.log('Params:', req.params)
  console.log('Body:', req.body)
  console.log('User:', req.user)
  
  const { id } = req.params
  const { role, id: userId } = req.user || {}
  const { is_completed, completion_content, title, due_date, priority, assigned_to, customer_id: bodyCustomerId } = req.body || {}
  const tenantId = getTenantId(req)

  if (!req.user || !userId) {
    console.error('Lỗi: req.user không tồn tại hoặc không có userId')
    return res.status(401).json({
      success: false,
      message: 'Không xác thực được người dùng.',
      error: 'Token không hợp lệ hoặc đã hết hạn.'
    })
  }

  try {
    const taskQuery = 'SELECT * FROM public.tasks WHERE task_id = $1 AND tenant_id = $2'
    const taskResult = await pool.query(taskQuery, [id, tenantId])

    if (taskResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Task không tồn tại.',
        error: `Task với ID ${id} không được tìm thấy trong database.`
      })
    }

    const task = taskResult.rows[0]

    // Kiểm tra quyền: Sales chỉ sửa task của mình
    if (role === 'sales' && task.assigned_to !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền sửa task này.',
        error: `Sales chỉ có thể sửa task được gán cho mình. Task này được gán cho employee_id: ${task.assigned_to}, nhưng bạn là: ${userId}`
      })
    }

    if (assigned_to !== undefined && assigned_to !== task.assigned_to) {
      if (role === 'sales') {
        return res.status(403).json({ success: false, message: 'Bạn không có quyền thay đổi người được gán task.' })
      }
      const empCheck = await pool.query(
        'SELECT employee_id FROM employees WHERE employee_id = $1 AND tenant_id = $2 AND is_active = true',
        [assigned_to, tenantId]
      )
      if (empCheck.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Nhân viên được gán không thuộc đơn vị của bạn.' })
      }
      const allowedIds = await getAssignableEmployeeIds(tenantId, userId, role)
      if (!allowedIds.includes(assigned_to)) {
        return res.status(403).json({ success: false, message: 'Bạn không được phép gán task cho nhân viên này (vượt quyền phân cấp).' })
      }
    }

    // Rule: Task từ Deal — không cho đổi khách hàng trên task; phải đổi trên Deal.
    const isFromDeal = task.related_type === 'DEAL' && task.related_id
    if (isFromDeal && bodyCustomerId !== undefined) {
      const normalizedBody = bodyCustomerId == null ? null : String(bodyCustomerId).trim() || null
      const currentCustomer = task.customer_id || null
      if (normalizedBody !== currentCustomer) {
        return res.status(400).json({
          success: false,
          message: 'Task này thuộc cơ hội (Deal). Để đổi khách hàng, vui lòng chỉnh tại Cơ hội tương ứng.',
          error: 'customer_id cannot be changed on a task linked to a deal'
        })
      }
    }

    // Rule: Task độc lập — cho phép cập nhật customer_id (validate tồn tại, cùng tenant, chưa xóa).
    if (!isFromDeal && bodyCustomerId !== undefined) {
      const newCustomerId = bodyCustomerId == null || bodyCustomerId === '' ? null : String(bodyCustomerId).trim()
      if (newCustomerId) {
        const customerCheck = await pool.query(
          'SELECT customer_id FROM customers WHERE customer_id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
          [newCustomerId, tenantId]
        )
        if (customerCheck.rows.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'Khách hàng không tồn tại hoặc đã bị xóa.',
            error: 'customer_id invalid or deleted'
          })
        }
      }
    }

    // Nếu đánh dấu hoàn thành và có completion_content
    if (is_completed === true && completion_content) {
      // Kiểm tra customer_id có tồn tại không
      if (!task.customer_id) {
        return res.status(400).json({
          success: false,
          message: 'Task này không liên kết với khách hàng, không thể tạo interaction.',
          error: `Task ${id} không có customer_id. Để hoàn thành task với kết quả, task phải được liên kết với một khách hàng.`
        })
      }

      // Kiểm tra customer có tồn tại và chưa bị xóa không
      const customerCheck = await pool.query(
        'SELECT customer_id FROM public.customers WHERE customer_id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
        [task.customer_id, tenantId]
      )
      
      if (customerCheck.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Khách hàng liên kết với task này không tồn tại hoặc đã bị xóa.',
          error: `Customer với ID ${task.customer_id} không tồn tại hoặc đã bị xóa (soft delete).`
        })
      }

      // Tạo interaction từ completion_content
      try {
        const interactionId = uuidv4()
        const now = Date.now()

        const interactionQuery = `
          INSERT INTO public.interactions (
            interaction_id, customer_id, interaction_type, content,
            interaction_date, employee_id, status, tenant_id, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING *
        `
        await pool.query(interactionQuery, [
          interactionId, task.customer_id, 'other', `[Hoàn thành Task] ${completion_content}`,
          now, userId, 'success', tenantId, now
        ])
      } catch (interactionError) {
        console.error('Lỗi khi tạo interaction:', interactionError)
        return res.status(500).json({
          success: false,
          message: 'Lỗi khi tạo interaction từ kết quả công việc.',
          error: interactionError.message,
          details: 'Không thể lưu kết quả công việc vào lịch sử tương tác. Vui lòng thử lại.'
        })
      }
    }

    // Cập nhật task
    const updateFields = []
    const updateValues = []
    let paramIndex = 1

    if (is_completed !== undefined) {
      updateFields.push(`is_completed = $${paramIndex++}`)
      updateValues.push(is_completed)
    }

    if (title !== undefined) {
      updateFields.push(`title = $${paramIndex++}`)
      updateValues.push(title)
    }

    if (due_date !== undefined) {
      updateFields.push(`due_date = $${paramIndex++}`)
      updateValues.push(due_date ? parseInt(due_date) : null)
    }

    if (priority !== undefined) {
      updateFields.push(`priority = $${paramIndex++}`)
      updateValues.push(priority)
    }

    if (assigned_to !== undefined) {
      updateFields.push(`assigned_to = $${paramIndex++}`)
      updateValues.push(assigned_to)
    }

    // Chỉ task không từ Deal mới được cập nhật customer_id (đã validate ở trên).
    if (!isFromDeal && bodyCustomerId !== undefined) {
      const newCustomerId = bodyCustomerId == null || bodyCustomerId === '' ? null : String(bodyCustomerId).trim()
      updateFields.push(`customer_id = $${paramIndex++}`)
      updateValues.push(newCustomerId)
    }

    if (updateFields.length === 0) {
      console.log('Không có trường nào để cập nhật. Body:', req.body)
      return res.status(400).json({
        success: false,
        message: 'Không có trường nào để cập nhật.',
        error: 'Tất cả các trường trong request đều undefined hoặc null.',
        receivedBody: req.body,
        debug: {
          is_completed,
          completion_content,
          title,
          due_date,
          priority,
          customer_id: bodyCustomerId
        }
      })
    }

    updateValues.push(id, tenantId)
    const updateQuery = `
      UPDATE public.tasks 
      SET ${updateFields.join(', ')}
      WHERE task_id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
      RETURNING *
    `

    console.log('Update query:', updateQuery)
    console.log('Update values:', updateValues)
    console.log('Task ID:', id)

    const result = await pool.query(updateQuery, updateValues)
    
    console.log('Update result:', result.rows.length > 0 ? 'Success' : 'No rows updated')

    if (result.rows.length === 0) {
      return res.status(500).json({
        success: false,
        message: 'Cập nhật task thất bại.',
        error: 'Không có dòng nào được cập nhật. Có thể task đã bị xóa hoặc có lỗi trong quá trình cập nhật.'
      })
    }

    const updated = result.rows[0]
    if (updated.related_type === 'DEAL' && updated.related_id) {
      updateDealTaskMetadata(updated.related_id, tenantId).catch((e) => console.error('updateDealTaskMetadata:', e))
    }

    res.json({
      success: true,
      message: 'Cập nhật task thành công!',
      data: updated
    })
  } catch (error) {
    console.error('Lỗi updateTask:', error)
    console.error('Chi tiết lỗi:', {
      taskId: id,
      userId,
      role,
      body: req.body,
      stack: error.stack
    })
    
    // Kiểm tra loại lỗi cụ thể
    let errorMessage = 'Lỗi hệ thống khi cập nhật task.'
    let statusCode = 500
    
    if (error.code === '23505') { // Unique violation
      errorMessage = 'Dữ liệu trùng lặp. Vui lòng kiểm tra lại.'
      statusCode = 400
    } else if (error.code === '23503') { // Foreign key violation
      errorMessage = 'Dữ liệu tham chiếu không hợp lệ.'
      statusCode = 400
    } else if (error.code === '42P01') { // Table does not exist
      errorMessage = 'Bảng không tồn tại trong database.'
      statusCode = 500
    }
    
    res.status(statusCode).json({
      success: false,
      message: errorMessage,
      error: error.message,
      errorCode: error.code,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
}

/**
 * Xóa task
 */
export const deleteTask = async (req, res) => {
  const { id } = req.params
  const { role, id: userId } = req.user
  const tenantId = getTenantId(req)

  try {
    const taskQuery = 'SELECT * FROM tasks WHERE task_id = $1 AND tenant_id = $2'
    const taskResult = await pool.query(taskQuery, [id, tenantId])
    if (taskResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Task không tồn tại.' })
    }
    const task = taskResult.rows[0]
    if (role === 'sales' && task.assigned_to !== userId) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền xóa task này.' })
    }
    const dealIdForMeta = task.related_type === 'DEAL' && task.related_id ? task.related_id : null

    await pool.query('DELETE FROM tasks WHERE task_id = $1 AND tenant_id = $2', [id, tenantId])

    if (dealIdForMeta) {
      updateDealTaskMetadata(dealIdForMeta, tenantId).catch((e) => console.error('updateDealTaskMetadata:', e))
    }

    res.json({
      success: true,
      message: 'Xóa task thành công!'
    })
  } catch (error) {
    console.error('Lỗi deleteTask:', error)
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi xóa task.',
      error: error.message
    })
  }
}

