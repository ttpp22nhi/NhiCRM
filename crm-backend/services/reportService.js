import pool from '../database.js'

const DEAL_CATEGORY_DEFAULT = 'MASS'
const STAGE_WEIGHT = {
  tiep_can: 0.1,
  tu_van: 0.2,
  khao_sat: 0.2,
  bao_gia: 0.4,
  thuong_thao: 0.9,
  thanh_cong: 1.0
}
const CONFIDENCE_FACTOR = { high: 1, medium: 0.5, low: 0.2 }

function normalizeDateRange(dateRange) {
  if (!dateRange) return { fromTs: null, toTs: null }
  const fromTs = Number(dateRange.fromTs)
  const toTs = Number(dateRange.toTs)
  return {
    fromTs: Number.isFinite(fromTs) ? fromTs : null,
    toTs: Number.isFinite(toTs) ? toTs : null
  }
}

async function resolveScopeToEmployeeIds(tenantId, scopeOptions) {
  if (scopeOptions == null) return null
  if (Array.isArray(scopeOptions)) return scopeOptions.length ? scopeOptions : []
  if (typeof scopeOptions === 'object') {
    if (Array.isArray(scopeOptions.employeeIds)) return scopeOptions.employeeIds
    if (scopeOptions.scopePath && String(scopeOptions.scopePath).trim()) {
      return getEmployeeIdsByScopePath(tenantId, String(scopeOptions.scopePath).trim())
    }
    return null
  }
  if (typeof scopeOptions === 'string' && scopeOptions.trim()) {
    return getEmployeeIdsByScopePath(tenantId, scopeOptions.trim())
  }
  return null
}

async function getEmployeeIdsByScopePath(tenantId, scopePath) {
  const idOrPath = String(scopePath || '').trim()
  if (!idOrPath) return []

  let departmentIds = []
  if (idOrPath.includes('/')) {
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
    const row = deptRow.rows?.[0]
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

function buildDealFilterClause(tenantId, employeeIds) {
  const params = [tenantId]
  const base = `d.tenant_id = $1 AND (COALESCE(d.is_deleted, false) = false)`
  if (employeeIds == null) return { clause: base, params }
  if (employeeIds.length === 0) return { clause: `${base} AND 1=0`, params }
  const placeholders = employeeIds.map((_, i) => `$${i + 2}`).join(', ')
  return {
    clause: `${base} AND d.assigned_to IN (${placeholders})`,
    params: [...params, ...employeeIds]
  }
}

function buildTaskFilterClause(tenantId, employeeIds) {
  const params = [tenantId]
  const base = `t.tenant_id = $1`
  if (employeeIds == null) return { clause: base, params }
  if (employeeIds.length === 0) return { clause: `${base} AND 1=0`, params }
  const placeholders = employeeIds.map((_, i) => `$${i + 2}`).join(', ')
  return {
    clause: `${base} AND t.assigned_to IN (${placeholders})`,
    params: [...params, ...employeeIds]
  }
}

function addDateRangeClause(clause, params, column, dateRange) {
  const { fromTs, toTs } = normalizeDateRange(dateRange)
  const outParams = [...params]
  let outClause = clause
  if (fromTs != null) {
    outClause += ` AND ${column} >= $${outParams.length + 1}`
    outParams.push(fromTs)
  }
  if (toTs != null) {
    outClause += ` AND ${column} <= $${outParams.length + 1}`
    outParams.push(toTs)
  }
  return { clause: outClause, params: outParams }
}

function addDealCategoryClause(clause, params, dealCategory) {
  if (dealCategory !== 'MASS' && dealCategory !== 'PROJECT') {
    return { clause, params }
  }
  return {
    clause: `${clause} AND COALESCE(d.deal_category, '${DEAL_CATEGORY_DEFAULT}') = $${params.length + 1}`,
    params: [...params, dealCategory]
  }
}

export async function getTenantExportMeta(tenantId, userId) {
  const [tenantRes, userRes] = await Promise.all([
    pool.query('SELECT name FROM tenants WHERE id = $1', [tenantId]),
    pool.query('SELECT full_name, username FROM employees WHERE employee_id = $1 AND tenant_id = $2', [userId, tenantId])
  ])
  return {
    tenantName: tenantRes.rows?.[0]?.name || tenantId,
    exportedBy: userRes.rows?.[0]?.full_name || userRes.rows?.[0]?.username || userId
  }
}

export async function getSalesForecastReport(tenantId, scopeOptions, dateRange, dealCategory = null) {
  const employeeIds = await resolveScopeToEmployeeIds(tenantId, scopeOptions)
  let { clause, params } = buildDealFilterClause(tenantId, employeeIds)
  ;({ clause, params } = addDealCategoryClause(clause, params, dealCategory))
  ;({ clause, params } = addDateRangeClause(clause, params, 'd.created_at', dateRange))

  const result = await pool.query(
    `SELECT
       d.deal_id, d.display_code, d.title, d.amount, d.stage, d.status,
       COALESCE(d.confidence_level, 'medium') AS confidence_level,
       c.full_name AS customer_name,
       e.full_name AS assigned_employee_name,
       dep.name AS department_name,
       dep.path AS department_path
     FROM deals d
     LEFT JOIN customers c ON d.customer_id = c.customer_id AND c.tenant_id = d.tenant_id AND c.deleted_at IS NULL
     LEFT JOIN employees e ON d.assigned_to = e.employee_id AND e.tenant_id = d.tenant_id
     LEFT JOIN departments dep ON e.department_id = dep.id AND dep.tenant_id = e.tenant_id
     WHERE ${clause} AND COALESCE(d.status, 'active') NOT IN ('lost', 'cancelled')
     ORDER BY dep.path ASC NULLS LAST, d.amount DESC NULLS LAST, d.created_at DESC`,
    params
  )

  const rows = (result.rows || []).map((r) => {
    const stagePercent = STAGE_WEIGHT[r.stage] || 0.1
    const confidenceFactor = CONFIDENCE_FACTOR[r.confidence_level] || 0.5
    const amount = parseFloat(r.amount || 0) || 0
    return {
      deal_id: r.deal_id,
      display_code: r.display_code,
      title: r.title,
      customer_name: r.customer_name || '',
      assigned_employee_name: r.assigned_employee_name || '',
      department_name: r.department_name || '',
      department_path: r.department_path || '',
      amount,
      stage: r.stage,
      stage_percent: stagePercent,
      confidence_level: r.confidence_level,
      weighted_value: amount * stagePercent * confidenceFactor,
      status: r.status || 'active'
    }
  })

  const totals = rows.reduce(
    (acc, row) => {
      acc.totalAmount += row.amount
      acc.totalWeightedValue += row.weighted_value
      return acc
    },
    { totalDeals: rows.length, totalAmount: 0, totalWeightedValue: 0 }
  )

  const byPath = rows.reduce((acc, row) => {
    const key = row.department_path || row.department_name || 'Chưa có đơn vị'
    if (!acc[key]) acc[key] = { path: key, totalAmount: 0, totalWeightedValue: 0, dealCount: 0 }
    acc[key].dealCount += 1
    acc[key].totalAmount += row.amount
    acc[key].totalWeightedValue += row.weighted_value
    return acc
  }, {})

  return {
    rows,
    totals,
    groupedByPath: Object.values(byPath)
  }
}

export async function getEmployeePerformanceReport(tenantId, scopeOptions, dateRange, dealCategory = null) {
  const employeeIds = await resolveScopeToEmployeeIds(tenantId, scopeOptions)
  const employeeParams = [tenantId]
  const employeeFilter =
    employeeIds != null && employeeIds.length > 0
      ? ` AND e.employee_id IN (${employeeIds.map((_, i) => `$${i + 2}`).join(', ')})`
      : employeeIds && employeeIds.length === 0
      ? ' AND 1=0'
      : ''
  employeeParams.push(...(employeeIds || []))

  let { clause: dealClause, params: dealParams } = buildDealFilterClause(tenantId, employeeIds)
  ;({ clause: dealClause, params: dealParams } = addDealCategoryClause(dealClause, dealParams, dealCategory))
  ;({ clause: dealClause, params: dealParams } = addDateRangeClause(dealClause, dealParams, 'd.created_at', dateRange))

  let { clause: taskClause, params: taskParams } = buildTaskFilterClause(tenantId, employeeIds)
  ;({ clause: taskClause, params: taskParams } = addDateRangeClause(taskClause, taskParams, 't.created_at', dateRange))

  const [employeesRes, dealRes, taskRes] = await Promise.all([
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
         COUNT(*) FILTER (WHERE COALESCE(d.status, 'active') = 'active')::int AS open_deals,
         COUNT(*) FILTER (WHERE d.status = 'won' OR d.stage = 'thanh_cong')::int AS won_deals,
         COUNT(*) FILTER (WHERE d.status IN ('lost', 'cancelled'))::int AS closed_lost_deals,
         COALESCE(SUM(CASE WHEN d.status = 'won' OR d.stage = 'thanh_cong' THEN d.amount ELSE 0 END), 0) AS won_amount
       FROM deals d
       WHERE ${dealClause}
       GROUP BY d.assigned_to`,
      dealParams
    ),
    pool.query(
      `SELECT
         t.assigned_to AS employee_id,
         COUNT(*) FILTER (WHERE t.is_completed = true)::int AS completed_tasks,
         COUNT(*) FILTER (
           WHERE t.is_completed = true
             AND (t.due_date IS NULL OR t.due_date >= COALESCE(ta.last_activity_at, t.created_at))
         )::int AS ontime_completed_tasks
       FROM tasks t
       LEFT JOIN (
         SELECT task_id, MAX(created_at) AS last_activity_at
         FROM task_activities
         WHERE tenant_id = $1
         GROUP BY task_id
       ) ta ON ta.task_id = t.task_id
       WHERE ${taskClause}
       GROUP BY t.assigned_to`,
      taskParams
    )
  ])

  const dealMap = new Map((dealRes.rows || []).map((r) => [r.employee_id, r]))
  const taskMap = new Map((taskRes.rows || []).map((r) => [r.employee_id, r]))

  const rows = (employeesRes.rows || []).map((e) => {
    const deal = dealMap.get(e.employee_id) || {}
    const task = taskMap.get(e.employee_id) || {}
    const wonDeals = parseInt(deal.won_deals || 0, 10)
    const lostDeals = parseInt(deal.closed_lost_deals || 0, 10)
    const closedDeals = wonDeals + lostDeals
    return {
      employee_id: e.employee_id,
      full_name: e.full_name || e.username || e.employee_id,
      username: e.username || '',
      role: e.role || '',
      department_name: e.department_name || '',
      open_deals: parseInt(deal.open_deals || 0, 10),
      win_rate: closedDeals === 0 ? 0 : Math.round((wonDeals / closedDeals) * 10000) / 100,
      won_amount: parseFloat(deal.won_amount || 0) || 0,
      completed_tasks_on_time: parseInt(task.ontime_completed_tasks || 0, 10),
      completed_tasks: parseInt(task.completed_tasks || 0, 10)
    }
  }).sort((a, b) => b.won_amount - a.won_amount)

  return {
    rows: rows.map((row, index) => ({ ...row, rank: index + 1 })),
    totals: {
      totalEmployees: rows.length,
      totalWonAmount: rows.reduce((sum, row) => sum + row.won_amount, 0),
      avgWinRate: rows.length ? Math.round((rows.reduce((sum, row) => sum + row.win_rate, 0) / rows.length) * 100) / 100 : 0
    }
  }
}

export async function getLossAnalysisReport(tenantId, scopeOptions, dateRange, dealCategory = null) {
  const employeeIds = await resolveScopeToEmployeeIds(tenantId, scopeOptions)
  let { clause, params } = buildDealFilterClause(tenantId, employeeIds)
  ;({ clause, params } = addDealCategoryClause(clause, params, dealCategory))
  ;({ clause, params } = addDateRangeClause(clause, params, 'd.updated_at', dateRange))

  const result = await pool.query(
    `SELECT
       d.deal_id, d.display_code, d.title, d.amount, d.loss_reason, d.notes, d.updated_at,
       c.full_name AS customer_name,
       e.full_name AS assigned_employee_name
     FROM deals d
     LEFT JOIN customers c ON d.customer_id = c.customer_id AND c.tenant_id = d.tenant_id AND c.deleted_at IS NULL
     LEFT JOIN employees e ON d.assigned_to = e.employee_id AND e.tenant_id = d.tenant_id
     WHERE ${clause} AND d.status IN ('lost', 'cancelled')
     ORDER BY d.updated_at DESC NULLS LAST, d.amount DESC NULLS LAST`,
    params
  )

  const rows = (result.rows || []).map((r) => ({
    deal_id: r.deal_id,
    display_code: r.display_code,
    title: r.title,
    customer_name: r.customer_name || '',
    amount: parseFloat(r.amount || 0) || 0,
    loss_reason: r.loss_reason || 'Không xác định',
    note: r.notes || '',
    assigned_employee_name: r.assigned_employee_name || '',
    updated_at: r.updated_at
  }))

  const reasonMap = rows.reduce((acc, row) => {
    const key = row.loss_reason || 'Không xác định'
    if (!acc[key]) acc[key] = { reason: key, count: 0, amount: 0 }
    acc[key].count += 1
    acc[key].amount += row.amount
    return acc
  }, {})

  return {
    rows,
    reasonBreakdown: Object.values(reasonMap).sort((a, b) => b.count - a.count),
    totals: {
      totalDeals: rows.length,
      totalAmount: rows.reduce((sum, row) => sum + row.amount, 0)
    }
  }
}

export async function getTaskActivityLogReport(tenantId, scopeOptions, dateRange) {
  const employeeIds = await resolveScopeToEmployeeIds(tenantId, scopeOptions)
  let { clause, params } = buildTaskFilterClause(tenantId, employeeIds)
  ;({ clause, params } = addDateRangeClause(clause, params, 't.created_at', dateRange))

  const result = await pool.query(
    `SELECT
       t.task_id, t.display_code, t.title, t.created_at, t.due_date, t.is_completed,
       e.full_name AS assigned_employee_name,
       d.display_code AS deal_display_code,
       d.title AS deal_title,
       ta.last_activity_at
     FROM tasks t
     LEFT JOIN employees e ON t.assigned_to = e.employee_id AND e.tenant_id = t.tenant_id
     LEFT JOIN deals d ON t.related_type = 'DEAL' AND t.related_id = d.deal_id AND d.tenant_id = t.tenant_id
     LEFT JOIN (
       SELECT task_id, MAX(created_at) AS last_activity_at
       FROM task_activities
       WHERE tenant_id = $1
       GROUP BY task_id
     ) ta ON ta.task_id = t.task_id
     WHERE ${clause}
     ORDER BY t.created_at DESC`,
    params
  )

  const now = Date.now()
  const rows = (result.rows || []).map((r) => {
    const actualEnd = r.is_completed ? (r.last_activity_at || r.created_at) : null
    const overdue = !r.is_completed && r.due_date != null && Number(r.due_date) < now
    return {
      task_id: r.task_id,
      display_code: r.display_code,
      title: r.title,
      assigned_employee_name: r.assigned_employee_name || '',
      deal_display_code: r.deal_display_code || '',
      deal_title: r.deal_title || '',
      status: r.is_completed ? 'Completed' : overdue ? 'Overdue' : 'Pending',
      actual_start: r.created_at,
      actual_end: actualEnd,
      overdue
    }
  })

  const statusMap = rows.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1
    return acc
  }, {})

  return {
    rows,
    summary: {
      totalTasks: rows.length,
      completedTasks: rows.filter((row) => row.status === 'Completed').length,
      overdueTasks: rows.filter((row) => row.overdue).length,
      statusBreakdown: Object.entries(statusMap).map(([status, count]) => ({ status, count }))
    }
  }
}
