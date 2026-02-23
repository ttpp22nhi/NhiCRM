import pool from '../database.js'
import { v4 as uuidv4 } from 'uuid'
import { getTenantId } from '../utils/tenantHelper.js'

/**
 * Lấy danh sách tasks — theo tenant
 */
export const getTasks = async (req, res) => {
  const { role, id: userId } = req.user
  const { assigned_to } = req.query
  const tenantId = getTenantId(req)

  try {
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
      WHERE t.tenant_id = $1
    `
    const params = [tenantId]

    if (role === 'sales') {
      query += ' AND t.assigned_to = $2'
      params.push(userId)
    } else if (assigned_to) {
      query += ' AND t.assigned_to = $2'
      params.push(assigned_to)
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

/**
 * Tạo task mới
 */
export const createTask = async (req, res) => {
  const { role, id: userId } = req.user
  const { customer_id, title, due_date, priority, assigned_to } = req.body
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
    }

    const task_id = uuidv4()
    const now = Date.now()
    const finalDueDate = due_date ? parseInt(due_date) : null

    const insertQuery = `
      INSERT INTO tasks (
        task_id, customer_id, title, due_date, priority, is_completed, created_at, assigned_to, tenant_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `
    const values = [
      task_id, customer_id || null, title, finalDueDate, priority || 'medium', false, now, finalAssignedTo, tenantId
    ]

    const result = await pool.query(insertQuery, values)

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
  const { is_completed, completion_content, title, due_date, priority } = req.body || {}
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
          priority
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

    res.json({
      success: true,
      message: 'Cập nhật task thành công!',
      data: result.rows[0]
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
    await pool.query('DELETE FROM tasks WHERE task_id = $1 AND tenant_id = $2', [id, tenantId])

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

