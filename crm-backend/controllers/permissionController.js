import pool from '../database.js'
import { v4 as uuidv4 } from 'uuid'
import { getTenantId } from '../utils/tenantHelper.js'

const VALID_SCOPES = ['personal', 'current_node', 'sub_tree', 'global']
const VALID_RESOURCES = ['customers', 'deals', 'employees', 'departments']
const VALID_ACTIONS = ['create', 'read', 'update', 'delete']

/**
 * Lấy danh sách role_permissions (chỉ tenant hiện tại)
 */
export const getRolePermissions = async (req, res) => {
  const { role_name, resource } = req.query
  const tenantId = getTenantId(req)
  try {
    let query = `
      SELECT id, role_name, resource, action, scope, created_at, updated_at
      FROM role_permissions
      WHERE tenant_id = $1
    `
    const params = [tenantId]
    let idx = 2
    if (role_name) {
      query += ` AND role_name = $${idx++}`
      params.push(role_name)
    }
    if (resource) {
      query += ` AND resource = $${idx++}`
      params.push(resource)
    }
    query += ' ORDER BY role_name, resource, action'
    const result = await pool.query(query, params)
    res.json({ success: true, data: result.rows })
  } catch (error) {
    console.error('Lỗi getRolePermissions:', error)
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi lấy ma trận phân quyền.',
      error: error.message
    })
  }
}

/**
 * Lấy ma trận phân quyền (group by role) - chỉ tenant hiện tại
 */
export const getPermissionMatrix = async (req, res) => {
  const tenantId = getTenantId(req)
  try {
    const result = await pool.query(
      `SELECT role_name, resource, action, scope
       FROM role_permissions
       WHERE tenant_id = $1
       ORDER BY role_name, resource, action`,
      [tenantId]
    )
    const byRole = {}
    for (const row of result.rows) {
      if (!byRole[row.role_name]) byRole[row.role_name] = []
      byRole[row.role_name].push(row)
    }
    res.json({ success: true, data: result.rows, byRole })
  } catch (error) {
    console.error('Lỗi getPermissionMatrix:', error)
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi lấy ma trận phân quyền.',
      error: error.message
    })
  }
}

/**
 * Tạo hoặc cập nhật role_permission (theo tenant)
 */
export const upsertRolePermission = async (req, res) => {
  const { role_name, resource, action, scope } = req.body
  const tenantId = getTenantId(req)
  try {
    if (!role_name || !resource || !action || !scope) {
      return res.status(400).json({
        success: false,
        message: 'role_name, resource, action, scope là bắt buộc.'
      })
    }
    if (!VALID_SCOPES.includes(scope)) {
      return res.status(400).json({
        success: false,
        message: `scope phải là một trong: ${VALID_SCOPES.join(', ')}`
      })
    }
    if (!VALID_RESOURCES.includes(resource)) {
      return res.status(400).json({
        success: false,
        message: `resource phải là một trong: ${VALID_RESOURCES.join(', ')}`
      })
    }
    if (!VALID_ACTIONS.includes(action)) {
      return res.status(400).json({
        success: false,
        message: `action phải là một trong: ${VALID_ACTIONS.join(', ')}`
      })
    }
    const now = Date.now()
    const id = uuidv4()
    await pool.query(
      `INSERT INTO role_permissions (id, role_name, resource, action, scope, tenant_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (tenant_id, role_name, resource, action)
       DO UPDATE SET scope = EXCLUDED.scope, updated_at = EXCLUDED.updated_at`,
      [id, role_name, resource, action, scope, tenantId, now, now]
    )
    const created = await pool.query(
      'SELECT * FROM role_permissions WHERE role_name = $1 AND resource = $2 AND action = $3 AND tenant_id = $4',
      [role_name, resource, action, tenantId]
    )
    res.json({
      success: true,
      message: 'Cập nhật phân quyền thành công!',
      data: created.rows[0]
    })
  } catch (error) {
    console.error('Lỗi upsertRolePermission:', error)
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi cập nhật phân quyền.',
      error: error.message
    })
  }
}
