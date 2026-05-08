/**
 * AnalyticsService: Tổng hợp chỉ số cho Dashboard
 * - scopeOptions: { scopePath?: string, employeeIds?: string[] }
 *   - employeeIds có sẵn (từ phân quyền): dùng trực tiếp
 *   - scopePath (đơn vị): resolve qua getEmployeeIdsByScopePath
 *   - cả hai đều không: toàn tenant
 */
import pool from '../database.js'

const STAGES_ORDER = ['tiep_can', 'tu_van', 'bao_gia', 'thuong_thao', 'thanh_cong']
const STAGE_LABELS = {
  tiep_can: 'Tiếp cận',
  tu_van: 'Tư vấn',
  bao_gia: 'Báo giá',
  thuong_thao: 'Thương thảo',
  thanh_cong: 'Thành công'
}

function normalizeDateRange(dateRange) {
  if (!dateRange) return { fromTs: null, toTs: null }
  const fromTs = Number(dateRange.fromTs)
  const toTs = Number(dateRange.toTs)
  return {
    fromTs: Number.isFinite(fromTs) ? fromTs : null,
    toTs: Number.isFinite(toTs) ? toTs : null
  }
}

function addDateRangeClause(clause, params, column, dateRange) {
  const { fromTs, toTs } = normalizeDateRange(dateRange)
  let nextClause = clause
  const nextParams = [...params]
  if (fromTs != null) {
    nextClause += ` AND ${column} >= $${nextParams.length + 1}`
    nextParams.push(fromTs)
  }
  if (toTs != null) {
    nextClause += ` AND ${column} <= $${nextParams.length + 1}`
    nextParams.push(toTs)
  }
  return { clause: nextClause, params: nextParams }
}

function getMonthRange(dateRange) {
  const { fromTs, toTs } = normalizeDateRange(dateRange)
  if (fromTs == null || toTs == null) return []
  const start = new Date(fromTs)
  const end = new Date(toTs)
  const months = []
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1)
  const last = new Date(end.getFullYear(), end.getMonth(), 1)
  while (cursor <= last) {
    months.push({ month: cursor.getMonth() + 1, year: cursor.getFullYear() })
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return months
}

const VN_TZ_MS = 7 * 60 * 60 * 1000

/** Kỳ KPI YYYY-MM theo ngày kết thúc bộ lọc (Asia/Ho_Chi_Minh), khớp trang /kpi. */
function kpiPeriodFromDateRangeEnd(dateRange) {
  const { toTs } = normalizeDateRange(dateRange)
  const ts = toTs != null && Number.isFinite(toTs) ? toTs : Date.now()
  const d = new Date(ts + VN_TZ_MS)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

/**
 * Resolve scopeOptions thành employeeIds (hoặc null = toàn tenant).
 * @param {string} tenantId
 * @param {{ scopePath?: string, employeeIds?: string[] }|string|null} scopeOptions - object hoặc scopePath (backward compat)
 * @returns {Promise<string[]|null>}
 */
async function resolveScopeToEmployeeIds(tenantId, scopeOptions) {
  if (scopeOptions == null) return null
  if (Array.isArray(scopeOptions)) return scopeOptions.length ? scopeOptions : null
  if (typeof scopeOptions === 'object') {
    if (scopeOptions.employeeIds != null && Array.isArray(scopeOptions.employeeIds))
      return scopeOptions.employeeIds.length ? scopeOptions.employeeIds : null
    if (scopeOptions.scopePath && String(scopeOptions.scopePath).trim())
      return getEmployeeIdsByScopePath(tenantId, scopeOptions.scopePath)
    return null
  }
  if (typeof scopeOptions === 'string' && scopeOptions.trim()) return getEmployeeIdsByScopePath(tenantId, scopeOptions)
  return null
}

/**
 * Lấy danh sách employee_id thuộc scopePath (department_id hoặc path).
 * @param {string} tenantId
 * @param {string} scopePath - department_id hoặc path (vd: "tenantId/deptId").
 * @returns {Promise<string[]|null>} employee_ids hoặc null (null = không lọc assigned_to)
 */
async function getEmployeeIdsByScopePath(tenantId, scopePath) {
  if (!scopePath || String(scopePath).trim() === '') return null
  const idOrPath = String(scopePath).trim()

  const isPath = idOrPath.includes('/')
  let departmentIds = []

  if (isPath) {
    const res = await pool.query(
      `SELECT id FROM departments WHERE tenant_id = $1 AND (path = $2 OR path LIKE $3)`,
      [tenantId, idOrPath, `${idOrPath}/%`]
    )
    departmentIds = (res.rows || []).map((r) => r.id)
  } else {
    const deptRow = await pool.query(
      'SELECT id, path FROM departments WHERE id = $1 AND tenant_id = $2',
      [idOrPath, tenantId]
    )
    const row = (deptRow.rows || [])[0]
    if (!row) return []
    const path = row.path || `${tenantId}/${row.id}`
    const subRes = await pool.query(
      `SELECT id FROM departments WHERE tenant_id = $1 AND (path LIKE $2 OR id = $3)`,
      [tenantId, `${path}/%`, row.id]
    )
    departmentIds = (subRes.rows || []).map((r) => r.id)
  }

  if (departmentIds.length === 0) return []

  const placeholders = departmentIds.map((_, i) => `$${i + 1}`).join(', ')
  const empResult = await pool.query(
    `SELECT employee_id FROM employees WHERE tenant_id = $${departmentIds.length + 1} AND department_id IN (${placeholders}) AND is_active = true`,
    [...departmentIds, tenantId]
  )
  return (empResult.rows || []).map((r) => r.employee_id)
}

function buildDealFilterClause(tenantId, employeeIds, paramStart = 1) {
  const params = [tenantId]
  let idx = paramStart + 1
  const base = `d.tenant_id = $1 AND (COALESCE(d.is_deleted, false) = false)`
  if (employeeIds == null) return { clause: base, params }
  if (employeeIds.length === 0) return { clause: `${base} AND 1=0`, params }
  const placeholders = employeeIds.map(() => `$${idx++}`).join(', ')
  return {
    clause: `${base} AND d.assigned_to IN (${placeholders})`,
    params: [...params, ...employeeIds]
  }
}

/**
 * getRevenueStats(tenantId, scopeOptions): Tổng Deal Won + Tổng Pipeline (Active)
 */
export async function getRevenueStats(tenantId, scopeOptions, dateRange = null) {
  const employeeIds = await resolveScopeToEmployeeIds(tenantId, scopeOptions)
  const { clause, params } = buildDealFilterClause(tenantId, employeeIds)
  const wonFilter = addDateRangeClause(clause, params, 'd.updated_at', dateRange)
  const pipelineFilter = addDateRangeClause(clause, params, 'd.created_at', dateRange)

  const wonQuery = `
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM deals d
    WHERE ${wonFilter.clause} AND (d.status = 'won' OR d.stage = 'thanh_cong')
  `
  const pipelineQuery = `
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM deals d
    WHERE ${pipelineFilter.clause} AND (COALESCE(d.status, 'active') = 'active')
  `

  const [wonRes, pipeRes] = await Promise.all([
    pool.query(wonQuery, wonFilter.params),
    pool.query(pipelineQuery, pipelineFilter.params)
  ])

  const totalRevenue = parseFloat((wonRes.rows && wonRes.rows[0]?.total) || wonRes.rows?.[0]?.total || 0) || 0
  const pipelineValue = parseFloat((pipeRes.rows && pipeRes.rows[0]?.total) || pipeRes.rows?.[0]?.total || 0) || 0

  return { totalRevenue, pipelineValue }
}

/**
 * getWinRate(tenantId, scopeOptions): Tỷ lệ % Deal thành công trên tổng Deal đã kết thúc
 */
export async function getWinRate(tenantId, scopeOptions, dateRange = null) {
  const employeeIds = await resolveScopeToEmployeeIds(tenantId, scopeOptions)
  const { clause, params } = buildDealFilterClause(tenantId, employeeIds)
  const filtered = addDateRangeClause(clause, params, 'd.updated_at', dateRange)

  const query = `
    SELECT
      COUNT(*) FILTER (WHERE d.status = 'won' OR d.stage = 'thanh_cong') AS won,
      COUNT(*) FILTER (WHERE d.status IN ('lost', 'cancelled')) AS lost_cancelled
    FROM deals d
    WHERE ${filtered.clause} AND (d.status IN ('won', 'lost', 'cancelled') OR d.stage = 'thanh_cong')
  `
  const result = await pool.query(query, filtered.params)
  const row = (result.rows || [])[0]
  const won = parseInt(row?.won || 0, 10)
  const lostCancelled = parseInt(row?.lost_cancelled || 0, 10)
  const closed = won + lostCancelled
  const winRate = closed === 0 ? 0 : Math.round((won / closed) * 10000) / 100
  return { winRate, won, closed }
}

/**
 * Tiến độ KPI Dashboard: tổng chỉ tiêu & thực đạt của **toàn bộ Sales đang hoạt động** trong tenant,
 * lấy từ bảng `kpis` (cùng nguồn với trang /kpi). Không lọc theo scopePath/đơn vị.
 * scopeOptions giữ tham số để tương thích gọi API; không dùng trong truy vấn.
 */
export async function getKpiProgress(tenantId, _scopeOptions, dateRange = null) {
  const months = getMonthRange(dateRange)
  if (months.length === 0) {
    return { targetValue: 0, actualRevenue: 0, progressPercent: 0 }
  }
  const periods = months.map((m) => `${m.year}-${String(m.month).padStart(2, '0')}`)

  try {
    const result = await pool.query(
      `SELECT
         COALESCE(SUM(k.target_revenue_new + k.target_revenue_existing), 0) AS target,
         COALESCE(SUM(k.actual_revenue_new + k.actual_revenue_existing), 0) AS actual
       FROM kpis k
       INNER JOIN employees e ON e.employee_id = k.user_id AND e.tenant_id = k.tenant_id
       WHERE k.tenant_id = $1
         AND LOWER(TRIM(COALESCE(e.role, ''))) = 'sales'
         AND e.is_active = TRUE
         AND k.period = ANY($2::text[])`,
      [tenantId, periods]
    )
    const targetValue = parseFloat((result.rows || [])[0]?.target || 0) || 0
    const actualRevenue = parseFloat((result.rows || [])[0]?.actual || 0) || 0
    const progressPercent =
      targetValue === 0
        ? actualRevenue > 0
          ? 100
          : 0
        : Math.min(100, Math.round((actualRevenue / targetValue) * 10000) / 100)
    return { targetValue, actualRevenue, progressPercent }
  } catch (err) {
    if (err.code === '42P01') {
      return { targetValue: 0, actualRevenue: 0, progressPercent: 0 }
    }
    throw err
  }
}

/**
 * KPI tháng (bảng kpis) theo từng Sales trong phạm vi scope Dashboard — để so sánh nhân viên.
 * Kỳ = tháng chứa ngày kết thúc filter (theo giờ VN).
 */
export async function getMonthlyKpiLeaderboard(tenantId, scopeOptions, dateRange = null) {
  const period = kpiPeriodFromDateRangeEnd(dateRange)

  try {
    const employeeIds = await resolveScopeToEmployeeIds(tenantId, scopeOptions)
    if (employeeIds && employeeIds.length === 0) {
      return { period, rows: [] }
    }

    const salesClause =
      "e.tenant_id = $1 AND e.is_active = TRUE AND LOWER(TRIM(COALESCE(e.role, ''))) = 'sales'"

    let query
    let params
    if (employeeIds != null && employeeIds.length > 0) {
      const placeholders = employeeIds.map((_, i) => `$${i + 3}`).join(', ')
      params = [tenantId, period, ...employeeIds]
      query = `
        SELECT
          e.employee_id,
          e.full_name,
          e.username,
          COALESCE(k.target_revenue_new, 0) + COALESCE(k.target_revenue_existing, 0) AS target_revenue_total,
          COALESCE(k.actual_revenue_new, 0) + COALESCE(k.actual_revenue_existing, 0) AS actual_revenue_total,
          COALESCE(k.approach_count, 0)::int AS approach_target,
          COALESCE(k.actual_approach_count, 0)::int AS approach_actual,
          COALESCE(k.target_product_count_new, 0) + COALESCE(k.target_product_count_existing, 0) AS target_product_total,
          COALESCE(k.actual_product_count_new, 0) + COALESCE(k.actual_product_count_existing, 0) AS actual_product_total
        FROM employees e
        LEFT JOIN kpis k
          ON k.tenant_id = e.tenant_id AND k.user_id = e.employee_id AND k.period = $2
        WHERE ${salesClause}
          AND e.employee_id IN (${placeholders})
        ORDER BY (COALESCE(k.actual_revenue_new, 0) + COALESCE(k.actual_revenue_existing, 0)) DESC NULLS LAST,
                 e.full_name ASC NULLS LAST
      `
    } else {
      params = [tenantId, period]
      query = `
        SELECT
          e.employee_id,
          e.full_name,
          e.username,
          COALESCE(k.target_revenue_new, 0) + COALESCE(k.target_revenue_existing, 0) AS target_revenue_total,
          COALESCE(k.actual_revenue_new, 0) + COALESCE(k.actual_revenue_existing, 0) AS actual_revenue_total,
          COALESCE(k.approach_count, 0)::int AS approach_target,
          COALESCE(k.actual_approach_count, 0)::int AS approach_actual,
          COALESCE(k.target_product_count_new, 0) + COALESCE(k.target_product_count_existing, 0) AS target_product_total,
          COALESCE(k.actual_product_count_new, 0) + COALESCE(k.actual_product_count_existing, 0) AS actual_product_total
        FROM employees e
        LEFT JOIN kpis k
          ON k.tenant_id = e.tenant_id AND k.user_id = e.employee_id AND k.period = $2
        WHERE ${salesClause}
        ORDER BY (COALESCE(k.actual_revenue_new, 0) + COALESCE(k.actual_revenue_existing, 0)) DESC NULLS LAST,
                 e.full_name ASC NULLS LAST
      `
    }

    const result = await pool.query(query, params)
    const rows = (result.rows || []).map((r) => {
      const targetRev = parseFloat(r.target_revenue_total) || 0
      const actualRev = parseFloat(r.actual_revenue_total) || 0
      const targetAp = parseInt(r.approach_target, 10) || 0
      const actualAp = parseInt(r.approach_actual, 10) || 0
      const targetPr = parseFloat(r.target_product_total) || 0
      const actualPr = parseFloat(r.actual_product_total) || 0

      const revenueAchievementPct =
        targetRev > 0 ? Math.min(999.99, Math.round((actualRev / targetRev) * 10000) / 100) : null
      const approachAchievementPct =
        targetAp > 0 ? Math.min(999.99, Math.round((actualAp / targetAp) * 10000) / 100) : null
      const productAchievementPct =
        targetPr > 0 ? Math.min(999.99, Math.round((actualPr / targetPr) * 10000) / 100) : null

      return {
        employee_id: r.employee_id,
        full_name: r.full_name || r.username || r.employee_id,
        username: r.username || '',
        target_revenue_total: targetRev,
        actual_revenue_total: actualRev,
        approach_target: targetAp,
        approach_actual: actualAp,
        target_product_total: targetPr,
        actual_product_total: actualPr,
        revenue_achievement_pct: revenueAchievementPct,
        approach_achievement_pct: approachAchievementPct,
        product_achievement_pct: productAchievementPct
      }
    })

    return { period, rows }
  } catch (err) {
    if (err.code === '42P01') {
      return { period, rows: [] }
    }
    throw err
  }
}

/**
 * getFunnelData(tenantId, scopeOptions): Đếm Deal theo từng stage
 */
export async function getFunnelData(tenantId, scopeOptions, dateRange = null) {
  const employeeIds = await resolveScopeToEmployeeIds(tenantId, scopeOptions)
  const { clause, params } = buildDealFilterClause(tenantId, employeeIds)
  const filtered = addDateRangeClause(clause, params, 'd.created_at', dateRange)

  const query = `
    SELECT COALESCE(d.stage, 'unknown') AS stage, COUNT(*)::int AS count
    FROM deals d
    WHERE ${filtered.clause}
    GROUP BY d.stage
  `
  const result = await pool.query(query, filtered.params)
  const map = {}
  for (const row of result.rows || []) {
    map[row.stage] = parseInt(row.count, 10) || 0
  }
  return STAGES_ORDER.map((stage) => ({
    stage,
    label: STAGE_LABELS[stage] || stage,
    count: map[stage] || 0
  }))
}

/**
 * getMonthlyTrend(tenantId, scopeOptions): Doanh thu 12 tháng gần nhất (theo updated_at deal won)
 */
export async function getMonthlyTrend(tenantId, scopeOptions, dateRange = null) {
  const employeeIds = await resolveScopeToEmployeeIds(tenantId, scopeOptions)
  const { clause, params } = buildDealFilterClause(tenantId, employeeIds)
  const normalizedRange = normalizeDateRange(dateRange)

  const query = `
    SELECT
      EXTRACT(YEAR FROM TO_TIMESTAMP(d.updated_at / 1000))::int AS y,
      EXTRACT(MONTH FROM TO_TIMESTAMP(d.updated_at / 1000))::int AS m,
      COALESCE(SUM(d.amount), 0) AS revenue
    FROM deals d
    WHERE ${clause} AND (d.status = 'won' OR d.stage = 'thanh_cong') AND d.updated_at IS NOT NULL
      AND d.updated_at >= $${params.length + 1}
      AND d.updated_at <= $${params.length + 2}
    GROUP BY 1, 2
    ORDER BY 1, 2
  `
  const fromTs = normalizedRange.fromTs ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1, 0, 0, 0, 0).getTime()
  const toTs = normalizedRange.toTs ?? Date.now()
  const trendResult = await pool.query(query, [...params, fromTs, toTs])

  const byKey = {}
  for (const row of trendResult.rows || []) {
    const key = `${row.y}-${String(row.m).padStart(2, '0')}`
    byKey[key] = parseFloat(row.revenue) || 0
  }

  const out = []
  const end = new Date(toTs)
  const start = new Date(fromTs)
  const monthCursor = new Date(start.getFullYear(), start.getMonth(), 1)
  const monthEnd = new Date(end.getFullYear(), end.getMonth(), 1)
  while (monthCursor <= monthEnd) {
    const d = new Date(monthCursor)
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    const key = `${y}-${String(m).padStart(2, '0')}`
    out.push({
      month: m,
      year: y,
      label: `${m}/${y}`,
      revenue: byKey[key] || 0
    })
    monthCursor.setMonth(monthCursor.getMonth() + 1)
  }
  return out
}

/**
 * getTopSales(tenantId, scopeOptions, limit = 5): Top nhân viên doanh số cao nhất
 */
export async function getTopSales(tenantId, scopeOptions, limit = 5, dateRange = null) {
  const employeeIds = await resolveScopeToEmployeeIds(tenantId, scopeOptions)
  if (employeeIds && employeeIds.length === 0) return []
  let params = [tenantId]
  const employeeFilter =
    employeeIds != null && employeeIds.length > 0
      ? `AND e.employee_id IN (${employeeIds.map((_, i) => `$${i + 2}`).join(', ')})`
      : ''
  params.push(...(employeeIds || []))
  const { fromTs, toTs } = normalizeDateRange(dateRange)

  const query = `
    SELECT
      e.employee_id,
      e.full_name,
      e.username,
      COALESCE(SUM(CASE WHEN (d.status = 'won' OR d.stage = 'thanh_cong') THEN d.amount ELSE 0 END), 0) AS total_revenue
    FROM employees e
    INNER JOIN deals d ON d.assigned_to = e.employee_id AND d.tenant_id = e.tenant_id AND (COALESCE(d.is_deleted, false) = false) AND (d.status = 'won' OR d.stage = 'thanh_cong')
    WHERE e.tenant_id = $1 AND e.is_active = true
      ${employeeFilter}
      AND d.updated_at >= $${params.length + 1}
      AND d.updated_at <= $${params.length + 2}
    GROUP BY e.employee_id, e.full_name, e.username
    ORDER BY total_revenue DESC
    LIMIT $${params.length + 3}
  `
  const result = await pool.query(query, [...params, fromTs, toTs, limit])
  return (result.rows || []).map((r) => ({
    employee_id: r.employee_id,
    full_name: r.full_name || r.username || r.employee_id,
    username: r.username,
    avatar_url: null,
    total_revenue: parseFloat(r.total_revenue) || 0
  }))
}

/**
 * getActiveDealsCount(tenantId, scopeOptions): Số Deal đang active
 */
export async function getActiveDealsCount(tenantId, scopeOptions, dateRange = null) {
  const employeeIds = await resolveScopeToEmployeeIds(tenantId, scopeOptions)
  const { clause, params } = buildDealFilterClause(tenantId, employeeIds)
  const filtered = addDateRangeClause(clause, params, 'd.created_at', dateRange)
  const result = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM deals d WHERE ${filtered.clause} AND (COALESCE(d.status, 'active') = 'active')`,
    filtered.params
  )
  return parseInt(result.rows?.[0]?.cnt || 0, 10) || 0
}

const STALE_DAYS_MS = 30 * 24 * 60 * 60 * 1000
const HIGH_VALUE_THRESHOLD = 100000000 // 100tr VND

/**
 * getStaleDeals(tenantId, scopeOptions, limit = 10): Deal active trì trệ (30 ngày không cập nhật).
 * Có thêm confidence_level để hiển thị badge. Sắp xếp: giá trị lớn + low confidence lên đầu, rồi updated_at.
 */
export async function getStaleDeals(tenantId, scopeOptions, limit = 10) {
  const employeeIds = await resolveScopeToEmployeeIds(tenantId, scopeOptions)
  const { clause, params } = buildDealFilterClause(tenantId, employeeIds)
  const staleTs = Date.now() - STALE_DAYS_MS
  const allParams = [...params, staleTs, limit]

  const result = await pool.query(
    `SELECT d.deal_id, d.title, d.amount, d.stage, d.display_code, d.updated_at, d.assigned_to,
       COALESCE(d.confidence_level, 'medium') AS confidence_level
     FROM deals d
     WHERE ${clause} AND (COALESCE(d.status, 'active') = 'active')
       AND (d.updated_at IS NULL OR d.updated_at < $${params.length + 1})
     ORDER BY (CASE WHEN (d.amount >= ${HIGH_VALUE_THRESHOLD} AND COALESCE(d.confidence_level, 'medium') = 'low') THEN 0 ELSE 1 END),
              d.amount DESC NULLS LAST,
              d.updated_at ASC NULLS FIRST
     LIMIT $${params.length + 2}`,
    allParams
  )

  return (result.rows || []).map((r) => ({
    deal_id: r.deal_id,
    title: r.title,
    amount: parseFloat(r.amount) || 0,
    stage: r.stage,
    display_code: r.display_code,
    updated_at: r.updated_at,
    confidence_level: r.confidence_level || 'medium'
  }))
}

/**
 * getDealsNeedingAttention(tenantId, scopeOptions, limit = 10): Cần chú ý = (1) Dự án >100tr + low confidence lên đầu, (2) Deal trì trệ.
 */
export async function getDealsNeedingAttention(tenantId, scopeOptions, limit = 10, dateRange = null) {
  const employeeIds = await resolveScopeToEmployeeIds(tenantId, scopeOptions)
  const { clause, params } = buildDealFilterClause(tenantId, employeeIds)
  const filtered = addDateRangeClause(clause, params, 'd.created_at', dateRange)
  const staleTs = Date.now() - STALE_DAYS_MS
  const allParams = [...filtered.params, staleTs, limit]

  const result = await pool.query(
    `WITH need_attention AS (
       SELECT d.deal_id, d.title, d.amount, d.stage, d.display_code, d.updated_at, d.assigned_to,
              COALESCE(d.confidence_level, 'medium') AS confidence_level,
              (d.amount >= ${HIGH_VALUE_THRESHOLD} AND COALESCE(d.confidence_level, 'medium') = 'low') AS is_high_risk
       FROM deals d
       WHERE ${filtered.clause} AND (COALESCE(d.status, 'active') = 'active')
         AND (
           (d.amount >= ${HIGH_VALUE_THRESHOLD} AND COALESCE(d.confidence_level, 'medium') = 'low')
           OR (d.updated_at IS NULL OR d.updated_at < $${filtered.params.length + 1})
         )
     )
     SELECT * FROM need_attention
     ORDER BY is_high_risk DESC, amount DESC NULLS LAST, updated_at ASC NULLS FIRST
     LIMIT $${filtered.params.length + 2}`,
    allParams
  )

  return (result.rows || []).map((r) => ({
    deal_id: r.deal_id,
    title: r.title,
    amount: parseFloat(r.amount) || 0,
    stage: r.stage,
    display_code: r.display_code,
    updated_at: r.updated_at,
    confidence_level: r.confidence_level || 'medium'
  }))
}

/**
 * getPipelineHealthByConfidence(tenantId, scopeOptions): Phân tích sức khỏe Pipeline theo mức độ tự tin (biểu đồ tròn).
 */
export async function getPipelineHealthByConfidence(tenantId, scopeOptions, dateRange = null) {
  const employeeIds = await resolveScopeToEmployeeIds(tenantId, scopeOptions)
  const { clause, params } = buildDealFilterClause(tenantId, employeeIds)
  const filtered = addDateRangeClause(clause, params, 'd.created_at', dateRange)

  const result = await pool.query(
    `SELECT COALESCE(d.confidence_level, 'medium') AS level, COUNT(*)::int AS cnt
     FROM deals d
     WHERE ${filtered.clause} AND (COALESCE(d.status, 'active') = 'active')
     GROUP BY COALESCE(d.confidence_level, 'medium')`,
    filtered.params
  )

  const labels = { high: 'Chắc chắn (Xanh)', medium: '50/50 (Vàng)', low: 'Rủi ro cao (Đỏ)' }
  const colors = { high: '#22c55e', medium: '#eab308', low: '#ef4444' }
  const order = ['high', 'medium', 'low']
  const byLevel = {}
  for (const row of result.rows || []) {
    byLevel[row.level] = parseInt(row.cnt, 10) || 0
  }
  return order.map((level) => ({
    level,
    label: labels[level] || level,
    count: byLevel[level] || 0,
    color: colors[level] || '#94a3b8'
  }))
}

const DEAL_CATEGORY_DEFAULT = 'MASS'

function addCategoryClause(clause, params, dealCategory, paramIndex) {
  const cat = dealCategory === 'PROJECT' ? 'PROJECT' : 'MASS'
  return {
    clause: `${clause} AND COALESCE(d.deal_category, '${DEAL_CATEGORY_DEFAULT}') = $${paramIndex}`,
    params: [...params, cat]
  }
}

/**
 * MASS: Số lượng deal theo tháng (12 tháng gần nhất)
 */
export async function getMassDealCountTrend(tenantId, scopeOptions, dateRange = null) {
  const employeeIds = await resolveScopeToEmployeeIds(tenantId, scopeOptions)
  const { clause, params } = buildDealFilterClause(tenantId, employeeIds)
  const { clause: fullClause, params: fullParams } = addCategoryClause(clause, params, 'MASS', params.length + 1)
  const { fromTs, toTs } = normalizeDateRange(dateRange)

  const result = await pool.query(
    `SELECT
       EXTRACT(YEAR FROM TO_TIMESTAMP(d.created_at / 1000))::int AS y,
       EXTRACT(MONTH FROM TO_TIMESTAMP(d.created_at / 1000))::int AS m,
       COUNT(*)::int AS cnt
     FROM deals d
     WHERE ${fullClause} AND d.created_at >= $${fullParams.length + 1} AND d.created_at <= $${fullParams.length + 2}
     GROUP BY 1, 2
     ORDER BY 1, 2`,
    [...fullParams, fromTs, toTs]
  )

  const byKey = {}
  for (const row of result.rows || []) {
    const key = `${row.y}-${String(row.m).padStart(2, '0')}`
    byKey[key] = parseInt(row.cnt, 10) || 0
  }
  const out = []
  const monthCursor = new Date(new Date(fromTs).getFullYear(), new Date(fromTs).getMonth(), 1)
  const monthEnd = new Date(new Date(toTs).getFullYear(), new Date(toTs).getMonth(), 1)
  while (monthCursor <= monthEnd) {
    const d = new Date(monthCursor)
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    const key = `${y}-${String(m).padStart(2, '0')}`
    out.push({ month: m, year: y, label: `${m}/${y}`, count: byKey[key] || 0 })
    monthCursor.setMonth(monthCursor.getMonth() + 1)
  }
  return out
}

/**
 * MASS: Tốc độ tăng trưởng (% so với tháng trước)
 */
export async function getMassGrowthRate(tenantId, scopeOptions, dateRange = null) {
  const employeeIds = await resolveScopeToEmployeeIds(tenantId, scopeOptions)
  const { clause, params } = buildDealFilterClause(tenantId, employeeIds)
  const { clause: fullClause, params: fullParams } = addCategoryClause(clause, params, 'MASS', params.length + 1)
  const { fromTs, toTs } = normalizeDateRange(dateRange)
  const span = Math.max(toTs - fromTs, 24 * 60 * 60 * 1000)
  const prevFrom = fromTs - span
  const prevTo = fromTs - 1

  const result = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE d.created_at >= $${fullParams.length + 1} AND d.created_at <= $${fullParams.length + 2})::int AS this_count,
       COUNT(*) FILTER (WHERE d.created_at >= $${fullParams.length + 3} AND d.created_at <= $${fullParams.length + 4})::int AS prev_count
     FROM deals d
     WHERE ${fullClause}`,
    [...fullParams, fromTs, toTs, prevFrom, prevTo]
  )
  const row = (result.rows || [])[0]
  const thisCount = parseInt(row?.this_count || 0, 10)
  const prevCount = parseInt(row?.prev_count || 0, 10)
  const growthRate = prevCount === 0 ? (thisCount > 0 ? 100 : 0) : Math.round(((thisCount - prevCount) / prevCount) * 10000) / 100
  return { thisMonthCount: thisCount, lastMonthCount: prevCount, growthRate }
}

/**
 * PROJECT: Tổng WeightedValue = SUM(amount × Stage% × ConfidenceFactor) cho deal PROJECT (won + active)
 * Stage%: tiep_can 10%, tu_van/khao_sat 20%, bao_gia 40%, thuong_thao 90%, thanh_cong 100%. Confidence: high 1.0, medium 0.5, low 0.2 (manifest).
 */
export async function getProjectWeightValue(tenantId, scopeOptions, dateRange = null) {
  const employeeIds = await resolveScopeToEmployeeIds(tenantId, scopeOptions)
  const { clause, params } = buildDealFilterClause(tenantId, employeeIds)
  const { clause: fullClause, params: fullParams } = addCategoryClause(clause, params, 'PROJECT', params.length + 1)
  const filtered = addDateRangeClause(fullClause, fullParams, 'd.created_at', dateRange)

  const result = await pool.query(
    `SELECT COALESCE(SUM(
       d.amount * (CASE d.stage
         WHEN 'tiep_can' THEN 0.1 WHEN 'tu_van' THEN 0.2 WHEN 'khao_sat' THEN 0.2
         WHEN 'bao_gia' THEN 0.4 WHEN 'thuong_thao' THEN 0.9 WHEN 'thanh_cong' THEN 1.0 ELSE 0.1 END)
       * (CASE COALESCE(d.confidence_level, 'medium') WHEN 'high' THEN 1.0 WHEN 'medium' THEN 0.5 WHEN 'low' THEN 0.2 ELSE 0.5 END)
     ), 0) AS total
     FROM deals d
     WHERE ${filtered.clause} AND (d.status = 'won' OR d.stage = 'thanh_cong' OR COALESCE(d.status, 'active') = 'active')`,
    filtered.params
  )
  return parseFloat((result.rows || [])[0]?.total || 0) || 0
}

/**
 * PROJECT: Top cơ hội (deal PROJECT) theo giá trị amount
 */
export async function getTopOpportunities(tenantId, scopeOptions, limit = 10, dateRange = null) {
  const employeeIds = await resolveScopeToEmployeeIds(tenantId, scopeOptions)
  const { clause, params } = buildDealFilterClause(tenantId, employeeIds)
  const { clause: fullClause, params: fullParams } = addCategoryClause(clause, params, 'PROJECT', params.length + 1)
  const filtered = addDateRangeClause(fullClause, fullParams, 'd.created_at', dateRange)
  const allParams = [...filtered.params, limit]

  const result = await pool.query(
    `SELECT d.deal_id, d.title, d.amount, d.stage, d.display_code, d.status
     FROM deals d
     WHERE ${filtered.clause} AND (COALESCE(d.status, 'active') = 'active' OR d.status = 'won' OR d.stage = 'thanh_cong')
     ORDER BY d.amount DESC NULLS LAST
     LIMIT $${allParams.length}`,
    allParams
  )
  return (result.rows || []).map((r) => ({
    deal_id: r.deal_id,
    title: r.title,
    amount: parseFloat(r.amount) || 0,
    stage: r.stage,
    display_code: r.display_code,
    status: r.status
  }))
}

/**
 * KPI nhân viên để xuất báo cáo Excel.
 * - Phạm vi theo scopeOptions của dashboard
 * - dealCategory: null | MASS | PROJECT
 */
export async function getEmployeeKpiReport(tenantId, scopeOptions, dealCategory = null, dateRange = null) {
  const employeeIds = await resolveScopeToEmployeeIds(tenantId, scopeOptions)
  if (employeeIds && employeeIds.length === 0) return []

  const employeeParams = [tenantId]
  const employeeFilter =
    employeeIds != null && employeeIds.length > 0
      ? ` AND e.employee_id IN (${employeeIds.map((_, i) => `$${i + 2}`).join(', ')})`
      : ''
  employeeParams.push(...(employeeIds || []))

  const dealFilterParts = ['d.tenant_id = $1', '(COALESCE(d.is_deleted, false) = false)']
  const dealParams = [tenantId]
  if (employeeIds != null && employeeIds.length > 0) {
    dealFilterParts.push(`d.assigned_to IN (${employeeIds.map((_, i) => `$${i + 2}`).join(', ')})`)
    dealParams.push(...employeeIds)
  }
  if (dealCategory === 'MASS' || dealCategory === 'PROJECT') {
    dealFilterParts.push(`COALESCE(d.deal_category, '${DEAL_CATEGORY_DEFAULT}') = $${dealParams.length + 1}`)
    dealParams.push(dealCategory)
  }
  let dealFilter = dealFilterParts.join(' AND ')
  let reportDealParams = [...dealParams]
  const dealRange = addDateRangeClause(dealFilter, reportDealParams, 'd.created_at', dateRange)
  dealFilter = dealRange.clause
  reportDealParams = dealRange.params

  const taskFilterParts = ['t.tenant_id = $1']
  const taskParams = [tenantId]
  if (employeeIds != null && employeeIds.length > 0) {
    taskFilterParts.push(`t.assigned_to IN (${employeeIds.map((_, i) => `$${i + 2}`).join(', ')})`)
    taskParams.push(...employeeIds)
  }
  const taskRange = addDateRangeClause(taskFilterParts.join(' AND '), taskParams, 't.created_at', dateRange)
  const taskFilter = taskRange.clause

  const [employeesRes, dealsRes, tasksRes] = await Promise.all([
    pool.query(
      `SELECT e.employee_id, e.full_name, e.username, e.role, d.name AS department_name
       FROM employees e
       LEFT JOIN departments d ON e.department_id = d.id AND d.tenant_id = e.tenant_id
       WHERE e.tenant_id = $1 AND e.is_active = true${employeeFilter}
       ORDER BY e.full_name ASC`,
      employeeParams
    ),
    pool.query(
      `SELECT
         d.assigned_to AS employee_id,
         COUNT(*)::int AS total_deals,
         COUNT(*) FILTER (WHERE COALESCE(d.status, 'active') = 'active')::int AS active_deals,
         COUNT(*) FILTER (WHERE d.status = 'won' OR d.stage = 'thanh_cong')::int AS won_deals,
         COUNT(*) FILTER (WHERE d.status IN ('lost', 'cancelled'))::int AS lost_deals,
         COALESCE(SUM(CASE WHEN COALESCE(d.status, 'active') = 'active' THEN d.amount ELSE 0 END), 0) AS pipeline_value,
         COALESCE(SUM(CASE WHEN d.status = 'won' OR d.stage = 'thanh_cong' THEN d.amount ELSE 0 END), 0) AS revenue_won
       FROM deals d
       WHERE ${dealFilter}
       GROUP BY d.assigned_to`,
      reportDealParams
    ),
    pool.query(
      `SELECT
         t.assigned_to AS employee_id,
         COUNT(*)::int AS total_tasks,
         COUNT(*) FILTER (WHERE t.is_completed = true)::int AS completed_tasks,
         COUNT(*) FILTER (WHERE COALESCE(t.is_completed, false) = false)::int AS pending_tasks,
         COUNT(*) FILTER (WHERE COALESCE(t.is_completed, false) = false AND t.due_date IS NOT NULL AND t.due_date < $${taskRange.params.length + 1})::int AS overdue_tasks
       FROM tasks t
       WHERE ${taskFilter}
       GROUP BY t.assigned_to`,
      [...taskRange.params, Date.now()]
    )
  ])

  const dealMap = new Map(
    (dealsRes.rows || []).map((row) => [
      row.employee_id,
      {
        total_deals: parseInt(row.total_deals || 0, 10),
        active_deals: parseInt(row.active_deals || 0, 10),
        won_deals: parseInt(row.won_deals || 0, 10),
        lost_deals: parseInt(row.lost_deals || 0, 10),
        pipeline_value: parseFloat(row.pipeline_value || 0) || 0,
        revenue_won: parseFloat(row.revenue_won || 0) || 0
      }
    ])
  )
  const taskMap = new Map(
    (tasksRes.rows || []).map((row) => [
      row.employee_id,
      {
        total_tasks: parseInt(row.total_tasks || 0, 10),
        completed_tasks: parseInt(row.completed_tasks || 0, 10),
        pending_tasks: parseInt(row.pending_tasks || 0, 10),
        overdue_tasks: parseInt(row.overdue_tasks || 0, 10)
      }
    ])
  )

  return (employeesRes.rows || []).map((emp) => {
    const dealData = dealMap.get(emp.employee_id) || {
      total_deals: 0,
      active_deals: 0,
      won_deals: 0,
      lost_deals: 0,
      pipeline_value: 0,
      revenue_won: 0
    }
    const taskData = taskMap.get(emp.employee_id) || {
      total_tasks: 0,
      completed_tasks: 0,
      pending_tasks: 0,
      overdue_tasks: 0
    }
    const taskCompletionRate =
      taskData.total_tasks === 0 ? 0 : Math.round((taskData.completed_tasks / taskData.total_tasks) * 10000) / 100

    return {
      employee_id: emp.employee_id,
      full_name: emp.full_name || emp.username || emp.employee_id,
      username: emp.username || '',
      role: emp.role || '',
      department_name: emp.department_name || '',
      ...dealData,
      ...taskData,
      task_completion_rate: taskCompletionRate
    }
  })
}

/**
 * Employee Breakdown (drill-down table)
 * - Returns KPI rows per employee inside scope
 * - Supports optional departmentId filter (sub-unit drill-down)
 */
export async function getEmployeeBreakdown(tenantId, scopeOptions, dealCategory = null, dateRange = null, options = {}) {
  const employeeIds = await resolveScopeToEmployeeIds(tenantId, scopeOptions)
  if (employeeIds && employeeIds.length === 0) return []

  const departmentId = options?.departmentId ? String(options.departmentId) : null

  const employeeParams = [tenantId]
  const employeeFilterParts = ['e.tenant_id = $1', 'e.is_active = true']
  if (employeeIds != null && employeeIds.length > 0) {
    employeeFilterParts.push(`e.employee_id IN (${employeeIds.map((_, i) => `$${i + 2}`).join(', ')})`)
    employeeParams.push(...employeeIds)
  }
  if (departmentId) {
    employeeFilterParts.push(`e.department_id = $${employeeParams.length + 1}`)
    employeeParams.push(departmentId)
  }
  const employeeFilter = employeeFilterParts.join(' AND ')

  const dealFilterParts = ['d.tenant_id = $1', '(COALESCE(d.is_deleted, false) = false)']
  const dealParams = [tenantId]
  if (employeeIds != null && employeeIds.length > 0) {
    dealFilterParts.push(`d.assigned_to IN (${employeeIds.map((_, i) => `$${i + 2}`).join(', ')})`)
    dealParams.push(...employeeIds)
  }
  if (dealCategory === 'MASS' || dealCategory === 'PROJECT') {
    dealFilterParts.push(`COALESCE(d.deal_category, '${DEAL_CATEGORY_DEFAULT}') = $${dealParams.length + 1}`)
    dealParams.push(dealCategory)
  }
  let dealFilter = dealFilterParts.join(' AND ')
  let reportDealParams = [...dealParams]
  const dealRange = addDateRangeClause(dealFilter, reportDealParams, 'd.created_at', dateRange)
  dealFilter = dealRange.clause
  reportDealParams = dealRange.params

  const taskFilterParts = ['t.tenant_id = $1']
  const taskParams = [tenantId]
  if (employeeIds != null && employeeIds.length > 0) {
    taskFilterParts.push(`t.assigned_to IN (${employeeIds.map((_, i) => `$${i + 2}`).join(', ')})`)
    taskParams.push(...employeeIds)
  }
  if (departmentId) {
    // Filter tasks by department via employees join in query below (avoid duplicating employeeIds)
  }
  const taskRange = addDateRangeClause(taskFilterParts.join(' AND '), taskParams, 't.created_at', dateRange)
  const taskFilter = taskRange.clause

  const nowTs = Date.now()

  const [employeesRes, dealsRes, tasksRes] = await Promise.all([
    pool.query(
      `SELECT e.employee_id, e.full_name, e.username, e.role,
         dep.id AS department_id, dep.name AS department_name, dep.path AS department_path
       FROM employees e
       LEFT JOIN departments dep ON e.department_id = dep.id AND dep.tenant_id = e.tenant_id
       WHERE ${employeeFilter}
       ORDER BY e.full_name ASC`,
      employeeParams
    ),
    pool.query(
      `SELECT
         d.assigned_to AS employee_id,
         COUNT(*) FILTER (WHERE COALESCE(d.status, 'active') = 'active')::int AS open_deals,
         COUNT(*) FILTER (WHERE d.status = 'won' OR d.stage = 'thanh_cong')::int AS won_deals,
         COUNT(*) FILTER (WHERE d.status IN ('lost', 'cancelled'))::int AS lost_deals,
         COALESCE(SUM(CASE WHEN COALESCE(d.status, 'active') = 'active' THEN d.amount ELSE 0 END), 0) AS pipeline_value,
         COALESCE(SUM(CASE WHEN d.status = 'won' OR d.stage = 'thanh_cong' THEN d.amount ELSE 0 END), 0) AS revenue_won
       FROM deals d
       WHERE ${dealFilter}
       GROUP BY d.assigned_to`,
      reportDealParams
    ),
    pool.query(
      `SELECT
         t.assigned_to AS employee_id,
         COUNT(*) FILTER (WHERE t.is_completed = true)::int AS completed_tasks,
         COUNT(*) FILTER (WHERE COALESCE(t.is_completed, false) = false)::int AS pending_tasks,
         COUNT(*) FILTER (WHERE COALESCE(t.is_completed, false) = false AND t.due_date IS NOT NULL AND t.due_date < $${taskRange.params.length + 1})::int AS overdue_tasks
       FROM tasks t
       LEFT JOIN employees e ON t.assigned_to = e.employee_id AND e.tenant_id = t.tenant_id
       WHERE ${taskFilter}${departmentId ? ` AND e.department_id = $${taskRange.params.length + 2}` : ''}
       GROUP BY t.assigned_to`,
      departmentId ? [...taskRange.params, nowTs, departmentId] : [...taskRange.params, nowTs]
    )
  ])

  const dealMap = new Map((dealsRes.rows || []).map((r) => [r.employee_id, r]))
  const taskMap = new Map((tasksRes.rows || []).map((r) => [r.employee_id, r]))

  return (employeesRes.rows || [])
    .map((e) => {
      const deal = dealMap.get(e.employee_id) || {}
      const task = taskMap.get(e.employee_id) || {}
      const wonDeals = parseInt(deal.won_deals || 0, 10)
      const lostDeals = parseInt(deal.lost_deals || 0, 10)
      const closed = wonDeals + lostDeals
      return {
        employee_id: e.employee_id,
        full_name: e.full_name || e.username || e.employee_id,
        username: e.username || '',
        role: e.role || '',
        department_id: e.department_id || null,
        department_name: e.department_name || '',
        department_path: e.department_path || '',
        open_deals: parseInt(deal.open_deals || 0, 10),
        pipeline_value: parseFloat(deal.pipeline_value || 0) || 0,
        revenue_won: parseFloat(deal.revenue_won || 0) || 0,
        win_rate: closed === 0 ? 0 : Math.round((wonDeals / closed) * 10000) / 100,
        completed_tasks: parseInt(task.completed_tasks || 0, 10),
        pending_tasks: parseInt(task.pending_tasks || 0, 10),
        overdue_tasks: parseInt(task.overdue_tasks || 0, 10)
      }
    })
    .sort((a, b) => b.revenue_won - a.revenue_won)
    .map((row, idx) => ({ ...row, rank: idx + 1 }))
}

/**
 * Department/Sub-unit Breakdown (drill-down table)
 * - Aggregates KPI per department within scope
 */
export async function getDepartmentBreakdown(tenantId, scopeOptions, dealCategory = null, dateRange = null) {
  const employeeIds = await resolveScopeToEmployeeIds(tenantId, scopeOptions)
  if (employeeIds && employeeIds.length === 0) return []

  const empFilterParts = ['e.tenant_id = $1', 'e.is_active = true', 'e.department_id IS NOT NULL']
  const empParams = [tenantId]
  if (employeeIds != null && employeeIds.length > 0) {
    empFilterParts.push(`e.employee_id IN (${employeeIds.map((_, i) => `$${i + 2}`).join(', ')})`)
    empParams.push(...employeeIds)
  }
  const empFilter = empFilterParts.join(' AND ')

  const dealFilterParts = ['d.tenant_id = $1', '(COALESCE(d.is_deleted, false) = false)']
  const dealParams = [tenantId]
  if (employeeIds != null && employeeIds.length > 0) {
    dealFilterParts.push(`d.assigned_to IN (${employeeIds.map((_, i) => `$${i + 2}`).join(', ')})`)
    dealParams.push(...employeeIds)
  }
  if (dealCategory === 'MASS' || dealCategory === 'PROJECT') {
    dealFilterParts.push(`COALESCE(d.deal_category, '${DEAL_CATEGORY_DEFAULT}') = $${dealParams.length + 1}`)
    dealParams.push(dealCategory)
  }
  const dealRange = addDateRangeClause(dealFilterParts.join(' AND '), dealParams, 'd.created_at', dateRange)

  const taskFilterParts = ['t.tenant_id = $1']
  const taskParams = [tenantId]
  if (employeeIds != null && employeeIds.length > 0) {
    taskFilterParts.push(`t.assigned_to IN (${employeeIds.map((_, i) => `$${i + 2}`).join(', ')})`)
    taskParams.push(...employeeIds)
  }
  const taskRange = addDateRangeClause(taskFilterParts.join(' AND '), taskParams, 't.created_at', dateRange)
  const nowTs = Date.now()

  const [deptRes, dealRes, taskRes] = await Promise.all([
    pool.query(
      `SELECT dep.id AS department_id, dep.name AS department_name, dep.path AS department_path,
         COUNT(*)::int AS employee_count
       FROM employees e
       JOIN departments dep ON e.department_id = dep.id AND dep.tenant_id = e.tenant_id
       WHERE ${empFilter}
       GROUP BY dep.id, dep.name, dep.path
       ORDER BY dep.path ASC`,
      empParams
    ),
    pool.query(
      `SELECT
         e.department_id AS department_id,
         COUNT(*) FILTER (WHERE COALESCE(d.status, 'active') = 'active')::int AS open_deals,
         COUNT(*) FILTER (WHERE d.status = 'won' OR d.stage = 'thanh_cong')::int AS won_deals,
         COUNT(*) FILTER (WHERE d.status IN ('lost', 'cancelled'))::int AS lost_deals,
         COALESCE(SUM(CASE WHEN COALESCE(d.status, 'active') = 'active' THEN d.amount ELSE 0 END), 0) AS pipeline_value,
         COALESCE(SUM(CASE WHEN d.status = 'won' OR d.stage = 'thanh_cong' THEN d.amount ELSE 0 END), 0) AS revenue_won
       FROM deals d
       JOIN employees e ON d.assigned_to = e.employee_id AND e.tenant_id = d.tenant_id
       WHERE ${dealRange.clause} AND e.department_id IS NOT NULL AND e.is_active = true
       GROUP BY e.department_id`,
      dealRange.params
    ),
    pool.query(
      `SELECT
         e.department_id AS department_id,
         COUNT(*) FILTER (WHERE t.is_completed = true)::int AS completed_tasks,
         COUNT(*) FILTER (WHERE COALESCE(t.is_completed, false) = false)::int AS pending_tasks,
         COUNT(*) FILTER (WHERE COALESCE(t.is_completed, false) = false AND t.due_date IS NOT NULL AND t.due_date < $${taskRange.params.length + 1})::int AS overdue_tasks
       FROM tasks t
       JOIN employees e ON t.assigned_to = e.employee_id AND e.tenant_id = t.tenant_id
       WHERE ${taskRange.clause} AND e.department_id IS NOT NULL AND e.is_active = true
       GROUP BY e.department_id`,
      [...taskRange.params, nowTs]
    )
  ])

  const dealMap = new Map((dealRes.rows || []).map((r) => [r.department_id, r]))
  const taskMap = new Map((taskRes.rows || []).map((r) => [r.department_id, r]))

  return (deptRes.rows || []).map((d) => {
    const deal = dealMap.get(d.department_id) || {}
    const task = taskMap.get(d.department_id) || {}
    const wonDeals = parseInt(deal.won_deals || 0, 10)
    const lostDeals = parseInt(deal.lost_deals || 0, 10)
    const closed = wonDeals + lostDeals
    return {
      department_id: d.department_id,
      department_name: d.department_name || '',
      department_path: d.department_path || '',
      employee_count: parseInt(d.employee_count || 0, 10),
      open_deals: parseInt(deal.open_deals || 0, 10),
      pipeline_value: parseFloat(deal.pipeline_value || 0) || 0,
      revenue_won: parseFloat(deal.revenue_won || 0) || 0,
      win_rate: closed === 0 ? 0 : Math.round((wonDeals / closed) * 10000) / 100,
      completed_tasks: parseInt(task.completed_tasks || 0, 10),
      pending_tasks: parseInt(task.pending_tasks || 0, 10),
      overdue_tasks: parseInt(task.overdue_tasks || 0, 10)
    }
  })
}

/**
 * Employee Detail (modal drill-down)
 * - Summary KPI + top deals needing attention + overdue tasks list
 */
export async function getEmployeeDetail(tenantId, employeeId, dateRange = null, dealCategory = null) {
  const empId = String(employeeId || '').trim()
  if (!empId) return null

  const empRes = await pool.query(
    `SELECT e.employee_id, e.full_name, e.username, e.role,
       dep.id AS department_id, dep.name AS department_name, dep.path AS department_path
     FROM employees e
     LEFT JOIN departments dep ON e.department_id = dep.id AND dep.tenant_id = e.tenant_id
     WHERE e.tenant_id = $1 AND e.employee_id = $2 AND e.is_active = true`,
    [tenantId, empId]
  )
  const emp = (empRes.rows || [])[0]
  if (!emp) return null

  const scopeOptions = { employeeIds: [empId] }
  const [revenue, winRate, activeDealsCount, dealsNeedingAttention] = await Promise.all([
    getRevenueStats(tenantId, scopeOptions, dateRange),
    getWinRate(tenantId, scopeOptions, dateRange),
    getActiveDealsCount(tenantId, scopeOptions, dateRange),
    getDealsNeedingAttention(tenantId, scopeOptions, 10, dateRange)
  ])

  const taskRange = addDateRangeClause('t.tenant_id = $1 AND t.assigned_to = $2', [tenantId, empId], 't.created_at', dateRange)
  const overdueTasksRes = await pool.query(
    `SELECT t.task_id, t.display_code, t.title, t.due_date, t.created_at
     FROM tasks t
     WHERE ${taskRange.clause}
       AND COALESCE(t.is_completed, false) = false
       AND t.due_date IS NOT NULL
       AND t.due_date < $${taskRange.params.length + 1}
     ORDER BY t.due_date ASC
     LIMIT 20`,
    [...taskRange.params, Date.now()]
  )

  return {
    employee: {
      employee_id: emp.employee_id,
      full_name: emp.full_name || emp.username || emp.employee_id,
      username: emp.username || '',
      role: emp.role || '',
      department_id: emp.department_id || null,
      department_name: emp.department_name || '',
      department_path: emp.department_path || ''
    },
    kpi: {
      revenue,
      winRate,
      activeDealsCount
    },
    dealsNeedingAttention,
    overdueTasks: (overdueTasksRes.rows || []).map((r) => ({
      task_id: r.task_id,
      display_code: r.display_code || null,
      title: r.title,
      due_date: r.due_date,
      created_at: r.created_at
    }))
  }
}
