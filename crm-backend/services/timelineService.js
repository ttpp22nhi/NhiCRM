import pool from '../database.js'

/**
 * TimelineService — Gộp timeline Deal + Task liên quan (related_type=DEAL, related_id=dealId)
 */

/**
 * Lấy timeline thống nhất của một Deal:
 * - Tất cả hoạt động từ deal_activities
 * - Tất cả hoạt động từ task_activities của các Task có related_type='DEAL' và related_id=dealId
 * Gộp, sắp xếp theo created_at giảm dần, phân biệt nguồn gốc (source).
 *
 * @param {string} dealId - ID deal
 * @param {string} tenantId - Tenant (bắt buộc để lọc đúng dữ liệu)
 * @returns {Promise<Array>} Mảng item: { id, source: 'deal'|'task', content, type, created_at, created_by, created_by_name, ... }
 */
export async function getUnifiedTimeline(dealId, tenantId) {
  if (!dealId || !tenantId) return []

  const dealRows = await pool.query(
    `SELECT a.id, a.deal_id, a.stage, a.content, a.type, a.created_by, a.created_at,
       e.full_name as created_by_name
     FROM deal_activities a
     LEFT JOIN employees e ON a.created_by = e.employee_id
     WHERE a.deal_id = $1 AND a.tenant_id = $2
     ORDER BY a.created_at DESC`,
    [dealId, tenantId]
  )

  const tasksLinked = await pool.query(
    `SELECT task_id, title FROM tasks
     WHERE related_type = 'DEAL' AND related_id = $1 AND tenant_id = $2`,
    [dealId, tenantId]
  )

  const taskIds = (tasksLinked.rows || []).map((r) => r.task_id)
  const taskTitleById = (tasksLinked.rows || []).reduce((acc, r) => {
    acc[r.task_id] = r.title || ''
    return acc
  }, {})

  let taskActivityRows = []
  if (taskIds.length > 0) {
    const placeholders = taskIds.map((_, i) => `$${i + 1}`).join(', ')
    const taskResult = await pool.query(
      `SELECT a.id, a.task_id, a.content, a.type, a.created_by, a.created_at,
         e.full_name as created_by_name
       FROM task_activities a
       LEFT JOIN employees e ON a.created_by = e.employee_id
       WHERE a.task_id IN (${placeholders}) AND a.tenant_id = $${taskIds.length + 1}
       ORDER BY a.created_at DESC`,
      [...taskIds, tenantId]
    )
    taskActivityRows = taskResult.rows || []
  }

  const dealItems = (dealRows.rows || []).map((row) => ({
    id: row.id,
    source: 'deal',
    deal_id: row.deal_id,
    stage: row.stage,
    content: row.content,
    type: row.type,
    created_at: row.created_at,
    created_by: row.created_by,
    created_by_name: row.created_by_name ?? null,
    task_id: null,
    task_title: null
  }))

  const taskItems = taskActivityRows.map((row) => ({
    id: row.id,
    source: 'task',
    deal_id: dealId,
    task_id: row.task_id,
    task_title: taskTitleById[row.task_id] ?? null,
    stage: null,
    content: row.content,
    type: row.type,
    created_at: row.created_at,
    created_by: row.created_by,
    created_by_name: row.created_by_name ?? null
  }))

  const merged = [...dealItems, ...taskItems].sort((a, b) => {
    const ta = Number(a.created_at) || 0
    const tb = Number(b.created_at) || 0
    return tb - ta
  })

  return merged
}
