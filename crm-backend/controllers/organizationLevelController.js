import pool from '../database.js'
import { v4 as uuidv4 } from 'uuid'
import { getTenantId } from '../utils/tenantHelper.js'

/**
 * Lấy danh sách các cấp bậc trong cây cấu trúc công ty — theo tenant (Công ty A: Level 1 = Phòng, Công ty B: Level 1 = Trung tâm)
 */
export const getOrganizationLevels = async (req, res) => {
  const tenantId = getTenantId(req)
  try {
    const result = await pool.query(
      `SELECT id, level_order, level_name, created_at, updated_at
       FROM organization_levels
       WHERE tenant_id = $1
       ORDER BY level_order ASC`,
      [tenantId]
    )
    res.json({ success: true, data: result.rows })
  } catch (error) {
    console.error('Lỗi getOrganizationLevels:', error)
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi lấy định nghĩa cấp bậc.',
      error: error.message
    })
  }
}

/**
 * Cập nhật tên cấp bậc (chỉ trong tenant hiện tại)
 */
export const updateOrganizationLevel = async (req, res) => {
  const { id } = req.params
  const { level_name } = req.body
  const tenantId = getTenantId(req)
  try {
    if (!level_name || !level_name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Tên cấp bậc là bắt buộc.'
      })
    }
    const result = await pool.query(
      `UPDATE organization_levels SET level_name = $1, updated_at = $2 WHERE id = $3 AND tenant_id = $4 RETURNING *`,
      [level_name.trim(), Date.now(), id, tenantId]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy cấp bậc.'
      })
    }
    res.json({
      success: true,
      message: 'Cập nhật tên cấp bậc thành công!',
      data: result.rows[0]
    })
  } catch (error) {
    console.error('Lỗi updateOrganizationLevel:', error)
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi cập nhật cấp bậc.',
      error: error.message
    })
  }
}

/**
 * Thêm cấp bậc mới (thuộc tenant hiện tại)
 */
export const createOrganizationLevel = async (req, res) => {
  const { level_order, level_name } = req.body
  const tenantId = getTenantId(req)
  try {
    if (!level_name || !level_name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Tên cấp bậc là bắt buộc.'
      })
    }
    const order = level_order != null ? parseInt(level_order, 10) : null
    if (order == null || isNaN(order) || order < 1) {
      return res.status(400).json({
        success: false,
        message: 'Thứ tự cấp bậc phải là số nguyên dương.'
      })
    }
    const id = uuidv4()
    const now = Date.now()
    await pool.query(
      `INSERT INTO organization_levels (id, level_order, level_name, tenant_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, order, level_name.trim(), tenantId, now, now]
    )
    const created = await pool.query('SELECT * FROM organization_levels WHERE id = $1 AND tenant_id = $2', [id, tenantId])
    res.status(201).json({
      success: true,
      message: 'Thêm cấp bậc thành công!',
      data: created.rows[0]
    })
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({
        success: false,
        message: 'Thứ tự cấp bậc đã tồn tại trong đơn vị của bạn.'
      })
    }
    console.error('Lỗi createOrganizationLevel:', error)
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi thêm cấp bậc.',
      error: error.message
    })
  }
}

/**
 * Xóa cấp bậc và cập nhật lại thứ tự các cấp còn lại (chỉ trong tenant)
 */
export const deleteOrganizationLevel = async (req, res) => {
  const { id } = req.params
  const tenantId = getTenantId(req)
  try {
    const current = await pool.query(
      'SELECT level_order FROM organization_levels WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    )
    if (current.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy cấp bậc.'
      })
    }
    const deletedOrder = current.rows[0].level_order

    await pool.query('DELETE FROM organization_levels WHERE id = $1 AND tenant_id = $2', [id, tenantId])

    await pool.query(
      `UPDATE organization_levels SET level_order = level_order - 1, updated_at = $1 WHERE tenant_id = $2 AND level_order > $3`,
      [Date.now(), tenantId, deletedOrder]
    )

    res.json({
      success: true,
      message: 'Đã xóa cấp bậc.'
    })
  } catch (error) {
    console.error('Lỗi deleteOrganizationLevel:', error)
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi xóa cấp bậc.',
      error: error.message
    })
  }
}

/**
 * Đổi thứ tự: move up/down (chỉ trong tenant)
 */
export const moveOrganizationLevel = async (req, res) => {
  const { id } = req.params
  const { direction } = req.body
  const tenantId = getTenantId(req)
  try {
    if (direction !== 'up' && direction !== 'down') {
      return res.status(400).json({
        success: false,
        message: 'direction phải là "up" hoặc "down".'
      })
    }
    const current = await pool.query(
      'SELECT * FROM organization_levels WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    )
    if (current.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy cấp bậc.'
      })
    }
    const item = current.rows[0]
    const myOrder = item.level_order

    const neighborOrder = direction === 'up' ? myOrder - 1 : myOrder + 1
    if (neighborOrder < 1) {
      return res.status(400).json({
        success: false,
        message: 'Đã ở vị trí đầu, không thể lên trên.'
      })
    }

    const neighbor = await pool.query(
      'SELECT * FROM organization_levels WHERE tenant_id = $1 AND level_order = $2',
      [tenantId, neighborOrder]
    )
    if (neighbor.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: direction === 'up' ? 'Đã ở vị trí đầu.' : 'Đã ở vị trí cuối.'
      })
    }

    const now = Date.now()
    const tempOrder = -1
    await pool.query(
      'UPDATE organization_levels SET level_order = $1, updated_at = $2 WHERE id = $3 AND tenant_id = $4',
      [tempOrder, now, id, tenantId]
    )
    await pool.query(
      'UPDATE organization_levels SET level_order = $1, updated_at = $2 WHERE id = $3 AND tenant_id = $4',
      [myOrder, now, neighbor.rows[0].id, tenantId]
    )
    await pool.query(
      'UPDATE organization_levels SET level_order = $1, updated_at = $2 WHERE id = $3 AND tenant_id = $4',
      [neighborOrder, now, id, tenantId]
    )

    res.json({
      success: true,
      message: 'Đã đổi thứ tự cấp bậc.',
      data: { myOrder: neighborOrder, otherOrder: myOrder }
    })
  } catch (error) {
    console.error('Lỗi moveOrganizationLevel:', error)
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi đổi thứ tự.',
      error: error.message
    })
  }
}
