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
 * Phân loại approach (Tiếp cận thực hiện):
 *   - Lấy trực tiếp từ bảng DEALS: mỗi deal mà sale (assigned_to) tạo trong kỳ
 *     = 1 lần tiếp cận. Lý do: pipeline đã có đầy đủ stages Tiếp cận → Tư vấn
 *     → Báo giá → Thương thảo → Thành công, việc tạo deal (stage khởi điểm
 *     luôn là "tiep_can") đã phản ánh hành động tiếp cận khách/ cơ hội.
 *   - Tính theo d.created_at thuộc period (YYYY-MM), loại trừ deal bị xóa mềm
 *     hoặc có status 'trashed'. Deal bị 'cancelled' / 'lost' vẫn tính (sale
 *     đã thực hiện tiếp cận, chỉ là không chốt được).
 */

function toMoney(n) {
  const x = Number(n)
  if (Number.isNaN(x)) return 0
  return Math.round(x * 100) / 100
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
  //     Đồng thời tính số lượng sản phẩm bán ra tách theo loại KH:
  //     SUM(COALESCE(quantity, 1)) group by NEW/EXISTING — mỗi deal tối thiểu
  //     = 1 sản phẩm (cùng mã bán cho 5 khách = 5).
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
           ELSE COALESCE(d.quantity, 1)
         END
       ), 0) AS product_new,
       COALESCE(SUM(
         CASE
           WHEN UPPER(TRIM(COALESCE(c.kpi_customer_kind, 'NEW'))) = 'EXISTING' THEN COALESCE(d.quantity, 1)
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

    // Mỗi CBS order đã duyệt (không có deal_id) = 1 sản phẩm bán ra.
    // Tách theo loại KH: ưu tiên snapshot kpi_kind_at_approve → customers.kpi_customer_kind → 'NEW'.
    const cbsProductRes = await pool.query(
      `SELECT
         SUM(CASE WHEN kind = 'EXISTING' THEN 0 ELSE 1 END)::int AS cnt_new,
         SUM(CASE WHEN kind = 'EXISTING' THEN 1 ELSE 0 END)::int AS cnt_existing
       FROM (
         SELECT UPPER(COALESCE(
           NULLIF(TRIM(o.kpi_kind_at_approve), ''),
           NULLIF(TRIM(c.kpi_customer_kind), ''),
           'NEW'
         )) AS kind
         FROM cbs_revenue_orders o
         LEFT JOIN customers c
           ON c.customer_id = o.customer_id AND c.tenant_id = o.tenant_id AND c.deleted_at IS NULL
         WHERE o.tenant_id    = $1
           AND o.claimed_by   = $2
           AND o.claim_status = 'approved'
           AND o.period_ym    = $3
           AND o.deal_id IS NULL
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

  // (3) Số lần tiếp cận thực tế — số deal sale tạo trong kỳ (mỗi deal = 1 cơ hội
  //     đã được tiếp cận). Lấy theo d.created_at để không phụ thuộc stage hiện tại.
  let approachCount = 0
  try {
    const ap = await pool.query(
      `SELECT COUNT(*)::int AS cnt
         FROM deals d
        WHERE d.tenant_id   = $1
          AND d.assigned_to = $2
          AND COALESCE(d.is_deleted, false) = false
          AND COALESCE(LOWER(TRIM(d.status)), 'active') <> 'trashed'
          AND d.created_at IS NOT NULL
          AND to_char(to_timestamp(d.created_at / 1000.0), 'YYYY-MM') = $3`,
      [tenantId, userId, period]
    )
    approachCount = Number(ap.rows[0]?.cnt || 0)
  } catch (err) {
    if (err?.code !== '42P01' && err?.code !== '42703') {
      console.error('recomputeKpiActuals (approach):', err)
    }
  }

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
 * Chỉ tính lại approach_count từ bảng deals. Nhẹ hơn recomputeKpiActuals.
 * Được gọi khi tạo/sửa/xoá/restore deal — nhưng thực tế đã gộp trong
 * recomputeKpiActuals nên hiếm khi cần dùng riêng. Giữ để tương thích.
 */
export async function recomputeKpiApproach(tenantId, userId, period) {
  if (!tenantId || !userId || !period) return
  if (isKpiPeriodActualsLocked(period)) return
  try {
    const ap = await pool.query(
      `SELECT COUNT(*)::int AS cnt
         FROM deals d
        WHERE d.tenant_id   = $1
          AND d.assigned_to = $2
          AND COALESCE(d.is_deleted, false) = false
          AND COALESCE(LOWER(TRIM(d.status)), 'active') <> 'trashed'
          AND d.created_at IS NOT NULL
          AND to_char(to_timestamp(d.created_at / 1000.0), 'YYYY-MM') = $3`,
      [tenantId, userId, period]
    )
    const cnt = Number(ap.rows[0]?.cnt || 0)
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
 * Từ 2026-04: approach tính từ deals → interaction không ảnh hưởng KPI approach
 * nữa. Giữ hàm để tương thích (no-op, không chạy SQL) — các controller import
 * nó không bị break, mà cũng không tốn CPU thừa.
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
