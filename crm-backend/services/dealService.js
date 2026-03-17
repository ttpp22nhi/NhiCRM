/**
 * DealService – truy vấn Deal theo phân cấp
 * - Tenant: luôn WHERE tenant_id = current_tenant_id (bảo mật, không xem tenant khác)
 * - director: toàn bộ (chỉ tenant_id)
 * - manager: path LIKE manager_dept_path% (toàn bộ phòng ban)
 * - leader: path LIKE leader_team_path% (toàn bộ team)
 * - sales: assigned_to = user_id (chỉ việc của mình)
 */

import pool from '../database.js'
import { buildScopeCondition } from './scopeService.js'

/**
 * Lấy danh sách deals theo Full Visibility
 * @param {string} tenantId
 * @param {string} userId - current user employee_id
 * @param {string} role - current user role (admin, director, manager, sales, leader, ...)
 * @param {object} filters - customer_id, assigned_to, stage, status, from_date, to_date, created_from, created_to, deal_category, confidence_level
 * @returns {Promise<Array>} rows
 */
export async function getDeals(tenantId, userId, role, filters = {}) {
  const {
    customer_id,
    assigned_to,
    stage,
    status,
    from_date,
    to_date,
    created_from,
    created_to,
    deal_category,
    confidence_level
  } = filters

  const baseParams = [tenantId]
  const { scopeClause, scopeParams } = await buildScopeCondition(tenantId, userId, role, 'd.assigned_to')
  let params = [...baseParams, ...scopeParams]
  let paramIndex = params.length + 1

  let query = `
    SELECT
      d.*,
      d.created_at AS time_create,
      c.full_name AS customer_full_name,
      c.phone AS customer_phone,
      c.customer_id,
      e.full_name AS assigned_employee_name,
      e.username AS assigned_employee_username
    FROM deals d
    LEFT JOIN customers c ON d.customer_id = c.customer_id AND c.deleted_at IS NULL AND c.tenant_id = d.tenant_id
    LEFT JOIN employees e ON d.assigned_to = e.employee_id
    WHERE d.tenant_id = $1 AND (COALESCE(d.is_deleted, false) = false) AND (${scopeClause})
  `

  if (assigned_to) {
    query += ` AND d.assigned_to = $${paramIndex++}`
    params.push(assigned_to)
  }
  if (customer_id) {
    query += ` AND d.customer_id = $${paramIndex++}`
    params.push(customer_id)
  }
  if (stage) {
    query += ` AND d.stage = $${paramIndex++}`
    params.push(stage)
  }
  if (deal_category && ['MASS', 'PROJECT'].includes(deal_category)) {
    query += ` AND COALESCE(d.deal_category, 'MASS') = $${paramIndex++}`
    params.push(deal_category)
  }

  const statusFilter = status
  if (statusFilter) {
    const raw = typeof statusFilter === 'string' ? statusFilter : (Array.isArray(statusFilter) ? statusFilter.join(',') : '')
    const statuses = raw.split(',').map((s) => String(s).trim()).filter(Boolean)
    if (statuses.length === 1) {
      if (statuses[0] === 'active') {
        query += ` AND (COALESCE(d.status, 'active') = 'active')`
      } else {
        query += ` AND d.status = $${paramIndex++}`
        params.push(statuses[0])
      }
    } else if (statuses.length > 1) {
      query += ` AND d.status IN (${statuses.map((_, i) => `$${paramIndex + i}`).join(', ')})`
      params.push(...statuses)
      paramIndex += statuses.length
    }
  }

  if (confidence_level && ['high', 'medium', 'low'].includes(confidence_level)) {
    query += ` AND COALESCE(d.confidence_level, 'medium') = $${paramIndex++}`
    params.push(confidence_level)
  }

  if (from_date && typeof from_date === 'string') {
    const fromMs = new Date(from_date + 'T00:00:00').getTime()
    if (!Number.isNaN(fromMs)) {
      query += ` AND d.expected_closing_date >= $${paramIndex++}`
      params.push(fromMs)
    }
  }
  if (to_date && typeof to_date === 'string') {
    const toMs = new Date(to_date + 'T23:59:59.999').getTime()
    if (!Number.isNaN(toMs)) {
      query += ` AND d.expected_closing_date <= $${paramIndex++}`
      params.push(toMs)
    }
  }
  if (created_from && typeof created_from === 'string') {
    const fromMs = new Date(created_from + 'T00:00:00').getTime()
    if (!Number.isNaN(fromMs)) {
      query += ` AND d.created_at >= $${paramIndex++}`
      params.push(fromMs)
    }
  }
  if (created_to && typeof created_to === 'string') {
    const toMs = new Date(created_to + 'T23:59:59.999').getTime()
    if (!Number.isNaN(toMs)) {
      query += ` AND d.created_at <= $${paramIndex++}`
      params.push(toMs)
    }
  }

  query += ' ORDER BY d.expected_closing_date ASC NULLS LAST, d.created_at DESC'

  const result = await pool.query(query, params)
  return result.rows || []
}
