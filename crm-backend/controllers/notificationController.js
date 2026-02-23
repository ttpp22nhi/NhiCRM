import pool from '../database.js'
import { getTenantId } from '../utils/tenantHelper.js'

/**
 * Lấy danh sách thông báo của người dùng hiện tại — theo tenant
 */
export const getNotifications = async (req, res) => {
  const { id: userId } = req.user
  const { unread_only = 'false' } = req.query
  const tenantId = getTenantId(req)

  try {
    let query = `
      SELECT *
      FROM public.notifications
      WHERE employee_id = $1 AND (tenant_id IS NULL OR tenant_id = $2)
    `
    const params = [userId, tenantId]

    if (unread_only === 'true') {
      query += ' AND is_read = false'
    }

    query += ' ORDER BY created_at DESC LIMIT 50'

    const result = await pool.query(query, params)

    res.json({
      success: true,
      data: result.rows
    })
  } catch (error) {
    console.error('Lỗi getNotifications:', error)
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi lấy danh sách thông báo.',
      error: error.message
    })
  }
}

/**
 * Đánh dấu thông báo đã đọc
 */
export const markAsRead = async (req, res) => {
  const { id } = req.params
  const { id: userId } = req.user
  const tenantId = getTenantId(req)

  try {
    const checkQuery = 'SELECT * FROM public.notifications WHERE notification_id = $1 AND employee_id = $2 AND (tenant_id IS NULL OR tenant_id = $3)'
    const checkResult = await pool.query(checkQuery, [id, userId, tenantId])

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Thông báo không tồn tại hoặc không thuộc về bạn.'
      })
    }

    // Đánh dấu đã đọc
    await pool.query(
      'UPDATE public.notifications SET is_read = true WHERE notification_id = $1',
      [id]
    )

    res.json({
      success: true,
      message: 'Đã đánh dấu thông báo đã đọc.'
    })
  } catch (error) {
    console.error('Lỗi markAsRead:', error)
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi đánh dấu thông báo.',
      error: error.message
    })
  }
}

/**
 * Đánh dấu tất cả thông báo đã đọc
 */
export const markAllAsRead = async (req, res) => {
  const { id: userId } = req.user
  const tenantId = getTenantId(req)

  try {
    await pool.query(
      'UPDATE public.notifications SET is_read = true WHERE employee_id = $1 AND (tenant_id IS NULL OR tenant_id = $2) AND is_read = false',
      [userId, tenantId]
    )

    res.json({
      success: true,
      message: 'Đã đánh dấu tất cả thông báo đã đọc.'
    })
  } catch (error) {
    console.error('Lỗi markAllAsRead:', error)
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi đánh dấu thông báo.',
      error: error.message
    })
  }
}

