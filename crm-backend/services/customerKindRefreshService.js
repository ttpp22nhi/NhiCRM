/**
 * Tự động chuyển khách hàng NEW → EXISTING khi đã phát sinh doanh thu
 * (deal thắng hoặc CBS order đã duyệt). Không đảo ngược EXISTING → NEW để
 * bảo toàn lịch sử báo cáo.
 *
 * Gọi sau mỗi lần CBS sync hoặc theo lịch hàng đêm.
 */

import pool from '../database.js'

export async function refreshKpiCustomerKindForTenant(tenantId) {
  if (!tenantId) return { promoted: 0 }

  const r = await pool.query(
    `UPDATE customers c
        SET kpi_customer_kind = 'EXISTING',
            updated_at = $2
      WHERE c.tenant_id = $1
        AND c.deleted_at IS NULL
        AND UPPER(COALESCE(c.kpi_customer_kind, 'NEW')) <> 'EXISTING'
        AND (
          EXISTS (
            SELECT 1 FROM deals d
             WHERE d.tenant_id = c.tenant_id
               AND d.customer_id = c.customer_id
               AND COALESCE(d.is_deleted, false) = false
               AND (d.status = 'won'
                    OR LOWER(TRIM(COALESCE(d.stage, ''))) = 'thanh_cong')
          )
          OR EXISTS (
            SELECT 1 FROM cbs_revenue_orders o
             WHERE o.tenant_id = c.tenant_id
               AND o.customer_id = c.customer_id
               AND o.claim_status = 'approved'
          )
        )`,
    [tenantId, Date.now()]
  )
  return { promoted: r.rowCount || 0 }
}

export async function refreshKpiCustomerKindForAllTenants() {
  try {
    const r = await pool.query(
      `SELECT DISTINCT tenant_id FROM customers WHERE deleted_at IS NULL`
    )
    const results = []
    for (const row of r.rows) {
      try {
        const x = await refreshKpiCustomerKindForTenant(row.tenant_id)
        results.push({ tenantId: row.tenant_id, ...x })
      } catch (err) {
        // 42P01: bảng cbs_revenue_orders chưa migrate → bỏ qua.
        if (err?.code !== '42P01' && err?.code !== '42703') {
          results.push({ tenantId: row.tenant_id, error: err?.message || String(err) })
        }
      }
    }
    return results
  } catch (err) {
    if (err?.code === '42P01') return []
    throw err
  }
}
