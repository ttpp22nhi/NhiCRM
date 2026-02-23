/**
 * Service truy vấn departments theo tenant và scope (Búp bê Nga).
 * Mọi lấy dữ liệu đều nhận tenantId và có thể nhận access (scope) để lọc.
 */
import pool from '../database.js'
import { buildDepartmentFilter } from './permissionService.js'

/**
 * Lấy danh sách departments (cây) theo tenant, có thể lọc theo scope
 * @param {string} tenantId
 * @param {object} [access] - Kết quả getAccessScope (departments, read). Nếu không truyền = xem toàn bộ trong tenant (global).
 */
export async function getDepartments(tenantId, access = null) {
  let whereClause = 'd.tenant_id = $1'
  let params = [tenantId]
  let paramIndex = 2

  if (access && access.scope !== 'global') {
    const filter = buildDepartmentFilter(access, paramIndex)
    whereClause += ` AND ${filter.clause}`
    params = [...params, ...filter.params]
    paramIndex = filter.paramIndex
  }

  const query = `
    SELECT d.id, d.name, d.parent_id, d.path, d.type, d.created_at, d.updated_at, d.tenant_id
    FROM departments d
    WHERE ${whereClause}
    ORDER BY
      CASE WHEN d.parent_id IS NULL THEN 0 ELSE 1 END,
      COALESCE(d.path, d.id),
      d.name ASC
  `
  const result = await pool.query(query, params)
  return result.rows
}

/**
 * Lấy danh sách departments dạng phẳng (dropdown), có thể lọc theo scope
 */
export async function getDepartmentsFlat(tenantId, access = null) {
  let whereClause = 'd.tenant_id = $1'
  let params = [tenantId]
  let paramIndex = 2

  if (access && access.scope !== 'global') {
    const filter = buildDepartmentFilter(access, paramIndex)
    whereClause += ` AND ${filter.clause}`
    params = [...params, ...filter.params]
  }

  const query = `
    SELECT d.id, d.name, d.parent_id, d.path, d.type, p.name as parent_name
    FROM departments d
    LEFT JOIN departments p ON d.parent_id = p.id AND p.tenant_id = d.tenant_id
    WHERE ${whereClause}
    ORDER BY COALESCE(d.path, d.id), d.name ASC
  `
  const result = await pool.query(query, params)
  return result.rows
}

/**
 * Lấy một department theo id (cùng tenant)
 */
export async function getDepartmentById(id, tenantId) {
  const result = await pool.query(
    `SELECT d.*, p.name as parent_name
     FROM departments d
     LEFT JOIN departments p ON d.parent_id = p.id AND p.tenant_id = d.tenant_id
     WHERE d.id = $1 AND d.tenant_id = $2`,
    [id, tenantId]
  )
  return result.rows[0] || null
}
