import pool from '../database.js'
import { getTenantId } from '../utils/tenantHelper.js'

/**
 * @swagger
 * /api/dashboard/stats:
 *   get:
 *     summary: Lấy thống kê tổng quan Dashboard
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [month, quarter, year]
 *           default: month
 *         description: Khoảng thời gian lọc (tháng này, quý này, năm nay)
 *     responses:
 *       200:
 *         description: Thống kê tổng quan
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     overview:
 *                       type: object
 *                       properties:
 *                         totalRevenue:
 *                           type: number
 *                         totalCustomers:
 *                           type: integer
 *                         pendingTasks:
 *                           type: integer
 *                         totalInteractions:
 *                           type: integer
 *                     customerDistribution:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           type:
 *                             type: string
 *                           count:
 *                             type: integer
 *                     employeePerformance:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           employee_id:
 *                             type: string
 *                           full_name:
 *                             type: string
 *                           customer_count:
 *                             type: integer
 *                           successful_deals:
 *                             type: integer
 *                           total_revenue:
 *                             type: number
 *                     dealStages:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           stage:
 *                             type: string
 *                           count:
 *                             type: integer
 *       401:
 *         description: Chưa đăng nhập
 *       500:
 *         description: Lỗi hệ thống
 */
export const getDashboardStats = async (req, res) => {
  const { role, id: userId } = req.user
  const { period = 'month' } = req.query
  const tenantId = getTenantId(req)

  try {
    // Tính toán khoảng thời gian
    const now = Date.now()
    let startTime = now

    switch (period) {
      case 'month':
        // Tháng này: từ đầu tháng đến hiện tại
        const monthStart = new Date()
        monthStart.setDate(1)
        monthStart.setHours(0, 0, 0, 0)
        startTime = monthStart.getTime()
        break
      case 'quarter':
        // Quý này: từ đầu quý đến hiện tại
        const quarterStart = new Date()
        const currentMonth = quarterStart.getMonth()
        const quarter = Math.floor(currentMonth / 3)
        quarterStart.setMonth(quarter * 3, 1)
        quarterStart.setHours(0, 0, 0, 0)
        startTime = quarterStart.getTime()
        break
      case 'year':
        // Năm nay: từ đầu năm đến hiện tại
        const yearStart = new Date()
        yearStart.setMonth(0, 1)
        yearStart.setHours(0, 0, 0, 0)
        startTime = yearStart.getTime()
        break
      default:
        startTime = now
    }

    // 1. Tổng quan (Overview) — lọc theo tenant
    const revenueQuery = `
      SELECT COALESCE(SUM(amount), 0) as total_revenue
      FROM deals
      WHERE tenant_id = $1 AND LOWER(COALESCE(stage, '')) IN ('thành công', 'closed_won', 'đã đóng', 'hoàn thành')
    `
    const revenueResult = await pool.query(revenueQuery, [tenantId])
    const totalRevenue = parseFloat(revenueResult.rows[0].total_revenue) || 0

    // Tổng số khách hàng (chưa bị xóa) — theo tenant
    let customerCountQuery = `
      SELECT COUNT(*) as total
      FROM customers
      WHERE deleted_at IS NULL AND tenant_id = $1
    `
    let customerCountParams = [tenantId]

    // Phân quyền: Sales chỉ thấy khách hàng của mình
    if (role !== 'admin' && role !== 'manager') {
      customerCountQuery += ' AND assigned_to = $2'
      customerCountParams.push(userId)
    }

    const customerCountResult = await pool.query(customerCountQuery, customerCountParams)
    const totalCustomers = parseInt(customerCountResult.rows[0].total) || 0

    // Số lượng Task chưa hoàn thành — theo tenant
    const taskQuery = `
      SELECT COUNT(*) as total
      FROM tasks
      WHERE tenant_id = $1 AND is_completed = false
    `
    const taskResult = await pool.query(taskQuery, [tenantId])
    const pendingTasks = parseInt(taskResult.rows[0].total) || 0

    // Tổng số tương tác trong khoảng thời gian — theo tenant
    const interactionQuery = `
      SELECT COUNT(*) as total
      FROM interactions
      WHERE tenant_id = $1 AND created_at >= $2
    `
    const interactionResult = await pool.query(interactionQuery, [tenantId, startTime])
    const totalInteractions = parseInt(interactionResult.rows[0].total) || 0

    // 2. Phân bổ khách hàng theo customer_type — theo tenant
    let customerDistributionQuery = `
      SELECT customer_type, COUNT(*) as count
      FROM customers
      WHERE deleted_at IS NULL AND tenant_id = $1
    `
    let distributionParams = [tenantId]

    if (role !== 'admin' && role !== 'manager') {
      customerDistributionQuery += ' AND assigned_to = $2'
      distributionParams.push(userId)
    }

    customerDistributionQuery += ' GROUP BY customer_type ORDER BY count DESC'
    const distributionResult = await pool.query(customerDistributionQuery, distributionParams)

    const customerDistribution = distributionResult.rows.map(row => ({
      type: row.customer_type || 'Không xác định',
      count: parseInt(row.count) || 0
    }))

    // 3. Hiệu suất nhân viên — chỉ trong tenant
    let employeePerformanceQuery = `
      SELECT 
        e.employee_id,
        e.full_name,
        COUNT(DISTINCT c.customer_id) as customer_count,
        COUNT(DISTINCT CASE WHEN LOWER(COALESCE(d.stage, '')) IN ('thành công', 'closed_won', 'đã đóng', 'hoàn thành') THEN d.deal_id END) as successful_deals,
        COALESCE(SUM(CASE WHEN LOWER(COALESCE(d.stage, '')) IN ('thành công', 'closed_won', 'đã đóng', 'hoàn thành') THEN d.amount ELSE 0 END), 0) as total_revenue
      FROM employees e
      LEFT JOIN customers c ON e.employee_id = c.assigned_to AND c.deleted_at IS NULL AND c.tenant_id = e.tenant_id
      LEFT JOIN deals d ON d.customer_id = c.customer_id AND d.tenant_id = e.tenant_id
      WHERE e.is_active = true AND e.tenant_id = $1
    `

    // Phân quyền: Sales chỉ thấy thống kê của mình
    if (role !== 'admin' && role !== 'manager') {
      employeePerformanceQuery += ' AND e.employee_id = $2'
    }

    employeePerformanceQuery += ' GROUP BY e.employee_id, e.full_name ORDER BY total_revenue DESC, customer_count DESC LIMIT 10'

    const employeeParams = role !== 'admin' && role !== 'manager' ? [tenantId, userId] : [tenantId]
    const employeeResult = await pool.query(employeePerformanceQuery, employeeParams)

    const employeePerformance = employeeResult.rows.map(row => ({
      employee_id: row.employee_id,
      full_name: row.full_name || 'Không xác định',
      customer_count: parseInt(row.customer_count) || 0,
      successful_deals: parseInt(row.successful_deals) || 0,
      total_revenue: parseFloat(row.total_revenue) || 0
    }))

    // 4. Trạng thái Deal — theo tenant
    const dealStagesQuery = `
      SELECT 
        COALESCE(stage, 'Không xác định') as stage,
        COUNT(*) as count
      FROM deals
      WHERE tenant_id = $1
      GROUP BY stage
      ORDER BY count DESC
    `
    const dealStagesResult = await pool.query(dealStagesQuery, [tenantId])

    const dealStages = dealStagesResult.rows.map(row => ({
      stage: row.stage || 'Không xác định',
      count: parseInt(row.count) || 0
    }))

    res.json({
      success: true,
      data: {
        overview: {
          totalRevenue,
          totalCustomers,
          pendingTasks,
          totalInteractions
        },
        customerDistribution,
        employeePerformance,
        dealStages
      }
    })
  } catch (error) {
    console.error('Lỗi getDashboardStats:', error)
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi lấy thống kê Dashboard.',
      error: error.message
    })
  }
}

