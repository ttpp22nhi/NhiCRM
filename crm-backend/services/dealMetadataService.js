import pool from '../database.js'

/**
 * Cập nhật cache metadata của Deal (số task đã hoàn thành / tổng task).
 * Gọi khi task có related_type='DEAL', related_id=dealId được tạo/cập nhật/xóa.
 *
 * LƯU Ý: dùng phép merge ( || ) để giữ nguyên các key khác trong metadata
 * (ví dụ: cờ CBS auto-promote, mốc thời gian khác mà module khác có thể lưu).
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
       SET metadata = COALESCE(metadata, '{}'::jsonb)
                       || jsonb_build_object('task_total', $1, 'task_completed', $2)
       WHERE deal_id = $3 AND tenant_id = $4`,
      [task_total, task_completed, dealId, tenantId]
    )
  } catch (err) {
    console.error('[dealMetadataService] updateDealTaskMetadata:', err)
  }
}

/**
 * Đồng bộ thông tin deal sang các task liên quan.
 * Mặc định CHỈ đồng bộ customer_id để tránh ghi đè người được giao của task khảo sát
 * (PROJECT khao_sat thường giao cho bộ phận Kỹ thuật, khác deal.assigned_to).
 *
 * Khi gọi với { syncAssignee: true }, sẽ đồng bộ assigned_to cho các task có
 * người được giao trùng với assignee cũ của deal — tránh nhảy nhầm assignee
 * của task đã được gán riêng biệt (ví dụ task khảo sát giao cho Kỹ thuật).
 *
 * @param {string} dealId
 * @param {string} tenantId
 * @param {{ assigned_to?: string | null; customer_id?: string | null; previous_assigned_to?: string | null; syncAssignee?: boolean }} payload
 */
export async function syncDealTasksWithDeal(
  dealId,
  tenantId,
  { assigned_to, customer_id, previous_assigned_to, syncAssignee = false } = {}
) {
  if (!dealId || !tenantId) return

  try {
    if (customer_id !== undefined) {
      await pool.query(
        `UPDATE tasks
         SET customer_id = $1
         WHERE related_type = 'DEAL' AND related_id = $2 AND tenant_id = $3`,
        [customer_id ?? null, dealId, tenantId]
      )
    }

    if (syncAssignee && assigned_to !== undefined) {
      // Chỉ đổi assignee nếu task đang gán cho assignee CŨ của deal (hoặc chưa có ai)
      // → giữ nguyên các task đã được giao có chủ đích cho người khác (Kỹ thuật, Quản lý...).
      const prev = previous_assigned_to ?? null
      if (prev === null) {
        await pool.query(
          `UPDATE tasks
           SET assigned_to = $1
           WHERE related_type = 'DEAL' AND related_id = $2 AND tenant_id = $3
             AND assigned_to IS NULL`,
          [assigned_to ?? null, dealId, tenantId]
        )
      } else {
        await pool.query(
          `UPDATE tasks
           SET assigned_to = $1
           WHERE related_type = 'DEAL' AND related_id = $2 AND tenant_id = $3
             AND (assigned_to IS NULL OR assigned_to = $4)`,
          [assigned_to ?? null, dealId, tenantId, prev]
        )
      }
    }
  } catch (err) {
    console.error('[dealMetadataService] syncDealTasksWithDeal:', err)
  }
}

/**
 * Khi deal bị xoá mềm: gỡ liên kết related_type/related_id trên các task đang gắn deal,
 * giữ lại parent_display_code cho mục đích truy vết, và đánh dấu là task "mồ côi".
 * Trả về số task bị ảnh hưởng để gọi nơi đó ghi log.
 *
 * @param {string} dealId
 * @param {string} tenantId
 * @returns {Promise<number>} Số task bị detach
 */
export async function detachTasksFromDeletedDeal(dealId, tenantId) {
  if (!dealId || !tenantId) return 0
  try {
    const r = await pool.query(
      `UPDATE tasks
       SET related_type = NULL,
           related_id = NULL
       WHERE related_type = 'DEAL' AND related_id = $1 AND tenant_id = $2
       RETURNING task_id`,
      [dealId, tenantId]
    )
    return r.rowCount || 0
  } catch (err) {
    console.error('[dealMetadataService] detachTasksFromDeletedDeal:', err)
    return 0
  }
}

/**
 * Khi deal được khôi phục (restore từ thùng rác): cố gắng gắn lại các task có
 * parent_display_code = display_code của deal nhưng đã bị detach.
 *
 * @param {string} dealId
 * @param {string} dealDisplayCode
 * @param {string} tenantId
 * @returns {Promise<number>} Số task được gắn lại
 */
export async function reattachTasksOnDealRestore(dealId, dealDisplayCode, tenantId) {
  if (!dealId || !tenantId || !dealDisplayCode) return 0
  try {
    const r = await pool.query(
      `UPDATE tasks
       SET related_type = 'DEAL',
           related_id = $1
       WHERE tenant_id = $2
         AND related_type IS NULL
         AND parent_display_code = $3
       RETURNING task_id`,
      [dealId, tenantId, dealDisplayCode]
    )
    return r.rowCount || 0
  } catch (err) {
    console.error('[dealMetadataService] reattachTasksOnDealRestore:', err)
    return 0
  }
}
