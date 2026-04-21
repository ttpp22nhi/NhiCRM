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

/** Ai được giao KPI hàng tháng cho nhân viên Sales (theo yêu cầu nghiệp vụ) */
export const KPI_ASSIGN_ROLES = ['manager', 'director', 'admin', 'super_admin']

/** Ai được xem KPI của chính mình (Sales) */
export const KPI_VIEW_OWN_ROLES = ['sales']

/** Ai được xem / giao KPI (gộp cho kiểm tra route) */
export const KPI_ACCESS_ROLES = [...new Set([...KPI_ASSIGN_ROLES, ...KPI_VIEW_OWN_ROLES])]

/** Ai được xem / duyệt hàng chờ chuyển giao (API transfer pending/approve) */
export const TRANSFER_APPROVER_ROLES = ['manager', 'director', 'admin', 'super_admin']

/** Ai được tạo nhân viên mới (đăng ký / import Excel) — không gồm Leader/Sales */
export const EMPLOYEE_CREATOR_ROLES = ['admin', 'super_admin', 'director', 'manager']

/** Vai trò được gán khi người tạo là Giám đốc / Quản lý (không phải Admin tenant) */
export const EMPLOYEE_TARGET_ROLES_FOR_EXECUTIVE = ['leader', 'sales']

/** Vai trò được gán khi người tạo là Admin / Super Admin trong tenant */
export const EMPLOYEE_TARGET_ROLES_FOR_TENANT_ADMIN = ['admin', 'director', 'manager', 'leader', 'sales']

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

export function isKpiAssignerRole(role) {
  return hasRole(role, KPI_ASSIGN_ROLES)
}

export function isKpiViewerRole(role) {
  return hasRole(role, KPI_ACCESS_ROLES)
}

export function canCreateEmployees(role) {
  return hasRole(role, EMPLOYEE_CREATOR_ROLES)
}
