/**
 * Helper Multi-tenant: lấy tenant_id từ request (đã qua middleware extractTenant).
 * Dùng thống nhất trong Controller/Service để đảm bảo Data Isolation.
 */

/**
 * Lấy tenant_id từ request.
 * @param {object} req - Express request (đã có req.tenantId)
 * @returns {string} req.tenantId
 */
export function getTenantId(req) {
  return req.tenantId;
}
