/** Phân loại KPI trên khách hàng — tách khỏi customer_type (segment: cá nhân, DN, …). */
export const KPI_CUSTOMER_KIND_NEW = 'NEW'
export const KPI_CUSTOMER_KIND_EXISTING = 'EXISTING'

export function parseKpiCustomerKind(raw) {
  const v = String(raw ?? KPI_CUSTOMER_KIND_NEW).toUpperCase().trim()
  if (v === KPI_CUSTOMER_KIND_EXISTING) return KPI_CUSTOMER_KIND_EXISTING
  return KPI_CUSTOMER_KIND_NEW
}
