import pool from '../database.js'

/**
 * Cập nhật cache metadata của Deal (số task đã hoàn thành / tổng task).
 * Gọi khi task có related_type='DEAL', related_id=dealId được tạo/cập nhật/xóa.
 *
 * @param {string} dealId
 * @param {string} tenantId
 */
export async function updateDealTaskMetadata(dealId, tenantId) {
  if (!dealId || !tenantId) return

  try {
    const countResult = await pool.query(
      `SELECT
         COUNT(*)::int AS task_total,
         COUNT(*) FILTER (WHERE is_completed = true)::int AS task_completed
       FROM tasks
       WHERE related_type = 'DEAL' AND related_id = $1 AND tenant_id = $2`,
      [dealId, tenantId]
    )

    const row = countResult.rows[0]
    const task_total = row ? Number(row.task_total) || 0 : 0
    const task_completed = row ? Number(row.task_completed) || 0 : 0

    await pool.query(
      `UPDATE deals
       SET metadata = jsonb_build_object('task_total', $1, 'task_completed', $2)
       WHERE deal_id = $3 AND tenant_id = $4`,
      [task_total, task_completed, dealId, tenantId]
    )
  } catch (err) {
    console.error('[dealMetadataService] updateDealTaskMetadata:', err)
  }
}

/**
 * Đồng bộ thông tin deal sang các task liên quan (assigned_to, customer_id).
 * Gọi khi cập nhật deal để task luôn khớp với deal.
 *
 * @param {string} dealId
 * @param {string} tenantId
 * @param {{ assigned_to?: string | null; customer_id?: string | null }} payload
 */
export async function syncDealTasksWithDeal(dealId, tenantId, { assigned_to, customer_id }) {
  if (!dealId || !tenantId) return

  try {
    await pool.query(
      `UPDATE tasks
       SET assigned_to = $1, customer_id = $2
       WHERE related_type = 'DEAL' AND related_id = $3 AND tenant_id = $4`,
      [assigned_to ?? null, customer_id ?? null, dealId, tenantId]
    )
  } catch (err) {
    console.error('[dealMetadataService] syncDealTasksWithDeal:', err)
  }
}
