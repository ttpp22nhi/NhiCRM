/**
 * Danh sách nhân viên được phép gán (Assigned To) theo phân cấp:
 * - director: toàn bộ nhân viên trong Tenant
 * - manager: chính mình + tất cả leader và sales thuộc department_path (cây đơn vị)
 * - leader: chính mình + tất cả sales thuộc team (cùng đơn vị current_node)
 * - sales: chỉ chính mình
 */

import pool from '../database.js'

const DIRECTOR_ROLES = ['super_admin', 'admin', 'director']

/**
 * Lấy danh sách employee_id được phép gán cho user (để validate 403)
 * @returns {Promise<string[]>}
 */
export async function getAssignableEmployeeIds(tenantId, userId, role) {
  const roleNorm = (role || '').toLowerCase()
  if (DIRECTOR_ROLES.includes(roleNorm)) {
    const r = await pool.query(
      'SELECT employee_id FROM employees WHERE tenant_id = $1 AND is_active = TRUE',
      [tenantId]
    )
    return (r.rows || []).map((row) => row.employee_id)
  }
  if (roleNorm === 'manager') {
    const userRow = await pool.query(
      'SELECT department_id FROM employees WHERE employee_id = $1 AND tenant_id = $2',
      [userId, tenantId]
    )
    if (!userRow.rows.length || !userRow.rows[0].department_id) {
      return [userId]
    }
    const deptId = userRow.rows[0].department_id
    const pathRow = await pool.query(
      'SELECT path FROM departments WHERE id = $1 AND tenant_id = $2',
      [deptId, tenantId]
    )
    const myPath = pathRow.rows[0]?.path || `${tenantId}/${deptId}`
    const sub = await pool.query(
      `SELECT id FROM departments WHERE tenant_id = $1 AND (path LIKE $2 OR id = $3)`,
      [tenantId, `${myPath}/%`, deptId]
    )
    const deptIds = sub.rows.map((r) => r.id)
    if (deptIds.length === 0) return [userId]
    const placeholders = deptIds.map((_, i) => `$${i + 1}`).join(', ')
    const emp = await pool.query(
      `SELECT employee_id FROM employees WHERE tenant_id = $${deptIds.length + 1} AND department_id IN (${placeholders}) AND is_active = TRUE AND role IN ('leader', 'sales')`,
      [...deptIds, tenantId]
    )
    const ids = (emp.rows || []).map((r) => r.employee_id)
    return ids.includes(userId) ? ids : [userId, ...ids]
  }
  if (roleNorm === 'leader') {
    const userRow = await pool.query(
      'SELECT department_id FROM employees WHERE employee_id = $1 AND tenant_id = $2',
      [userId, tenantId]
    )
    if (!userRow.rows.length || !userRow.rows[0].department_id) {
      return [userId]
    }
    const deptId = userRow.rows[0].department_id
    const emp = await pool.query(
      `SELECT employee_id FROM employees WHERE tenant_id = $1 AND department_id = $2 AND is_active = TRUE AND (role = 'leader' OR role = 'sales')`,
      [tenantId, deptId]
    )
    const ids = (emp.rows || []).map((r) => r.employee_id)
    return ids.includes(userId) ? ids : [userId, ...ids]
  }
  return [userId]
}

/**
 * Lấy danh sách nhân viên hiển thị trong dropdown Assigned To (cùng cấu trúc với getEmployees)
 * @returns {Promise<Array<{ employee_id, username, full_name, email, role, department_id, department_name }>>}
 */
export async function getAssignableEmployees(tenantId, userId, role) {
  const ids = await getAssignableEmployeeIds(tenantId, userId, role)
  if (ids.length === 0) return []
  const placeholders = ids.map((_, i) => `$${i + 2}`).join(', ')
  const result = await pool.query(
    `SELECT e.employee_id, e.username, e.full_name, e.email, e.role, e.department_id, e.is_active,
      d.name AS department_name
     FROM employees e
     LEFT JOIN departments d ON e.department_id = d.id AND d.tenant_id = e.tenant_id
     WHERE e.tenant_id = $1 AND e.employee_id IN (${placeholders}) AND e.is_active = TRUE
     ORDER BY e.full_name ASC`,
    [tenantId, ...ids]
  )
  return result.rows || []
}
