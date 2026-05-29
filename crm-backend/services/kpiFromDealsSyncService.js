import { v4 as uuidv4 } from 'uuid'
import pool from '../database.js'
import { isKpiPeriodActualsLocked } from '../utils/kpiPeriodLock.js'

/**
 * Đồng bộ KPI actuals từ Deals + CBS Orders và đếm actual_approach_count từ
 * chính bảng Deals. Gọi fire-and-forget từ các controller liên quan; lỗi do
 * bảng/cột chưa tồn tại (42P01/42703) sẽ bị nuốt để không chặn luồng chính.
 *
 * Nguyên tắc SOURCE-OF-TRUTH doanh thu (tránh double-count Deal ↔ CBS):
 *   - Nếu một CBS order đã duyệt và có deal_id → doanh thu đã được Deal ghi nhận,
 *     KHÔNG cộng CBS order đó vào actual nữa.
 *   - Ngược lại (CBS không có deal_id) → cộng CBS vào actual theo kpi_kind_at_approve
 *     (fallback: suy từ kpi_customer_kind của customer; cuối cùng fallback 'NEW').
 *   - Deal thắng: phân nhóm theo kpi_customer_kind tại thời điểm tính.
 *   - Kỳ đã chốt (sau ngày 05 VN tháng kế sau kỳ): không ghi đè actuals → báo cáo
 *     quý/năm cộng dồn từng tháng không tự thay đổi ngược.
 *
 * Phân loại approach (Tiếp cận thực hiện) = deals trong kỳ + CBS đã duyệt (distinct KH),
 *   có loại trùng: khách CBS không cộng thêm nếu đã có deal cùng kỳ cùng sale và
 *   trùng customer_id / MST / SĐT (9 số cuối) / tên DN với hồ sơ khách trên deal.
 *   Mỗi deal vẫn = 1 lần (kể cả nhiều deal cùng một khách).
 */

function toMoney(n) {
  const x = Number(n)
  if (Number.isNaN(x)) return 0
  return Math.round(x * 100) / 100
}

/**
 * Tiếp cận thực hiện: COUNT(deal trong kỳ) + COUNT(khách CBS đã duyệt chưa trùng deal).
 * @returns {Promise<number>}
 */
async function computeActualApproachCount(tenantId, userId, period) {
  try {
    const r = await pool.query(
      `WITH deals_in_period AS (
         SELECT d.deal_id,
                NULLIF(TRIM(d.customer_id), '') AS customer_id
           FROM deals d
          WHERE d.tenant_id   = $1
            AND d.assigned_to = $2
            AND COALESCE(d.is_deleted, false) = false
            AND COALESCE(LOWER(TRIM(d.status)), 'active') <> 'trashed'
            AND d.created_at IS NOT NULL
            AND to_char(to_timestamp(d.created_at / 1000.0), 'YYYY-MM') = $3
       ),
       cbs_customers AS (
         SELECT DISTINCT ON (g.cust_key)
                g.cust_key,
                NULLIF(TRIM(o.customer_id), '') AS cbs_customer_id,
                NULLIF(TRIM(o.external_id1), '') AS external_id1,
                NULLIF(TRIM(o.customer_name), '') AS customer_name
           FROM cbs_revenue_orders o
           CROSS JOIN LATERAL (
             SELECT COALESCE(
               NULLIF(TRIM(o.customer_id), ''),
               NULLIF(TRIM(o.external_id1), ''),
               CASE
                 WHEN NULLIF(TRIM(o.customer_name), '') IS NOT NULL
                 THEN 'n:' || LOWER(TRIM(o.customer_name))
               END,
               'o:' || o.id::text
             ) AS cust_key
           ) g
          WHERE o.tenant_id    = $1
            AND o.claimed_by   = $2
            AND o.claim_status = 'approved'
            AND o.period_ym    = $3
          ORDER BY g.cust_key, COALESCE(o.price_vat, 0) DESC, o.id
       ),
       cbs_only AS (
         SELECT c.cust_key
           FROM cbs_customers c
          WHERE NOT EXISTS (
            SELECT 1
              FROM deals_in_period dip
              LEFT JOIN customers cu
                ON cu.customer_id = dip.customer_id
               AND cu.tenant_id = $1
               AND cu.deleted_at IS NULL
             WHERE dip.customer_id IS NOT NULL
               AND (
                 (c.cbs_customer_id IS NOT NULL AND c.cbs_customer_id = dip.customer_id)
                 OR (
                   c.external_id1 IS NOT NULL
                   AND cu.tax_code IS NOT NULL
                   AND LOWER(TRIM(c.external_id1)) = LOWER(TRIM(cu.tax_code))
                 )
                 OR (
                   c.external_id1 IS NOT NULL
                   AND cu.phone IS NOT NULL
                   AND length(regexp_replace(c.external_id1, '[^0-9]+', '', 'g')) >= 9
                   AND length(regexp_replace(cu.phone, '[^0-9]+', '', 'g')) >= 9
                   AND right(regexp_replace(c.external_id1, '[^0-9]+', '', 'g'), 9)
                     = right(regexp_replace(cu.phone, '[^0-9]+', '', 'g'), 9)
                 )
                 OR (
                   c.customer_name IS NOT NULL
                   AND cu.full_name IS NOT NULL
                   AND LOWER(TRIM(c.customer_name)) = LOWER(TRIM(cu.full_name))
                 )
               )
          )
       )
       SELECT
         (SELECT COUNT(*)::int FROM deals_in_period) AS deal_cnt,
         (SELECT COUNT(*)::int FROM cbs_only) AS cbs_extra_cnt`,
      [tenantId, userId, period]
    )
    const row = r.rows[0] || {}
    return Math.max(
      0,
      Number(row.deal_cnt || 0) + Number(row.cbs_extra_cnt || 0)
    )
  } catch (err) {
    if (err?.code !== '42P01' && err?.code !== '42703') {
      console.error('computeActualApproachCount:', err)
    }
    return 0
  }
}

async function yyyyMmFromMs(ms) {
  const r = await pool.query(
    `SELECT to_char(to_timestamp($1 / 1000.0), 'YYYY-MM') AS ym`,
    [Number(ms) || Date.now()]
  )
  return r.rows[0]?.ym || null
}

async function yyyyMmFromDeal(deal) {
  const ms = Number(
    deal?.expected_closing_date != null
      ? deal.expected_closing_date
      : deal?.updated_at != null
        ? deal.updated_at
        : Date.now()
  )
  return yyyyMmFromMs(ms)
}

function dedupePairs(pairs) {
  const seen = new Set()
  const out = []
  for (const p of pairs) {
    if (!p?.userId || !p?.period) continue
    const k = `${p.userId}|${p.period}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push(p)
  }
  return out
}

/**
 * Tính lại actual_revenue_new / actual_revenue_existing + actual_approach_count
 * cho (tenant × user × period). Luôn UPSERT vào kpis kể cả khi 0 — để UI hiển
 * thị đúng "0 VNĐ" thay vì rỗng.
 */
export async function recomputeKpiActuals(tenantId, userId, period) {
  if (isKpiPeriodActualsLocked(period)) return

  // (1) Doanh thu từ Deal thắng — phân loại theo kpi_customer_kind của customer.
     //     Đồng thời đếm số hợp đồng (deal thắng = 1 HĐ) tách theo loại KH NEW/EXISTING.
  const dealsRes = await pool.query(
    `SELECT
       COALESCE(SUM(
         CASE
           WHEN UPPER(TRIM(COALESCE(c.kpi_customer_kind, 'NEW'))) = 'EXISTING' THEN 0
           ELSE d.amount
         END
       ), 0) AS actual_new,
       COALESCE(SUM(
         CASE
           WHEN UPPER(TRIM(COALESCE(c.kpi_customer_kind, 'NEW'))) = 'EXISTING' THEN d.amount
           ELSE 0
         END
       ), 0) AS actual_existing,
       COALESCE(SUM(
         CASE
           WHEN UPPER(TRIM(COALESCE(c.kpi_customer_kind, 'NEW'))) = 'EXISTING' THEN 0
           ELSE 1
         END
       ), 0) AS product_new,
       COALESCE(SUM(
         CASE
           WHEN UPPER(TRIM(COALESCE(c.kpi_customer_kind, 'NEW'))) = 'EXISTING' THEN 1
           ELSE 0
         END
       ), 0) AS product_existing
     FROM deals d
     LEFT JOIN customers c
       ON c.customer_id = d.customer_id AND c.tenant_id = d.tenant_id AND c.deleted_at IS NULL
     WHERE d.tenant_id = $1
       AND d.assigned_to = $2
       AND COALESCE(d.is_deleted, false) = false
       AND (d.status = 'won' OR LOWER(TRIM(COALESCE(d.stage, ''))) = 'thanh_cong')
       AND to_char(to_timestamp(COALESCE(d.expected_closing_date, d.updated_at) / 1000.0), 'YYYY-MM') = $3`,
    [tenantId, userId, period]
  )
  const dealRow = dealsRes.rows[0] || {}
  let actualNew = toMoney(dealRow.actual_new)
  let actualExisting = toMoney(dealRow.actual_existing)
  let productCountNew = Math.max(0, Math.floor(Number(dealRow.product_new) || 0))
  let productCountExisting = Math.max(0, Math.floor(Number(dealRow.product_existing) || 0))

  // (2) Doanh thu từ CBS Orders đã duyệt NHƯNG KHÔNG có deal_id (avoid double-count).
  //     Ưu tiên kpi_kind_at_approve (snapshot); fallback customers.kpi_customer_kind;
  //     fallback cuối 'NEW'.
  try {
    const cbsRes = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN kind = 'EXISTING' THEN 0 ELSE amount END), 0) AS actual_new,
         COALESCE(SUM(CASE WHEN kind = 'EXISTING' THEN amount ELSE 0 END), 0) AS actual_existing
       FROM (
         SELECT
           COALESCE(o.price_not_vat_round, o.price_not_vat, 0)::numeric AS amount,
           UPPER(COALESCE(
             NULLIF(TRIM(o.kpi_kind_at_approve), ''),
             NULLIF(TRIM(c.kpi_customer_kind), ''),
             CASE
               WHEN o.customer_id IS NULL AND EXISTS (
                 SELECT 1 FROM customers c2
                  WHERE c2.tenant_id = o.tenant_id
                    AND c2.deleted_at IS NULL
                    AND o.external_id1 IS NOT NULL
                    AND (
                      (c2.tax_code IS NOT NULL AND LOWER(TRIM(c2.tax_code)) = LOWER(TRIM(o.external_id1)))
                      OR (c2.phone IS NOT NULL
                          AND length(regexp_replace(c2.phone, '[^0-9]+', '', 'g')) >= 9
                          AND length(regexp_replace(o.external_id1, '[^0-9]+', '', 'g')) >= 9
                          AND right(regexp_replace(c2.phone, '[^0-9]+', '', 'g'), 9)
                            = right(regexp_replace(o.external_id1, '[^0-9]+', '', 'g'), 9))
                    )
               ) THEN 'EXISTING' ELSE 'NEW' END,
             'NEW'
           )) AS kind
         FROM cbs_revenue_orders o
         LEFT JOIN customers c
           ON c.customer_id = o.customer_id AND c.tenant_id = o.tenant_id AND c.deleted_at IS NULL
         WHERE o.tenant_id    = $1
           AND o.claimed_by   = $2
           AND o.claim_status = 'approved'
           AND o.period_ym    = $3
           AND o.deal_id IS NULL   -- chỉ tính CBS khi chưa có deal tương ứng
       ) s`,
      [tenantId, userId, period]
    )
    const cbsRow = cbsRes.rows[0] || {}
    actualNew = toMoney(actualNew + toMoney(cbsRow.actual_new))
    actualExisting = toMoney(actualExisting + toMoney(cbsRow.actual_existing))

    // Mỗi hợp đồng CBS đã duyệt (không có deal_id) = 1 chỉ tiêu sản phẩm (các dòng cùng contract_no gộp).
    // Tách theo loại KH: ưu tiên snapshot kpi_kind_at_approve → customers.kpi_customer_kind → 'NEW'.
    const cbsProductRes = await pool.query(
      `SELECT
         SUM(CASE WHEN kind = 'EXISTING' THEN 0 ELSE 1 END)::int AS cnt_new,
         SUM(CASE WHEN kind = 'EXISTING' THEN 1 ELSE 0 END)::int AS cnt_existing
       FROM (
         SELECT DISTINCT ON (grp_key)
           UPPER(COALESCE(
             NULLIF(TRIM(o.kpi_kind_at_approve), ''),
             NULLIF(TRIM(c.kpi_customer_kind), ''),
             'NEW'
           )) AS kind
         FROM cbs_revenue_orders o
         LEFT JOIN customers c
           ON c.customer_id = o.customer_id AND c.tenant_id = o.tenant_id AND c.deleted_at IS NULL
         CROSS JOIN LATERAL (
           SELECT COALESCE(NULLIF(TRIM(o.contract_no), ''), o.id::text) AS grp_key
         ) g
         WHERE o.tenant_id    = $1
           AND o.claimed_by   = $2
           AND o.claim_status = 'approved'
           AND o.period_ym    = $3
           AND o.deal_id IS NULL
         ORDER BY grp_key, COALESCE(o.price_vat, 0) DESC, o.id
       ) s`,
      [tenantId, userId, period]
    )
    const cbsProdRow = cbsProductRes.rows[0] || {}
    productCountNew += Number(cbsProdRow.cnt_new || 0)
    productCountExisting += Number(cbsProdRow.cnt_existing || 0)
  } catch (err) {
    if (err?.code !== '42P01' && err?.code !== '42703') {
      console.error('recomputeKpiActuals (cbs):', err)
    }
  }

  const approachCount = await computeActualApproachCount(tenantId, userId, period)

  const now = Date.now()
  await pool.query(
    `INSERT INTO kpis (
       id, tenant_id, user_id, period,
       target_revenue_new, target_revenue_existing,
       actual_revenue_new, actual_revenue_existing,
       approach_count, actual_approach_count,
       target_product_count_new, target_product_count_existing,
       actual_product_count_new, actual_product_count_existing,
       created_at, updated_at
     ) VALUES ($1, $2, $3, $4, 0, 0, $5, $6, 0, $7, 0, 0, $8, $9, $10, $10)
     ON CONFLICT (tenant_id, user_id, period)
     DO UPDATE SET
       actual_revenue_new = EXCLUDED.actual_revenue_new,
       actual_revenue_existing = EXCLUDED.actual_revenue_existing,
       actual_approach_count   = EXCLUDED.actual_approach_count,
       actual_product_count_new      = EXCLUDED.actual_product_count_new,
       actual_product_count_existing = EXCLUDED.actual_product_count_existing,
       updated_at = EXCLUDED.updated_at`,
    [
      uuidv4(), tenantId, userId, period,
      actualNew, actualExisting, approachCount,
      productCountNew, productCountExisting, now
    ]
  )
}

/**
 * Chỉ tính lại actual_approach_count (deals + CBS đã duyệt theo khách).
 */
export async function recomputeKpiApproach(tenantId, userId, period) {
  if (!tenantId || !userId || !period) return
  if (isKpiPeriodActualsLocked(period)) return
  try {
    const cnt = await computeActualApproachCount(tenantId, userId, period)
    const now = Date.now()
    await pool.query(
      `INSERT INTO kpis (
         id, tenant_id, user_id, period,
         target_revenue_new, target_revenue_existing,
         actual_revenue_new, actual_revenue_existing,
         approach_count, actual_approach_count, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, 0, 0, 0, 0, 0, $5, $6, $6)
       ON CONFLICT (tenant_id, user_id, period)
       DO UPDATE SET
         actual_approach_count = EXCLUDED.actual_approach_count,
         updated_at = EXCLUDED.updated_at`,
      [uuidv4(), tenantId, userId, period, cnt, now]
    )
  } catch (err) {
    if (err?.code === '42P01' || err?.code === '42703') return
    console.error('recomputeKpiApproach:', err)
  }
}

/**
 * Trigger khi tạo/sửa interaction hoặc hoàn thành task có log tương tác.
 * Approach tính từ deals + CBS (không từ interaction). Giữ no-op tương thích.
 */
export async function syncKpiForInteraction(_tenantId, _employeeId, _interactionDateMs) {
  return
}

/**
 * @param {string} tenantId
 * @param {object|null} beforeDeal
 * @param {object|null} afterDeal
 */
export async function syncKpiForDealsChange(tenantId, beforeDeal, afterDeal) {
  try {
    const pairs = []
    // Với mỗi phiên bản deal (before/after), push 2 period khác nhau:
    //   - Kỳ doanh thu: theo expected_closing_date (fallback updated_at).
    //   - Kỳ tiếp cận: theo created_at (vì actual_approach_count đếm theo created_at).
    // Hai period có thể khác nhau (sale tạo deal tháng này, dự kiến đóng tháng sau)
    // → cần recompute cho CẢ HAI để KPI của tháng tạo và tháng đóng đều đúng.
    for (const d of [beforeDeal, afterDeal]) {
      if (!d?.assigned_to) continue

      const revYm = await yyyyMmFromDeal(d)
      if (revYm) pairs.push({ userId: d.assigned_to, period: revYm })

      if (d.created_at != null) {
        const creYm = await yyyyMmFromMs(d.created_at)
        if (creYm) pairs.push({ userId: d.assigned_to, period: creYm })
      }
    }

    for (const { userId, period } of dedupePairs(pairs)) {
      await recomputeKpiActuals(tenantId, userId, period)
    }
  } catch (err) {
    if (err.code === '42P01' || err.code === '42703') return
    console.error('syncKpiForDealsChange:', err)
  }
}
