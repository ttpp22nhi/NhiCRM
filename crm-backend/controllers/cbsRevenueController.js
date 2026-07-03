/**
 * CBS revenue controller
 * - Cấu hình CBS (username/password/unit) cho tenant: admin tenant hoặc super admin
 * - Danh sách đơn doanh thu CBS đã đồng bộ: mọi nhân viên trong tenant
 * - Quy trình xác nhận người bán:
 *     + Sales: POST /claim (không có seller_id) → pending hoặc auto-approve (theo cbs_config.sales_claim_auto_approve).
 *     + Non-sales (admin/director/manager/leader): POST /claim với seller_id → gán & auto approve.
 *     + Non-sales: POST /approve → duyệt đơn đang pending.
 *     + Sales: POST /unclaim để huỷ request của chính mình khi còn pending;
 *       khi bật sales_claim_auto_approve còn được gỡ đơn đã tự duyệt (approved_by = chính mình).
 *     + Non-sales: POST /unclaim để gỡ người bán (pending hoặc approved).
 * - Manual sync: executive roles
 */

import { v4 as uuidv4 } from 'uuid'
import pool from '../database.js'
import { getTenantId } from '../utils/tenantHelper.js'
import { isExecutiveRole, isTenantAdminRole } from '../config/rbac.js'
import { syncTenant } from '../services/cbsRevenueSyncService.js'
import { recomputeKpiActuals } from '../services/kpiFromDealsSyncService.js'
import {
  linkOrCreateCustomerForCbsOrder,
  findMatchingDealForCbsOrder,
  promoteDealToWonFromCbs,
} from '../services/customerAutoCreateService.js'
import centralEmitter, { EVENT_DEAL_STAGE_CHANGED } from '../events/eventEmitter.js'

// Cập nhật lại actual KPI của 1 nhân viên + kỳ sau khi CBS claim thay đổi.
// Fire-and-forget, không chặn luồng chính.
function kickRecomputeKpi(tenantId, userId, period) {
  if (!tenantId || !userId || !period) return
  Promise.resolve()
    .then(() => recomputeKpiActuals(tenantId, userId, period))
    .catch((err) => {
      if (err?.code === '42P01' || err?.code === '42703') return
      console.error('kickRecomputeKpi:', err)
    })
}

/**
 * Khi một đơn CBS được duyệt — liên kết với customer (match/tạo mới), tìm deal
 * trùng (nếu có) và snapshot kpi_kind_at_approve.
 *
 * Chạy trong cùng transaction với UPDATE approve để đảm bảo consistency.
 * Trả về { customer_id, deal_id, kind, createdCustomer } để caller log hoặc
 * trả về cho FE.
 */
async function linkAndSnapshotApprovedOrder(client, tenantId, orderId, actorUserId) {
  const cur = await client.query(
    `SELECT id, tenant_id, customer_id, deal_id, kpi_kind_at_approve,
            external_id1, customer_name, claimed_by, period_ym,
            price_not_vat, price_not_vat_round, payment_date, active_date,
            contract_no, product_name, masp, primary_product_code
       FROM cbs_revenue_orders
      WHERE id = $1 AND tenant_id = $2
      FOR UPDATE`,
    [orderId, tenantId]
  )
  if (cur.rows.length === 0) return null
  const order = cur.rows[0]

  // 1) Customer
  const linked = await linkOrCreateCustomerForCbsOrder(client, tenantId, order, actorUserId)
  order.customer_id = linked.customer_id

  // 2) Deal (best-effort) + auto-promote lên "Thành công" nếu cần
  let dealId = order.deal_id
  let promotionInfo = null
  if (!dealId) {
    try {
      const matched = await findMatchingDealForCbsOrder(client, tenantId, order)
      dealId = matched?.deal_id || null
      if (dealId && matched?.needs_promote) {
        promotionInfo = await promoteDealToWonFromCbs(client, tenantId, dealId, order)
      }
    } catch (err) {
      console.error('findMatchingDealForCbsOrder:', err)
      dealId = null
    }
  }

  // 3) Snapshot kind — linked.kind đã là 'NEW' | 'EXISTING'
  const kind = (linked.kind || 'NEW').toUpperCase() === 'EXISTING' ? 'EXISTING' : 'NEW'

  await client.query(
    `UPDATE cbs_revenue_orders
        SET customer_id = $3,
            deal_id = $4,
            kpi_kind_at_approve = $5
      WHERE id = $1 AND tenant_id = $2`,
    [orderId, tenantId, linked.customer_id, dealId, kind]
  )

  // 4) Log deal_activities (type=system) + notify sale nếu có auto-promote
  if (dealId && promotionInfo?.changed) {
    try {
      const now = Date.now()
      const contractLabel = order.contract_no ? `HĐ ${order.contract_no}` : 'hoá đơn CBS'
      const parts = []
      if (promotionInfo.changed_stage) {
        parts.push(`đẩy giai đoạn "${promotionInfo.stage_before || 'n/a'}" → "Thành công"`)
      }
      if (promotionInfo.changed_status) parts.push('chuyển trạng thái sang "Đã chốt"')
      if (promotionInfo.changed_amount) {
        const f = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(Number(n) || 0))
        parts.push(`đồng bộ giá trị ${f(promotionInfo.amount_before)} → ${f(promotionInfo.amount_after)} VNĐ theo CBS`)
      }
      if (promotionInfo.changed_closing) parts.push('cập nhật ngày đóng theo ngày thanh toán CBS')
      const content = `[CBS] Auto-promote từ ${contractLabel}: ${parts.join('; ') || 'đồng bộ dữ liệu'}.`

      await client.query(
        `INSERT INTO deal_activities (id, deal_id, stage, content, type, created_by, tenant_id, created_at)
         VALUES ($1, $2, $3, $4, 'system', $5, $6, $7)`,
        [uuidv4(), dealId, 'thanh_cong', content, actorUserId || null, tenantId, now]
      )

      // Notify sale (assigned_to). Fire-and-forget ngoài transaction-safe context vẫn OK
      // vì dùng cùng client trong BEGIN/COMMIT.
      if (promotionInfo.assigned_to) {
        await client.query(
          `INSERT INTO notifications (notification_id, employee_id, type, title, message, is_read, tenant_id, created_at)
           VALUES ($1, $2, 'cbs_deal_auto_promoted', $3, $4, false, $5, $6)`,
          [
            uuidv4(),
            promotionInfo.assigned_to,
            'Deal tự động chốt thắng từ CBS',
            `Deal ${promotionInfo.display_code || ''} đã được hệ thống đánh dấu "Thành công" nhờ ${contractLabel} vừa được duyệt.`.trim(),
            tenantId,
            now,
          ]
        )
      }
    } catch (logErr) {
      // Lỗi log/notify không được chặn approve flow.
      console.error('linkAndSnapshot log/notify:', logErr)
    }
  }

  return {
    customer_id: linked.customer_id,
    deal_id: dealId || null,
    kind,
    createdCustomer: !!linked.created,
    promotedDeal: !!promotionInfo?.changed,
    promotionInfo,
  }
}

/**
 * Sau khi COMMIT transaction approve, emit EVENT_DEAL_STAGE_CHANGED để listener
 * (dealStageChangedListener) có cơ hội tạo task / activity bổ sung (nếu có),
 * và đảm bảo KPI của assignee của deal được recompute — kể cả khi người bán
 * CBS (claimed_by) khác assigned_to của deal.
 */
function afterPromoteSideEffects(tenantId, orderPeriod, promotionInfo, actorUserId) {
  if (!promotionInfo?.changed) return
  const assignee = promotionInfo.assigned_to
  if (assignee && orderPeriod) {
    kickRecomputeKpi(tenantId, assignee, orderPeriod)
  }
  try {
    centralEmitter.emit(EVENT_DEAL_STAGE_CHANGED, {
      deal: {
        deal_id: promotionInfo.deal_id,
        stage: promotionInfo.stage_after,
        assigned_to: assignee,
        customer_id: promotionInfo.customer_id,
        display_code: promotionInfo.display_code,
        deal_category: promotionInfo.deal_category || 'MASS',
      },
      tenantId,
      userId: actorUserId || null,
      newStage: promotionInfo.stage_after,
      previousStage: promotionInfo.stage_before,
      source: 'cbs_auto_promote',
    })
  } catch (err) {
    console.error('emit EVENT_DEAL_STAGE_CHANGED (cbs promote):', err)
  }
}

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/

/**
 * Parse last_sync_message từ cbsRevenueSyncService:
 * "Đồng bộ CBS (kỳ YYYY-MM): nhận X, thêm A, cập nhật U."
 */
function parseCbsLastSyncBatch(message) {
  if (!message || typeof message !== 'string') return null
  const periodMatch = message.match(/kỳ\s+(\d{4}-(?:0[1-9]|1[0-2]))/i)
  const numsMatch = message.match(/nhận\s+(\d+)\s*,\s*thêm\s+(\d+)\s*,\s*cập nhật\s+(\d+)/i)
  if (!numsMatch) return null
  return {
    period_ym: periodMatch ? periodMatch[1] : null,
    received: parseInt(numsMatch[1], 10),
    inserted: parseInt(numsMatch[2], 10),
    updated: parseInt(numsMatch[3], 10),
  }
}

// Sales chỉ được tự claim (pending). Các role khác (admin/director/manager/leader)
// có quyền gán người bán và duyệt claim.
function canApproveClaim(role) {
  return String(role || '').toLowerCase() !== 'sales'
}

async function getSalesClaimAutoApprove(tenantId) {
  const r = await pool.query(
    `SELECT COALESCE(sales_claim_auto_approve, false) AS sales_claim_auto_approve
       FROM cbs_config WHERE tenant_id = $1 LIMIT 1`,
    [tenantId]
  )
  return r.rows[0]?.sales_claim_auto_approve === true
}

function maskedConfig(row) {
  if (!row) return null
  const hasPass = !!row.password
  return {
    tenant_id: row.tenant_id,
    base_url: row.base_url,
    username: row.username,
    password_is_set: hasPass,
    unit: row.unit,
    report_config_code: row.report_config_code,
    auto_sync: row.auto_sync,
    sales_claim_auto_approve: row.sales_claim_auto_approve === true,
    last_synced_at: row.last_synced_at,
    last_sync_status: row.last_sync_status,
    last_sync_message: row.last_sync_message,
    updated_at: row.updated_at,
    updated_by: row.updated_by,
  }
}

// ---------- CBS config ----------

export async function getCbsConfig(req, res) {
  try {
    const tenantId = getTenantId(req)
    const role = String(req.user?.role || '').toLowerCase()
    if (!isExecutiveRole(role)) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền xem cấu hình CBS.' })
    }
    const r = await pool.query(
      `SELECT tenant_id, base_url, username, password, unit, report_config_code,
              auto_sync, sales_claim_auto_approve,
              last_synced_at, last_sync_status, last_sync_message, updated_at, updated_by
         FROM cbs_config WHERE tenant_id = $1 LIMIT 1`,
      [tenantId]
    )
    return res.json({ success: true, data: maskedConfig(r.rows[0]) })
  } catch (err) {
    console.error('getCbsConfig:', err)
    return res.status(500).json({ success: false, message: 'Không lấy được cấu hình CBS.' })
  }
}

export async function upsertCbsConfig(req, res) {
  try {
    const tenantId = getTenantId(req)
    const role = String(req.user?.role || '').toLowerCase()
    if (!isTenantAdminRole(role)) {
      return res.status(403).json({ success: false, message: 'Chỉ Admin mới thay đổi cấu hình CBS.' })
    }
    const body = req.body || {}
    const username = String(body.username || '').trim()
    const password = body.password != null ? String(body.password) : null
    const unit = Number.isFinite(Number(body.unit)) ? Math.trunc(Number(body.unit)) : null
    const baseUrl = body.base_url ? String(body.base_url).trim() : null
    const reportCode = body.report_config_code ? String(body.report_config_code).trim() : null
    const autoSync = body.auto_sync == null ? true : !!body.auto_sync

    if (!username) return res.status(400).json({ success: false, message: 'username là bắt buộc.' })
    if (unit == null || unit < 0) {
      return res.status(400).json({ success: false, message: 'unit không hợp lệ (số nguyên không âm).' })
    }

    const now = Date.now()
    const existing = await pool.query(
      `SELECT password, sales_claim_auto_approve FROM cbs_config WHERE tenant_id = $1`,
      [tenantId]
    )
    const salesClaimAutoApproveOnInsert =
      body.sales_claim_auto_approve == null ? false : !!body.sales_claim_auto_approve

    if (existing.rows.length === 0) {
      if (!password) {
        return res.status(400).json({ success: false, message: 'Lần cấu hình đầu tiên cần nhập password.' })
      }
      await pool.query(
        `INSERT INTO cbs_config (
          tenant_id, base_url, username, password, unit, report_config_code, auto_sync,
          sales_claim_auto_approve, updated_at, updated_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          tenantId,
          baseUrl || 'https://cbs.mobifone.vn',
          username,
          password,
          unit,
          reportCode || 'REPORT_INVOICING_PREPAID',
          autoSync,
          salesClaimAutoApproveOnInsert,
          now,
          req.user?.id || null,
        ]
      )
    } else {
      const finalPassword = password ? password : existing.rows[0].password
      const keepClaimPolicy = existing.rows[0].sales_claim_auto_approve === true
      const salesClaimAutoApproveOnUpdate =
        body.sales_claim_auto_approve == null
          ? keepClaimPolicy
          : !!body.sales_claim_auto_approve
      await pool.query(
        `UPDATE cbs_config
           SET base_url = $2,
               username = $3,
               password = $4,
               unit = $5,
               report_config_code = $6,
               auto_sync = $7,
               sales_claim_auto_approve = $8,
               updated_at = $9,
               updated_by = $10
         WHERE tenant_id = $1`,
        [
          tenantId,
          baseUrl || 'https://cbs.mobifone.vn',
          username,
          finalPassword,
          unit,
          reportCode || 'REPORT_INVOICING_PREPAID',
          autoSync,
          salesClaimAutoApproveOnUpdate,
          now,
          req.user?.id || null,
        ]
      )
    }

    const after = await pool.query(
      `SELECT tenant_id, base_url, username, password, unit, report_config_code,
              auto_sync, sales_claim_auto_approve,
              last_synced_at, last_sync_status, last_sync_message, updated_at, updated_by
         FROM cbs_config WHERE tenant_id = $1`,
      [tenantId]
    )
    return res.json({ success: true, message: 'Đã lưu cấu hình CBS.', data: maskedConfig(after.rows[0]) })
  } catch (err) {
    console.error('upsertCbsConfig:', err)
    return res.status(500).json({ success: false, message: 'Không lưu được cấu hình CBS.' })
  }
}

/**
 * PATCH /api/cbs/config/claim-policy
 * Admin đặt quy trình khi Sales tự tích đơn: tự duyệt hay chờ kiểm duyệt.
 */
export async function updateCbsClaimPolicy(req, res) {
  try {
    const tenantId = getTenantId(req)
    const role = String(req.user?.role || '').toLowerCase()
    if (!isTenantAdminRole(role)) {
      return res.status(403).json({ success: false, message: 'Chỉ Admin mới thay đổi quy trình duyệt đơn CBS.' })
    }

    if (req.body?.sales_claim_auto_approve == null) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu sales_claim_auto_approve (true | false).',
      })
    }
    const salesClaimAutoApprove = !!req.body.sales_claim_auto_approve
    const now = Date.now()

    const existing = await pool.query(`SELECT tenant_id FROM cbs_config WHERE tenant_id = $1`, [tenantId])
    if (existing.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cần cấu hình CBS trước (Cấu hình CBS) rồi mới đặt quy trình duyệt đơn.',
      })
    }

    await pool.query(
      `UPDATE cbs_config
          SET sales_claim_auto_approve = $2,
              updated_at = $3,
              updated_by = $4
        WHERE tenant_id = $1`,
      [tenantId, salesClaimAutoApprove, now, req.user?.id || null]
    )

    return res.json({
      success: true,
      message: salesClaimAutoApprove
        ? 'Đã bật tự động duyệt đơn khi Sales tự tích.'
        : 'Đã bật kiểm duyệt đơn — Sales tích đơn sẽ chờ xác nhận.',
      data: { sales_claim_auto_approve: salesClaimAutoApprove },
    })
  } catch (err) {
    console.error('updateCbsClaimPolicy:', err)
    return res.status(500).json({ success: false, message: 'Không cập nhật được quy trình duyệt đơn.' })
  }
}

// ---------- Orders ----------

/**
 * GET /api/cbs/revenue?period=YYYY-MM&owner=all|mine|unclaimed|others&q=...
 */
/**
 * GET /api/deals/:id/cbs-orders — trả về các đơn CBS đã link vào deal.
 * Ai có thể gọi: mọi user trong tenant; logic permission của deal do controller
 * Deal quản, endpoint này chỉ lọc theo tenant_id + deal_id nên an toàn.
 */
export async function listCbsOrdersByDeal(req, res) {
  try {
    const tenantId = getTenantId(req)
    const dealId = String(req.params.id || '').trim()
    if (!dealId) return res.status(400).json({ success: false, message: 'Thiếu dealId.' })

    const r = await pool.query(
      `SELECT o.id, o.period_ym, o.contract_no, o.product_name, o.primary_product_code,
              o.masp, o.customer_name, o.external_id1,
              o.price_not_vat, o.price_not_vat_round, o.price_vat,
              o.payment_date, o.active_date,
              o.claim_status, o.claimed_by, o.approved_by, o.approved_at,
              o.kpi_kind_at_approve,
              e1.full_name AS claimed_by_name,
              e2.full_name AS approved_by_name
         FROM cbs_revenue_orders o
         LEFT JOIN employees e1 ON e1.employee_id = o.claimed_by AND e1.tenant_id = o.tenant_id
         LEFT JOIN employees e2 ON e2.employee_id = o.approved_by AND e2.tenant_id = o.tenant_id
        WHERE o.tenant_id = $1 AND o.deal_id = $2
        ORDER BY o.approved_at DESC NULLS LAST, o.period_ym DESC`,
      [tenantId, dealId]
    )

    return res.json({ success: true, data: r.rows || [] })
  } catch (err) {
    if (err?.code === '42P01' || err?.code === '42703') {
      return res.json({ success: true, data: [] })
    }
    console.error('listCbsOrdersByDeal:', err)
    return res.status(500).json({ success: false, message: 'Không lấy được CBS orders của deal.' })
  }
}

export async function listCbsOrders(req, res) {
  try {
    const tenantId = getTenantId(req)
    const myId = req.user?.id
    const period = String(req.query.period || '').trim()
    if (!PERIOD_RE.test(period)) {
      return res.status(400).json({ success: false, message: 'period (YYYY-MM) là bắt buộc.' })
    }
    const owner = String(req.query.owner || 'all').toLowerCase()
    const q = String(req.query.q || '').trim().toLowerCase()

    const where = [`o.tenant_id = $1`, `o.period_ym = $2`]
    const params = [tenantId, period]

    if (owner === 'mine') {
      params.push(myId)
      where.push(`o.claimed_by = $${params.length}`)
    } else if (owner === 'unclaimed') {
      where.push(`o.claimed_by IS NULL`)
    } else if (owner === 'others') {
      params.push(myId)
      where.push(`o.claimed_by IS NOT NULL AND o.claimed_by <> $${params.length}`)
    } else if (owner === 'pending') {
      where.push(`o.claim_status = 'pending'`)
    }

    if (q) {
      params.push(`%${q}%`)
      const idx = params.length
      where.push(
        `(LOWER(COALESCE(o.customer_name, '')) LIKE $${idx}
          OR LOWER(COALESCE(o.contract_no, '')) LIKE $${idx}
          OR LOWER(COALESCE(o.product_name, '')) LIKE $${idx}
          OR LOWER(COALESCE(o.external_id1, '')) LIKE $${idx}
          OR LOWER(COALESCE(o.serial, '')) LIKE $${idx}
          OR LOWER(COALESCE(o.cbs_staff, '')) LIKE $${idx})`
      )
    }

    const sql = `
      SELECT o.*,
             e.full_name  AS claimed_by_name,
             e.username   AS claimed_by_username,
             e.territory  AS claimed_by_territory,
             e.role       AS claimed_by_role,
             a.full_name  AS approved_by_name,
             a.username   AS approved_by_username,
             c.full_name      AS crm_customer_name,
             c.phone          AS crm_customer_phone,
             c.tax_code       AS crm_customer_tax_code,
             c.kpi_customer_kind AS crm_customer_kind,
             d.display_code   AS deal_display_code,
             d.title          AS deal_title
        FROM cbs_revenue_orders o
        LEFT JOIN employees e
          ON e.employee_id = o.claimed_by AND e.tenant_id = o.tenant_id
        LEFT JOIN employees a
          ON a.employee_id = o.approved_by AND a.tenant_id = o.tenant_id
        LEFT JOIN customers c
          ON c.customer_id = o.customer_id AND c.tenant_id = o.tenant_id AND c.deleted_at IS NULL
        LEFT JOIN deals d
          ON d.deal_id = o.deal_id AND d.tenant_id = o.tenant_id
       WHERE ${where.join(' AND ')}
       ORDER BY COALESCE(o.active_date, o.payment_date) DESC, o.price_vat DESC
       LIMIT 2000`

    const r = await pool.query(sql, params)

    const cfg = await pool.query(
      `SELECT last_synced_at, last_sync_status, last_sync_message,
              COALESCE(sales_claim_auto_approve, false) AS sales_claim_auto_approve
         FROM cbs_config WHERE tenant_id = $1`,
      [tenantId]
    )

    const agg = {
      total: r.rows.length,
      total_vat: 0,
      total_not_vat: 0,
      claimed: 0,
      unclaimed: 0,
      mine: 0,
      pending: 0,
    }
    for (const row of r.rows) {
      agg.total_vat += Number(row.price_vat || 0)
      agg.total_not_vat += Number(row.price_not_vat_round || row.price_not_vat || 0)
      if (row.claimed_by) {
        agg.claimed++
        if (row.claimed_by === myId) agg.mine++
        if (row.claim_status === 'pending') agg.pending++
      } else {
        agg.unclaimed++
      }
    }

    return res.json({
      success: true,
      period,
      data: r.rows,
      summary: agg,
      last_sync: cfg.rows[0] || null,
      last_sync_batch: parseCbsLastSyncBatch(cfg.rows[0]?.last_sync_message),
      claim_policy: {
        sales_claim_auto_approve: cfg.rows[0]?.sales_claim_auto_approve === true,
      },
    })
  } catch (err) {
    console.error('listCbsOrders:', err)
    return res.status(500).json({ success: false, message: 'Không tải được danh sách doanh thu CBS.' })
  }
}

/**
 * POST /api/cbs/revenue/:id/claim
 *   - Sales: tự claim đơn của mình → pending hoặc approved (theo sales_claim_auto_approve).
 *   - Non-sales: body.seller_id = employee_id của Sales cần gán → claim_status = 'approved' luôn.
 *     Nếu không truyền seller_id thì mặc định gán cho bản thân & auto-approve.
 */
export async function claimCbsOrder(req, res) {
  try {
    const tenantId = getTenantId(req)
    const myId = req.user?.id
    const role = String(req.user?.role || '').toLowerCase()
    const id = String(req.params.id || '').trim()
    if (!id) return res.status(400).json({ success: false, message: 'Thiếu id.' })

    const body = req.body || {}
    const requestedSellerId = body.seller_id ? String(body.seller_id).trim() : null

    const cur = await pool.query(
      `SELECT id, claimed_by, claim_status, period_ym
         FROM cbs_revenue_orders WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    )
    if (cur.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng CBS.' })
    }
    const current = cur.rows[0]
    const oldOwner = current.claimed_by
    const period = current.period_ym
    const now = Date.now()

    // Nhánh Sales: chỉ được tự claim, không ghi đè người khác.
    if (!canApproveClaim(role)) {
      if (requestedSellerId && requestedSellerId !== myId) {
        return res.status(403).json({
          success: false,
          message: 'Sales chỉ được tích đơn cho chính mình.',
        })
      }
      if (current.claimed_by && current.claimed_by !== myId) {
        return res.status(409).json({ success: false, message: 'Đơn hàng đã được người khác tích.' })
      }

      const autoApprove = await getSalesClaimAutoApprove(tenantId)

      if (autoApprove) {
        const client = await pool.connect()
        let data, linkInfo
        try {
          await client.query('BEGIN')
          const r = await client.query(
            `UPDATE cbs_revenue_orders
                SET claimed_by    = $3,
                    claimed_at    = $4,
                    claim_status  = 'approved',
                    approved_by   = $3,
                    approved_at   = $4,
                    updated_at    = $4
              WHERE id = $1 AND tenant_id = $2
              RETURNING id, claimed_by, claimed_at, claim_status, approved_by, approved_at`,
            [id, tenantId, myId, now]
          )
          data = r.rows[0]
          linkInfo = await linkAndSnapshotApprovedOrder(client, tenantId, id, myId)
          await client.query('COMMIT')
        } catch (err) {
          await client.query('ROLLBACK').catch(() => {})
          throw err
        } finally {
          client.release()
        }

        if (oldOwner && oldOwner !== myId) kickRecomputeKpi(tenantId, oldOwner, period)
        kickRecomputeKpi(tenantId, myId, period)
        afterPromoteSideEffects(tenantId, period, linkInfo?.promotionInfo, myId)

        const extraParts = []
        if (linkInfo?.createdCustomer) extraParts.push('Đã tạo khách hàng mới từ đơn CBS.')
        else if (linkInfo?.customer_id) extraParts.push('Đã liên kết khách hàng tương ứng.')
        if (linkInfo?.promotedDeal) extraParts.push('Deal liên quan đã được đẩy sang "Thành công".')
        const extraMsg = extraParts.length ? ' ' + extraParts.join(' ') : ''

        return res.json({
          success: true,
          message: 'Đã tích và duyệt đơn hàng.' + extraMsg,
          data: { ...data, ...(linkInfo || {}) },
        })
      }

      // Cần kiểm duyệt: đặt pending
      const r = await pool.query(
        `UPDATE cbs_revenue_orders
            SET claimed_by    = $3,
                claimed_at    = $4,
                claim_status  = 'pending',
                approved_by   = NULL,
                approved_at   = NULL,
                updated_at    = $4
          WHERE id = $1 AND tenant_id = $2
          RETURNING id, claimed_by, claimed_at, claim_status, approved_by, approved_at`,
        [id, tenantId, myId, now]
      )
      // Sales tạo pending → chưa tính vào actual; chỉ recompute cho an toàn nếu trước đó có owner khác đã approved.
      if (oldOwner && oldOwner !== myId) {
        kickRecomputeKpi(tenantId, oldOwner, period)
      }
      return res.json({
        success: true,
        message: 'Đã gửi yêu cầu xác nhận đơn hàng, chờ quản lý duyệt.',
        data: r.rows[0],
      })
    }

    // Nhánh non-sales: gán trực tiếp & auto-approve.
    const sellerId = requestedSellerId || myId
    // Nếu gán cho user khác → kiểm tra sellerId có phải nhân viên trong tenant
    if (sellerId !== myId) {
      const emp = await pool.query(
        `SELECT employee_id FROM employees
          WHERE employee_id = $1 AND tenant_id = $2 AND is_active = true`,
        [sellerId, tenantId]
      )
      if (emp.rows.length === 0) {
        return res.status(400).json({ success: false, message: 'Người bán không hợp lệ.' })
      }
    }

    const client = await pool.connect()
    let data, linkInfo
    try {
      await client.query('BEGIN')
      const r = await client.query(
        `UPDATE cbs_revenue_orders
            SET claimed_by    = $3,
                claimed_at    = $4,
                claim_status  = 'approved',
                approved_by   = $5,
                approved_at   = $4,
                updated_at    = $4
          WHERE id = $1 AND tenant_id = $2
          RETURNING id, claimed_by, claimed_at, claim_status, approved_by, approved_at`,
        [id, tenantId, sellerId, now, myId]
      )
      data = r.rows[0]
      linkInfo = await linkAndSnapshotApprovedOrder(client, tenantId, id, myId)
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      throw err
    } finally {
      client.release()
    }

    // Recompute KPI cho chủ cũ (nếu có, khác chủ mới) và chủ mới.
    if (oldOwner && oldOwner !== sellerId) kickRecomputeKpi(tenantId, oldOwner, period)
    kickRecomputeKpi(tenantId, sellerId, period)
    afterPromoteSideEffects(tenantId, period, linkInfo?.promotionInfo, myId)

    const extraParts = []
    if (linkInfo?.createdCustomer) extraParts.push('Đã tạo khách hàng mới từ đơn CBS.')
    else if (linkInfo?.customer_id) extraParts.push('Đã liên kết khách hàng tương ứng.')
    if (linkInfo?.promotedDeal) extraParts.push('Deal liên quan đã được đẩy sang "Thành công".')
    const extraMsg = extraParts.length ? ' ' + extraParts.join(' ') : ''
    return res.json({
      success: true,
      message:
        (sellerId === myId
          ? 'Đã gán đơn hàng là của bạn.'
          : 'Đã gán người bán cho đơn hàng.') + extraMsg,
      data: { ...data, ...(linkInfo || {}) },
    })
  } catch (err) {
    console.error('claimCbsOrder:', err)
    return res.status(500).json({ success: false, message: 'Không thể tích đơn hàng CBS.' })
  }
}

/**
 * POST /api/cbs/revenue/:id/approve
 * Non-sales duyệt một đơn đang ở trạng thái pending.
 */
export async function approveCbsOrder(req, res) {
  try {
    const tenantId = getTenantId(req)
    const myId = req.user?.id
    const role = String(req.user?.role || '').toLowerCase()
    const id = String(req.params.id || '').trim()
    if (!id) return res.status(400).json({ success: false, message: 'Thiếu id.' })

    if (!canApproveClaim(role)) {
      return res
        .status(403)
        .json({ success: false, message: 'Bạn không có quyền duyệt xác nhận người bán.' })
    }

    const cur = await pool.query(
      `SELECT id, claimed_by, claim_status, period_ym
         FROM cbs_revenue_orders WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    )
    if (cur.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng CBS.' })
    }
    const cr = cur.rows[0]
    if (!cr.claimed_by) {
      return res
        .status(400)
        .json({ success: false, message: 'Đơn hàng chưa có người bán để duyệt.' })
    }
    if (cr.claim_status === 'approved') {
      return res.json({ success: true, message: 'Đơn hàng đã được duyệt trước đó.' })
    }

    const now = Date.now()
    const client = await pool.connect()
    let data, linkInfo
    try {
      await client.query('BEGIN')
      const r = await client.query(
        `UPDATE cbs_revenue_orders
            SET claim_status = 'approved',
                approved_by  = $3,
                approved_at  = $4,
                updated_at   = $4
          WHERE id = $1 AND tenant_id = $2
          RETURNING id, claimed_by, claim_status, approved_by, approved_at`,
        [id, tenantId, myId, now]
      )
      data = r.rows[0]
      linkInfo = await linkAndSnapshotApprovedOrder(client, tenantId, id, myId)
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      throw err
    } finally {
      client.release()
    }

    kickRecomputeKpi(tenantId, cr.claimed_by, cr.period_ym)
    afterPromoteSideEffects(tenantId, cr.period_ym, linkInfo?.promotionInfo, myId)

    const extraParts = []
    if (linkInfo?.createdCustomer) extraParts.push('Đã tạo khách hàng mới từ đơn CBS.')
    else if (linkInfo?.customer_id) extraParts.push('Đã liên kết khách hàng tương ứng.')
    if (linkInfo?.promotedDeal) extraParts.push('Deal liên quan đã được đẩy sang "Thành công".')
    const extraMsg = extraParts.length ? ' ' + extraParts.join(' ') : ''
    return res.json({
      success: true,
      message: 'Đã duyệt xác nhận người bán cho đơn hàng.' + extraMsg,
      data: { ...data, ...(linkInfo || {}) },
    })
  } catch (err) {
    console.error('approveCbsOrder:', err)
    return res.status(500).json({ success: false, message: 'Không thể duyệt đơn hàng.' })
  }
}

export async function unclaimCbsOrder(req, res) {
  try {
    const tenantId = getTenantId(req)
    const myId = req.user?.id
    const role = String(req.user?.role || '').toLowerCase()
    const id = String(req.params.id || '').trim()
    if (!id) return res.status(400).json({ success: false, message: 'Thiếu id.' })

    const cur = await pool.query(
      `SELECT id, claimed_by, claim_status, approved_by, period_ym
         FROM cbs_revenue_orders WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    )
    if (cur.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng CBS.' })
    }
    const owner = cur.rows[0].claimed_by
    const status = cur.rows[0].claim_status
    const period = cur.rows[0].period_ym
    if (!owner) return res.json({ success: true, message: 'Đơn hàng hiện chưa được tích.' })

    // Sales: huỷ request pending của mình; hoặc gỡ đơn đã tự duyệt khi bật auto-approve.
    if (!canApproveClaim(role)) {
      if (owner !== myId) {
        return res
          .status(403)
          .json({ success: false, message: 'Bạn không có quyền gỡ tích đơn của người khác.' })
      }
      if (status === 'approved') {
        const autoApprove = await getSalesClaimAutoApprove(tenantId)
        const selfAutoApproved = cur.rows[0].approved_by === myId
        if (!autoApprove || !selfAutoApproved) {
          return res.status(409).json({
            success: false,
            message: 'Đơn đã được duyệt, liên hệ quản lý để gỡ.',
          })
        }
      }
    }

    const now = Date.now()
    await pool.query(
      `UPDATE cbs_revenue_orders
          SET claimed_by          = NULL,
              claimed_at          = NULL,
              claim_status        = NULL,
              approved_by         = NULL,
              approved_at         = NULL,
              deal_id             = NULL,
              kpi_kind_at_approve = NULL,
              updated_at          = $3
        WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId, now]
    )
    // Ghi chú: giữ lại customer_id cho mục đích tra cứu lịch sử, vì khách vẫn
    // có thể còn tồn tại trong CRM và đơn có thể được approve lại sau này.
    // Nếu trước đó đã approved → owner cũ mất doanh thu này, cần recompute.
    if (status === 'approved') {
      kickRecomputeKpi(tenantId, owner, period)
    }
    return res.json({ success: true, message: 'Đã gỡ người bán của đơn hàng.' })
  } catch (err) {
    console.error('unclaimCbsOrder:', err)
    return res.status(500).json({ success: false, message: 'Không thể gỡ tích đơn hàng.' })
  }
}

/**
 * POST /api/cbs/revenue/recompute-kpi
 * Backfill KPI actuals từ toàn bộ đơn CBS đã duyệt trong tenant.
 * Dùng khi admin muốn đồng bộ lại KPI mà không cần re-sync dữ liệu CBS.
 */
export async function recomputeKpiFromApprovedOrders(req, res) {
  try {
    const tenantId = getTenantId(req)
    const role = String(req.user?.role || '').toLowerCase()
    if (!canApproveClaim(role)) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền tính lại KPI từ CBS.',
      })
    }

    const pairs = await pool.query(
      `SELECT DISTINCT claimed_by, period_ym
         FROM cbs_revenue_orders
        WHERE tenant_id    = $1
          AND claim_status = 'approved'
          AND claimed_by   IS NOT NULL
          AND period_ym    IS NOT NULL`,
      [tenantId]
    )
    let processed = 0
    let failed = 0
    for (const p of pairs.rows) {
      try {
        await recomputeKpiActuals(tenantId, p.claimed_by, p.period_ym)
        processed++
      } catch (err) {
        failed++
        if (err?.code !== '42P01' && err?.code !== '42703') {
          console.error('recomputeKpiFromApprovedOrders:', err)
        }
      }
    }
    return res.json({
      success: true,
      message: `Đã tính lại KPI cho ${processed}/${pairs.rows.length} (nhân viên × kỳ).${
        failed ? ` Lỗi ${failed}.` : ''
      }`,
      data: { processed, failed, total: pairs.rows.length },
    })
  } catch (err) {
    console.error('recomputeKpiFromApprovedOrders outer:', err)
    return res
      .status(500)
      .json({ success: false, message: 'Không thể tính lại KPI từ CBS.' })
  }
}

// ---------- Manual sync ----------

export async function syncNow(req, res) {
  try {
    const role = String(req.user?.role || '').toLowerCase()
    if (!isExecutiveRole(role)) {
      return res.status(403).json({ success: false, message: 'Chỉ Admin / Lãnh đạo / Quản lý mới chạy đồng bộ.' })
    }
    const tenantId = getTenantId(req)
    const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/
    const raw = req.body?.period ?? req.query?.period
    const period =
      raw != null && PERIOD_RE.test(String(raw).trim()) ? String(raw).trim() : undefined
    const result = await syncTenant(tenantId, period ? { period } : {})
    const rm = Number(result.removed_orphans) || 0
    const extra = rm > 0 ? ` Đã gỡ ${rm} đơn thừa (chưa duyệt, không còn trong CBS).` : ''
    return res.json({
      success: true,
      message: `Đồng bộ CBS xong: kỳ ${result.synced_for_period ?? period ?? 'hiện tại'}, nhận ${result.total} đơn, thêm ${result.inserted}, cập nhật ${result.updated}.${extra}`,
      data: result,
    })
  } catch (err) {
    console.error('syncNow:', err)
    return res.status(500).json({
      success: false,
      message: err?.message || 'Đồng bộ CBS thất bại.',
    })
  }
}
