/**
 * KPI hàng tháng — đơn vị:
 * - target_revenue_* / actual_revenue_*: VNĐ (đồng), giao diện nhập/hiển thị cùng đơn vị
 * - approach_count: lần (số nguyên)
 */
import { v4 as uuidv4 } from 'uuid'
import pool from '../database.js'
import { getTenantId } from '../utils/tenantHelper.js'
import { isKpiAssignerRole, isTenantAdminRole } from '../config/rbac.js'
import {
  isKpiPeriodActualsLocked,
  formatKpiConfirmationDeadlineDdMmYyyy,
} from '../utils/kpiPeriodLock.js'

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/

function parsePeriod(q) {
  const p = q && String(q).trim()
  if (!p || !PERIOD_RE.test(p)) return null
  return p
}

function toMoney(v) {
  const n = Number(v)
  if (Number.isNaN(n) || n < 0) return null
  return Math.round(n * 100) / 100
}

function toInt(v) {
  const n = parseInt(String(v), 10)
  if (Number.isNaN(n) || n < 0) return null
  return n
}

/**
 * GET /api/kpis?period=YYYY-MM
 * - Giao KPI (manager, director, admin, super_admin): danh sách Sales + chỉ tiêu kỳ.
 * - Sales: chỉ bản ghi của mình.
 */
export async function getKpis(req, res) {
  const tenantId = getTenantId(req)
  const period = parsePeriod(req.query.period)
  const role = String(req.user?.role || '').toLowerCase()
  const myId = req.user?.id

  if (!period) {
    return res.status(400).json({
      success: false,
      message: 'Tham số period (YYYY-MM) là bắt buộc.',
    })
  }

  const assigner = isKpiAssignerRole(role)
  const isSales = role === 'sales'

  if (!assigner && !isSales) {
    return res.status(403).json({
      success: false,
      message: 'Chỉ Lãnh đạo, Quản lý, Admin hoặc Sales mới xem được KPI.',
    })
  }

  try {
    if (isSales && !assigner) {
      const r = await pool.query(
        `SELECT e.employee_id, e.full_name, e.username, e.territory,
                k.id AS kpi_id, k.period,
                k.target_revenue_new, k.target_revenue_existing,
                k.actual_revenue_new, k.actual_revenue_existing,
                k.approach_count, k.actual_approach_count,
                k.target_product_count_new, k.target_product_count_existing,
                k.actual_product_count_new, k.actual_product_count_existing
         FROM employees e
         LEFT JOIN kpis k ON k.tenant_id = e.tenant_id
           AND k.user_id = e.employee_id AND k.period = $2
         WHERE e.tenant_id = $1 AND e.employee_id = $3 AND e.is_active = true`,
        [tenantId, period, myId]
      )
      return res.json({
        success: true,
        period,
        period_actuals_locked: isKpiPeriodActualsLocked(period),
        confirmation_deadline_ddmmyyyy: formatKpiConfirmationDeadlineDdMmYyyy(period),
        canAssign: false,
        data: r.rows,
      })
    }

    const r = await pool.query(
      `SELECT e.employee_id, e.full_name, e.username, e.territory,
              k.id AS kpi_id, k.period,
              k.target_revenue_new, k.target_revenue_existing,
              k.actual_revenue_new, k.actual_revenue_existing,
              k.approach_count, k.actual_approach_count,
              k.target_product_count_new, k.target_product_count_existing,
              k.actual_product_count_new, k.actual_product_count_existing
       FROM employees e
       LEFT JOIN kpis k ON k.tenant_id = e.tenant_id
         AND k.user_id = e.employee_id AND k.period = $2
       WHERE e.tenant_id = $1 AND e.role = 'sales' AND e.is_active = true
       ORDER BY COALESCE(NULLIF(TRIM(e.territory), ''), 'zzz') ASC, e.full_name ASC`,
      [tenantId, period]
    )

    return res.json({
      success: true,
      period,
      period_actuals_locked: isKpiPeriodActualsLocked(period),
      confirmation_deadline_ddmmyyyy: formatKpiConfirmationDeadlineDdMmYyyy(period),
      canAssign: true,
      data: r.rows,
    })
  } catch (err) {
    console.error('getKpis:', err)
    return res.status(500).json({
      success: false,
      message: 'Không thể tải dữ liệu KPI.',
    })
  }
}

/**
 * PUT /api/kpis
 * Body: { period: "YYYY-MM", items: [{ user_id, target_revenue_new, target_revenue_existing, approach_count }] }
 */
export async function upsertKpis(req, res) {
  const tenantId = getTenantId(req)
  const role = String(req.user?.role || '').toLowerCase()

  if (!isKpiAssignerRole(role)) {
    return res.status(403).json({
      success: false,
      message: 'Chỉ Lãnh đạo, Quản lý hoặc Admin mới giao KPI cho Sales.',
    })
  }

  const period = parsePeriod(req.body?.period)
  const items = Array.isArray(req.body?.items) ? req.body.items : null

  if (!period) {
    return res.status(400).json({
      success: false,
      message: 'period (YYYY-MM) là bắt buộc.',
    })
  }
  if (!items || items.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'items phải là mảng gồm ít nhất một nhân viên Sales.',
    })
  }

  // Sau hạn ngày 5 (VN) tháng kế sau kỳ: chốt — chỉ Admin sửa chỉ tiêu; actuals không còn recompute.
  if (isKpiPeriodActualsLocked(period) && !isTenantAdminRole(role)) {
    return res.status(403).json({
      success: false,
      message: `Kỳ ${period} đã chốt (sau hạn xác nhận ngày 5 tháng kế tiếp, giờ VN). Chỉ Admin mới chỉnh được chỉ tiêu.`,
    })
  }

  const now = Date.now()

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    for (const row of items) {
      const userId = row.user_id && String(row.user_id).trim()
      if (!userId) {
        await client.query('ROLLBACK')
        return res.status(400).json({ success: false, message: 'Mỗi dòng cần user_id (employee_id).' })
      }

      const chk = await client.query(
        `SELECT 1 FROM employees
         WHERE tenant_id = $1 AND employee_id = $2 AND role = 'sales' AND is_active = true`,
        [tenantId, userId]
      )
      if (chk.rows.length === 0) {
        await client.query('ROLLBACK')
        return res.status(400).json({
          success: false,
          message: `Nhân viên ${userId} không phải Sales hoạt động trong công ty.`,
        })
      }

      const tn = toMoney(row.target_revenue_new ?? 0)
      const te = toMoney(row.target_revenue_existing ?? 0)
      const ac = toInt(row.approach_count ?? 0)
      const pcn = toInt(row.target_product_count_new ?? 0)
      const pce = toInt(row.target_product_count_existing ?? 0)
      if (tn === null || te === null || ac === null || pcn === null || pce === null) {
        await client.query('ROLLBACK')
        return res.status(400).json({
          success: false,
          message: 'Giá trị chỉ tiêu không hợp lệ (số không âm).',
        })
      }

      const existing = await client.query(
        `SELECT id FROM kpis WHERE tenant_id = $1 AND user_id = $2 AND period = $3`,
        [tenantId, userId, period]
      )

      if (existing.rows.length > 0) {
        await client.query(
          `UPDATE kpis SET
            target_revenue_new = $1,
            target_revenue_existing = $2,
            approach_count = $3,
            target_product_count_new = $4,
            target_product_count_existing = $5,
            updated_at = $6
           WHERE tenant_id = $7 AND user_id = $8 AND period = $9`,
          [tn, te, ac, pcn, pce, now, tenantId, userId, period]
        )
      } else {
        await client.query(
          `INSERT INTO kpis (
            id, tenant_id, user_id, period,
            target_revenue_new, target_revenue_existing,
            actual_revenue_new, actual_revenue_existing,
            approach_count,
            target_product_count_new, target_product_count_existing,
            actual_product_count_new, actual_product_count_existing,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, 0, 0, $7, $8, $9, 0, 0, $10, $10)`,
          [uuidv4(), tenantId, userId, period, tn, te, ac, pcn, pce, now]
        )
      }
    }

    await client.query('COMMIT')
    return res.json({ success: true, message: 'Đã lưu chỉ tiêu KPI.' })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('upsertKpis:', err)
    return res.status(500).json({
      success: false,
      message: 'Lỗi khi lưu KPI.',
    })
  } finally {
    client.release()
  }
}
