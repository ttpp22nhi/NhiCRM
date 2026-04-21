export type KpiCustomerKind = 'NEW' | 'EXISTING'

/** Ưu tiên cột kpi_customer_kind; fallback khi dữ liệu cũ lỡ lưu NEW/EXISTING vào customer_type. */
export function inferKpiCustomerKind(row: {
  kpi_customer_kind?: string | null
  customer_type?: string | null
}): KpiCustomerKind {
  const k = row.kpi_customer_kind
  if (k && String(k).toUpperCase() === 'EXISTING') return 'EXISTING'
  if (k && String(k).toUpperCase() === 'NEW') return 'NEW'
  const t = String(row.customer_type || '').toUpperCase()
  if (t === 'EXISTING') return 'EXISTING'
  if (t === 'NEW') return 'NEW'
  return 'NEW'
}

export function labelKpiCustomerKind(kind: KpiCustomerKind): string {
  return kind === 'EXISTING' ? 'Khách hiện hữu (KPI)' : 'Khách mới (KPI)'
}
