import { getTenantId } from '../utils/tenantHelper.js'
import * as pipelineStagesService from '../services/pipelineStagesService.js'

/**
 * GET /api/pipeline-stages?deal_category=MASS|PROJECT
 * Trả về danh sách stages cho Kanban theo loại deal.
 */
export async function getPipelineStages(req, res) {
  const tenantId = getTenantId(req)
  const dealCategory = req.query.deal_category || 'MASS'
  try {
    const stages = await pipelineStagesService.getStagesByCategory(tenantId, dealCategory)
    res.json({ success: true, data: stages })
  } catch (err) {
    console.error('getPipelineStages:', err)
    res.status(500).json({ success: false, message: 'Lỗi khi lấy cấu hình pipeline.', error: err.message })
  }
}
