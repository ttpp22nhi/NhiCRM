import pool from '../database.js'
import { getTenantId } from '../utils/tenantHelper.js'
import * as analytics from '../services/analyticsService.js'
import * as reports from '../services/reportService.js'
import { getAccessScope } from '../services/permissionService.js'
import {
  buildDashboardKpiCacheKey,
  buildDateRangeCacheKey,
  buildScopeCacheKey,
  getOrSetJson
} from '../services/cacheService.js'

function forbid(res, message) {
  return res.status(403).json({ success: false, message: message || 'Bạn không có quyền thực hiện thao tác này.' })
}

function hasRole(role, allowed) {
  if (!role) return false
  return allowed.includes(String(role))
}

function getScopeLabel(scopeOptions, queryScopePath, canUseScopePath, role) {
  if (queryScopePath && canUseScopePath) return 'filter' // frontend hiển thị tên đơn vị đã chọn
  if (!scopeOptions || !scopeOptions.employeeIds) return 'company'
  if (scopeOptions.employeeIds.length === 1) return 'personal'
  return 'team'
}

async function resolveDashboardScopeOptions(tenantId, userId, role, scopePath) {
  const canUseScopePath = role === 'admin' || role === 'super_admin'
  const queryScopePath = scopePath && String(scopePath).trim() ? String(scopePath).trim() : null

  if (queryScopePath && canUseScopePath) {
    return { scopeOptions: { scopePath: queryScopePath }, canUseScopePath, queryScopePath }
  }

  // Business rule: Admin/Super Admin luôn có quyền xem toàn tenant trên Dashboard.
  // Không phụ thuộc role_permissions để tránh bị thu hẹp scope ngoài ý muốn.
  if (role === 'admin' || role === 'super_admin') {
    return { scopeOptions: null, canUseScopePath, queryScopePath }
  }

  const access = await getAccessScope(userId, 'deals', 'read', tenantId)
  if (access.scope === 'global') {
    return { scopeOptions: null, canUseScopePath, queryScopePath }
  }

  return {
    scopeOptions: { employeeIds: access.employeeIds || [userId] },
    canUseScopePath,
    queryScopePath
  }
}

function parseDateRange(fromDate, toDate) {
  const now = new Date()
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime()
  const defaultTo = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime()

  const fromTs = fromDate && String(fromDate).trim()
    ? new Date(`${String(fromDate).trim()}T00:00:00`).getTime()
    : defaultFrom
  const toTs = toDate && String(toDate).trim()
    ? new Date(`${String(toDate).trim()}T23:59:59.999`).getTime()
    : defaultTo

  return {
    fromTs: Number.isNaN(fromTs) ? defaultFrom : fromTs,
    toTs: Number.isNaN(toTs) ? defaultTo : toTs
  }
}

async function buildReportContext(req, scopeOptions, canUseScopePath, queryScopePath, role, reportName) {
  const tenantId = getTenantId(req)
  const userId = req.user?.id
  const meta = await reports.getTenantExportMeta(tenantId, userId)
  const fromDate = req.query?.from_date ? String(req.query.from_date) : null
  const toDate = req.query?.to_date ? String(req.query.to_date) : null
  return {
    reportName,
    tenantName: meta.tenantName,
    exportedBy: meta.exportedBy,
    generatedAt: Date.now(),
    scopeLabel: getScopeLabel(scopeOptions, queryScopePath, canUseScopePath, role),
    dateRangeLabel: `${fromDate || '...'} -> ${toDate || '...'}`
  }
}

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
      WHERE tenant_id = $1 AND (COALESCE(is_deleted, false) = false)
        AND LOWER(COALESCE(stage, '')) IN ('thành công', 'closed_won', 'đã đóng', 'hoàn thành', 'thanh_cong')
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
        COUNT(DISTINCT CASE WHEN LOWER(COALESCE(d.stage, '')) IN ('thành công', 'thanh_cong', 'closed_won', 'đã đóng', 'hoàn thành') THEN d.deal_id END) as successful_deals,
        COALESCE(SUM(CASE WHEN LOWER(COALESCE(d.stage, '')) IN ('thành công', 'thanh_cong', 'closed_won', 'đã đóng', 'hoàn thành') THEN d.amount ELSE 0 END), 0) as total_revenue
      FROM employees e
      LEFT JOIN customers c ON e.employee_id = c.assigned_to AND c.deleted_at IS NULL AND c.tenant_id = e.tenant_id
      LEFT JOIN deals d ON d.customer_id = c.customer_id AND d.tenant_id = e.tenant_id AND (COALESCE(d.is_deleted, false) = false)
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
      WHERE tenant_id = $1 AND (COALESCE(is_deleted, false) = false)
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

/**
 * GET /api/dashboard/analytics
 * Tổng hợp chỉ số Dashboard theo phân quyền:
 * - Sales: chỉ data của bản thân (personal).
 * - Manager/Leader/Director: data theo scope (current_node / sub_tree). Có thể chọn thêm đơn vị nếu admin.
 * - Admin/Super_admin: toàn tenant; có thể lọc theo scopePath (đơn vị).
 * Query: period, scopePath (chỉ admin/super_admin), month, year.
 * Cache: phần KPI (kpiProgress) cache riêng theo tenant + khoảng ngày — không gắn scopePath để khớp logic tổng Sales toàn tenant.
 */
export const getDashboardAnalytics = async (req, res) => {
  const tenantId = getTenantId(req)
  const userId = req.user?.id
  const role = req.user?.role
  const { scopePath, from_date: fromDate, to_date: toDate, deal_category: dealCategoryFilter } = req.query
  const businessType = dealCategoryFilter === 'PROJECT' ? 'PROJECT' : dealCategoryFilter === 'MASS' ? 'MASS' : null
  const dateRange = parseDateRange(fromDate, toDate)

  const { scopeOptions, canUseScopePath, queryScopePath } = await resolveDashboardScopeOptions(tenantId, userId, role, scopePath)

  try {
    const kpiCacheKey = buildDashboardKpiCacheKey(tenantId, dateRange)
    const analyticsCacheKey = [
      'dashboard:analytics',
      `tenant=${tenantId}`,
      buildScopeCacheKey(scopeOptions),
      buildDateRangeCacheKey(dateRange),
      `dealCategory=${businessType || 'all'}`
    ].join('|')

    const [kpiRes, bundleRes] = await Promise.all([
      getOrSetJson(kpiCacheKey, 60, async () =>
        analytics.getKpiProgress(tenantId, null, dateRange).catch(() => ({
          targetValue: 0,
          actualRevenue: 0,
          progressPercent: 0
        }))
      ),
      getOrSetJson(analyticsCacheKey, 60, async () => {
        const baseCalls = [
          analytics.getRevenueStats(tenantId, scopeOptions, dateRange),
          analytics.getWinRate(tenantId, scopeOptions, dateRange),
          analytics.getFunnelData(tenantId, scopeOptions, dateRange),
          analytics.getMonthlyTrend(tenantId, scopeOptions, dateRange),
          analytics.getTopSales(tenantId, scopeOptions, 5, dateRange),
          analytics.getActiveDealsCount(tenantId, scopeOptions, dateRange),
          analytics.getDealsNeedingAttention(tenantId, scopeOptions, 10, dateRange),
          analytics.getPipelineHealthByConfidence(tenantId, scopeOptions, dateRange)
        ]
        const massProjectCalls = [
          analytics.getMassDealCountTrend(tenantId, scopeOptions, dateRange),
          analytics.getMassGrowthRate(tenantId, scopeOptions, dateRange),
          analytics.getProjectWeightValue(tenantId, scopeOptions, dateRange),
          analytics.getTopOpportunities(tenantId, scopeOptions, 10, dateRange)
        ]
        const [
          revenueStats,
          winRateData,
          funnelData,
          monthlyTrend,
          topSales,
          activeDealsCount,
          dealsNeedingAttention,
          pipelineHealth,
          massDealCountTrend,
          massGrowthRate,
          projectWeightValue,
          topOpportunities
        ] = await Promise.all([...baseCalls, ...massProjectCalls])

        return {
          revenue: revenueStats,
          winRate: winRateData,
          funnel: funnelData,
          monthlyTrend,
          topSales,
          activeDealsCount,
          staleDeals: dealsNeedingAttention,
          pipelineHealth,
          scopeLabel: getScopeLabel(scopeOptions, queryScopePath, canUseScopePath, role),
          dateRange,
          massStats: { dealCountTrend: massDealCountTrend, growthRate: massGrowthRate },
          projectStats: { totalWeightValue: projectWeightValue, topOpportunities }
        }
      })
    ])

    res.json({ success: true, data: { ...bundleRes.value, kpiProgress: kpiRes.value } })
  } catch (error) {
    console.error('Lỗi getDashboardAnalytics:', error)
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi lấy thống kê Dashboard.',
      error: error.message
    })
  }
}

export const getEmployeeKpiReport = async (req, res) => {
  const tenantId = getTenantId(req)
  const userId = req.user?.id
  const role = req.user?.role
  const { scopePath, from_date: fromDate, to_date: toDate, deal_category: dealCategoryFilter } = req.query
  const businessType = dealCategoryFilter === 'PROJECT' ? 'PROJECT' : dealCategoryFilter === 'MASS' ? 'MASS' : null
  const dateRange = parseDateRange(fromDate, toDate)

  try {
    const { scopeOptions, canUseScopePath, queryScopePath } = await resolveDashboardScopeOptions(tenantId, userId, role, scopePath)
    const rows = await analytics.getEmployeeKpiReport(tenantId, scopeOptions, businessType, dateRange)

    res.json({
      success: true,
      data: {
        generatedAt: Date.now(),
        scopeLabel: getScopeLabel(scopeOptions, queryScopePath, canUseScopePath, role),
        dealCategory: businessType,
        dateRange,
        employees: rows,
        revenueComparison: rows
          .map((row) => ({
            employee_id: row.employee_id,
            full_name: row.full_name,
            revenue_won: row.revenue_won
          }))
          .sort((a, b) => b.revenue_won - a.revenue_won)
      }
    })
  } catch (error) {
    console.error('Lỗi getEmployeeKpiReport:', error)
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi xuất báo cáo KPI nhân viên.',
      error: error.message
    })
  }
}

export const getSalesForecastReport = async (req, res) => {
  const tenantId = getTenantId(req)
  const userId = req.user?.id
  const role = req.user?.role
  if (!hasRole(role, ['admin', 'super_admin', 'director', 'manager', 'leader'])) {
    return forbid(res, 'Bạn không có quyền xuất báo cáo Forecast.')
  }
  const { scopePath, from_date: fromDate, to_date: toDate, deal_category: dealCategoryFilter } = req.query
  const businessType = dealCategoryFilter === 'PROJECT' ? 'PROJECT' : dealCategoryFilter === 'MASS' ? 'MASS' : null
  const dateRange = parseDateRange(fromDate, toDate)

  try {
    const { scopeOptions, canUseScopePath, queryScopePath } = await resolveDashboardScopeOptions(tenantId, userId, role, scopePath)
    const report = await reports.getSalesForecastReport(tenantId, scopeOptions, dateRange, businessType)
    const context = await buildReportContext(req, scopeOptions, canUseScopePath, queryScopePath, role, 'Báo cáo Doanh thu & Dự báo')

    res.json({ success: true, data: { ...context, dealCategory: businessType, dateRange, ...report } })
  } catch (error) {
    console.error('Lỗi getSalesForecastReport:', error)
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi xuất báo cáo forecast.',
      error: error.message
    })
  }
}

export const getEmployeePerformanceReport = async (req, res) => {
  const tenantId = getTenantId(req)
  const userId = req.user?.id
  const role = req.user?.role
  // Sales được phép xuất KPI cá nhân (scope sẽ tự giới hạn theo quyền).
  const { scopePath, from_date: fromDate, to_date: toDate, deal_category: dealCategoryFilter } = req.query
  const businessType = dealCategoryFilter === 'PROJECT' ? 'PROJECT' : dealCategoryFilter === 'MASS' ? 'MASS' : null
  const dateRange = parseDateRange(fromDate, toDate)

  try {
    const { scopeOptions, canUseScopePath, queryScopePath } = await resolveDashboardScopeOptions(tenantId, userId, role, scopePath)
    const report = await reports.getEmployeePerformanceReport(tenantId, scopeOptions, dateRange, businessType)
    const context = await buildReportContext(req, scopeOptions, canUseScopePath, queryScopePath, role, 'Báo cáo Hiệu suất Nhân viên')

    res.json({ success: true, data: { ...context, dealCategory: businessType, dateRange, ...report } })
  } catch (error) {
    console.error('Lỗi getEmployeePerformanceReport:', error)
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi xuất báo cáo hiệu suất nhân viên.',
      error: error.message
    })
  }
}

export const getLossAnalysisReport = async (req, res) => {
  const tenantId = getTenantId(req)
  const userId = req.user?.id
  const role = req.user?.role
  if (!hasRole(role, ['admin', 'super_admin', 'director', 'manager', 'leader'])) {
    return forbid(res, 'Bạn không có quyền xuất báo cáo Loss Analysis.')
  }
  const { scopePath, from_date: fromDate, to_date: toDate, deal_category: dealCategoryFilter } = req.query
  const businessType = dealCategoryFilter === 'PROJECT' ? 'PROJECT' : dealCategoryFilter === 'MASS' ? 'MASS' : null
  const dateRange = parseDateRange(fromDate, toDate)

  try {
    const { scopeOptions, canUseScopePath, queryScopePath } = await resolveDashboardScopeOptions(tenantId, userId, role, scopePath)
    const report = await reports.getLossAnalysisReport(tenantId, scopeOptions, dateRange, businessType)
    const context = await buildReportContext(req, scopeOptions, canUseScopePath, queryScopePath, role, 'Báo cáo Phân tích Thất bại')

    res.json({ success: true, data: { ...context, dealCategory: businessType, dateRange, ...report } })
  } catch (error) {
    console.error('Lỗi getLossAnalysisReport:', error)
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi xuất báo cáo phân tích thất bại.',
      error: error.message
    })
  }
}

export const getTaskActivityLogReport = async (req, res) => {
  const tenantId = getTenantId(req)
  const userId = req.user?.id
  const role = req.user?.role
  // Sales được phép xuất nhật ký công việc (scope sẽ tự giới hạn theo quyền).
  const { scopePath, from_date: fromDate, to_date: toDate } = req.query
  const dateRange = parseDateRange(fromDate, toDate)

  try {
    const { scopeOptions, canUseScopePath, queryScopePath } = await resolveDashboardScopeOptions(tenantId, userId, role, scopePath)
    const report = await reports.getTaskActivityLogReport(tenantId, scopeOptions, dateRange)
    const context = await buildReportContext(req, scopeOptions, canUseScopePath, queryScopePath, role, 'Nhật ký Công việc & Tiến độ')

    res.json({ success: true, data: { ...context, dateRange, ...report } })
  } catch (error) {
    console.error('Lỗi getTaskActivityLogReport:', error)
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi xuất nhật ký công việc.',
      error: error.message
    })
  }
}

export const getDashboardEmployeeBreakdown = async (req, res) => {
  const tenantId = getTenantId(req)
  const userId = req.user?.id
  const role = req.user?.role
  const { scopePath, from_date: fromDate, to_date: toDate, deal_category: dealCategoryFilter, department_id: departmentId } = req.query
  const businessType = dealCategoryFilter === 'PROJECT' ? 'PROJECT' : dealCategoryFilter === 'MASS' ? 'MASS' : null
  const dateRange = parseDateRange(fromDate, toDate)

  try {
    const { scopeOptions } = await resolveDashboardScopeOptions(tenantId, userId, role, scopePath)
    const cacheKey = [
      'dashboard:breakdown:employees',
      `tenant=${tenantId}`,
      buildScopeCacheKey(scopeOptions),
      buildDateRangeCacheKey(dateRange),
      `dealCategory=${businessType || 'all'}`,
      `departmentId=${departmentId ? String(departmentId) : 'all'}`
    ].join('|')

    const { value } = await getOrSetJson(cacheKey, 60, async () => {
      return await analytics.getEmployeeBreakdown(tenantId, scopeOptions, businessType, dateRange, {
        departmentId: departmentId ? String(departmentId) : null
      })
    })
    res.json({ success: true, data: value })
  } catch (error) {
    console.error('Lỗi getDashboardEmployeeBreakdown:', error)
    res.status(500).json({ success: false, message: 'Lỗi hệ thống khi lấy breakdown nhân viên.', error: error.message })
  }
}

export const getDashboardDepartmentBreakdown = async (req, res) => {
  const tenantId = getTenantId(req)
  const userId = req.user?.id
  const role = req.user?.role
  const { scopePath, from_date: fromDate, to_date: toDate, deal_category: dealCategoryFilter } = req.query
  const businessType = dealCategoryFilter === 'PROJECT' ? 'PROJECT' : dealCategoryFilter === 'MASS' ? 'MASS' : null
  const dateRange = parseDateRange(fromDate, toDate)

  try {
    const { scopeOptions } = await resolveDashboardScopeOptions(tenantId, userId, role, scopePath)
    const cacheKey = [
      'dashboard:breakdown:departments',
      `tenant=${tenantId}`,
      buildScopeCacheKey(scopeOptions),
      buildDateRangeCacheKey(dateRange),
      `dealCategory=${businessType || 'all'}`
    ].join('|')

    const { value } = await getOrSetJson(cacheKey, 60, async () => {
      return await analytics.getDepartmentBreakdown(tenantId, scopeOptions, businessType, dateRange)
    })
    res.json({ success: true, data: value })
  } catch (error) {
    console.error('Lỗi getDashboardDepartmentBreakdown:', error)
    res.status(500).json({ success: false, message: 'Lỗi hệ thống khi lấy breakdown đơn vị.', error: error.message })
  }
}

export const getDashboardEmployeeDetail = async (req, res) => {
  const tenantId = getTenantId(req)
  const userId = req.user?.id
  const role = req.user?.role
  const { scopePath, from_date: fromDate, to_date: toDate, deal_category: dealCategoryFilter, employee_id: employeeId } = req.query
  const businessType = dealCategoryFilter === 'PROJECT' ? 'PROJECT' : dealCategoryFilter === 'MASS' ? 'MASS' : null
  const dateRange = parseDateRange(fromDate, toDate)

  try {
    if (!employeeId) {
      return res.status(400).json({ success: false, message: 'employee_id là bắt buộc.' })
    }
    const { scopeOptions } = await resolveDashboardScopeOptions(tenantId, userId, role, scopePath)
    const allowedEmployeeIds = scopeOptions?.employeeIds || null
    if (allowedEmployeeIds && !allowedEmployeeIds.includes(String(employeeId))) {
      return forbid(res, 'Bạn không có quyền xem chi tiết nhân viên này.')
    }

    const cacheKey = [
      'dashboard:employee-detail',
      `tenant=${tenantId}`,
      buildScopeCacheKey(scopeOptions),
      buildDateRangeCacheKey(dateRange),
      `dealCategory=${businessType || 'all'}`,
      `employeeId=${String(employeeId)}`
    ].join('|')

    const { value: detail } = await getOrSetJson(cacheKey, 60, async () => {
      return await analytics.getEmployeeDetail(tenantId, String(employeeId), dateRange, businessType)
    })
    if (!detail) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy nhân viên.' })
    }
    res.json({ success: true, data: detail })
  } catch (error) {
    console.error('Lỗi getDashboardEmployeeDetail:', error)
    res.status(500).json({ success: false, message: 'Lỗi hệ thống khi lấy chi tiết nhân viên.', error: error.message })
  }
}
