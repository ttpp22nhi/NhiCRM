/**
 * Tính lại KPI tháng 6/2026 cho Nguyễn Thành Chung (bypass khóa kỳ).
 * Chạy: node scripts/fix-kpi-chung-2026-06.js
 */
import 'dotenv/config'
import pool from '../database.js'
import { recomputeKpiActuals } from '../services/kpiFromDealsSyncService.js'

const PERIOD = '2026-06'
const USERNAME = 'chung.nthanh'

async function main() {
  const emp = await pool.query(
    `SELECT employee_id, full_name, tenant_id FROM employees
      WHERE username = $1 AND is_active = true LIMIT 1`,
    [USERNAME]
  )
  if (!emp.rows.length) {
    console.error('Không tìm thấy nhân viên:', USERNAME)
    process.exit(1)
  }
  const { employee_id: userId, full_name, tenant_id: tenantId } = emp.rows[0]

  const before = await pool.query(
    `SELECT actual_revenue_new, actual_revenue_existing FROM kpis
      WHERE tenant_id = $1 AND user_id = $2 AND period = $3`,
    [tenantId, userId, PERIOD]
  )
  const b = before.rows[0] || {}
  console.log('Trước:', {
    name: full_name,
    new: Number(b.actual_revenue_new || 0),
    existing: Number(b.actual_revenue_existing || 0),
    total: Number(b.actual_revenue_new || 0) + Number(b.actual_revenue_existing || 0),
  })

  await recomputeKpiActuals(tenantId, userId, PERIOD, { force: true })

  const after = await pool.query(
    `SELECT actual_revenue_new, actual_revenue_existing,
            actual_product_count_new, actual_product_count_existing,
            actual_approach_count, updated_at
       FROM kpis
      WHERE tenant_id = $1 AND user_id = $2 AND period = $3`,
    [tenantId, userId, PERIOD]
  )
  const a = after.rows[0] || {}
  console.log('Sau:', {
    new: Number(a.actual_revenue_new || 0),
    existing: Number(a.actual_revenue_existing || 0),
    total: Number(a.actual_revenue_new || 0) + Number(a.actual_revenue_existing || 0),
    products_new: a.actual_product_count_new,
    products_existing: a.actual_product_count_existing,
    approach: a.actual_approach_count,
    updated_at: a.updated_at ? new Date(Number(a.updated_at)).toISOString() : null,
  })

  await pool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
