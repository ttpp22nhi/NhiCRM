/**
 * Đồng bộ doanh thu CBS → bảng cbs_revenue_orders.
 *  - syncTenant(tenantId): login CBS bằng cấu hình tenant → fetch báo cáo tháng → upsert theo fingerprint.
 *  - syncAllTenants(): quét mọi cấu hình auto_sync=true.
 * Lưu ý: CBS yêu cầu đăng nhập lần gọi → đơn giản hoá bằng cách login mỗi lần.
 */

import crypto from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import pool from '../database.js'
import { currentVNMonthRange, fetchMonthlyReport, loginCbs } from './cbsClient.js'
import { recomputeKpiActuals } from './kpiFromDealsSyncService.js'
import { refreshKpiCustomerKindForTenant } from './customerKindRefreshService.js'
import { createAutoTasksForPendingCbsOrders } from './cbsAutoTaskService.js'

const CBS_TZ_OFFSET_MS = 7 * 60 * 60 * 1000 // Asia/Ho_Chi_Minh = UTC+7

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

function fingerprintFor(item) {
  const key = [
    item.contractNo || '',
    item.productCode || '',
    item.externalId1 || '',
    item.serial || '',
    item.paymentDate || '',
    item.activeDate || '',
    item.priceVat ?? '',
  ]
    .map((v) => String(v).trim())
    .join('|')
  return crypto.createHash('sha1').update(key).digest('hex')
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
 * Upsert một đơn hàng doanh thu, trả về 'inserted' | 'updated' | 'claimed-kept'.
 */
async function upsertOrder(tenantId, item, now) {
  const fp = fingerprintFor(item)
  const paymentMs = toMs(item.paymentDate)
  const periodYm = periodYmFromMs(paymentMs) || periodYmFromMs(toMs(item.activeDate))
  const priceNotVat = toMoneyNumber(item.priceNotVat)
  const priceNotVatRound = toMoneyNumber(item.priceNotVatRound ?? item.priceNotVat)
  const priceVat = toMoneyNumber(item.priceVat)
  const vat = toMoneyNumber(item.vat)

  const existing = await pool.query(
    `SELECT id, claimed_by FROM cbs_revenue_orders WHERE tenant_id = $1 AND fingerprint = $2 LIMIT 1`,
    [tenantId, fp]
  )

  if (existing.rows.length === 0) {
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
        JSON.stringify(item),
        now,
      ]
    )
    return 'inserted'
  }

  await pool.query(
    `UPDATE cbs_revenue_orders SET
      period_ym = $3,
      contract_no = $4, contract_type = $5, product_name = $6, product_code = $7, primary_product_code = $8,
      masp = $9, external_id1 = $10, serial = $11,
      customer_name = $12, customer_type = $13, partner = $14, cen_code_dev = $15,
      cbs_staff = $16, payment_type = $17,
      price_not_vat = $18, price_not_vat_round = $19, price_vat = $20, vat = $21,
      sub_start_date = $22, first_date_revenue = $23, active_date = $24, payment_date = $25,
      raw = $26::jsonb, synced_at = $27, updated_at = $27
     WHERE tenant_id = $1 AND fingerprint = $2`,
    [
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
      JSON.stringify(item),
      now,
    ]
  )
  return 'updated'
}

/**
 * Đồng bộ doanh thu CBS cho 1 tenant theo tháng hiện tại (giờ VN).
 * Trả về { inserted, updated, total }.
 */
export async function syncTenant(tenantId, { range } = {}) {
  if (!tenantId) throw new Error('Thiếu tenantId')
  const cfg = await getCbsConfigRow(tenantId)
  if (!cfg) {
    throw new Error('Tenant chưa cấu hình tài khoản CBS.')
  }

  const now = Date.now()
  await updateSyncStatus(tenantId, 'running', null, now)

  try {
    const { accessToken } = await loginCbs({
      baseUrl: cfg.base_url,
      username: cfg.username,
      password: cfg.password,
    })

    const { from, to } = range || currentVNMonthRange()
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
      const r = await upsertOrder(tenantId, it, now)
      if (r === 'inserted') inserted++
      else if (r === 'updated') updated++
    }

    const msg = `Đồng bộ CBS: nhận ${items.length}, thêm ${inserted}, cập nhật ${updated}.`
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

    return { inserted, updated, total: items.length }
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
