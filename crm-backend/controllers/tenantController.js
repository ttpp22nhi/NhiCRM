/**
 * API quản lý Tenants (chỉ Super Admin - cấp hệ thống).
 * Không bị giới hạn bởi tenant_id.
 */
import pool from '../database.js'
import { v4 as uuidv4 } from 'uuid'

const PACKAGE_TYPES = ['Starter', 'Growth', 'Ultimate']

/**
 * Lấy thông tin gói dịch vụ của tenant hiện tại (cho Dashboard: banner hết hạn, disable nút).
 * Chạy sau checkTenantSubscription nên req.tenantSubscription đã có.
 */
export const getMySubscription = (req, res) => {
  res.json({ success: true, data: req.tenantSubscription || null })
}

export const getTenants = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, domain, package_type, max_users, max_levels, is_active, start_date, end_date, created_at, updated_at
      FROM tenants
      ORDER BY name ASC
    `)
    res.json({ success: true, data: result.rows })
  } catch (error) {
    console.error('Lỗi getTenants:', error)
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi lấy danh sách tenant.',
      error: error.message
    })
  }
}

export const getTenantById = async (req, res) => {
  const { id } = req.params
  try {
    const result = await pool.query(
      'SELECT id, name, domain, package_type, max_users, max_levels, is_active, start_date, end_date, created_at, updated_at FROM tenants WHERE id = $1',
      [id]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy tenant.'
      })
    }
    res.json({ success: true, data: result.rows[0] })
  } catch (error) {
    console.error('Lỗi getTenantById:', error)
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống.',
      error: error.message
    })
  }
}

function parseDate(v) {
  if (v == null || v === '') return null
  const s = String(v).trim()
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : s.substring(0, 10) // YYYY-MM-DD
}

export const createTenant = async (req, res) => {
  const { name, domain, package_type, max_users, max_levels, start_date, end_date } = req.body
  try {
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Tên tenant là bắt buộc.' })
    }
    if (!domain || !domain.trim()) {
      return res.status(400).json({ success: false, message: 'Domain là bắt buộc.' })
    }
    const pkg = (package_type || 'Starter').trim()
    if (!PACKAGE_TYPES.includes(pkg)) {
      return res.status(400).json({
        success: false,
        message: `package_type phải là một trong: ${PACKAGE_TYPES.join(', ')}`
      })
    }
    const maxUsers = Math.max(1, parseInt(max_users, 10) || 10)
    const maxLevels = Math.max(1, Math.min(20, parseInt(max_levels, 10) || 5))
    const startDate = parseDate(start_date)
    const endDate = parseDate(end_date)

    const id = uuidv4()
    const now = Date.now()
    await pool.query(
      `INSERT INTO tenants (id, name, domain, package_type, max_users, max_levels, is_active, start_date, end_date, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8, $9, $10)`,
      [id, name.trim(), domain.trim().toLowerCase().replace(/\s+/g, '-'), pkg, maxUsers, maxLevels, startDate, endDate, now, now]
    )
    const created = await pool.query(
      'SELECT id, name, domain, package_type, max_users, max_levels, is_active, start_date, end_date, created_at, updated_at FROM tenants WHERE id = $1',
      [id]
    )
    res.status(201).json({
      success: true,
      message: 'Tạo tenant thành công!',
      data: created.rows[0]
    })
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ success: false, message: 'Domain đã tồn tại.' })
    }
    console.error('Lỗi createTenant:', error)
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi tạo tenant.',
      error: error.message
    })
  }
}

export const updateTenant = async (req, res) => {
  const { id } = req.params
  const { name, domain, package_type, max_users, max_levels, is_active, start_date, end_date } = req.body
  try {
    const check = await pool.query('SELECT id FROM tenants WHERE id = $1', [id])
    if (check.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tenant.' })
    }

    const updates = []
    const values = []
    let idx = 1

    if (name !== undefined) {
      updates.push(`name = $${idx++}`)
      values.push(name.trim())
    }
    if (domain !== undefined) {
      updates.push(`domain = $${idx++}`)
      values.push(domain.trim().toLowerCase().replace(/\s+/g, '-'))
    }
    if (package_type !== undefined) {
      const pkg = package_type.trim()
      if (!PACKAGE_TYPES.includes(pkg)) {
        return res.status(400).json({
          success: false,
          message: `package_type phải là một trong: ${PACKAGE_TYPES.join(', ')}`
        })
      }
      updates.push(`package_type = $${idx++}`)
      values.push(pkg)
    }
    if (max_users !== undefined) {
      updates.push(`max_users = $${idx++}`)
      values.push(Math.max(1, parseInt(max_users, 10) || 10))
    }
    if (max_levels !== undefined) {
      updates.push(`max_levels = $${idx++}`)
      values.push(Math.max(1, Math.min(20, parseInt(max_levels, 10) || 5)))
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${idx++}`)
      values.push(!!is_active)
    }
    if (start_date !== undefined) {
      updates.push(`start_date = $${idx++}`)
      values.push(parseDate(start_date))
    }
    if (end_date !== undefined) {
      updates.push(`end_date = $${idx++}`)
      values.push(parseDate(end_date))
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'Không có trường nào để cập nhật.' })
    }

    updates.push(`updated_at = $${idx++}`)
    values.push(Date.now())
    values.push(id)
    await pool.query(
      `UPDATE tenants SET ${updates.join(', ')} WHERE id = $${idx}`,
      values
    )
    const updated = await pool.query(
      'SELECT id, name, domain, package_type, max_users, max_levels, is_active, start_date, end_date, created_at, updated_at FROM tenants WHERE id = $1',
      [id]
    )
    res.json({
      success: true,
      message: 'Cập nhật tenant thành công!',
      data: updated.rows[0]
    })
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ success: false, message: 'Domain đã tồn tại.' })
    }
    console.error('Lỗi updateTenant:', error)
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi cập nhật tenant.',
      error: error.message
    })
  }
}
