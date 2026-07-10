/**
 * Đồng bộ doanh thu CBS → bảng cbs_revenue_orders.
 *  - syncTenant(tenantId, { range?, period? }): login CBS → fetch báo cáo → upsert theo
 *    khóa nghiệp vụ (HĐ + mã SP + ngày kích hoạt [+ serial nếu có]). Đổi giá → UPDATE, không INSERT.
 *  - fingerprint chỉ dùng phụ (legacy / unique index), không phải khóa chính khi sync.
 *  - Sau upsert: gỡ orphan fingerprint + gỡ unclaimed trùng business key với bản approved.
 *  - syncAllTenants(): quét mọi cấu hình auto_sync=true (luôn dùng tháng hiện tại VN).
 */

import crypto from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import pool from '../database.js'
import { currentVNMonthRange, fetchMonthlyReport, loginCbs, vnMonthRangeFromYyyyMm } from './cbsClient.js'
import { recomputeKpiActuals } from './kpiFromDealsSyncService.js'
import { refreshKpiCustomerKindForTenant } from './customerKindRefreshService.js'
import { createAutoTasksForPendingCbsOrders } from './cbsAutoTaskService.js'

const CBS_TZ_OFFSET_MS = 7 * 60 * 60 * 1000 // Asia/Ho_Chi_Minh = UTC+7
const PERIOD_YM_RE = /^\d{4}-(0[1-9]|1[0-2])$/

function firstDefined(...vals) {
  for (const v of vals) {
    if (v != null && v !== '') return v
  }
  return null
}

/** Chuẩn hoá field CBS (camelCase từ API Mobifone hoặc snake_case nếu có). */
function normalizeCbsReportItem(raw) {
  if (!raw || typeof raw !== 'object') return {}
  const r = raw
  const g = (a, b) => firstDefined(r[a], r[b])

  return {
    subStartDate: g('subStartDate', 'sub_start_date'),
    masp: firstDefined(r.masp, r.MASP),
    contractNo: g('contractNo', 'contract_no'),
    contractType: g('contractType', 'contract_type'),
    vat: g('vat', 'vat'),
    staff: g('staff', 'staff'),
    productName: g('productName', 'product_name'),
    externalId1: g('externalId1', 'external_id1'),
    paymentType: g('paymentType', 'payment_type'),
    firstDateRevenue: g('firstDateRevenue', 'first_date_revenue'),
    primaryProductCode: g('primaryProductCode', 'primary_product_code'),
    customerType: g('customerType', 'customer_type'),
    productCode: g('productCode', 'product_code'),
    partner: g('partner', 'partner'),
    priceNotVat: g('priceNotVat', 'price_not_vat'),
    name: firstDefined(r.name, r.customer_name, r.customerName),
    activeDate: g('activeDate', 'active_date'),
    priceVat: g('priceVat', 'price_vat'),
    priceNotVatRound: g('priceNotVatRound', 'price_not_vat_round'),
    paymentDate: g('paymentDate', 'payment_date'),
    cenCodeDev: g('cenCodeDev', 'cen_code_dev'),
    serial: g('serial', 'serial'),
  }
}

function toMs(value) {
  if (value == null || value === '') return null
  const n = Date.parse(String(value))
  if (Number.isNaN(n)) return null
  return n
}

function toMoneyNumber(v) {
  const n = Number(v)
  return Number.isNaN(n) ? 0 : n
}

function periodYmFromMs(ms) {
  if (ms == null) return null
  const d = new Date(Number(ms) + CBS_TZ_OFFSET_MS)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

/** Ngày lịch (YYYY-MM-DD) theo giờ VN — dùng trong khóa nghiệp vụ, bỏ phần giờ. */
function vnDayKeyFromMs(ms) {
  if (ms == null || !Number.isFinite(Number(ms))) return null
  const d = new Date(Number(ms) + CBS_TZ_OFFSET_MS)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function vnDayKeyFromRaw(value) {
  return vnDayKeyFromMs(toMs(value))
}

function resolveProductCode(item) {
  return String(item.productCode || item.primaryProductCode || '').trim()
}

/**
 * Khóa nghiệp vụ ổn định (không gồm giá):
 *   HĐ + mã SP + ngày kích hoạt (+ serial nếu có)
 * Fallback ngày: paymentDate / firstDateRevenue nếu thiếu activeDate.
 */
function businessKeyParts(item) {
  const contractNo = String(item.contractNo || '').trim()
  const productCode = resolveProductCode(item)
  const serial = String(item.serial || '').trim()
  const activeDay =
    vnDayKeyFromRaw(item.activeDate) ||
    vnDayKeyFromRaw(item.paymentDate) ||
    vnDayKeyFromRaw(item.firstDateRevenue)
  if (!contractNo || !productCode || !activeDay) return null
  return { contractNo, productCode, activeDay, serial: serial || null }
}

/** Fingerprint phụ — vẫn gồm giá để unique index; không dùng làm khóa upsert chính. */
function fingerprintFor(item) {
  const key = [
    item.contractNo || '',
    item.productCode || '',
    item.primaryProductCode || '',
    item.masp || '',
    item.externalId1 || '',
    item.serial || '',
    item.paymentDate || '',
    item.activeDate || '',
    item.firstDateRevenue || '',
    item.priceVat ?? '',
    item.priceNotVatRound ?? item.priceNotVat ?? '',
  ]
    .map((v) => String(v).trim())
    .join('|')
  return crypto.createHash('sha1').update(key).digest('hex')
}

/**
 * Tìm dòng CRM theo khóa nghiệp vụ (ưu tiên approved / đã claim).
 * SQL so sánh active_date theo ngày VN (UTC+7).
 */
async function findExistingByBusinessKey(tenantId, periodYm, item) {
  if (!periodYm) return null
  const parts = businessKeyParts(item)
  if (!parts) return null

  const params = [tenantId, periodYm, parts.contractNo, parts.productCode, parts.activeDay]
  let serialClause = ''
  if (parts.serial) {
    params.push(parts.serial)
    serialClause = `AND TRIM(COALESCE(serial, '')) = $${params.length}`
  }

  const r = await pool.query(
    `SELECT id, fingerprint, claim_status, claimed_by
       FROM cbs_revenue_orders
      WHERE tenant_id = $1
        AND period_ym = $2
        AND TRIM(COALESCE(contract_no, '')) = $3
        AND LOWER(TRIM(COALESCE(product_code, primary_product_code, ''))) = LOWER($4)
        AND to_char(
              to_timestamp(
                COALESCE(active_date, payment_date, first_date_revenue) / 1000.0
              ) AT TIME ZONE 'Asia/Ho_Chi_Minh',
              'YYYY-MM-DD'
            ) = $5
        ${serialClause}
      ORDER BY
        CASE WHEN claim_status = 'approved' THEN 0
             WHEN claimed_by IS NOT NULL THEN 1
             ELSE 2 END,
        COALESCE(price_vat, 0) DESC,
        id
      LIMIT 1`,
    params
  )
  return r.rows[0] || null
}

/**
 * Gỡ unclaimed trùng khóa nghiệp vụ với bản đã approved
 * (cùng HĐ + SP + ngày kích hoạt [+ serial]).
 */
async function removeDuplicateUnclaimedByBusinessKey(tenantId, periodYm) {
  if (!tenantId || !periodYm) return 0
  try {
    const del = await pool.query(
      `DELETE FROM cbs_revenue_orders o
        WHERE o.tenant_id = $1
          AND o.period_ym = $2
          AND COALESCE(LOWER(TRIM(o.claim_status)), '') <> 'approved'
          AND o.claimed_by IS NULL
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
                     to_timestamp(
                       COALESCE(a.active_date, a.payment_date, a.first_date_revenue) / 1000.0
                     ) AT TIME ZONE 'Asia/Ho_Chi_Minh',
                     'YYYY-MM-DD'
                   )
                 = to_char(
                     to_timestamp(
                       COALESCE(o.active_date, o.payment_date, o.first_date_revenue) / 1000.0
                     ) AT TIME ZONE 'Asia/Ho_Chi_Minh',
                     'YYYY-MM-DD'
                   )
               AND TRIM(COALESCE(a.serial, '')) = TRIM(COALESCE(o.serial, ''))
          )`,
      [tenantId, periodYm]
    )
    return del.rowCount || 0
  } catch (err) {
    if (err?.code !== '42P01' && err?.code !== '42703') {
      console.error('removeDuplicateUnclaimedByBusinessKey:', err)
    }
    return 0
  }
}

function buildOrderFieldParams(item, periodYm, priceNotVat, priceNotVatRound, priceVat, vat, paymentMs, rawItem, now) {
  return {
    periodYm,
    contractNo: item.contractNo || null,
    contractType: item.contractType || null,
    productName: item.productName || null,
    productCode: item.productCode || null,
    primaryProductCode: item.primaryProductCode || null,
    masp: item.masp || null,
    externalId1: item.externalId1 || null,
    serial: item.serial || null,
    customerName: item.name || null,
    customerType: item.customerType || null,
    partner: item.partner || null,
    cenCodeDev: item.cenCodeDev || null,
    cbsStaff: item.staff || null,
    paymentType: item.paymentType || null,
    priceNotVat,
    priceNotVatRound,
    priceVat,
    vat,
    subStartDate: toMs(item.subStartDate),
    firstDateRevenue: toMs(item.firstDateRevenue),
    activeDate: toMs(item.activeDate),
    paymentDate: paymentMs,
    raw: JSON.stringify(rawItem),
    now,
  }
}

async function getCbsConfigRow(tenantId) {
  const r = await pool.query(
    `SELECT tenant_id, base_url, username, password, unit, report_config_code, auto_sync
     FROM cbs_config WHERE tenant_id = $1 LIMIT 1`,
    [tenantId]
  )
  return r.rows[0] || null
}

async function listAutoSyncTenants() {
  const r = await pool.query(
    `SELECT tenant_id FROM cbs_config
     WHERE auto_sync = true AND username <> '' AND password <> ''`
  )
  return r.rows.map((x) => x.tenant_id)
}

async function updateSyncStatus(tenantId, status, message, now = Date.now()) {
  // Tách "synced_at" ra biến JS để mỗi placeholder chỉ gắn với một kiểu cột duy nhất
  // (tránh lỗi Postgres: "inconsistent types deduced for parameter").
  const syncedAt = status === 'success' ? now : null
  const trimmedMessage = message ? String(message).slice(0, 500) : null
  await pool.query(
    `UPDATE cbs_config
       SET last_sync_status = $2::varchar,
           last_sync_message = $3::text,
           last_synced_at = COALESCE($4::bigint, last_synced_at),
           updated_at = $5::bigint
     WHERE tenant_id = $1::varchar`,
    [tenantId, status, trimmedMessage, syncedAt, now]
  )
}

/**
 * @param {string} tenantId
 * @param {object} rawItem — một dòng từ CBS export-report-online
 * @param {number} now
 * @param {{ periodYmFromSync?: string | null }} [options] — kỳ KPI (YYYY-MM) khớp lần sync
 */
async function upsertOrder(tenantId, rawItem, now, options = {}) {
  const item = normalizeCbsReportItem(rawItem)
  const { periodYmFromSync } = options
  const fp = fingerprintFor(item)
  const paymentMs = toMs(item.paymentDate)
  const syncYm =
    periodYmFromSync && PERIOD_YM_RE.test(String(periodYmFromSync).trim())
      ? String(periodYmFromSync).trim()
      : null
  const periodYm =
    syncYm ||
    periodYmFromMs(paymentMs) ||
    periodYmFromMs(toMs(item.activeDate)) ||
    periodYmFromMs(toMs(item.firstDateRevenue))
  const priceNotVat = toMoneyNumber(item.priceNotVat)
  const priceNotVatRound = toMoneyNumber(item.priceNotVatRound ?? item.priceNotVat)
  const priceVat = toMoneyNumber(item.priceVat)
  const vat = toMoneyNumber(item.vat)
  const fields = buildOrderFieldParams(
    item, periodYm, priceNotVat, priceNotVatRound, priceVat, vat, paymentMs, rawItem, now
  )

  /** UPDATE CBS fields + fingerprint; giữ claim/approve. */
  const updateExistingRow = async (rowId) => {
    // Tránh conflict unique (tenant_id, fingerprint) khi giá đổi tạo fp mới
    // mà bản unclaimed trùng fp đã tồn tại.
    await pool.query(
      `DELETE FROM cbs_revenue_orders
        WHERE tenant_id = $1
          AND fingerprint = $2
          AND id <> $3
          AND claimed_by IS NULL
          AND COALESCE(LOWER(TRIM(claim_status)), '') <> 'approved'`,
      [tenantId, fp, rowId]
    )
    await pool.query(
      `UPDATE cbs_revenue_orders SET
        fingerprint = $3,
        period_ym = $4,
        contract_no = $5, contract_type = $6, product_name = $7, product_code = $8, primary_product_code = $9,
        masp = $10, external_id1 = $11, serial = $12,
        customer_name = $13, customer_type = $14, partner = $15, cen_code_dev = $16,
        cbs_staff = $17, payment_type = $18,
        price_not_vat = $19, price_not_vat_round = $20, price_vat = $21, vat = $22,
        sub_start_date = $23, first_date_revenue = $24, active_date = $25, payment_date = $26,
        raw = $27::jsonb, synced_at = $28, updated_at = $28
       WHERE tenant_id = $1 AND id = $2`,
      [
        tenantId,
        rowId,
        fp,
        fields.periodYm,
        fields.contractNo,
        fields.contractType,
        fields.productName,
        fields.productCode,
        fields.primaryProductCode,
        fields.masp,
        fields.externalId1,
        fields.serial,
        fields.customerName,
        fields.customerType,
        fields.partner,
        fields.cenCodeDev,
        fields.cbsStaff,
        fields.paymentType,
        fields.priceNotVat,
        fields.priceNotVatRound,
        fields.priceVat,
        fields.vat,
        fields.subStartDate,
        fields.firstDateRevenue,
        fields.activeDate,
        fields.paymentDate,
        fields.raw,
        fields.now,
      ]
    )
  }

  // 1) Khóa nghiệp vụ trước (HĐ + SP + ngày kích hoạt [+ serial]) → đổi giá = UPDATE
  const byBiz = await findExistingByBusinessKey(tenantId, periodYm, item)
  if (byBiz) {
    await updateExistingRow(byBiz.id)
    return 'updated'
  }

  // 2) Legacy: khớp fingerprint cũ (cùng giá/ngày)
  const byFp = await pool.query(
    `SELECT id FROM cbs_revenue_orders WHERE tenant_id = $1 AND fingerprint = $2 LIMIT 1`,
    [tenantId, fp]
  )
  if (byFp.rows.length > 0) {
    await updateExistingRow(byFp.rows[0].id)
    return 'updated'
  }

  // 3) INSERT mới
  await pool.query(
    `INSERT INTO cbs_revenue_orders (
      id, tenant_id, fingerprint, period_ym,
      contract_no, contract_type, product_name, product_code, primary_product_code,
      masp, external_id1, serial,
      customer_name, customer_type, partner, cen_code_dev,
      cbs_staff, payment_type,
      price_not_vat, price_not_vat_round, price_vat, vat,
      sub_start_date, first_date_revenue, active_date, payment_date,
      raw, synced_at, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4,
      $5, $6, $7, $8, $9,
      $10, $11, $12,
      $13, $14, $15, $16,
      $17, $18,
      $19, $20, $21, $22,
      $23, $24, $25, $26,
      $27::jsonb, $28, $28, $28
    )`,
    [
      uuidv4(),
      tenantId,
      fp,
      periodYm,
      item.contractNo || null,
      item.contractType || null,
      item.productName || null,
      item.productCode || null,
      item.primaryProductCode || null,
      item.masp || null,
      item.externalId1 || null,
      item.serial || null,
      item.name || null,
      item.customerType || null,
      item.partner || null,
      item.cenCodeDev || null,
      item.staff || null,
      item.paymentType || null,
      priceNotVat,
      priceNotVatRound,
      priceVat,
      vat,
      toMs(item.subStartDate),
      toMs(item.firstDateRevenue),
      toMs(item.activeDate),
      paymentMs,
      JSON.stringify(rawItem),
      now,
    ]
  )
  return 'inserted'
}

/**
 * Đồng bộ doanh thu CBS cho 1 tenant.
 * @param {string} tenantId
 * @param {{ range?: { from: Date, to: Date }, period?: string }} [opts]
 *        - period: YYYY-MM — fetch đúng kỳ đó (cho đồng bộ tay khi xem tháng cũ)
 *        - range: override from/to trực tiếp
 *        - mặc định: tháng hiện tại (giờ VN)
 * Trả về { inserted, updated, total, synced_for_period, removed_orphans }.
 */
export async function syncTenant(tenantId, { range, period } = {}) {
  if (!tenantId) throw new Error('Thiếu tenantId')
  const cfg = await getCbsConfigRow(tenantId)
  if (!cfg) {
    throw new Error('Tenant chưa cấu hình tài khoản CBS.')
  }

  let syncedForPeriod = null
  let resolvedRange = range
  if (!resolvedRange && period && PERIOD_YM_RE.test(String(period).trim())) {
    const p = String(period).trim()
    const mr = vnMonthRangeFromYyyyMm(p)
    if (mr) {
      resolvedRange = { from: mr.from, to: mr.to }
      syncedForPeriod = p
    }
  }
  if (!resolvedRange) {
    const cur = currentVNMonthRange()
    resolvedRange = { from: cur.from, to: cur.to }
    syncedForPeriod = `${cur.year}-${String(cur.month).padStart(2, '0')}`
  } else if (syncedForPeriod == null && resolvedRange.from) {
    syncedForPeriod = periodYmFromMs(resolvedRange.from.getTime()) || null
  }

  const now = Date.now()
  await updateSyncStatus(tenantId, 'running', null, now)

  try {
    const { accessToken } = await loginCbs({
      baseUrl: cfg.base_url,
      username: cfg.username,
      password: cfg.password,
    })

    const { from, to } = resolvedRange
    const items = await fetchMonthlyReport({
      baseUrl: cfg.base_url,
      accessToken,
      unit: cfg.unit,
      reportConfigCode: cfg.report_config_code,
      from,
      to,
    })

    let inserted = 0
    let updated = 0
    for (const it of items) {
      const r = await upsertOrder(tenantId, it, now, { periodYmFromSync: syncedForPeriod })
      if (r === 'inserted') inserted++
      else if (r === 'updated') updated++
    }

    // Gỡ dòng trong kỳ không còn trong gói CBS (giữ đơn đã approved để không mất chốt).
    // Lưu ý SQL: NOT (fingerprint = ANY(...)) với fingerprint NULL cho kết quả UNKNOWN → không xóa;
    // phải thêm fingerprint IS NULL để gỡ dòng hỏng / import cũ.
    let removedOrphans = 0
    let fpArr = []
    if (syncedForPeriod && items.length > 0) {
      const fpSet = new Set()
      for (const it of items) {
        fpSet.add(fingerprintFor(normalizeCbsReportItem(it)))
      }
      fpArr = [...fpSet]
      if (fpArr.length > 0) {
        try {
          const del = await pool.query(
            `DELETE FROM cbs_revenue_orders
             WHERE tenant_id   = $1
               AND period_ym   = $2
               AND (fingerprint IS NULL OR NOT (fingerprint = ANY($3::text[])))
               AND COALESCE(LOWER(TRIM(claim_status)), '') <> 'approved'`,
            [tenantId, syncedForPeriod, fpArr]
          )
          removedOrphans = del.rowCount || 0
        } catch (delErr) {
          if (delErr?.code !== '42P01' && delErr?.code !== '42703') {
            console.error('syncTenant removeOrphans:', delErr)
          }
        }
      }
    }

    let removedDupes = 0
    let remainingInPeriod = 0
    let approvedOrphansKept = 0
    if (syncedForPeriod) {
      removedDupes = await removeDuplicateUnclaimedByBusinessKey(tenantId, syncedForPeriod)
      try {
        const cnt = await pool.query(
          `SELECT COUNT(*)::int AS n
             FROM cbs_revenue_orders
            WHERE tenant_id = $1 AND period_ym = $2`,
          [tenantId, syncedForPeriod]
        )
        remainingInPeriod = cnt.rows[0]?.n ?? 0
        if (items.length > 0 && fpArr.length > 0) {
          const apk = await pool.query(
            `SELECT COUNT(*)::int AS n
               FROM cbs_revenue_orders
              WHERE tenant_id = $1
                AND period_ym   = $2
                AND COALESCE(LOWER(TRIM(claim_status)), '') = 'approved'
                AND (fingerprint IS NULL OR NOT (fingerprint = ANY($3::text[])))`,
            [tenantId, syncedForPeriod, fpArr]
          )
          approvedOrphansKept = apk.rows[0]?.n ?? 0
        }
      } catch (cntErr) {
        if (cntErr?.code !== '42P01' && cntErr?.code !== '42703') {
          console.error('syncTenant count period:', cntErr)
        }
      }
    }

    const msg =
      syncedForPeriod && (removedOrphans > 0 || removedDupes > 0 || remainingInPeriod > 0 || items.length > 0)
        ? `Đồng bộ CBS (kỳ ${syncedForPeriod}): nhận ${items.length}, thêm ${inserted}, cập nhật ${updated}${
            removedOrphans > 0
              ? `, gỡ ${removedOrphans} dòng thừa (không còn trong CBS, chưa duyệt)`
              : ''
          }${
            removedDupes > 0
              ? `, gỡ ${removedDupes} dòng trùng khóa nghiệp vụ (đã có bản duyệt)`
              : ''
          }. Trong CRM kỳ này còn ${remainingInPeriod} đơn.${
            approvedOrphansKept > 0
              ? ` (${approvedOrphansKept} đơn đã duyệt không nằm trong file CBS — giữ để chốt KPI.)`
              : ''
          }`
        : `Đồng bộ CBS (kỳ ${syncedForPeriod || '—'}): nhận ${items.length}, thêm ${inserted}, cập nhật ${updated}.`
    await updateSyncStatus(tenantId, 'success', msg, Date.now())

    // Backfill KPI actuals cho tất cả (claimed_by, period_ym) có đơn đã duyệt trong tenant.
    // Không chặn luồng sync: log lỗi thầm lặng.
    try {
      const pairs = await pool.query(
        `SELECT DISTINCT claimed_by, period_ym
           FROM cbs_revenue_orders
          WHERE tenant_id    = $1
            AND claim_status = 'approved'
            AND claimed_by   IS NOT NULL
            AND period_ym    IS NOT NULL`,
        [tenantId]
      )
      for (const p of pairs.rows) {
        try {
          await recomputeKpiActuals(tenantId, p.claimed_by, p.period_ym)
        } catch (err) {
          if (err?.code !== '42P01' && err?.code !== '42703') {
            console.error('syncTenant recomputeKpi:', err)
          }
        }
      }
    } catch (err) {
      if (err?.code !== '42P01' && err?.code !== '42703') {
        console.error('syncTenant list kpi pairs:', err)
      }
    }

    // Auto-promote NEW → EXISTING cho khách đã có doanh thu.
    try {
      await refreshKpiCustomerKindForTenant(tenantId)
    } catch (err) {
      if (err?.code !== '42P01' && err?.code !== '42703') {
        console.error('syncTenant refreshKind:', err)
      }
    }

    // Tạo task nhắc xác nhận người bán cho đơn chưa có chủ / pending lâu.
    try {
      await createAutoTasksForPendingCbsOrders(tenantId)
    } catch (err) {
      if (err?.code !== '42P01' && err?.code !== '42703') {
        console.error('syncTenant autoTask:', err)
      }
    }

    return {
      inserted,
      updated,
      total: items.length,
      synced_for_period: syncedForPeriod,
      removed_orphans: removedOrphans,
    }
  } catch (err) {
    const message = err?.message || 'Lỗi không xác định'
    await updateSyncStatus(tenantId, 'error', message, Date.now())
    throw err
  }
}

/**
 * Duyệt tất cả tenant có auto_sync = true, đồng bộ tuần tự (tránh rate-limit CBS).
 */
export async function syncAllTenants() {
  const tenantIds = await listAutoSyncTenants()
  const results = []
  for (const tid of tenantIds) {
    try {
      const r = await syncTenant(tid)
      results.push({ tenantId: tid, ok: true, ...r })
    } catch (err) {
      results.push({ tenantId: tid, ok: false, error: err?.message || String(err) })
    }
  }
  return results
}
