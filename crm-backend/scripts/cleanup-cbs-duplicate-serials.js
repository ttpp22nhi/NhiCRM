/**
 * Gỡ dòng CBS unclaimed trùng contract+serial khi đã có bản approved.
 * Chạy: node scripts/cleanup-cbs-duplicate-serials.js [YYYY-MM]
 */
import 'dotenv/config'
import pool from '../database.js'

const PERIOD = process.argv[2] || '2026-06'

async function main() {
  const tenants = await pool.query(
    `SELECT DISTINCT tenant_id FROM cbs_revenue_orders WHERE period_ym = $1`,
    [PERIOD]
  )
  let totalRemoved = 0
  for (const { tenant_id: tenantId } of tenants.rows) {
    const del = await pool.query(
      `DELETE FROM cbs_revenue_orders o
        WHERE o.tenant_id = $1
          AND o.period_ym = $2
          AND COALESCE(LOWER(TRIM(o.claim_status)), '') <> 'approved'
          AND o.claimed_by IS NULL
          AND NULLIF(TRIM(o.serial), '') IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM cbs_revenue_orders a
             WHERE a.tenant_id = o.tenant_id
               AND a.period_ym = o.period_ym
               AND TRIM(COALESCE(a.contract_no, '')) = TRIM(COALESCE(o.contract_no, ''))
               AND TRIM(COALESCE(a.serial, '')) = TRIM(COALESCE(o.serial, ''))
               AND a.claim_status = 'approved'
               AND a.id <> o.id
          )
       RETURNING id`,
      [tenantId, PERIOD]
    )
    const n = del.rowCount || 0
    if (n > 0) console.log(`Tenant ${tenantId}: removed ${n} duplicate rows`)
    totalRemoved += n
  }
  console.log(`Done. Total removed for ${PERIOD}: ${totalRemoved}`)
  await pool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
