/**
 * Dịch vụ phân quyền động theo mô hình "Búp bê Nga"
 * Quyền hạn = (Bạn là ai - role) + (Bạn đứng ở đâu - department + path)
 *
 * scope:
 * - personal: Chỉ dữ liệu của chính mình (assigned_to = userId)
 * - current_node: Dữ liệu của nhân viên trong đơn vị hiện tại
 * - sub_tree: Dữ liệu của nhân viên trong đơn vị + tất cả đơn vị con/cháu (path LIKE)
 * - global: Toàn công ty
 */

import pool from '../database.js'

const VALID_SCOPES = ['personal', 'current_node', 'sub_tree', 'global']

/**
 * Lấy scope phân quyền cho user với resource và action (theo tenant)
 * @param {string} userId - employee_id
 * @param {string} resource - VD: 'customers', 'deals'
 * @param {string} action - VD: 'create', 'read', 'update', 'delete'
 * @param {string} tenantId - tenant_id để Data Isolation
 * @returns {Promise<{scope: string, employeeIds?: string[], departmentIds?: string[]}>}
 */
export async function getAccessScope(userId, resource, action, tenantId) {
  const userResult = await pool.query(
    'SELECT employee_id, role, department_id FROM employees WHERE employee_id = $1 AND tenant_id = $2 AND is_active = TRUE',
    [userId, tenantId]
  )
  if (userResult.rows.length === 0) {
    return { scope: 'personal', employeeIds: [userId], departmentIds: [] }
  }

  const { role, department_id } = userResult.rows[0]
  const roleNorm = String(role || '').toLowerCase()
  // Rule hiện tại: director/manager có quyền như admin trong phạm vi tenant.
  if (['admin', 'super_admin', 'director', 'manager'].includes(roleNorm)) {
    return { scope: 'global' }
  }
  let userDepartmentPath = null
  if (department_id) {
    const pathRow = await pool.query(
      'SELECT path FROM departments WHERE id = $1 AND tenant_id = $2',
      [department_id, tenantId]
    )
    userDepartmentPath = pathRow.rows[0]?.path || null
  }

  const permResult = await pool.query(
    'SELECT scope FROM role_permissions WHERE role_name = $1 AND resource = $2 AND action = $3 AND tenant_id = $4',
    [role, resource, action, tenantId]
  )

  let scope = 'personal'
  if (permResult.rows.length > 0) {
    scope = permResult.rows[0].scope
    if (!VALID_SCOPES.includes(scope)) scope = 'personal'
  }

  if (scope === 'global') {
    return { scope: 'global' }
  }

  if (scope === 'personal') {
    return {
      scope: 'personal',
      employeeIds: [userId],
      userDepartmentId: department_id || null,
      userDepartmentPath
    }
  }

  if (scope === 'current_node') {
    if (!department_id) {
      return { scope: 'personal', employeeIds: [userId], userDepartmentId: null, userDepartmentPath: null }
    }
    const deptRow = await pool.query(
      'SELECT id, path FROM departments WHERE id = $1 AND tenant_id = $2',
      [department_id, tenantId]
    )
    const userDepartmentPath = deptRow.rows[0]?.path || null
    const empResult = await pool.query(
      'SELECT employee_id FROM employees WHERE department_id = $1 AND tenant_id = $2 AND is_active = TRUE',
      [department_id, tenantId]
    )
    const employeeIds = empResult.rows.map((r) => r.employee_id)
    return {
      scope: 'current_node',
      employeeIds,
      departmentIds: [department_id],
      userDepartmentId: department_id,
      userDepartmentPath
    }
  }

  if (scope === 'sub_tree') {
    if (!department_id) {
      return { scope: 'personal', employeeIds: [userId], userDepartmentId: null, userDepartmentPath: null }
    }
    const deptResult = await pool.query(
      'SELECT path FROM departments WHERE id = $1 AND tenant_id = $2',
      [department_id, tenantId]
    )
    if (deptResult.rows.length === 0) {
      return { scope: 'personal', employeeIds: [userId], userDepartmentId: null, userDepartmentPath: null }
    }
    const myPath = deptResult.rows[0].path || `${tenantId}/${department_id}`
    const subResult = await pool.query(
      `SELECT id FROM departments WHERE tenant_id = $1 AND (path LIKE $2 OR id = $3)`,
      [tenantId, `${myPath}/%`, department_id]
    )
    const departmentIds = subResult.rows.map((r) => r.id)
    if (departmentIds.length === 0) {
      return { scope: 'personal', employeeIds: [userId], userDepartmentId: department_id, userDepartmentPath: myPath }
    }
    const placeholders = departmentIds.map((_, i) => `$${i + 1}`).join(', ')
    const empResult = await pool.query(
      `SELECT employee_id FROM employees WHERE tenant_id = $${departmentIds.length + 1} AND department_id IN (${placeholders}) AND is_active = TRUE`,
      [...departmentIds, tenantId]
    )
    const employeeIds = empResult.rows.map((r) => r.employee_id)
    return {
      scope: 'sub_tree',
      employeeIds,
      departmentIds,
      userDepartmentId: department_id,
      userDepartmentPath: myPath
    }
  }

  return { scope: 'personal', employeeIds: [userId], userDepartmentId: null, userDepartmentPath: null }
}

/**
 * Chuyển scope thành WHERE cho bảng departments (path / department_id).
 * personal: chỉ đơn vị của user (department_id = user_department_id).
 * current_node: department_id = user_department_id.
 * sub_tree: path LIKE userDepartmentPath/% OR id = userDepartmentId (cùng tenant).
 * global: không thêm điều kiện cấp (chỉ dùng tenant_id ở ngoài).
 */
export function buildDepartmentFilter(access, paramIndex = 1) {
  if (access.scope === 'global') {
    return { clause: '1=1', params: [], paramIndex }
  }
  if (access.scope === 'personal' || access.scope === 'current_node') {
    if (!access.userDepartmentId) {
      return { clause: '1=0', params: [], paramIndex }
    }
    return {
      clause: `d.id = $${paramIndex}`,
      params: [access.userDepartmentId],
      paramIndex: paramIndex + 1
    }
  }
  if (access.scope === 'sub_tree' && access.userDepartmentPath != null) {
    return {
      clause: `(d.path LIKE $${paramIndex} OR d.id = $${paramIndex + 1})`,
      params: [`${access.userDepartmentPath}/%`, access.userDepartmentId],
      paramIndex: paramIndex + 2
    }
  }
  return { clause: '1=0', params: [], paramIndex }
}

/**
 * Tạo điều kiện SQL filter cho customers (assigned_to)
 * @param {object} access - Kết quả từ getAccessScope
 * @param {number} paramIndex - Vị trí tham số tiếp theo
 * @returns {{ clause: string, params: string[] }}
 */
export function buildCustomerFilter(access, paramIndex = 1) {
  if (access.scope === 'global') {
    return { clause: '1=1', params: [], paramIndex }
  }
  if (access.employeeIds && access.employeeIds.length > 0) {
    const placeholders = access.employeeIds.map((_, i) => `$${paramIndex + i}`).join(', ')
    return {
      clause: `c.assigned_to IN (${placeholders})`,
      params: access.employeeIds,
      paramIndex: paramIndex + access.employeeIds.length
    }
  }
  return { clause: 'c.assigned_to = $1', params: [access.employeeIds?.[0]], paramIndex: paramIndex + 1 }
}

/**
 * Tạo điều kiện SQL filter cho deals (assigned_to)
 */
export function buildDealFilter(access, paramIndex = 1) {
  if (access.scope === 'global') {
    return { clause: '1=1', params: [], paramIndex }
  }
  if (access.employeeIds && access.employeeIds.length > 0) {
    const placeholders = access.employeeIds.map((_, i) => `$${paramIndex + i}`).join(', ')
    return {
      clause: `d.assigned_to IN (${placeholders})`,
      params: access.employeeIds,
      paramIndex: paramIndex + access.employeeIds.length
    }
  }
  return { clause: `d.assigned_to = $${paramIndex}`, params: [access.employeeIds?.[0]], paramIndex: paramIndex + 1 }
}
