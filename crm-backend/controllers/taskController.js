import pool from '../database.js'
import { v4 as uuidv4 } from 'uuid'

/**
 * Lấy danh sách tasks
 * Phân quyền: Sales chỉ thấy task của mình, Admin/Manager thấy tất cả
 */
export const getTasks = async (req, res) => {
  const { role, id: userId } = req.user
  const { assigned_to } = req.query // Filter theo nhân viên (chỉ Admin/Manager)

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
      LEFT JOIN customers c ON t.customer_id = c.customer_id AND c.deleted_at IS NULL
      LEFT JOIN employees e ON t.assigned_to = e.employee_id
      WHERE 1=1
    `
    const params = []

    // Phân quyền: Sales chỉ thấy task của mình
    if (role === 'sales') {
      query += ' AND t.assigned_to = $1'
      params.push(userId)
    } else if (assigned_to) {
      // Admin/Manager có thể lọc theo nhân viên
      query += ' AND t.assigned_to = $1'
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

  try {
    // Validation
    if (!title) {
      return res.status(400).json({
        success: false,
        message: 'Tiêu đề task là bắt buộc.'
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
      // Sales chỉ có thể tạo task cho chính mình
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
          message: 'Nhân viên được gán không tồn tại hoặc đã bị khóa.'
        })
      }
    }

    const task_id = uuidv4()
    const now = Date.now()
    const finalDueDate = due_date ? parseInt(due_date) : null

    const insertQuery = `
      INSERT INTO tasks (
        task_id, customer_id, title, due_date, priority, is_completed, created_at, assigned_to
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `

    const values = [
      task_id,
      customer_id || null,
      title,
      finalDueDate,
      priority || 'medium',
      false,
      now,
      finalAssignedTo
    ]

    const result = await pool.query(insertQuery, values)

    // Tạo thông báo cho nhân viên được gán task (nếu không phải chính người tạo)
    if (finalAssignedTo && finalAssignedTo !== userId) {
      try {
        const notificationId = uuidv4()
        await pool.query(
          `INSERT INTO notifications (
            notification_id, employee_id, type, title, message, is_read, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            notificationId,
            finalAssignedTo,
            'task_assigned',
            'Task mới được giao',
            `Bạn có task mới: "${title}"`,
            false,
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
  const { id } = req.params
  const { role, id: userId } = req.user
  const { is_completed, completion_content, title, due_date, priority } = req.body

  try {
    // Lấy thông tin task hiện tại
    const taskQuery = 'SELECT * FROM tasks WHERE task_id = $1'
    const taskResult = await pool.query(taskQuery, [id])

    if (taskResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Task không tồn tại.'
      })
    }

    const task = taskResult.rows[0]

    // Kiểm tra quyền: Sales chỉ sửa task của mình
    if (role === 'sales' && task.assigned_to !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền sửa task này.'
      })
    }

    // Nếu đánh dấu hoàn thành và có completion_content
    if (is_completed === true && completion_content) {
      // Kiểm tra customer_id có tồn tại không
      if (!task.customer_id) {
        return res.status(400).json({
          success: false,
          message: 'Task này không liên kết với khách hàng, không thể tạo interaction.'
        })
      }

      // Tạo interaction từ completion_content
      const interactionId = uuidv4()
      const now = Date.now()

      const interactionQuery = `
        INSERT INTO interactions (
          interaction_id, customer_id, interaction_type, content, 
          interaction_date, employee_id, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `

      await pool.query(interactionQuery, [
        interactionId,
        task.customer_id,
        'other', // Loại tương tác mặc định cho task completion
        `[Hoàn thành Task] ${completion_content}`,
        now,
        userId,
        'success',
        now
      ])
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
      return res.status(400).json({
        success: false,
        message: 'Không có trường nào để cập nhật.'
      })
    }

    updateValues.push(id)
    const updateQuery = `
      UPDATE tasks 
      SET ${updateFields.join(', ')}
      WHERE task_id = $${paramIndex}
      RETURNING *
    `

    const result = await pool.query(updateQuery, updateValues)

    res.json({
      success: true,
      message: 'Cập nhật task thành công!',
      data: result.rows[0]
    })
  } catch (error) {
    console.error('Lỗi updateTask:', error)
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi cập nhật task.',
      error: error.message
    })
  }
}

/**
 * Xóa task
 */
export const deleteTask = async (req, res) => {
  const { id } = req.params
  const { role, id: userId } = req.user

  try {
    // Lấy thông tin task
    const taskQuery = 'SELECT * FROM tasks WHERE task_id = $1'
    const taskResult = await pool.query(taskQuery, [id])

    if (taskResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Task không tồn tại.'
      })
    }

    const task = taskResult.rows[0]

    // Kiểm tra quyền
    if (role === 'sales' && task.assigned_to !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền xóa task này.'
      })
    }

    // Xóa task
    await pool.query('DELETE FROM tasks WHERE task_id = $1', [id])

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

