/**
 * Tự động chuyển khách hàng NEW → EXISTING sau khi đã có phát sinh (deal thắng
 * hoặc đơn CBS đã duyệt) **và** tháng phát sinh đó đã qua: chỉ promote từ
 * tháng kế tiếp trở đi (so sánh YYYY-MM theo Asia/Ho_Chi_Minh).
 *
 * Lý do: trong tháng M, deal won vẫn tính vào KPI “khách mới”; nếu đổi sang
 * EXISTING ngay trong M thì phần sản phẩm/doanh thu “mới” trong kỳ có thể về 0.
 *
 * Không đảo ngược EXISTING → NEW. Gọi sau CBS sync hoặc lịch scheduler.
 */

import pool from '../database.js'

async function currentYyyyMmHoChiMinh(client = pool) {
  const ymRow = await client.query(
    `SELECT to_char((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh'), 'YYYY-MM') AS ym`
  )
  return ymRow.rows[0]?.ym || null
}

export async function refreshKpiCustomerKindForTenant(tenantId) {
  if (!tenantId) return { promoted: 0 }

  const currentYyyyMm = await currentYyyyMmHoChiMinh()
  if (!currentYyyyMm) return { promoted: 0 }

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
               AND (
                 d.status = 'won'
                 OR LOWER(TRIM(COALESCE(d.stage, ''))) IN ('thanh_cong', 'closed_won')
               )
               AND to_char(
                 to_timestamp(COALESCE(d.expected_closing_date, d.updated_at) / 1000.0),
                 'YYYY-MM'
               ) < $3
          )
          OR EXISTS (
            SELECT 1 FROM cbs_revenue_orders o
             WHERE o.tenant_id = c.tenant_id
               AND o.customer_id = c.customer_id
               AND o.claim_status = 'approved'
               AND (
                 (
                   o.approved_at IS NOT NULL
                   AND to_char(to_timestamp(o.approved_at / 1000.0), 'YYYY-MM') < $3
                 )
                 OR (
                   o.approved_at IS NULL
                   AND o.period_ym IS NOT NULL
                   AND trim(o.period_ym) <> ''
                   AND o.period_ym < $3
                 )
               )
          )
        )`,
    [tenantId, Date.now(), currentYyyyMm]
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
