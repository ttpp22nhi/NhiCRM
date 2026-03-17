/**
 * Sinh mã hiển thị tự động: [PREFIX]-[YYMM]-[NNN]
 * VD: DEAL-2602-001, TSK-2602-001
 * Unique trong cùng tenant_id; số thứ tự tăng dần theo tháng.
 */
import pool from '../database.js'

const PREFIX = {
  DEAL: 'DEAL',
  TSK: 'TSK'
}

/**
 * Sinh display_code cho Deal hoặc Task trong tenant.
 * @param {string} type - 'DEAL' | 'TSK'
 * @param {string} tenantId - tenant_id
 * @returns {Promise<string>} Mã dạng DEAL-2602-001 hoặc TSK-2602-001
 */
export async function generateDisplayCode(type, tenantId) {
  if (!tenantId || !type) {
    throw new Error('generateDisplayCode cần type và tenantId.')
  }
  const prefix = type === 'DEAL' ? PREFIX.DEAL : PREFIX.TSK
  const table = type === 'DEAL' ? 'deals' : 'tasks'
  const idColumn = type === 'DEAL' ? 'deal_id' : 'task_id'

  const now = new Date()
  const yy = String(now.getFullYear()).slice(-2)
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const yymm = `${yy}${mm}`
  const pattern = `${prefix}-${yymm}-%`

  const query = `
    SELECT display_code
    FROM ${table}
    WHERE tenant_id = $1
      AND display_code IS NOT NULL
      AND display_code LIKE $2
    ORDER BY display_code DESC
    LIMIT 1
  `
  const result = await pool.query(query, [tenantId, pattern])
  let nextNum = 1
  if (result.rows.length > 0) {
    const lastCode = result.rows[0].display_code
    const match = lastCode.match(new RegExp(`^${prefix}-${yymm}-(\\d+)$`))
    if (match) {
      nextNum = parseInt(match[1], 10) + 1
    }
  }

  const seq = String(nextNum).padStart(3, '0')
  return `${prefix}-${yymm}-${seq}`
}
