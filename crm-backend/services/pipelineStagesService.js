/**
 * Pipeline stages theo deal_category (MASS / PROJECT).
 * Nếu tenant chưa cấu hình thì trả về stages mặc định.
 */
import pool from '../database.js'

const DEFAULT_MASS_STAGES = [
  { id: 'tiep_can', label: 'Tiếp cận', color: 'bg-blue-100 border-blue-300', sort_order: 1, task_assign_department_id: null },
  { id: 'tu_van', label: 'Tư vấn', color: 'bg-yellow-100 border-yellow-300', sort_order: 2, task_assign_department_id: null },
  { id: 'bao_gia', label: 'Báo giá', color: 'bg-orange-100 border-orange-300', sort_order: 3, task_assign_department_id: null },
  { id: 'thuong_thao', label: 'Thương thảo', color: 'bg-purple-100 border-purple-300', sort_order: 4, task_assign_department_id: null },
  { id: 'thanh_cong', label: 'Thành công', color: 'bg-green-100 border-green-300', sort_order: 5, task_assign_department_id: null }
]

const DEFAULT_PROJECT_STAGES = [
  { id: 'tiep_can', label: 'Tiếp cận', color: 'bg-blue-100 border-blue-300', sort_order: 1, task_assign_department_id: null },
  { id: 'tu_van', label: 'Tư vấn', color: 'bg-yellow-100 border-yellow-300', sort_order: 2, task_assign_department_id: null },
  { id: 'khao_sat', label: 'Khảo sát', color: 'bg-cyan-100 border-cyan-300', sort_order: 3, task_assign_department_id: null },
  { id: 'bao_gia', label: 'Báo giá', color: 'bg-orange-100 border-orange-300', sort_order: 4, task_assign_department_id: null },
  { id: 'thuong_thao', label: 'Thương thảo', color: 'bg-purple-100 border-purple-300', sort_order: 5, task_assign_department_id: null },
  { id: 'thanh_cong', label: 'Thành công', color: 'bg-green-100 border-green-300', sort_order: 6, task_assign_department_id: null }
]

const CATEGORIES = ['MASS', 'PROJECT']

/**
 * Lấy danh sách stages theo tenant và deal_category.
 * Nếu chưa có trong DB thì trả về mặc định.
 */
export async function getStagesByCategory(tenantId, dealCategory) {
  const category = CATEGORIES.includes(dealCategory) ? dealCategory : 'MASS'
  const result = await pool.query(
    `SELECT id, stage_key, label, sort_order, color, task_assign_department_id
     FROM pipeline_stages
     WHERE tenant_id = $1 AND deal_category = $2
     ORDER BY sort_order ASC`,
    [tenantId, category]
  )
  if (result.rows && result.rows.length > 0) {
    return result.rows.map((r) => ({
      id: r.stage_key,
      label: r.label,
      color: r.color || 'bg-gray-100 border-gray-300',
      sort_order: r.sort_order,
      task_assign_department_id: r.task_assign_department_id || null
    }))
  }
  const defaults = category === 'PROJECT' ? DEFAULT_PROJECT_STAGES : DEFAULT_MASS_STAGES
  return defaults.map((s) => ({
    id: s.id,
    label: s.label,
    color: s.color,
    sort_order: s.sort_order,
    task_assign_department_id: s.task_assign_department_id
  }))
}

/**
 * Lấy stage config cho automation: khi deal PROJECT chuyển sang stage_key,
 * có task_assign_department_id thì gán task cho phòng đó.
 */
export async function getStageConfig(tenantId, dealCategory, stageKey) {
  const result = await pool.query(
    `SELECT stage_key, label, task_assign_department_id
     FROM pipeline_stages
     WHERE tenant_id = $1 AND deal_category = $2 AND stage_key = $3`,
    [tenantId, dealCategory, stageKey]
  )
  if (result.rows && result.rows.length > 0) {
    const r = result.rows[0]
    return { task_assign_department_id: r.task_assign_department_id || null }
  }
  if (dealCategory === 'PROJECT' && stageKey === 'khao_sat') {
    return { task_assign_department_id: null }
  }
  return { task_assign_department_id: null }
}

export function getDefaultStages(category) {
  return category === 'PROJECT' ? [...DEFAULT_PROJECT_STAGES] : [...DEFAULT_MASS_STAGES]
}
