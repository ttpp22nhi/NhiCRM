/**
 * RBAC — khớp crm-backend/config/rbac.js (UI: ẩn/hiện menu và nút).
 */

export const TENANT_ADMIN_ROLES = ['admin', 'super_admin'] as const
export const EXECUTIVE_ROLES = ['admin', 'super_admin', 'director', 'manager'] as const
export const TRANSFER_APPROVER_ROLES = ['manager', 'director', 'admin', 'super_admin'] as const

export type TenantAdminRole = (typeof TENANT_ADMIN_ROLES)[number]
export type ExecutiveRole = (typeof EXECUTIVE_ROLES)[number]

export function isTenantAdmin(role?: string | null): boolean {
  if (!role) return false
  return (TENANT_ADMIN_ROLES as readonly string[]).includes(role)
}

/** Chỉ Super Admin cấp hệ thống */
export function isSuperAdmin(role?: string | null): boolean {
  return role === 'super_admin'
}

export function isExecutive(role?: string | null): boolean {
  if (!role) return false
  return (EXECUTIVE_ROLES as readonly string[]).includes(role)
}

/** Thêm nhân viên (form / import): Admin, Super Admin, Lãnh đạo, Quản lý — khớp EMPLOYEE_CREATOR_ROLES backend */
export function canCreateEmployees(role?: string | null): boolean {
  if (!role) return false
  return ['admin', 'super_admin', 'director', 'manager'].includes(role)
}

export function isTransferApprover(role?: string | null): boolean {
  if (!role) return false
  return (TRANSFER_APPROVER_ROLES as readonly string[]).includes(role)
}

/** Menu Quản trị: có mục con nào đó cần hiển thị */
export function canOpenAdminSection(role?: string | null): boolean {
  return isTenantAdmin(role) || isExecutive(role) || isTransferApprover(role)
}

/** Giao chỉ tiêu KPI hàng tháng cho Sales (Lãnh đạo, Quản lý, Admin, Super Admin trong tenant) */
export function canAssignKpi(role?: string | null): boolean {
  if (!role) return false
  return ['manager', 'director', 'admin', 'super_admin'].includes(role)
}

/** Xem trang KPI (giao hoặc xem mục tiêu của mình — Sales) */
export function canAccessKpiPage(role?: string | null): boolean {
  return canAssignKpi(role) || role === 'sales'
}

/** Trang Doanh thu CBS: mọi vai trò trong tenant xem được; super_admin chưa chọn tenant thì ẩn. */
export function canAccessCbsRevenue(role?: string | null): boolean {
  if (!role) return false
  return [
    'admin',
    'super_admin',
    'director',
    'manager',
    'leader',
    'sales',
  ].includes(role)
}

/** Chạy đồng bộ CBS thủ công — executive roles. */
export function canSyncCbsRevenue(role?: string | null): boolean {
  return isExecutive(role)
}

/** Sửa cấu hình CBS (username/password/unit) — admin tenant. */
export function canManageCbsConfig(role?: string | null): boolean {
  return isTenantAdmin(role)
}
