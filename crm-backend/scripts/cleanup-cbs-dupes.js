/**
 * Dọn unclaimed trùng khóa nghiệp vụ với bản approved:
 *   HĐ + mã SP + ngày kích hoạt (VN) + serial
 *
 * Dry-run: node scripts/cleanup-cbs-dupes.js --dry-run [--period=2026-06] [--seller=chung.nthanh]
 * Chạy:    node scripts/cleanup-cbs-dupes.js [--period=2026-06] [--seller=chung.nthanh]
 * Toàn tenant (không lọc seller): bỏ --seller
 */
import 'dotenv/config'
import pool from '../database.js'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const period = (args.find((a) => a.startsWith('--period=')) || '--period=2026-06').split('=')[1]
const sellerArg = args.find((a) => a.startsWith('--seller='))
const sellerUsername = sellerArg ? sellerArg.split('=')[1] : null

async function main() {
  let tenantId = null
  let userId = null
  let fullName = null

  if (sellerUsername) {
    const emp = await pool.query(
      `SELECT employee_id, full_name, tenant_id FROM employees
        WHERE username = $1 AND is_active = true LIMIT 1`,
      [sellerUsername]
    )
    if (!emp.rows.length) {
      console.error('Không tìm thấy NV:', sellerUsername)
      process.exit(1)
    }
    ;({ employee_id: userId, full_name: fullName, tenant_id: tenantId } = emp.rows[0])
    console.log(`${dryRun ? '[DRY-RUN] ' : ''}Seller: ${fullName} (${sellerUsername}) kỳ ${period}`)
  } else {
    console.log(`${dryRun ? '[DRY-RUN] ' : ''}Toàn bộ tenant — kỳ ${period}`)
  }

  const params = [period]
  let sellerFilter = ''
  if (userId && tenantId) {
    params.push(tenantId, userId)
    sellerFilter = `
      AND o.tenant_id = $2
      AND EXISTS (
        SELECT 1 FROM cbs_revenue_orders a
         WHERE a.tenant_id = o.tenant_id AND a.period_ym = o.period_ym
           AND a.claim_status = 'approved' AND a.claimed_by = $3
           AND TRIM(COALESCE(a.contract_no,'')) = TRIM(COALESCE(o.contract_no,''))
           AND LOWER(TRIM(COALESCE(a.product_code, a.primary_product_code, '')))
             = LOWER(TRIM(COALESCE(o.product_code, o.primary_product_code, '')))
           AND to_char(to_timestamp(COALESCE(a.active_date,a.payment_date,a.first_date_revenue)/1000.0)
                 AT TIME ZONE 'Asia/Ho_Chi_Minh','YYYY-MM-DD')
             = to_char(to_timestamp(COALESCE(o.active_date,o.payment_date,o.first_date_revenue)/1000.0)
                 AT TIME ZONE 'Asia/Ho_Chi_Minh','YYYY-MM-DD')
           AND TRIM(COALESCE(a.serial,'')) = TRIM(COALESCE(o.serial,''))
      )`
  }

  const candidates = await pool.query(
    `SELECT o.id, o.tenant_id, o.contract_no, o.serial, o.product_code,
            ROUND(COALESCE(o.price_not_vat_round, o.price_not_vat, 0))::bigint AS not_vat
       FROM cbs_revenue_orders o
      WHERE o.period_ym = $1
        AND o.claimed_by IS NULL
        AND COALESCE(LOWER(TRIM(o.claim_status)), '') <> 'approved'
        AND EXISTS (
          SELECT 1 FROM cbs_revenue_orders a
           WHERE a.tenant_id = o.tenant_id
             AND a.period_ym = o.period_ym
             AND a.claim_status = 'approved'
             AND a.id <> o.id
             AND TRIM(COALESCE(a.contract_no, '')) = TRIM(COALESCE(o.contract_no, ''))
             AND LOWER(TRIM(COALESCE(a.product_code, a.primary_product_code, '')))
               = LOWER(TRIM(COALESCE(o.product_code, o.primary_product_code, '')))
             AND to_char(
                   to_timestamp(COALESCE(a.active_date, a.payment_date, a.first_date_revenue) / 1000.0)
                   AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD'
                 )
               = to_char(
                   to_timestamp(COALESCE(o.active_date, o.payment_date, o.first_date_revenue) / 1000.0)
                   AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD'
                 )
             AND TRIM(COALESCE(a.serial, '')) = TRIM(COALESCE(o.serial, ''))
        )
        ${sellerFilter}`,
    params
  )

  console.log(`\nSẽ xóa ${candidates.rows.length} dòng trùng (unclaimed)`)
  if (candidates.rows.length) console.table(candidates.rows.slice(0, 50))

  if (!dryRun && candidates.rows.length > 0) {
    const ids = candidates.rows.map((r) => r.id)
    const del = await pool.query(
      `DELETE FROM cbs_revenue_orders WHERE id = ANY($1::text[]) RETURNING id`,
      [ids]
    )
    console.log(`Đã xóa ${del.rowCount} dòng.`)
  } else if (dryRun) {
    console.log('(Dry-run — không xóa)')
  }

  await pool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
