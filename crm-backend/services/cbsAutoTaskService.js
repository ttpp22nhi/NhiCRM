/**
 * Tự động sinh task nhắc "xác nhận người bán" cho các đơn CBS chưa có chủ
 * (claim_status IS NULL) hoặc đang pending quá lâu.
 *
 * Người được giao task: ưu tiên tenant admin (role in tenant admin). Nếu tenant
 * có nhiều admin, chọn người có ít task chưa hoàn thành nhất để dàn việc.
 * Task được đánh dấu related_type = 'CBS_ORDER', related_id = cbs_revenue_orders.id
 * để tránh tạo trùng cho cùng một đơn.
 *
 * Giới hạn: mỗi lần chạy chỉ tạo tối đa 100 task / tenant để không bị spam khi
 * mới import lần đầu; lần chạy sau (scheduler 06:00/18:00) sẽ dọn nốt.
 */

import { v4 as uuidv4 } from 'uuid'
import pool from '../database.js'
import { generateDisplayCode } from './displayCodeService.js'

const MAX_TASKS_PER_RUN = 100
const DEFAULT_DUE_DAYS = 3

async function pickAssigneeForTenant(tenantId) {
  // Ưu tiên admin/director/manager theo thứ tự — chọn người ít task chưa hoàn thành nhất.
  const r = await pool.query(
    `SELECT e.employee_id, e.role,
            COALESCE(t.open_tasks, 0) AS open_tasks
       FROM employees e
       LEFT JOIN (
         SELECT assigned_to, COUNT(*) AS open_tasks
           FROM tasks
          WHERE tenant_id = $1 AND COALESCE(is_completed, false) = false
          GROUP BY assigned_to
       ) t ON t.assigned_to = e.employee_id
      WHERE e.tenant_id = $1
        AND e.is_active = true
        AND LOWER(e.role) IN ('admin', 'director', 'manager')
      ORDER BY
        CASE LOWER(e.role)
          WHEN 'admin'    THEN 1
          WHEN 'director' THEN 2
          WHEN 'manager'  THEN 3
          ELSE 99
        END ASC,
        open_tasks ASC,
        e.created_at ASC
      LIMIT 1`,
    [tenantId]
  )
  return r.rows[0]?.employee_id || null
}

/**
 * Tạo task nhắc duyệt cho tenant. Trả về số task vừa tạo.
 */
export async function createAutoTasksForPendingCbsOrders(tenantId) {
  if (!tenantId) return 0

  const assignee = await pickAssigneeForTenant(tenantId)
  if (!assignee) return 0 // Không có người để giao → bỏ qua, tránh task lơ lửng.

  // Đơn cần tạo task:
  //   - Không/chưa có người bán, hoặc đang pending > 1 ngày.
  //   - Chưa có task liên kết (tránh tạo trùng).
  const candidates = await pool.query(
    `SELECT o.id, o.contract_no, o.customer_name, o.period_ym,
            o.price_vat, o.claim_status, o.claimed_at
       FROM cbs_revenue_orders o
      WHERE o.tenant_id = $1
        AND (
          o.claim_status IS NULL
          OR (o.claim_status = 'pending'
              AND o.claimed_at IS NOT NULL
              AND o.claimed_at < $2)
        )
        AND NOT EXISTS (
          SELECT 1 FROM tasks t
           WHERE t.tenant_id  = o.tenant_id
             AND t.related_type = 'CBS_ORDER'
             AND t.related_id   = o.id
             AND COALESCE(t.is_completed, false) = false
        )
      ORDER BY COALESCE(o.payment_date, o.active_date) DESC NULLS LAST,
               o.price_vat DESC
      LIMIT $3`,
    [tenantId, Date.now() - 24 * 60 * 60 * 1000, MAX_TASKS_PER_RUN]
  )

  if (candidates.rows.length === 0) return 0

  const now = Date.now()
  const dueDate = now + DEFAULT_DUE_DAYS * 24 * 60 * 60 * 1000
  let created = 0

  for (const o of candidates.rows) {
    try {
      const taskId = uuidv4()
      const displayCode = await generateDisplayCode('TSK', tenantId)
      const title = `Xác nhận người bán: ${o.contract_no || o.id} — ${o.customer_name || ''}`.trim()

      await pool.query(
        `INSERT INTO tasks (
           task_id, customer_id, title, due_date, priority, is_completed,
           created_at, assigned_to, tenant_id, related_type, related_id, display_code
         ) VALUES ($1, NULL, $2, $3, 'high', false, $4, $5, $6, 'CBS_ORDER', $7, $8)`,
        [taskId, title, dueDate, now, assignee, tenantId, o.id, displayCode]
      )

      // Thông báo tới người được giao (không chặn luồng)
      try {
        await pool.query(
          `INSERT INTO public.notifications (
             notification_id, employee_id, type, title, message, is_read, tenant_id, created_at
           ) VALUES ($1, $2, 'cbs_auto_task', 'Đơn CBS cần xác nhận người bán', $3, false, $4, $5)`,
          [uuidv4(), assignee, title, tenantId, now]
        )
      } catch (err) {
        if (err?.code !== '42P01') console.error('notify cbs_auto_task:', err)
      }

      created++
    } catch (err) {
      // Không chặn loop — log để diagnose.
      console.error('createAutoTasksForPendingCbsOrders:item', err)
    }
  }
  return created
}

/**
 * Chạy cho tất cả tenant có cbs_config auto_sync=true — gọi sau khi sync xong.
 */
export async function createAutoTasksForAllTenants() {
  try {
    const r = await pool.query(
      `SELECT DISTINCT tenant_id FROM cbs_config WHERE auto_sync = true`
    )
    const results = []
    for (const row of r.rows) {
      try {
        const n = await createAutoTasksForPendingCbsOrders(row.tenant_id)
        results.push({ tenantId: row.tenant_id, created: n })
      } catch (err) {
        results.push({ tenantId: row.tenant_id, error: err?.message || String(err) })
      }
    }
    return results
  } catch (err) {
    if (err?.code === '42P01') return []
    throw err
  }
}
