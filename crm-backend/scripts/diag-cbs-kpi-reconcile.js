/**
 * Đối chiếu CBS đã duyệt (chưa VAT, no deal) vs KPI actuals theo sales × kỳ.
 * node scripts/diag-cbs-kpi-reconcile.js [period=2026-06]
 */
import 'dotenv/config'
import pool from '../database.js'

const PERIOD = process.argv[2] || '2026-06'

async function main() {
  console.log(`Kỳ: ${PERIOD}\n`)

  const r = await pool.query(
    `WITH cbs AS (
       SELECT o.tenant_id, o.claimed_by AS user_id,
              ROUND(SUM(COALESCE(o.price_not_vat_round, o.price_not_vat, 0))::numeric, 2) AS cbs_not_vat,
              COUNT(*)::int AS cbs_cnt
         FROM cbs_revenue_orders o
        WHERE o.period_ym = $1
          AND o.claim_status = 'approved'
          AND o.claimed_by IS NOT NULL
          AND o.deal_id IS NULL
        GROUP BY o.tenant_id, o.claimed_by
     ),
     deals AS (
       SELECT d.tenant_id, d.assigned_to AS user_id,
              ROUND(SUM(COALESCE(d.amount, 0))::numeric, 2) AS deal_amt,
              COUNT(*)::int AS deal_cnt
         FROM deals d
        WHERE COALESCE(d.is_deleted, false) = false
          AND (d.status = 'won' OR LOWER(TRIM(COALESCE(d.stage, ''))) = 'thanh_cong')
          AND to_char(
                to_timestamp(COALESCE(d.expected_closing_date, d.updated_at) / 1000.0),
                'YYYY-MM'
              ) = $1
        GROUP BY d.tenant_id, d.assigned_to
     ),
     expected AS (
       SELECT
         COALESCE(c.tenant_id, d.tenant_id) AS tenant_id,
         COALESCE(c.user_id, d.user_id) AS user_id,
         COALESCE(c.cbs_not_vat, 0) AS cbs_not_vat,
         COALESCE(c.cbs_cnt, 0) AS cbs_cnt,
         COALESCE(d.deal_amt, 0) AS deal_amt,
         COALESCE(d.deal_cnt, 0) AS deal_cnt,
         COALESCE(c.cbs_not_vat, 0) + COALESCE(d.deal_amt, 0) AS expected_total
       FROM cbs c
       FULL OUTER JOIN deals d
         ON d.tenant_id = c.tenant_id AND d.user_id = c.user_id
     )
     SELECT e.full_name, e.username,
            x.cbs_cnt, x.cbs_not_vat,
            x.deal_cnt, x.deal_amt,
            x.expected_total,
            ROUND(COALESCE(k.actual_revenue_new, 0) + COALESCE(k.actual_revenue_existing, 0), 2) AS kpi_total,
            ROUND(
              (COALESCE(k.actual_revenue_new, 0) + COALESCE(k.actual_revenue_existing, 0))
              - x.expected_total
            , 2) AS gap,
            CASE
              WHEN ABS(
                (COALESCE(k.actual_revenue_new, 0) + COALESCE(k.actual_revenue_existing, 0))
                - x.expected_total
              ) < 1 THEN 'OK'
              ELSE 'LEAK'
            END AS status
       FROM expected x
       JOIN employees e
         ON e.employee_id = x.user_id AND e.tenant_id = x.tenant_id
       LEFT JOIN kpis k
         ON k.tenant_id = x.tenant_id AND k.user_id = x.user_id AND k.period = $1
      WHERE x.expected_total > 0 OR COALESCE(k.actual_revenue_new, 0) + COALESCE(k.actual_revenue_existing, 0) > 0
      ORDER BY status DESC, ABS(
        (COALESCE(k.actual_revenue_new, 0) + COALESCE(k.actual_revenue_existing, 0)) - x.expected_total
      ) DESC, e.full_name`,
    [PERIOD]
  )

  console.table(
    r.rows.map((row) => ({
      name: row.full_name,
      user: row.username,
      cbs_lines: row.cbs_cnt,
      cbs_not_vat: Number(row.cbs_not_vat),
      deals: row.deal_cnt,
      deal_amt: Number(row.deal_amt),
      expected: Number(row.expected_total),
      kpi: Number(row.kpi_total),
      gap: Number(row.gap),
      status: row.status,
    }))
  )

  const ok = r.rows.filter((x) => x.status === 'OK').length
  const leak = r.rows.filter((x) => x.status === 'LEAK')
  console.log(`\nTổng: ${r.rows.length} sales | OK: ${ok} | Lệch: ${leak.length}`)

  if (leak.length) {
    console.log('\n=== Chi tiết lệch ===')
    for (const row of leak) {
      console.log(
        `- ${row.full_name} (@${row.username}): KPI=${row.kpi_total} vs expected=${row.expected_total} (gap=${row.gap})`
      )
    }
  }

  // Chung spotlight
  const chung = r.rows.find((x) => x.username === 'chung.nthanh')
  if (chung) {
    console.log('\n=== Nguyễn Thành Chung ===')
    console.log(chung)
  }

  // Dupes remaining in period
  const dup = await pool.query(
    `SELECT COUNT(*)::int AS unclaimed_dupes
       FROM cbs_revenue_orders o
      WHERE o.period_ym = $1
        AND o.claimed_by IS NULL
        AND COALESCE(LOWER(TRIM(o.claim_status)), '') <> 'approved'
        AND EXISTS (
          SELECT 1 FROM cbs_revenue_orders a
           WHERE a.tenant_id = o.tenant_id AND a.period_ym = o.period_ym
             AND a.claim_status = 'approved' AND a.id <> o.id
             AND TRIM(COALESCE(a.contract_no,'')) = TRIM(COALESCE(o.contract_no,''))
             AND LOWER(TRIM(COALESCE(a.product_code,a.primary_product_code,'')))
               = LOWER(TRIM(COALESCE(o.product_code,o.primary_product_code,'')))
             AND to_char(to_timestamp(COALESCE(a.active_date,a.payment_date,a.first_date_revenue)/1000.0)
                   AT TIME ZONE 'Asia/Ho_Chi_Minh','YYYY-MM-DD')
               = to_char(to_timestamp(COALESCE(o.active_date,o.payment_date,o.first_date_revenue)/1000.0)
                   AT TIME ZONE 'Asia/Ho_Chi_Minh','YYYY-MM-DD')
             AND TRIM(COALESCE(a.serial,'')) = TRIM(COALESCE(o.serial,''))
        )`,
    [PERIOD]
  )
  console.log('\nUnclaimed trùng khóa nghiệp vụ (toàn kỳ):', dup.rows[0].unclaimed_dupes)

  await pool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
