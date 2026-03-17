import pool from '../database.js'
import { v4 as uuidv4 } from 'uuid'
import { getTenantId } from '../utils/tenantHelper.js'
import { computePathForDepartment, calculateAndSyncPath } from '../services/departmentPathService.js'
import { getAccessScope } from '../services/permissionService.js'
import * as departmentService from '../services/departmentService.js'

/**
 * Lấy danh sách departments (cây) theo tenant và scope phân quyền.
 * Admin/Super Admin luôn xem toàn bộ cây (global) để quản lý tổ chức đầy đủ.
 */
export const getDepartments = async (req, res) => {
  const tenantId = getTenantId(req)
  const userId = req.user?.id
  try {
    const isAdminOrSuperAdmin = req.user?.role === 'admin' || req.user?.role === 'super_admin'
    const access =
      isAdminOrSuperAdmin
        ? null
        : userId
          ? await getAccessScope(userId, 'departments', 'read', tenantId)
          : null
    const rows = await departmentService.getDepartments(tenantId, access)
    res.json({ success: true, data: rows })
  } catch (error) {
    console.error('Lỗi getDepartments:', error)
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi lấy danh sách phòng ban.',
      error: error.message
    })
  }
}

/**
 * Lấy danh sách departments dạng phẳng (dropdown), theo scope.
 * Admin/Super Admin luôn xem toàn bộ (global) để có thể chọn Phòng/Tổ khi thêm/sửa nhân viên.
 */
export const getDepartmentsFlat = async (req, res) => {
  const tenantId = getTenantId(req)
  const userId = req.user?.id
  try {
    const isAdminOrSuperAdmin = req.user?.role === 'admin' || req.user?.role === 'super_admin'
    const access =
      isAdminOrSuperAdmin
        ? null
        : userId
          ? await getAccessScope(userId, 'departments', 'read', tenantId)
          : null
    const rows = await departmentService.getDepartmentsFlat(tenantId, access)
    res.json({ success: true, data: rows })
  } catch (error) {
    console.error('Lỗi getDepartmentsFlat:', error)
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi lấy danh sách phòng ban.',
      error: error.message
    })
  }
}

/**
 * Lấy chi tiết một department (cùng tenant)
 */
export const getDepartmentById = async (req, res) => {
  const { id } = req.params
  const tenantId = getTenantId(req)
  try {
    const row = await departmentService.getDepartmentById(id, tenantId)
    if (!row) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy phòng ban/tổ.'
      })
    }
    res.json({ success: true, data: row })
  } catch (error) {
    console.error('Lỗi getDepartmentById:', error)
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi lấy thông tin phòng ban.',
      error: error.message
    })
  }
}

/**
 * Lấy level_order từ tên cấp (organization_levels) theo tenant
 */
async function getLevelOrderByLevelName(tenantId, levelName) {
  if (!levelName || !levelName.trim()) return null
  const r = await pool.query(
    'SELECT level_order FROM organization_levels WHERE tenant_id = $1 AND TRIM(level_name) = $2',
    [tenantId, levelName.trim()]
  )
  return r.rows.length > 0 ? r.rows[0].level_order : null
}

/**
 * Tính depth từ path (path = "tenantId/id1/id2" -> depth = số id = path.split('/').length - 1)
 */
function depthFromPath(path) {
  if (!path) return 0
  return Math.max(0, path.split('/').length - 1)
}

/**
 * Tạo department mới (cùng tenant, parent phải cùng tenant).
 * Ràng buộc: Nếu chọn Loại cấp bậc = Cấp K thì đơn vị cha phải ở cấp K-1 (cha phải cao hơn, không bằng hoặc thấp hơn).
 */
export const createDepartment = async (req, res) => {
  const { name, parent_id, type } = req.body
  const tenantId = getTenantId(req)
  try {
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Tên đơn vị là bắt buộc.'
      })
    }
    const finalType = (type || 'Phòng').trim()
    const levelOrder = await getLevelOrderByLevelName(tenantId, finalType)
    if (levelOrder != null) {
      if (levelOrder === 1) {
        if (parent_id) {
          return res.status(400).json({
            success: false,
            message: 'Cấp bậc Cấp 1 (gốc) phải là đơn vị cấp cao, không được chọn đơn vị cha.'
          })
        }
        const existingRoot = await pool.query(
          'SELECT id FROM departments WHERE tenant_id = $1 AND parent_id IS NULL LIMIT 1',
          [tenantId]
        )
        if (existingRoot.rows.length > 0) {
          return res.status(400).json({
            success: false,
            message: 'Chỉ được có một đơn vị gốc (Cấp 1 - VD: Công ty). Đã tồn tại đơn vị gốc, không thể tạo thêm.'
          })
        }
      } else {
        if (!parent_id) {
          return res.status(400).json({
            success: false,
            message: `Cấp bậc Cấp ${levelOrder} phải có đơn vị cha thuộc cấp ${levelOrder - 1}.`
          })
        }
        const parentCheck = await pool.query(
          'SELECT id, path, type FROM departments WHERE id = $1 AND tenant_id = $2',
          [parent_id, tenantId]
        )
        if (parentCheck.rows.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'Đơn vị cha không tồn tại hoặc không thuộc tenant của bạn.'
          })
        }
        const parentType = parentCheck.rows[0].type
        const parentLevelOrder = parentType ? await getLevelOrderByLevelName(tenantId, parentType) : null
        const requiredParentLevelOrder = levelOrder - 1
        if (parentLevelOrder == null || parentLevelOrder !== requiredParentLevelOrder) {
          return res.status(400).json({
            success: false,
            message: `Đơn vị cha phải là loại Cấp ${requiredParentLevelOrder} (không thể bằng hoặc thấp hơn Cấp ${levelOrder}).`
          })
        }
      }
    }
    if (parent_id && !levelOrder) {
      const parentCheck = await pool.query(
        'SELECT id, path FROM departments WHERE id = $1 AND tenant_id = $2',
        [parent_id, tenantId]
      )
      if (parentCheck.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Đơn vị cha không tồn tại hoặc không thuộc tenant của bạn.'
        })
      }
    }
    const id = uuidv4()
    const path = await computePathForDepartment(id, parent_id || null, tenantId)
    // path = "tenantId/id1/id2" -> số cấp = số segment - 1 (bỏ tenantId). VD: 2 segment = 1 cấp (Công ty), 3 = 2 cấp (Công ty -> Phòng)
    const depth = path.split('/').length - 1
    const tenantRow = await pool.query(
      'SELECT max_levels FROM tenants WHERE id = $1 AND is_active = TRUE',
      [tenantId]
    )
    if (tenantRow.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Tenant không tồn tại hoặc đã bị khóa.'
      })
    }
    const maxLevels = tenantRow.rows[0].max_levels
    if (depth > maxLevels) {
      return res.status(400).json({
        success: false,
        message: `Đã đạt giới hạn số cấp tổ chức (tối đa ${maxLevels} cấp). Không thể tạo thêm đơn vị con. Vui lòng nâng cấp gói.`
      })
    }
    const now = Date.now()
    await pool.query(
      `INSERT INTO departments (id, name, parent_id, path, type, tenant_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, name.trim(), parent_id || null, path, finalType, tenantId, now, now]
    )
    await calculateAndSyncPath(id, tenantId)
    const created = await pool.query(
      'SELECT id, name, parent_id, path, type, created_at, updated_at FROM departments WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    )
    res.status(201).json({
      success: true,
      message: 'Tạo đơn vị thành công!',
      data: created.rows[0]
    })
  } catch (error) {
    console.error('Lỗi createDepartment:', error)
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi tạo phòng ban.',
      error: error.message
    })
  }
}

/**
 * Cập nhật department (cùng tenant; parent phải cùng tenant)
 */
export const updateDepartment = async (req, res) => {
  const { id } = req.params
  const { name, parent_id, type } = req.body
  const tenantId = getTenantId(req)
  try {
    const check = await pool.query(
      'SELECT id, parent_id, path FROM departments WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    )
    if (check.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy phòng ban/tổ.'
      })
    }
    const current = check.rows[0]
    if (parent_id === id) {
      return res.status(400).json({
        success: false,
        message: 'Đơn vị không thể là cha của chính nó.'
      })
    }
    const effectiveType = (type !== undefined ? type : current.type) || 'Phòng'
    const effectiveParentId = parent_id !== undefined ? parent_id : current.parent_id
    const levelOrder = await getLevelOrderByLevelName(tenantId, effectiveType.trim())
    if (levelOrder != null) {
      if (levelOrder === 1) {
        if (effectiveParentId) {
          return res.status(400).json({
            success: false,
            message: 'Cấp bậc Cấp 1 (gốc) phải là đơn vị cấp cao, không được chọn đơn vị cha.'
          })
        }
        const otherRoot = await pool.query(
          'SELECT id FROM departments WHERE tenant_id = $1 AND parent_id IS NULL AND id != $2 LIMIT 1',
          [tenantId, id]
        )
        if (otherRoot.rows.length > 0) {
          return res.status(400).json({
            success: false,
            message: 'Chỉ được có một đơn vị gốc (Cấp 1). Đã tồn tại đơn vị gốc khác, không thể đổi thành gốc.'
          })
        }
      } else {
        if (!effectiveParentId) {
          return res.status(400).json({
            success: false,
            message: `Cấp bậc Cấp ${levelOrder} phải có đơn vị cha thuộc cấp ${levelOrder - 1}.`
          })
        }
        const parentCheck = await pool.query(
          'SELECT id, path, type FROM departments WHERE id = $1 AND tenant_id = $2',
          [effectiveParentId, tenantId]
        )
        if (parentCheck.rows.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'Đơn vị cha không tồn tại hoặc không thuộc tenant của bạn.'
          })
        }
        const parentType = parentCheck.rows[0].type
        const parentLevelOrder = parentType ? await getLevelOrderByLevelName(tenantId, parentType) : null
        const requiredParentLevelOrder = levelOrder - 1
        if (parentLevelOrder == null || parentLevelOrder !== requiredParentLevelOrder) {
          return res.status(400).json({
            success: false,
            message: `Đơn vị cha phải là loại Cấp ${requiredParentLevelOrder} (không thể bằng hoặc thấp hơn Cấp ${levelOrder}).`
          })
        }
      }
    } else if (effectiveParentId) {
      const parentCheck = await pool.query(
        'SELECT id FROM departments WHERE id = $1 AND tenant_id = $2',
        [effectiveParentId, tenantId]
      )
      if (parentCheck.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Đơn vị cha không tồn tại hoặc không thuộc tenant của bạn.'
        })
      }
    }
    const updates = []
    const values = []
    let idx = 1
    if (name !== undefined) {
      updates.push(`name = $${idx++}`)
      values.push(name.trim())
    }
    if (type !== undefined) {
      updates.push(`type = $${idx++}`)
      values.push((type || 'Phòng').trim())
    }
    if (parent_id !== undefined) {
      updates.push(`parent_id = $${idx++}`)
      values.push(parent_id || null)
    }
    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Không có trường nào để cập nhật.'
      })
    }
    updates.push(`updated_at = $${idx++}`)
    values.push(Date.now())
    values.push(id)
    values.push(tenantId)
    await pool.query(
      `UPDATE departments SET ${updates.join(', ')} WHERE id = $${idx++} AND tenant_id = $${idx}`,
      values
    )
    if (parent_id !== undefined) {
      await calculateAndSyncPath(id, tenantId)
    }
    const updated = await pool.query(
      'SELECT id, name, parent_id, path, type, created_at, updated_at FROM departments WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    )
    res.json({
      success: true,
      message: 'Cập nhật phòng ban thành công!',
      data: updated.rows[0]
    })
  } catch (error) {
    console.error('Lỗi updateDepartment:', error)
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi cập nhật phòng ban.',
      error: error.message
    })
  }
}

/**
 * Xóa department (chỉ trong tenant)
 */
export const deleteDepartment = async (req, res) => {
  const { id } = req.params
  const tenantId = getTenantId(req)
  try {
    const check = await pool.query('SELECT id, name FROM departments WHERE id = $1 AND tenant_id = $2', [id, tenantId])
    if (check.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy phòng ban/tổ.'
      })
    }
    const empCount = await pool.query(
      'SELECT COUNT(*) as cnt FROM employees WHERE department_id = $1 AND tenant_id = $2',
      [id, tenantId]
    )
    if (parseInt(empCount.rows[0].cnt, 10) > 0) {
      return res.status(400).json({
        success: false,
        message: `Không thể xóa. Còn nhân viên đang thuộc đơn vị này.`
      })
    }
    const childCount = await pool.query(
      'SELECT COUNT(*) as cnt FROM departments WHERE parent_id = $1 AND tenant_id = $2',
      [id, tenantId]
    )
    if (parseInt(childCount.rows[0].cnt, 10) > 0) {
      return res.status(400).json({
        success: false,
        message: 'Không thể xóa. Đơn vị này còn có đơn vị con. Vui lòng xóa các đơn vị con trước.'
      })
    }
    await pool.query('DELETE FROM departments WHERE id = $1 AND tenant_id = $2', [id, tenantId])
    res.json({ success: true, message: 'Đã xóa đơn vị thành công.' })
  } catch (error) {
    console.error('Lỗi deleteDepartment:', error)
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi xóa phòng ban.',
      error: error.message
    })
  }
}
