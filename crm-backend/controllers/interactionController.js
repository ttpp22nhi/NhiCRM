import { v4 as uuidv4 } from 'uuid'
import pool from '../database.js'
import { getTenantId } from '../utils/tenantHelper.js'
import { syncKpiForInteraction } from '../services/kpiFromDealsSyncService.js'

/**
 * @swagger
 * /api/interactions:
 *   post:
 *     summary: Tạo mới một tương tác
 *     tags: [Interactions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - customer_id
 *               - interaction_type
 *               - content
 *             properties:
 *               customer_id:
 *                 type: string
 *                 description: ID của khách hàng
 *               deal_id:
 *                 type: string
 *                 description: ID của deal (tùy chọn)
 *               interaction_type:
 *                 type: string
 *                 description: Loại tương tác (call, email, meeting, note, etc.)
 *               content:
 *                 type: string
 *                 description: Nội dung tương tác
 *               status:
 *                 type: string
 *                 description: Trạng thái tương tác
 *               interaction_date:
 *                 type: integer
 *                 format: int64
 *                 description: Timestamp của ngày tương tác (nếu không có sẽ dùng thời gian hiện tại)
 *     responses:
 *       201:
 *         description: Tạo tương tác thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       500:
 *         description: Lỗi hệ thống
 */
export const createInteraction = async (req, res) => {
  const { id: employeeId } = req.user
  const { customer_id, deal_id, interaction_type, content, status, interaction_date } = req.body
  const tenantId = getTenantId(req)

  try {
    if (!customer_id) {
      return res.status(400).json({ success: false, message: 'customer_id là bắt buộc.' })
    }
    if (!interaction_type) {
      return res.status(400).json({ success: false, message: 'interaction_type là bắt buộc.' })
    }
    if (!content || content.trim() === '') {
      return res.status(400).json({ success: false, message: 'content là bắt buộc và không được để trống.' })
    }

    const customerCheck = await pool.query(
      'SELECT customer_id FROM customers WHERE customer_id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [customer_id, tenantId]
    )
    if (customerCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Khách hàng không tồn tại hoặc đã bị xóa.' })
    }

    if (deal_id) {
      const dealCheck = await pool.query(
        'SELECT deal_id FROM deals WHERE deal_id = $1 AND tenant_id = $2 AND (COALESCE(is_deleted, false) = false)',
        [deal_id, tenantId]
      )
      if (dealCheck.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Deal không tồn tại.' })
      }
    }

    const interaction_id = uuidv4()
    const finalInteractionDate = interaction_date || Date.now()
    const created_at = Date.now()

    const query = `
      INSERT INTO interactions (
        interaction_id, customer_id, deal_id, interaction_type, content,
        interaction_date, employee_id, status, tenant_id, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `
    const values = [
      interaction_id, customer_id, deal_id || null, interaction_type, content.trim(),
      finalInteractionDate, employeeId, status || null, tenantId, created_at
    ]

    const result = await pool.query(query, values)

    // Fire-and-forget: cập nhật actual_approach_count cho kỳ tương ứng.
    syncKpiForInteraction(tenantId, employeeId, finalInteractionDate).catch((e) => {
      if (e?.code !== '42P01' && e?.code !== '42703') {
        console.error('syncKpiForInteraction (createInteraction):', e)
      }
    })

    res.status(201).json({
      success: true,
      message: 'Tạo tương tác thành công!',
      data: result.rows[0]
    })
  } catch (error) {
    console.error('Lỗi createInteraction:', error)
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi tạo tương tác.',
      error: error.message
    })
  }
}

/**
 * @swagger
 * /api/interactions/customer/{customerId}:
 *   get:
 *     summary: Lấy danh sách tương tác của khách hàng
 *     tags: [Interactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: customerId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của khách hàng
 *     responses:
 *       200:
 *         description: Danh sách tương tác
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Interaction'
 *       404:
 *         description: Khách hàng không tồn tại
 *       500:
 *         description: Lỗi hệ thống
 */
export const getInteractionsByCustomer = async (req, res) => {
  const { customerId } = req.params
  const { role, id: userId } = req.user
  const tenantId = getTenantId(req)

  try {
    const customerCheck = await pool.query(
      'SELECT customer_id, assigned_to FROM customers WHERE customer_id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [customerId, tenantId]
    )
    if (customerCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Khách hàng không tồn tại hoặc đã bị xóa.' })
    }
    const customer = customerCheck.rows[0]
    const roleNorm = String(role || '').toLowerCase()
    // Rule mới: mọi role trừ sales đều được xem lịch sử tương tác trong tenant.
    // sales chỉ được xem khách hàng do mình phụ trách.
    if (roleNorm === 'sales' && customer.assigned_to !== userId) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền xem tương tác của khách hàng này.' })
    }

    const query = `
      SELECT 
        i.*,
        e.full_name as employee_full_name,
        e.username as employee_username,
        e.email as employee_email,
        e.role as employee_role
      FROM interactions i
      LEFT JOIN employees e ON i.employee_id = e.employee_id
      WHERE i.customer_id = $1 AND i.tenant_id = $2
      ORDER BY i.interaction_date DESC, i.created_at DESC
    `
    const result = await pool.query(query, [customerId, tenantId])

    res.json({
      success: true,
      data: result.rows
    })
  } catch (error) {
    console.error('Lỗi getInteractionsByCustomer:', error)
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi lấy danh sách tương tác.',
      error: error.message
    })
  }
}





