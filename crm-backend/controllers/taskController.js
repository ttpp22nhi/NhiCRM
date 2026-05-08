import pool from '../database.js'
import { v4 as uuidv4 } from 'uuid'
import { getTenantId } from '../utils/tenantHelper.js'
import { updateDealTaskMetadata } from '../services/dealMetadataService.js'
import { generateDisplayCode } from '../services/displayCodeService.js'
import { getAssignableEmployeeIds } from '../services/assignableEmployeesService.js'
import { buildScopeCondition } from '../services/scopeService.js'
import { syncKpiForInteraction } from '../services/kpiFromDealsSyncService.js'

const MAX_TASK_DESCRIPTION_LEN = 4000

function normalizeTaskDescription(v) {
  if (v == null || v === '') return null
  const s = String(v).trim()
  if (!s) return null
  return s.length > MAX_TASK_DESCRIPTION_LEN ? s.slice(0, MAX_TASK_DESCRIPTION_LEN) : s
}

/**
 * Ghi nhật ký vào timeline của Deal khi user thao tác task gắn deal.
 * (Không chặn luồng nếu lỗi.)
 */
async function logDealActivityForTask({ tenantId, userId, dealId, dealStage, taskId, content }) {
  if (!tenantId || !dealId || !taskId || !content) return
  try {
    await pool.query(
      `INSERT INTO deal_activities (id, deal_id, stage, content, type, created_by, tenant_id, created_at, task_id)
       VALUES ($1, $2, $3, $4, 'system', $5, $6, $7, $8)`,
      [uuidv4(), dealId, dealStage || null, content, userId || null, tenantId, Date.now(), taskId]
    )
  } catch (err) {
    if (err?.code !== '42P01' && err?.code !== '42703') {
      console.error('logDealActivityForTask:', err)
    }
  }
}

/**
 * Ghi 1 activity vào timeline của Task (đối với mọi task, không chỉ task của deal).
 */
async function logTaskActivity({ tenantId, taskId, userId, content, type = 'system' }) {
  if (!tenantId || !taskId || !content) return
  try {
    await pool.query(
      `INSERT INTO task_activities (id, task_id, content, type, created_by, tenant_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [uuidv4(), taskId, content, type, userId || null, tenantId, Date.now()]
    )
  } catch (err) {
    if (err?.code !== '42P01' && err?.code !== '42703') {
      console.error('logTaskActivity:', err)
    }
  }
}

/**
 * Lấy danh sách tasks — theo phân cấp (tenant + director/manager/leader/sales)
 * Hỗ trợ filter:
 *   - assigned_to: lọc theo nhân viên được giao
 *   - related_type: 'DEAL' | 'CUSTOMER' | 'CBS_ORDER' | 'NONE' (NONE = task độc lập)
 *   - related_id:   khi cần lọc đúng 1 thực thể
 */
export const getTasks = async (req, res) => {
  const { role, id: userId } = req.user
  const { assigned_to: assignedToFilter, related_type: relatedTypeFilter, related_id: relatedIdFilter } = req.query
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
        e.username as assigned_employee_username,
        d.deal_id  as linked_deal_id,
        d.title    as linked_deal_title,
        d.display_code as linked_deal_display_code,
        d.is_deleted   as linked_deal_is_deleted
      FROM tasks t
      LEFT JOIN customers c ON t.customer_id = c.customer_id AND c.deleted_at IS NULL AND c.tenant_id = t.tenant_id
      LEFT JOIN employees e ON t.assigned_to = e.employee_id
      LEFT JOIN deals     d ON t.related_type = 'DEAL' AND t.related_id = d.deal_id AND d.tenant_id = t.tenant_id
      WHERE t.tenant_id = $1 AND (${scopeClause})
    `

    if (assignedToFilter) {
      query += ` AND t.assigned_to = $${paramIndex++}`
      params.push(assignedToFilter)
    }

    if (relatedTypeFilter) {
      const rt = String(relatedTypeFilter).toUpperCase()
      if (rt === 'NONE') {
        query += ` AND t.related_type IS NULL`
      } else if (['DEAL', 'CUSTOMER', 'CBS_ORDER'].includes(rt)) {
        query += ` AND t.related_type = $${paramIndex++}`
        params.push(rt)
      }
    }

    if (relatedIdFilter) {
      query += ` AND t.related_id = $${paramIndex++}`
      params.push(String(relatedIdFilter))
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
  e.username as assigned_employee_username,
  d.deal_id  as linked_deal_id,
  d.title    as linked_deal_title,
  d.display_code as linked_deal_display_code,
  d.is_deleted   as linked_deal_is_deleted
`

const taskSelectFromJoin = `
  FROM tasks t
  LEFT JOIN customers c ON t.customer_id = c.customer_id AND c.deleted_at IS NULL AND c.tenant_id = t.tenant_id
  LEFT JOIN employees e ON t.assigned_to = e.employee_id
  LEFT JOIN deals     d ON t.related_type = 'DEAL' AND t.related_id = d.deal_id AND d.tenant_id = t.tenant_id
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
      ${taskSelectFromJoin}
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
      ${taskSelectFromJoin}
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
  const { customer_id, title, due_date, priority, assigned_to, related_type, related_id, description } = req.body
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
    const allowedTypes = ['DEAL', 'CUSTOMER', 'CBS_ORDER']
    const finalRelatedType = allowedTypes.includes(related_type) ? related_type : null
    const finalRelatedId = (finalRelatedType && related_id) ? String(related_id).trim() : null

    let parentDisplayCode = null
    let dealRow = null
    if (finalRelatedType === 'DEAL' && finalRelatedId) {
      const r = await pool.query(
        'SELECT deal_id, display_code, customer_id, stage, is_deleted FROM deals WHERE deal_id = $1 AND tenant_id = $2',
        [finalRelatedId, tenantId]
      )
      if (r.rows.length === 0 || r.rows[0].is_deleted) {
        return res.status(404).json({ success: false, message: 'Cơ hội (Deal) không tồn tại hoặc đã bị xoá.' })
      }
      dealRow = r.rows[0]
      parentDisplayCode = dealRow.display_code || null
    }

    const displayCode = await generateDisplayCode('TSK', tenantId)

    // Khi task gắn DEAL: nếu request không truyền customer_id → tự lấy customer_id của deal
    // (đảm bảo task luôn khớp khách hàng của deal).
    let finalCustomerId = customer_id || null
    if (finalRelatedType === 'DEAL' && dealRow && !finalCustomerId) {
      finalCustomerId = dealRow.customer_id || null
    }

    const finalDescription = normalizeTaskDescription(description)

    const insertQuery = `
      INSERT INTO tasks (
        task_id, customer_id, title, description, due_date, priority, is_completed, created_at, assigned_to, tenant_id, related_type, related_id, display_code, parent_display_code
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `
    const values = [
      task_id, finalCustomerId, title, finalDescription, finalDueDate, priority || 'medium', false, now, finalAssignedTo, tenantId,
      finalRelatedType, finalRelatedId, displayCode, parentDisplayCode
    ]

    const result = await pool.query(insertQuery, values)

    if (finalRelatedType === 'DEAL' && finalRelatedId) {
      updateDealTaskMetadata(finalRelatedId, tenantId).catch((e) => console.error('updateDealTaskMetadata:', e))
      // Ghi vào timeline cơ hội: ai tạo task, mã, tiêu đề.
      logDealActivityForTask({
        tenantId,
        userId,
        dealId: finalRelatedId,
        dealStage: dealRow?.stage,
        taskId: task_id,
        content: `[${displayCode}] Đã tạo công việc mới: "${title}".`,
      })
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
 *
 * Quy tắc khi `is_completed=true`:
 *  - Task gắn DEAL/CUSTOMER có customer_id → tạo interaction + cộng `actual_approach_count`.
 *  - Task gắn CBS_ORDER (không có customer_id): KHÔNG tạo interaction, chỉ ghi task_activity
 *    để đồng bộ trạng thái (vì đơn CBS đã có duyệt riêng).
 *  - Task độc lập không có khách hàng: cho phép hoàn thành (không ghi interaction).
 */
export const updateTask = async (req, res) => {
  const { id } = req.params
  const { role, id: userId } = req.user || {}
  const { is_completed, completion_content, title, due_date, priority, assigned_to, customer_id: bodyCustomerId, description: bodyDescription } = req.body || {}
  const tenantId = getTenantId(req)

  if (!req.user || !userId) {
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

    // Sales chỉ sửa task của mình
    if (role === 'sales' && task.assigned_to !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền sửa task này.'
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

    const isFromDeal = task.related_type === 'DEAL' && task.related_id
    const isFromCbs  = task.related_type === 'CBS_ORDER' && task.related_id

    // Task từ DEAL không cho đổi customer trên task; phải đổi tại Deal.
    if (isFromDeal && bodyCustomerId !== undefined) {
      const normalizedBody = bodyCustomerId == null ? null : String(bodyCustomerId).trim() || null
      const currentCustomer = task.customer_id || null
      if (normalizedBody !== currentCustomer) {
        return res.status(400).json({
          success: false,
          message: 'Task này thuộc cơ hội (Deal). Để đổi khách hàng, vui lòng chỉnh tại Cơ hội tương ứng.',
        })
      }
    }

    // Task độc lập (không gắn deal/cbs) — cho phép cập nhật customer_id (validate tồn tại).
    if (!isFromDeal && !isFromCbs && bodyCustomerId !== undefined) {
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
          })
        }
      }
    }

    // Đánh dấu hoàn thành + có nội dung kết quả
    if (is_completed === true && completion_content) {
      if (isFromCbs) {
        // CBS task: không tạo interaction, không cộng KPI, chỉ ghi task_activity và để
        // người duyệt CBS đối chiếu thủ công.
        await logTaskActivity({
          tenantId,
          taskId: id,
          userId,
          content: `Hoàn thành: ${completion_content}`,
          type: 'note',
        })
      } else if (task.customer_id) {
        const customerCheck = await pool.query(
          'SELECT customer_id FROM public.customers WHERE customer_id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
          [task.customer_id, tenantId]
        )
        if (customerCheck.rows.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'Khách hàng liên kết với task này không tồn tại hoặc đã bị xóa.',
          })
        }

        try {
          const interactionId = uuidv4()
          const now = Date.now()
          await pool.query(
            `INSERT INTO public.interactions (
              interaction_id, customer_id, interaction_type, content,
              interaction_date, employee_id, status, tenant_id, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              interactionId, task.customer_id, 'other', `[Hoàn thành Task] ${completion_content}`,
              now, userId, 'success', tenantId, now
            ]
          )
          syncKpiForInteraction(tenantId, userId, now).catch((e) => {
            if (e?.code !== '42P01' && e?.code !== '42703') {
              console.error('syncKpiForInteraction (taskComplete):', e)
            }
          })
        } catch (interactionError) {
          console.error('Lỗi khi tạo interaction:', interactionError)
          return res.status(500).json({
            success: false,
            message: 'Lỗi khi tạo interaction từ kết quả công việc.',
            error: interactionError.message,
          })
        }
      } else {
        // Task độc lập, không có khách → chỉ ghi note vào timeline task.
        await logTaskActivity({
          tenantId,
          taskId: id,
          userId,
          content: `Hoàn thành: ${completion_content}`,
          type: 'note',
        })
      }
    }

    // Cập nhật các trường
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

    if (bodyDescription !== undefined) {
      updateFields.push(`description = $${paramIndex++}`)
      updateValues.push(normalizeTaskDescription(bodyDescription))
    }

    // Chỉ task không từ Deal/CBS mới được cập nhật customer_id (đã validate ở trên).
    if (!isFromDeal && !isFromCbs && bodyCustomerId !== undefined) {
      const newCustomerId = bodyCustomerId == null || bodyCustomerId === '' ? null : String(bodyCustomerId).trim()
      updateFields.push(`customer_id = $${paramIndex++}`)
      updateValues.push(newCustomerId)
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Không có trường nào để cập nhật.',
      })
    }

    updateValues.push(id, tenantId)
    const updateQuery = `
      UPDATE public.tasks 
      SET ${updateFields.join(', ')}
      WHERE task_id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
      RETURNING *
    `
    const result = await pool.query(updateQuery, updateValues)
    if (result.rows.length === 0) {
      return res.status(500).json({
        success: false,
        message: 'Cập nhật task thất bại.',
      })
    }

    const updated = result.rows[0]
    if (updated.related_type === 'DEAL' && updated.related_id) {
      updateDealTaskMetadata(updated.related_id, tenantId).catch((e) => console.error('updateDealTaskMetadata:', e))

      // Ghi vào timeline deal khi task chuyển trạng thái hoàn thành.
      if (is_completed === true && task.is_completed !== true) {
        const summary = completion_content
          ? `[${updated.display_code}] Đã hoàn thành: ${completion_content}`
          : `[${updated.display_code}] Đã hoàn thành công việc "${updated.title}".`
        logDealActivityForTask({
          tenantId,
          userId,
          dealId: updated.related_id,
          dealStage: null,
          taskId: updated.task_id,
          content: summary,
        })
      } else if (is_completed === false && task.is_completed === true) {
        logDealActivityForTask({
          tenantId,
          userId,
          dealId: updated.related_id,
          dealStage: null,
          taskId: updated.task_id,
          content: `[${updated.display_code}] Đã mở lại công việc "${updated.title}".`,
        })
      }
    }

    res.json({
      success: true,
      message: 'Cập nhật task thành công!',
      data: updated
    })
  } catch (error) {
    console.error('Lỗi updateTask:', error)
    let errorMessage = 'Lỗi hệ thống khi cập nhật task.'
    let statusCode = 500
    if (error.code === '23505') { errorMessage = 'Dữ liệu trùng lặp. Vui lòng kiểm tra lại.'; statusCode = 400 }
    else if (error.code === '23503') { errorMessage = 'Dữ liệu tham chiếu không hợp lệ.'; statusCode = 400 }
    else if (error.code === '42P01') { errorMessage = 'Bảng không tồn tại trong database.'; statusCode = 500 }
    res.status(statusCode).json({
      success: false,
      message: errorMessage,
      error: error.message,
      errorCode: error.code,
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
    const taskDisplayCode = task.display_code
    const taskTitle = task.title

    await pool.query('DELETE FROM tasks WHERE task_id = $1 AND tenant_id = $2', [id, tenantId])

    if (dealIdForMeta) {
      updateDealTaskMetadata(dealIdForMeta, tenantId).catch((e) => console.error('updateDealTaskMetadata:', e))
      logDealActivityForTask({
        tenantId,
        userId,
        dealId: dealIdForMeta,
        dealStage: null,
        taskId: id,
        content: `[${taskDisplayCode || id}] Đã xoá công việc "${taskTitle}".`,
      })
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
