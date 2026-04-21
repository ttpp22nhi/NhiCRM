import { v4 as uuidv4 } from 'uuid'
import pool from '../database.js'
import centralEmitter, { EVENT_DEAL_STAGE_CHANGED } from '../events/eventEmitter.js'
import { updateDealTaskMetadata } from '../services/dealMetadataService.js'
import { generateDisplayCode } from '../services/displayCodeService.js'
import { getStageConfig } from '../services/pipelineStagesService.js'

const TASK_TITLE_MASS = 'Gọi điện xác nhận báo giá'
const TASK_TITLE_PROJECT_KHAO_SAT = 'Khảo sát kỹ thuật / giải pháp'
const ACTIVITY_MESSAGE_MASS = 'Hệ thống đã tạo task tự động: Gọi điện xác nhận báo giá.'
const ACTIVITY_MESSAGE_PROJECT = 'Hệ thống đã tạo task tự động: Khảo sát kỹ thuật / giải pháp (giao bộ phận Kỹ thuật/Giải pháp).'

/**
 * Gán task cho nhân viên thuộc department_id (bộ phận Kỹ thuật/Giải pháp). Trả về employee_id hoặc null.
 */
async function resolveTaskAssigneeForDepartment(tenantId, departmentId) {
  if (!departmentId) return null
  const result = await pool.query(
    `SELECT employee_id FROM employees WHERE tenant_id = $1 AND department_id = $2 AND is_active = true ORDER BY created_at ASC LIMIT 1`,
    [tenantId, departmentId]
  )
  return result.rows?.[0]?.employee_id || null
}

/**
 * Listener: MASS chuyển Báo giá → task Sales; PROJECT chuyển Khảo sát → task Kỹ thuật/Giải pháp (nếu cấu hình)
 */
async function onDealStageChanged ({ deal, tenantId, userId, newStage, source }) {
  const dealId = deal?.deal_id
  if (!dealId || !tenantId) return

  const category = deal?.deal_category || 'MASS'
  const stage = newStage || deal?.stage

  // Không tạo task tự động khi:
  // - deal đã chuyển sang "Thành công" (không còn action follow-up)
  // - sự kiện đến từ luồng auto-promote CBS (đã có log CBS riêng)
  if (stage === 'thanh_cong' || source === 'cbs_auto_promote') {
    return
  }

  let taskTitle = TASK_TITLE_MASS
  let activityMessage = ACTIVITY_MESSAGE_MASS
  let assignedTo = deal.assigned_to || null

  if (category === 'PROJECT' && stage === 'khao_sat') {
    taskTitle = TASK_TITLE_PROJECT_KHAO_SAT
    activityMessage = ACTIVITY_MESSAGE_PROJECT
    const config = await getStageConfig(tenantId, 'PROJECT', 'khao_sat')
    if (config.task_assign_department_id) {
      const techEmployeeId = await resolveTaskAssigneeForDepartment(tenantId, config.task_assign_department_id)
      if (techEmployeeId) assignedTo = techEmployeeId
    }
  }

  try {
    const now = Date.now()
    const taskId = uuidv4()
    const displayCode = await generateDisplayCode('TSK', tenantId)
    const parentDisplayCode = deal.display_code || null

    await pool.query(
      `INSERT INTO tasks (
        task_id, customer_id, title, due_date, priority, is_completed, created_at, assigned_to, tenant_id, related_type, related_id, display_code, parent_display_code
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        taskId,
        deal.customer_id || null,
        taskTitle,
        null,
        'medium',
        false,
        now,
        assignedTo,
        tenantId,
        'DEAL',
        dealId,
        displayCode,
        parentDisplayCode
      ]
    )

    const activityContent = `[${displayCode}]: ${activityMessage}`
    const activityId = uuidv4()
    await pool.query(
      `INSERT INTO deal_activities (id, deal_id, stage, content, type, created_by, tenant_id, created_at, task_id)
       VALUES ($1, $2, $3, $4, 'system', $5, $6, $7, $8)`,
      [activityId, dealId, stage || deal.stage, activityContent, userId || null, tenantId, now, taskId]
    )

    await updateDealTaskMetadata(dealId, tenantId)
  } catch (err) {
    console.error('[dealStageChangedListener] Lỗi khi tạo task / ghi activity:', err)
  }
}

centralEmitter.on(EVENT_DEAL_STAGE_CHANGED, (payload) => {
  onDealStageChanged(payload).catch((e) => console.error('[dealStageChangedListener]', e))
})
