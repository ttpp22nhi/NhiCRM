/**
 * Scope theo phân cấp (dùng chung cho getDeals, getTasks):
 * - director: WHERE tenant_id = current_tenant_id (thấy toàn bộ)
 * - manager: + path LIKE manager_dept_path%
 * - leader: + path LIKE leader_team_path%
 * - sales: assigned_to = user_id (chỉ việc của mình)
 * Bảo mật: luôn lọc tenant_id, không xem dữ liệu tenant khác.
 */

import pool from '../database.js'

const FULL_VISIBILITY_ROLES = ['super_admin', 'admin', 'director', 'manager']
const PATH_SCOPE_ROLES = ['leader']

async function getUserDepartmentPath(tenantId, userId) {
  const row = await pool.query(
    `SELECT dep.path, dep.id AS department_id
     FROM employees e
     JOIN departments dep ON e.department_id = dep.id AND dep.tenant_id = e.tenant_id
     WHERE e.employee_id = $1 AND e.tenant_id = $2`,
    [userId, tenantId]
  )
  if (row.rows.length === 0) return { path: null }
  const r = row.rows[0]
  const path = r.path || (r.department_id ? `${tenantId}/${r.department_id}` : null)
  return { path }
}

/**
 * @param {string} tenantId
 * @param {string} userId
 * @param {string} role
 * @param {string} assignedToColumn - e.g. 'd.assigned_to' hoặc 't.assigned_to'
 * @returns {Promise<{ scopeClause: string, scopeParams: any[] }>}
 */
export async function buildScopeCondition(tenantId, userId, role, assignedToColumn = 'd.assigned_to') {
  const roleNorm = (role || '').toLowerCase()

  if (FULL_VISIBILITY_ROLES.includes(roleNorm)) {
    return { scopeClause: '1=1', scopeParams: [] }
  }

  if (PATH_SCOPE_ROLES.includes(roleNorm)) {
    const { path } = await getUserDepartmentPath(tenantId, userId)
    if (!path) {
      return { scopeClause: `${assignedToColumn} = $2`, scopeParams: [userId] }
    }
    const pathPattern = `${path}%`
    return {
      scopeClause: `(
        ${assignedToColumn} IN (
          SELECT e.employee_id FROM employees e
          JOIN departments dep ON e.department_id = dep.id AND dep.tenant_id = e.tenant_id
          WHERE dep.tenant_id = $2 AND dep.path LIKE $3
        )
      )`,
      scopeParams: [tenantId, pathPattern]
    }
  }

  return { scopeClause: `${assignedToColumn} = $2`, scopeParams: [userId] }
}
