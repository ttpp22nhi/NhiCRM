import pool from '../database.js'

/**
 * Quy tắc nghiệp vụ: khách NEW trong tháng M có ≥1 deal thành công
 * → từ tháng M+1 trở đi được coi là khách hiện hữu (EXISTING).
 *
 * Điều kiện kỹ thuật: kpi_customer_kind = NEW và tồn tại deal thắng có tháng kỳ (expected_closing_date hoặc updated_at)
 * **nhỏ hơn** tháng hiện tại (YYYY-MM so sánh chuỗi).
 */
export async function promoteNewCustomersWithSuccessfulDealsToExisting(tenantId) {
  const now = Date.now()
  const ymRow = await pool.query(
    `SELECT to_char((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh'), 'YYYY-MM') AS ym`
  )
  const currentYyyyMm = ymRow.rows[0]?.ym
  if (!currentYyyyMm) return

  await pool.query(
    `UPDATE customers c
     SET kpi_customer_kind = 'EXISTING', updated_at = $1
     WHERE c.tenant_id = $2
       AND c.deleted_at IS NULL
       AND UPPER(TRIM(COALESCE(c.kpi_customer_kind, ''))) = 'NEW'
       AND EXISTS (
         SELECT 1 FROM deals d
         WHERE d.customer_id = c.customer_id
           AND d.tenant_id = c.tenant_id
           AND COALESCE(d.is_deleted, false) = false
           AND (d.status = 'won' OR LOWER(TRIM(COALESCE(d.stage, ''))) IN ('thanh_cong', 'closed_won'))
           AND to_char(
             to_timestamp(COALESCE(d.expected_closing_date, d.updated_at) / 1000.0),
             'YYYY-MM'
           ) < $3
       )`,
    [now, tenantId, currentYyyyMm]
  )
}
