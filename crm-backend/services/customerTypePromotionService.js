import { refreshKpiCustomerKindForTenant } from './customerKindRefreshService.js'

/**
 * @deprecated Gọi refreshKpiCustomerKindForTenant — logic NEW→EXISTING (deal + CBS,
 * chỉ từ tháng sau tháng phát sinh) nằm trong customerKindRefreshService.js.
 */
export async function promoteNewCustomersWithSuccessfulDealsToExisting(tenantId) {
  await refreshKpiCustomerKindForTenant(tenantId)
}
