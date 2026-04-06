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

export function isExecutive(role?: string | null): boolean {
  if (!role) return false
  return (EXECUTIVE_ROLES as readonly string[]).includes(role)
}

export function isTransferApprover(role?: string | null): boolean {
  if (!role) return false
  return (TRANSFER_APPROVER_ROLES as readonly string[]).includes(role)
}

/** Menu Quản trị: có mục con nào đó cần hiển thị */
export function canOpenAdminSection(role?: string | null): boolean {
  return isTenantAdmin(role) || isExecutive(role) || isTransferApprover(role)
}
