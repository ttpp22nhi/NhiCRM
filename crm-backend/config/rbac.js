/**
 * RBAC — single source of truth for role sets (tenant APIs).
 *
 * - TENANT_ADMIN: Cấu hình tổ chức, ma trận phân quyền, CRUD nhân viên (đăng ký/cập nhật),
 *   thùng rác deal, v.v.
 * - EXECUTIVE: Vận hành rộng trong tenant (xem toàn danh sách nhân viên, chuyển giao hàng loạt)
 *   — không chỉnh cấu trúc / ma trận quyền.
 * - TRANSFER_APPROVER: Phê duyệt yêu cầu chuyển giao (khớp transferController).
 */

export const TENANT_ADMIN_ROLES = ['admin', 'super_admin']

export const EXECUTIVE_ROLES = ['admin', 'super_admin', 'director', 'manager']

/** Ai được xem / duyệt hàng chờ chuyển giao (API transfer pending/approve) */
export const TRANSFER_APPROVER_ROLES = ['manager', 'director', 'admin', 'super_admin']

export function normalizeRole(role) {
  return String(role || '').toLowerCase()
}

export function hasRole(role, allowedList) {
  const r = normalizeRole(role)
  return allowedList.some((x) => normalizeRole(x) === r)
}

export function isTenantAdminRole(role) {
  return hasRole(role, TENANT_ADMIN_ROLES)
}

export function isExecutiveRole(role) {
  return hasRole(role, EXECUTIVE_ROLES)
}

export function isTransferApproverRole(role) {
  return hasRole(role, TRANSFER_APPROVER_ROLES)
}
