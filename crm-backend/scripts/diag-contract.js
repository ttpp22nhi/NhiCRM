/**
 * Kiểm tra hợp đồng CBS — node scripts/diag-contract.js <contract_no> [period_ym]
 */
import 'dotenv/config'
import pool from '../database.js'

const contractNo = process.argv[2] || 'QRMBF328990/2026'
const period = process.argv[3] || null

async function main() {
  const params = [contractNo]
  let where = `TRIM(COALESCE(contract_no,'')) = $1`
  if (period) {
    params.push(period)
    where += ` AND period_ym = $2`
  }

  const rows = await pool.query(
    `SELECT o.id, o.period_ym, o.fingerprint, o.contract_no, o.serial,
            o.product_name, o.product_code, o.masp,
            ROUND(COALESCE(o.price_not_vat_round,o.price_not_vat,0))::bigint AS not_vat,
            ROUND(COALESCE(o.price_vat,0))::bigint AS vat,
            o.claim_status, o.claimed_by, o.approved_at, o.deal_id,
            LEFT(o.cbs_staff,50) AS cbs_staff,
            e.full_name AS claimed_by_name,
            to_timestamp(o.synced_at/1000.0) AS synced_at,
            to_timestamp(o.created_at/1000.0) AS created_at
       FROM cbs_revenue_orders o
       LEFT JOIN employees e ON e.employee_id = o.claimed_by AND e.tenant_id = o.tenant_id
      WHERE ${where}
      ORDER BY o.period_ym, o.serial, o.price_vat DESC, o.created_at`,
    params
  )

  console.log(`Contract: ${contractNo}${period ? ` period ${period}` : ''}`)
  console.log(`Found ${rows.rows.length} row(s)\n`)
  console.table(rows.rows)

  const bySerial = new Map()
  for (const r of rows.rows) {
    const key = `${r.period_ym}|${String(r.serial || '').trim()}`
    if (!bySerial.has(key)) bySerial.set(key, [])
    bySerial.get(key).push(r)
  }

  console.log('\n=== Nhóm theo period + serial ===')
  for (const [key, list] of bySerial) {
    if (list.length > 1) {
      console.log(`\nDUPLICATE (${list.length} rows): ${key}`)
      console.table(
        list.map((r) => ({
          id: r.id,
          not_vat: r.not_vat,
          vat: r.vat,
          claim_status: r.claim_status,
          claimed_by_name: r.claimed_by_name,
          cbs_staff: r.cbs_staff,
          fingerprint: r.fingerprint?.slice(0, 12) + '…',
        }))
      )
    }
  }

  const fps = new Set(rows.rows.map((r) => r.fingerprint))
  if (fps.size < rows.rows.length) {
    console.log('\n⚠ Trùng fingerprint:', rows.rows.length - fps.size, 'extra row(s)')
  }

  await pool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
