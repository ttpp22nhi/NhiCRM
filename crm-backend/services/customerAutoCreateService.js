/**
 * Dịch vụ tìm / tạo khách hàng từ một đơn CBS khi approve.
 *
 * Quy tắc khớp (existing) — match 1 trong 2 là coi là KH cũ:
 *   (a) tax_code trùng (so không phân biệt hoa thường).
 *   (b) 9 chữ số cuối của số điện thoại trùng (loại mọi ký tự phi số).
 *
 * Nếu không khớp → tạo khách hàng mới với:
 *   - full_name    = customer_name của CBS order
 *   - tax_code     = external_id1 nếu "trông giống MST" (>=10 ký tự, không phải số điện thoại)
 *   - phone        = external_id1 nếu là số điện thoại VN (9–11 số)
 *   - customer_type= 'company' (CBS chủ yếu là đơn DN)
 *   - kpi_customer_kind = 'NEW'
 *   - assigned_to  = claimed_by (người bán vừa được duyệt)
 *   - source       = 'CBS'
 *
 * Trả về: { customer_id, kind, created }
 *   - kind: 'NEW' | 'EXISTING' (đánh giá tại thời điểm gọi)
 *   - created: true nếu vừa tạo mới
 */

import { v4 as uuidv4 } from 'uuid'
import pool from '../database.js'

function normPhoneDigits(raw) {
  if (raw == null) return ''
  return String(raw).replace(/[^0-9]+/g, '')
}

function looksLikePhone(raw) {
  const d = normPhoneDigits(raw)
  return d.length >= 9 && d.length <= 11
}

function looksLikeTaxCode(raw) {
  if (raw == null) return false
  const s = String(raw).trim()
  // MST VN: 10 hoặc 13 (10-3) ký tự số, có thể chèn dấu '-'.
  const digits = s.replace(/[^0-9]+/g, '')
  if (digits.length >= 10 && digits.length <= 14 && !looksLikePhone(raw)) return true
  // Một số mã khách CBS không phải số — vẫn dùng làm tax_code cho an toàn.
  if (s.length >= 8 && !/^\d+$/.test(s)) return true
  return false
}

/**
 * @param {object} client Transaction client (pool hoặc client đã BEGIN) — dùng pool.query nếu không truyền
 * @param {string} tenantId
 * @param {object} order  cbs_revenue_orders row (đã có id, customer_name, external_id1, claimed_by,…)
 * @param {string|null} actorUserId Người thực hiện duyệt (để ghi assigned_to nếu chưa có)
 * @returns {Promise<{ customer_id:string, kind:'NEW'|'EXISTING', created:boolean }>}
 */
export async function linkOrCreateCustomerForCbsOrder(client, tenantId, order, actorUserId) {
  const db = client || pool
  const ext = (order.external_id1 || '').trim()
  const name = (order.customer_name || '').trim() || 'Khách hàng từ CBS'
  const sellerId = order.claimed_by || actorUserId || null

  // 0) Nếu đơn đã có customer_id hợp lệ → dùng lại
  if (order.customer_id) {
    const cur = await db.query(
      `SELECT customer_id, kpi_customer_kind
         FROM customers
        WHERE customer_id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [order.customer_id, tenantId]
    )
    if (cur.rows.length > 0) {
      return {
        customer_id: cur.rows[0].customer_id,
        kind: (cur.rows[0].kpi_customer_kind || 'EXISTING').toUpperCase() === 'NEW' ? 'NEW' : 'EXISTING',
        created: false,
      }
    }
  }

  // 1) Match theo tax_code (ưu tiên)
  if (ext) {
    const byTax = await db.query(
      `SELECT customer_id, kpi_customer_kind
         FROM customers
        WHERE tenant_id = $1
          AND deleted_at IS NULL
          AND tax_code IS NOT NULL
          AND LOWER(TRIM(tax_code)) = LOWER($2)
        LIMIT 1`,
      [tenantId, ext]
    )
    if (byTax.rows.length > 0) {
      return {
        customer_id: byTax.rows[0].customer_id,
        kind: 'EXISTING',
        created: false,
      }
    }
  }

  // 2) Match theo phone (9 số cuối)
  const digits = normPhoneDigits(ext)
  if (digits.length >= 9) {
    const byPhone = await db.query(
      `SELECT customer_id, kpi_customer_kind
         FROM customers
        WHERE tenant_id = $1
          AND deleted_at IS NULL
          AND phone IS NOT NULL
          AND length(regexp_replace(phone, '[^0-9]+', '', 'g')) >= 9
          AND right(regexp_replace(phone, '[^0-9]+', '', 'g'), 9) = right($2, 9)
        LIMIT 1`,
      [tenantId, digits]
    )
    if (byPhone.rows.length > 0) {
      return {
        customer_id: byPhone.rows[0].customer_id,
        kind: 'EXISTING',
        created: false,
      }
    }
  }

  // 3) Không khớp → tạo mới (NEW).
  const newId = uuidv4()
  const now = Date.now()
  const isPhone = looksLikePhone(ext)
  const isTax = !isPhone && looksLikeTaxCode(ext)
  const phoneValue = isPhone ? digits : '' // cột phone NOT NULL → dùng chuỗi rỗng khi không có
  const taxValue = isTax ? ext : null

  await db.query(
    `INSERT INTO customers (
       customer_id, full_name, email, phone, address, customer_type, kpi_customer_kind,
       company_name, tax_code, source, assigned_to, tenant_id, created_at, updated_at
     ) VALUES ($1, $2, '', $3, '', 'company', 'NEW',
               $4, $5, 'CBS', $6, $7, $8, $8)`,
    [newId, name, phoneValue, name, taxValue, sellerId, tenantId, now]
  )

  return { customer_id: newId, kind: 'NEW', created: true }
}

/**
 * Tìm deal phù hợp để link với đơn CBS approved. Chiến lược 3 tầng:
 *   1) Deal đã WON cùng customer, cùng period_ym, amount khớp ±5% (chặt chẽ).
 *   2) Deal ACTIVE (chưa won/lost/cancelled/trashed) của cùng customer, amount
 *      khớp ±20% — sẽ được auto-promote lên "Thành công" sau khi link.
 *   3) Deal ACTIVE gần nhất của customer (không cần khớp amount) — dùng để
 *      đảm bảo đơn CBS không mồ côi khi sale chưa cập nhật số liệu chuẩn.
 *
 * Trả về { deal_id, needs_promote } — needs_promote=true nếu deal chưa won.
 */
export async function findMatchingDealForCbsOrder(client, tenantId, order) {
  const db = client || pool
  if (!order?.customer_id) return { deal_id: null, needs_promote: false }

  const amount = Number(order.price_not_vat_round ?? order.price_not_vat ?? 0)
  const lo5 = amount > 0 ? amount * 0.95 : 0
  const hi5 = amount > 0 ? amount * 1.05 : Number.MAX_SAFE_INTEGER
  const lo20 = amount > 0 ? amount * 0.8 : 0
  const hi20 = amount > 0 ? amount * 1.2 : Number.MAX_SAFE_INTEGER
  const period = order.period_ym || null

  if (period) {
    const won = await db.query(
      `SELECT d.deal_id
         FROM deals d
        WHERE d.tenant_id  = $1
          AND d.customer_id = $2
          AND COALESCE(d.is_deleted, false) = false
          AND (d.status = 'won' OR LOWER(TRIM(COALESCE(d.stage, ''))) = 'thanh_cong')
          AND to_char(to_timestamp(COALESCE(d.expected_closing_date, d.updated_at) / 1000.0), 'YYYY-MM') = $3
          AND (d.amount = 0 OR d.amount BETWEEN $4 AND $5)
        ORDER BY d.updated_at DESC NULLS LAST
        LIMIT 1`,
      [tenantId, order.customer_id, period, lo5, hi5]
    )
    if (won.rows[0]?.deal_id) {
      return { deal_id: won.rows[0].deal_id, needs_promote: false }
    }
  }

  const active = await db.query(
    `SELECT d.deal_id
       FROM deals d
      WHERE d.tenant_id  = $1
        AND d.customer_id = $2
        AND COALESCE(d.is_deleted, false) = false
        AND COALESCE(LOWER(TRIM(d.status)), 'active') NOT IN ('trashed', 'cancelled', 'lost', 'won')
        AND (d.amount = 0 OR d.amount BETWEEN $3 AND $4)
      ORDER BY d.updated_at DESC NULLS LAST, d.created_at DESC NULLS LAST
      LIMIT 1`,
    [tenantId, order.customer_id, lo20, hi20]
  )
  if (active.rows[0]?.deal_id) {
    return { deal_id: active.rows[0].deal_id, needs_promote: true }
  }

  const latest = await db.query(
    `SELECT d.deal_id
       FROM deals d
      WHERE d.tenant_id  = $1
        AND d.customer_id = $2
        AND COALESCE(d.is_deleted, false) = false
        AND COALESCE(LOWER(TRIM(d.status)), 'active') NOT IN ('trashed', 'cancelled', 'lost')
      ORDER BY d.updated_at DESC NULLS LAST, d.created_at DESC NULLS LAST
      LIMIT 1`,
    [tenantId, order.customer_id]
  )
  if (latest.rows[0]?.deal_id) {
    return { deal_id: latest.rows[0].deal_id, needs_promote: true }
  }

  return { deal_id: null, needs_promote: false }
}

/**
 * Auto-promote deal lên stage "Thành công" + status "won" khi CBS đã approve.
 * Đồng thời đồng bộ amount / expected_closing_date theo CBS (nguồn chuẩn).
 * Nếu deal đang ở stage 'thanh_cong' + status='won' → chỉ update các field
 * chênh lệch (vd amount rỗng). No-op nếu deal đã chuẩn.
 */
export async function promoteDealToWonFromCbs(client, tenantId, dealId, order) {
  const db = client || pool
  if (!dealId || !order) return null

  const cbsAmount = Number(order.price_not_vat_round ?? order.price_not_vat ?? 0)
  const paymentMs = Number(order.payment_date) || Number(order.active_date) || null
  const now = Date.now()

  const cur = await db.query(
    `SELECT deal_id, stage, status, amount, expected_closing_date,
            display_code, assigned_to, customer_id, deal_category
       FROM deals
      WHERE deal_id = $1 AND tenant_id = $2
      FOR UPDATE`,
    [dealId, tenantId]
  )
  if (cur.rows.length === 0) return null
  const d = cur.rows[0]
  const stageNow = String(d.stage || '').trim().toLowerCase()
  const statusNow = String(d.status || '').trim().toLowerCase() || 'active'

  const needStage = stageNow !== 'thanh_cong'
  const needStatus = statusNow !== 'won'
  const dealAmt = Number(d.amount || 0)
  const amountGap =
    cbsAmount > 0 && (dealAmt === 0 || Math.abs(dealAmt - cbsAmount) / Math.max(dealAmt, cbsAmount) > 0.05)
  const needAmount = cbsAmount > 0 && amountGap
  const needClose = !d.expected_closing_date && Number.isFinite(paymentMs)

  if (!needStage && !needStatus && !needAmount && !needClose) {
    return { changed: false, ...d, stage_before: d.stage, stage_after: d.stage }
  }

  await db.query(
    `UPDATE deals SET
        stage = CASE WHEN $3 THEN 'thanh_cong' ELSE stage END,
        status = CASE WHEN $4 THEN 'won' ELSE status END,
        amount = CASE WHEN $5 THEN $6::numeric ELSE amount END,
        expected_closing_date = CASE WHEN $7 THEN $8::bigint ELSE expected_closing_date END,
        updated_at = $9
      WHERE deal_id = $1 AND tenant_id = $2`,
    [dealId, tenantId, needStage, needStatus, needAmount, cbsAmount || 0, needClose, paymentMs || 0, now]
  )

  return {
    changed: true,
    deal_id: dealId,
    assigned_to: d.assigned_to || null,
    customer_id: d.customer_id || null,
    display_code: d.display_code || null,
    deal_category: d.deal_category || 'MASS',
    stage_before: d.stage || null,
    stage_after: needStage ? 'thanh_cong' : d.stage,
    status_after: needStatus ? 'won' : statusNow,
    amount_before: dealAmt,
    amount_after: needAmount ? cbsAmount : dealAmt,
    changed_stage: needStage,
    changed_status: needStatus,
    changed_amount: needAmount,
    changed_closing: needClose,
  }
}
