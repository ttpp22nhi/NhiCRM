/**
 * Force recompute KPI cho các sales lệch kỳ đã chốt.
 * node scripts/fix-kpi-leaks-2026-06.js
 */
import 'dotenv/config'
import pool from '../database.js'
import { recomputeKpiActuals } from '../services/kpiFromDealsSyncService.js'

const PERIOD = '2026-06'
const USERNAMES = ['lam.tran', 'tien.hovan', 'thu.phan', 'phu.tran']

async function main() {
  for (const username of USERNAMES) {
    const emp = await pool.query(
      `SELECT employee_id, full_name, tenant_id FROM employees
        WHERE username = $1 AND is_active = true LIMIT 1`,
      [username]
    )
    if (!emp.rows.length) {
      console.log('Skip missing:', username)
      continue
    }
    const { employee_id, full_name, tenant_id } = emp.rows[0]
    const before = await pool.query(
      `SELECT COALESCE(actual_revenue_new,0)+COALESCE(actual_revenue_existing,0) AS t
         FROM kpis WHERE tenant_id=$1 AND user_id=$2 AND period=$3`,
      [tenant_id, employee_id, PERIOD]
    )
    await recomputeKpiActuals(tenant_id, employee_id, PERIOD, { force: true })
    const after = await pool.query(
      `SELECT COALESCE(actual_revenue_new,0)+COALESCE(actual_revenue_existing,0) AS t
         FROM kpis WHERE tenant_id=$1 AND user_id=$2 AND period=$3`,
      [tenant_id, employee_id, PERIOD]
    )
    console.log(`${full_name}: ${Number(before.rows[0]?.t || 0)} → ${Number(after.rows[0]?.t || 0)}`)
  }
  await pool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
