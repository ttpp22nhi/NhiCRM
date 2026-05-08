import pool from '../database.js'
import { v4 as uuidv4 } from 'uuid'
import { getTenantId } from '../utils/tenantHelper.js'
import { getAccessScope, buildDealFilter } from '../services/permissionService.js'
import * as dealService from '../services/dealService.js'
import centralEmitter, { EVENT_DEAL_STAGE_CHANGED } from '../events/eventEmitter.js'
import {
  syncDealTasksWithDeal,
  detachTasksFromDeletedDeal,
  reattachTasksOnDealRestore,
} from '../services/dealMetadataService.js'
import { generateDisplayCode } from '../services/displayCodeService.js'
import * as pipelineStagesService from '../services/pipelineStagesService.js'
import { getAssignableEmployeeIds } from '../services/assignableEmployeesService.js'
import { syncKpiForDealsChange } from '../services/kpiFromDealsSyncService.js'

/**
 * Lấy danh sách Leader/Manager có quyền phê duyệt deal của nhân viên (cùng phòng hoặc cấp trên theo path)
 */
async function getApproversForEmployee(tenantId, employeeId) {
  const emp = await pool.query(
    'SELECT department_id FROM employees WHERE employee_id = $1 AND tenant_id = $2 AND is_active = TRUE',
    [employeeId, tenantId]
  )
  if (!emp.rows.length || !emp.rows[0].department_id) return []
  const deptId = emp.rows[0].department_id
  const leaders = await pool.query(
    `SELECT employee_id FROM employees
     WHERE tenant_id = $1 AND department_id = $2 AND is_active = TRUE AND role IN ('leader', 'manager')`,
    [tenantId, deptId]
  )
  return (leaders.rows || []).map((r) => r.employee_id)
}

/**
 * Lấy danh sách deals – Full Visibility (DealService.getDeals)
 * Tenant isolation + role-based scope: admin/director = toàn tenant; manager = theo department path; staff = assigned_to = user
 * Search & filter: stage, status, confidence_level, deal_category, dates vẫn hoạt động.
 */
export const getDeals = async (req, res) => {
  const { id: userId, role } = req.user
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
  } = req.query

  try {
    const tenantId = getTenantId(req)
    const filters = {
      customer_id: customer_id || undefined,
      assigned_to: assigned_to || undefined,
      stage: stage || undefined,
      status: status || undefined,
      from_date: from_date || undefined,
      to_date: to_date || undefined,
      created_from: created_from || undefined,
      created_to: created_to || undefined,
      deal_category: deal_category || undefined,
      confidence_level: confidence_level || undefined
    }
    const rows = await dealService.getDeals(tenantId, userId, role || 'sales', filters)
    res.json({
      success: true,
      data: rows
    })
  } catch (error) {
    console.error('Lỗi getDeals:', error)
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi lấy danh sách deals.',
      error: error.message
    })
  }
}

/**
 * Tạo deal mới
 */
const DEAL_CATEGORIES = ['MASS', 'PROJECT']

const CONFIDENCE_LEVELS = ['high', 'medium', 'low']

/** Deal giá trị > 500 triệu do Sales tạo → trạng thái pending_approval, cần Leader/Manager phê duyệt */
const APPROVAL_THRESHOLD_AMOUNT = 500_000_000

const MAX_DEAL_DESCRIPTION_LEN = 4000

function normalizeDealDescription(v) {
  if (v == null || v === '') return null
  const s = String(v).trim()
  if (!s) return null
  return s.length > MAX_DEAL_DESCRIPTION_LEN ? s.slice(0, MAX_DEAL_DESCRIPTION_LEN) : s
}

export const createDeal = async (req, res) => {
  const { role, id: userId } = req.user
  const { customer_id, title, amount, stage, expected_closing_date, assigned_to, product_name, quantity, invoice_info, notes, description, deal_category: bodyCategory, confidence_level: bodyConfidence, confidence_note: bodyConfidenceNote, primary_product_code, first_contact_date } = req.body
  const tenantId = getTenantId(req)
  const dealCategory = DEAL_CATEGORIES.includes(bodyCategory) ? bodyCategory : 'MASS'
  const confidenceLevel = CONFIDENCE_LEVELS.includes(bodyConfidence) ? bodyConfidence : 'medium'
  const confidenceNote = bodyConfidenceNote != null && String(bodyConfidenceNote).trim() ? String(bodyConfidenceNote).trim() : null

  try {
    if (!title) {
      return res.status(400).json({ success: false, message: 'Tiêu đề deal là bắt buộc.' })
    }
    if (confidenceLevel === 'low' && !confidenceNote) {
      return res.status(400).json({
        success: false,
        message: 'Khi mức độ tự tin là "Khả năng thất bại cao" (Đỏ), bắt buộc nhập ghi chú lý do.'
      })
    }

    if (customer_id) {
      const customerCheck = await pool.query(
        'SELECT customer_id FROM customers WHERE customer_id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
        [customer_id, tenantId]
      )
      if (customerCheck.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Khách hàng không tồn tại hoặc đã bị xóa.' })
      }
    }

    let finalAssignedTo = assigned_to
    if (role === 'sales') {
      finalAssignedTo = userId
    } else if (!finalAssignedTo) {
      finalAssignedTo = userId
    }

    if (finalAssignedTo) {
      const employeeCheck = await pool.query(
        'SELECT employee_id FROM employees WHERE employee_id = $1 AND tenant_id = $2 AND is_active = true',
        [finalAssignedTo, tenantId]
      )
      if (employeeCheck.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Nhân viên được gán không tồn tại hoặc không thuộc đơn vị của bạn.' })
      }
      const allowedIds = await getAssignableEmployeeIds(tenantId, userId, role)
      if (!allowedIds.includes(finalAssignedTo)) {
        return res.status(403).json({ success: false, message: 'Bạn không được phép gán deal cho nhân viên này (vượt quyền phân cấp).' })
      }
    }

    // Validate stage theo pipeline của deal_category
    const stagesForCategory = await pipelineStagesService.getStagesByCategory(tenantId, dealCategory)
    const validStageIds = stagesForCategory.map((s) => s.id)
    const finalStage = stage || validStageIds[0] || 'tiep_can'
    if (!validStageIds.includes(finalStage)) {
      return res.status(400).json({
        success: false,
        message: 'Giai đoạn deal không hợp lệ cho loại hình này.'
      })
    }

    // Validate amount
    const finalAmount = amount ? parseFloat(amount) : 0
    if (isNaN(finalAmount) || finalAmount < 0) {
      return res.status(400).json({
        success: false,
        message: 'Giá trị deal phải là số dương.'
      })
    }

    // Validate expected_closing_date
    let finalExpectedClosingDate = null
    if (expected_closing_date) {
      finalExpectedClosingDate = parseInt(expected_closing_date)
      if (isNaN(finalExpectedClosingDate) || finalExpectedClosingDate <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Ngày dự kiến đóng deal không hợp lệ.'
        })
      }
    }

    const dealId = uuidv4()
    const now = Date.now()
    const qty = quantity != null && quantity !== '' ? parseFloat(quantity) : null
    const productName = product_name && String(product_name).trim() ? String(product_name).trim() : null
    const invoiceInfo = invoice_info && String(invoice_info).trim() ? String(invoice_info).trim() : null
    const notesVal = notes && String(notes).trim() ? String(notes).trim() : null
    const descriptionVal = normalizeDealDescription(description)
    const primaryProductCode = primary_product_code && String(primary_product_code).trim()
      ? String(primary_product_code).trim().toUpperCase()
      : null
    let firstContactMs = null
    if (first_contact_date != null && first_contact_date !== '') {
      const fc = parseInt(first_contact_date, 10)
      if (!Number.isNaN(fc) && fc > 0) firstContactMs = fc
    }

    const displayCode = await generateDisplayCode('DEAL', tenantId)

    // Sales tạo deal > 500 triệu → chờ phê duyệt (Leader/Manager mới vào Pipeline)
    let initialStatus = 'active'
    if (role === 'sales' && finalAmount > APPROVAL_THRESHOLD_AMOUNT) {
      initialStatus = 'pending_approval'
    }

    const insertQuery = `
      INSERT INTO deals (
        deal_id, customer_id, title, description, amount, stage, status,
        expected_closing_date, assigned_to, tenant_id, created_at, updated_at,
        product_name, quantity, invoice_info, notes, display_code, deal_category,
        confidence_level, confidence_note, primary_product_code, first_contact_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
      RETURNING *
    `
    await pool.query(insertQuery, [
      dealId, customer_id || null, title.trim(), descriptionVal, finalAmount, finalStage, initialStatus,
      finalExpectedClosingDate, finalAssignedTo, tenantId, now, now,
      productName, qty, invoiceInfo, notesVal, displayCode, dealCategory,
      confidenceLevel, confidenceNote, primaryProductCode, firstContactMs
    ])

    if (initialStatus === 'pending_approval') {
      try {
        const approvers = await getApproversForEmployee(tenantId, finalAssignedTo)
        const amountFmt = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(finalAmount)
        for (const approverId of approvers) {
          await pool.query(
            `INSERT INTO notifications (notification_id, employee_id, type, title, message, is_read, tenant_id, created_at)
             VALUES ($1, $2, $3, $4, $5, false, $6, $7)`,
            [
              uuidv4(),
              approverId,
              'deal_pending_approval',
              'Deal cần phê duyệt',
              `Deal "${title.trim()}" (${amountFmt}) do nhân viên tạo đang chờ phê duyệt để vào Pipeline.`,
              tenantId,
              now
            ]
          )
        }
      } catch (notifErr) {
        console.error('Lỗi gửi thông báo phê duyệt deal:', notifErr)
      }
    }

    // Lấy thông tin đầy đủ với JOIN
    const fullQuery = `
      SELECT 
        d.*,
        c.full_name as customer_full_name,
        c.phone as customer_phone,
        e.full_name as assigned_employee_name,
        e.username as assigned_employee_username
      FROM deals d
      LEFT JOIN customers c ON d.customer_id = c.customer_id AND c.deleted_at IS NULL
      LEFT JOIN employees e ON d.assigned_to = e.employee_id
      WHERE d.deal_id = $1
    `

    const fullResult = await pool.query(fullQuery, [dealId])
    const createdDeal = fullResult.rows[0]

    syncKpiForDealsChange(tenantId, null, createdDeal).catch((e) =>
      console.error('syncKpiForDealsChange (createDeal):', e)
    )

    res.status(201).json({
      success: true,
      message: initialStatus === 'pending_approval'
        ? 'Deal đã tạo và đang chờ Leader/Manager phê duyệt để vào Pipeline.'
        : 'Tạo deal thành công!',
      data: createdDeal
    })
  } catch (error) {
    console.error('Lỗi createDeal:', error)
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi tạo deal.',
      error: error.message
    })
  }
}

/**
 * Cập nhật deal (bao gồm chuyển stage)
 */
export const updateDeal = async (req, res) => {
  const { role, id: userId } = req.user
  const { id } = req.params
  const { title, amount, stage, status, expected_closing_date, assigned_to, customer_id, product_name, quantity, invoice_info, notes, description, loss_reason, stage_change_note, deal_category: bodyCategory, confidence_level: bodyConfidence, confidence_note: bodyConfidenceNote, primary_product_code, first_contact_date } = req.body

  const tenantId = getTenantId(req)

  try {
    const dealCheck = await pool.query(
      'SELECT * FROM deals WHERE deal_id = $1 AND tenant_id = $2 AND (COALESCE(is_deleted, false) = false)',
      [id, tenantId]
    )
    if (dealCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Deal không tồn tại.' })
    }
    const deal = dealCheck.rows[0]
    if (role === 'sales' && deal.assigned_to !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền cập nhật deal này.'
      })
    }

    // Kiểm tra customer nếu có thay đổi
    if (customer_id && customer_id !== deal.customer_id) {
      const customerCheck = await pool.query(
        'SELECT customer_id FROM customers WHERE customer_id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
        [customer_id, tenantId]
      )
      if (customerCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Khách hàng không tồn tại hoặc đã bị xóa.'
        })
      }
    }

    // Kiểm tra assigned_to nếu có thay đổi
    if (assigned_to && assigned_to !== deal.assigned_to) {
      // Sales không thể thay đổi assigned_to
      if (role === 'sales') {
        return res.status(403).json({
          success: false,
          message: 'Bạn không có quyền thay đổi người phụ trách deal.'
        })
      }

      const employeeCheck = await pool.query(
        'SELECT employee_id FROM employees WHERE employee_id = $1 AND tenant_id = $2 AND is_active = true',
        [assigned_to, tenantId]
      )
      if (employeeCheck.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Nhân viên được gán không thuộc đơn vị của bạn.' })
      }
      const allowedIds = await getAssignableEmployeeIds(tenantId, userId, role)
      if (!allowedIds.includes(assigned_to)) {
        return res.status(403).json({ success: false, message: 'Bạn không được phép gán deal cho nhân viên này (vượt quyền phân cấp).' })
      }
    }

    // Validate stage nếu có (theo pipeline của deal_category)
    const currentCategory = deal.deal_category || 'MASS'
    if (stage) {
      const stagesForCategory = await pipelineStagesService.getStagesByCategory(tenantId, currentCategory)
      const validStageIds = stagesForCategory.map((s) => s.id)
      if (!validStageIds.includes(stage)) {
        return res.status(400).json({
          success: false,
          message: 'Giai đoạn deal không hợp lệ cho loại hình này.'
        })
      }
    }

    // Validate amount nếu có
    if (amount !== undefined) {
      const finalAmount = parseFloat(amount)
      if (isNaN(finalAmount) || finalAmount < 0) {
        return res.status(400).json({
          success: false,
          message: 'Giá trị deal phải là số dương.'
        })
      }
    }

    // Validate expected_closing_date nếu có
    let finalExpectedClosingDate = deal.expected_closing_date
    if (expected_closing_date !== undefined) {
      if (expected_closing_date === null || expected_closing_date === '') {
        finalExpectedClosingDate = null
      } else {
        finalExpectedClosingDate = parseInt(expected_closing_date)
        if (isNaN(finalExpectedClosingDate) || finalExpectedClosingDate <= 0) {
          return res.status(400).json({
            success: false,
            message: 'Ngày dự kiến đóng deal không hợp lệ.'
          })
        }
      }
    }

    // Confidence: nếu chọn low thì bắt buộc confidence_note
    const confidenceLevel = bodyConfidence !== undefined && CONFIDENCE_LEVELS.includes(bodyConfidence) ? bodyConfidence : undefined
    const confidenceNoteVal = bodyConfidenceNote !== undefined ? (bodyConfidenceNote != null && String(bodyConfidenceNote).trim() ? String(bodyConfidenceNote).trim() : null) : undefined
    if (confidenceLevel === 'low' && (confidenceNoteVal === undefined ? !(deal.confidence_note && String(deal.confidence_note).trim()) : !confidenceNoteVal)) {
      return res.status(400).json({
        success: false,
        message: 'Khi mức độ tự tin là "Khả năng thất bại cao" (Đỏ), bắt buộc nhập ghi chú lý do.'
      })
    }

    // Khi chuyển sang cancelled hoặc lost bắt buộc phải có loss_reason
    const { loss_reason: lossReason } = req.body
    if (status === 'cancelled' || status === 'lost') {
      const reason = (lossReason != null && String(lossReason).trim()) ? String(lossReason).trim() : ''
      if (!reason) {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng nhập lý do hủy/thất bại khi chuyển trạng thái sang Hủy hoặc Thất bại.'
        })
      }
    }

    // Validate status nếu có
    if (status) {
      const validStatuses = ['active', 'won', 'lost', 'cancelled', 'closed', 'pending_approval']
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Trạng thái deal không hợp lệ.'
        })
      }
      // Chuyển pending_approval → active chỉ qua endpoint POST /api/deals/:id/approve
      if (deal.status === 'pending_approval' && status === 'active') {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng dùng nút "Phê duyệt" để đưa deal vào Pipeline.'
        })
      }
    }

    // Xây dựng query cập nhật
    const updateFields = []
    const updateValues = []
    let paramIndex = 1

    if (title !== undefined) {
      updateFields.push(`title = $${paramIndex++}`)
      updateValues.push(title.trim())
    }

    if (amount !== undefined) {
      updateFields.push(`amount = $${paramIndex++}`)
      updateValues.push(parseFloat(amount))
    }

    if (stage !== undefined) {
      updateFields.push(`stage = $${paramIndex++}`)
      updateValues.push(stage)
      if (stage === 'thanh_cong') {
        updateFields.push(`status = $${paramIndex++}`)
        updateValues.push('won')
      }
    }

    if (status !== undefined) {
      updateFields.push(`status = $${paramIndex++}`)
      updateValues.push(status)
    }
    if (status === 'cancelled' || status === 'lost') {
      const reason = (loss_reason != null && String(loss_reason).trim()) ? String(loss_reason).trim() : null
      updateFields.push(`loss_reason = $${paramIndex++}`)
      updateValues.push(reason)
    }

    if (expected_closing_date !== undefined) {
      updateFields.push(`expected_closing_date = $${paramIndex++}`)
      updateValues.push(finalExpectedClosingDate)
    }

    if (assigned_to !== undefined && role !== 'sales') {
      updateFields.push(`assigned_to = $${paramIndex++}`)
      updateValues.push(assigned_to)
    }

    if (customer_id !== undefined) {
      updateFields.push(`customer_id = $${paramIndex++}`)
      updateValues.push(customer_id || null)
    }

    if (product_name !== undefined) {
      updateFields.push(`product_name = $${paramIndex++}`)
      updateValues.push(product_name && String(product_name).trim() ? String(product_name).trim() : null)
    }
    if (quantity !== undefined) {
      updateFields.push(`quantity = $${paramIndex++}`)
      updateValues.push(quantity != null && quantity !== '' ? parseFloat(quantity) : null)
    }
    if (invoice_info !== undefined) {
      updateFields.push(`invoice_info = $${paramIndex++}`)
      updateValues.push(invoice_info && String(invoice_info).trim() ? String(invoice_info).trim() : null)
    }
    if (notes !== undefined) {
      updateFields.push(`notes = $${paramIndex++}`)
      updateValues.push(notes && String(notes).trim() ? String(notes).trim() : null)
    }

    if (description !== undefined) {
      updateFields.push(`description = $${paramIndex++}`)
      updateValues.push(normalizeDealDescription(description))
    }

    if (bodyCategory !== undefined && DEAL_CATEGORIES.includes(bodyCategory)) {
      updateFields.push(`deal_category = $${paramIndex++}`)
      updateValues.push(bodyCategory)
    }
    if (confidenceLevel !== undefined) {
      updateFields.push(`confidence_level = $${paramIndex++}`)
      updateValues.push(confidenceLevel)
    }
    if (confidenceNoteVal !== undefined) {
      updateFields.push(`confidence_note = $${paramIndex++}`)
      updateValues.push(confidenceNoteVal)
    }

    if (primary_product_code !== undefined) {
      const ppc = primary_product_code && String(primary_product_code).trim()
        ? String(primary_product_code).trim().toUpperCase()
        : null
      updateFields.push(`primary_product_code = $${paramIndex++}`)
      updateValues.push(ppc)
    }

    if (first_contact_date !== undefined) {
      let fcMs = null
      if (first_contact_date != null && first_contact_date !== '') {
        const fc = parseInt(first_contact_date, 10)
        if (!Number.isNaN(fc) && fc > 0) fcMs = fc
      }
      updateFields.push(`first_contact_date = $${paramIndex++}`)
      updateValues.push(fcMs)
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Không có trường nào để cập nhật.'
      })
    }

    // Thêm updated_at
    updateFields.push(`updated_at = $${paramIndex++}`)
    updateValues.push(Date.now())

    updateValues.push(id, tenantId)
    const updateQuery = `
      UPDATE deals 
      SET ${updateFields.join(', ')}
      WHERE deal_id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
      RETURNING *
    `
    const result = await pool.query(updateQuery, updateValues)
    const updatedDealRow = (result.rows || [])[0]

    // Khi chuyển giai đoạn: ghi log deal_activities (type system) — gộp "từ → sang" + nội dung
    if (stage !== undefined && stage !== deal.stage) {
      const effectiveCategory =
        (bodyCategory !== undefined && DEAL_CATEGORIES.includes(bodyCategory))
          ? bodyCategory
          : (updatedDealRow?.deal_category || deal.deal_category || 'MASS')
      const allStages = await pipelineStagesService.getStagesByCategory(tenantId, effectiveCategory)
      const stageLabelMap = Object.fromEntries(allStages.map((s) => [s.id, s.label]))
      const fromLabel = stageLabelMap[deal.stage] || deal.stage || '—'
      const toLabel = stageLabelMap[stage] || stage
      const noteText = (stage_change_note && String(stage_change_note).trim()) ? String(stage_change_note).trim() : ''
      const content = noteText
        ? `Chuyển từ ${fromLabel} sang ${toLabel}\n${noteText}`
        : `Chuyển từ ${fromLabel} sang ${toLabel}`
      const activityId = uuidv4()
      const now = Date.now()
      await pool.query(
        `INSERT INTO deal_activities (id, deal_id, stage, content, type, created_by, tenant_id, created_at)
         VALUES ($1, $2, $3, $4, 'system', $5, $6, $7)`,
        [activityId, id, stage, content, userId, tenantId, now]
      )
    }

    // Lấy thông tin đầy đủ với JOIN
    const fullQuery = `
      SELECT 
        d.*,
        c.full_name as customer_full_name,
        c.phone as customer_phone,
        e.full_name as assigned_employee_name,
        e.username as assigned_employee_username
      FROM deals d
      LEFT JOIN customers c ON d.customer_id = c.customer_id AND c.deleted_at IS NULL
      LEFT JOIN employees e ON d.assigned_to = e.employee_id
      WHERE d.deal_id = $1
    `

    const fullResult = await pool.query(fullQuery, [id])
    const updatedDeal = fullResult.rows[0]

    // Đồng bộ customer_id và assigned_to sang task liên quan.
    // Lưu ý:
    //  - customer_id: luôn đồng bộ (nguồn sự thật là deal).
    //  - assigned_to: chỉ đồng bộ những task ĐANG gán cho assignee CŨ của deal
    //    (hoặc chưa có ai). Tránh ghi đè task đã giao thủ công cho người khác
    //    (ví dụ task khảo sát của bộ phận Kỹ thuật trong pipeline PROJECT).
    syncDealTasksWithDeal(id, tenantId, {
      customer_id: updatedDeal?.customer_id ?? null,
      assigned_to: updatedDeal?.assigned_to ?? null,
      previous_assigned_to: deal.assigned_to ?? null,
      syncAssignee: true,
    }).catch((e) => console.error('syncDealTasksWithDeal:', e))

    // Tự động hóa: MASS chuyển Báo giá → task Sales; PROJECT chuyển Khảo sát → task Kỹ thuật/Giải pháp
    const category = updatedDeal?.deal_category || deal.deal_category || 'MASS'
    const shouldEmitMASS = stage !== undefined && stage === 'bao_gia' && stage !== deal.stage && category === 'MASS' && updatedDeal
    const shouldEmitPROJECT = stage !== undefined && stage === 'khao_sat' && stage !== deal.stage && category === 'PROJECT' && updatedDeal
    if (shouldEmitMASS || shouldEmitPROJECT) {
      centralEmitter.emit(EVENT_DEAL_STAGE_CHANGED, {
        deal: updatedDeal,
        tenantId,
        userId,
        newStage: stage
      })
    }

    syncKpiForDealsChange(tenantId, deal, updatedDeal).catch((e) =>
      console.error('syncKpiForDealsChange (updateDeal):', e)
    )

    res.json({
      success: true,
      message: 'Cập nhật deal thành công!',
      data: updatedDeal
    })
  } catch (error) {
    console.error('Lỗi updateDeal:', error)
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi cập nhật deal.',
      error: error.message
    })
  }
}

/**
 * Phê duyệt deal (pending_approval → active). Chỉ Leader/Manager của nhân viên phụ trách deal hoặc Admin/Director.
 */
export const approveDeal = async (req, res) => {
  const { role, id: userId } = req.user
  const { id } = req.params
  const tenantId = getTenantId(req)

  try {
    const dealRow = await pool.query(
      'SELECT deal_id, status, assigned_to FROM deals WHERE deal_id = $1 AND tenant_id = $2 AND (COALESCE(is_deleted, false) = false)',
      [id, tenantId]
    )
    if (dealRow.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Deal không tồn tại.' })
    }
    const deal = dealRow.rows[0]
    if (deal.status !== 'pending_approval') {
      return res.status(400).json({
        success: false,
        message: 'Chỉ deal đang chờ phê duyệt mới có thể phê duyệt.'
      })
    }

    const canApprove = role === 'admin' || role === 'super_admin' || role === 'director'
    if (!canApprove) {
      const approvers = await getApproversForEmployee(tenantId, deal.assigned_to)
      if (!approvers.includes(userId)) {
        return res.status(403).json({
          success: false,
          message: 'Chỉ Leader/Manager của nhân viên phụ trách deal mới được phê duyệt.'
        })
      }
    }

    const now = Date.now()
    await pool.query(
      'UPDATE deals SET status = $1, updated_at = $2 WHERE deal_id = $3 AND tenant_id = $4',
      ['active', now, id, tenantId]
    )

    const fullDeal = await pool.query(
      'SELECT * FROM deals WHERE deal_id = $1 AND tenant_id = $2',
      [id, tenantId]
    )
    const updatedDeal = fullDeal.rows[0]
    try {
      await pool.query(
        `INSERT INTO deal_activities (id, deal_id, stage, content, type, created_by, tenant_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          uuidv4(),
          id,
          updatedDeal?.stage || 'tiep_can',
          'Deal đã được phê duyệt và đưa vào Pipeline.',
          'system',
          userId,
          tenantId,
          now
        ]
      )
    } catch (actErr) {
      console.error('Lỗi ghi deal_activities khi phê duyệt:', actErr)
    }

    const fullQuery = `
      SELECT d.*, c.full_name as customer_full_name, c.phone as customer_phone,
        e.full_name as assigned_employee_name, e.username as assigned_employee_username
      FROM deals d
      LEFT JOIN customers c ON d.customer_id = c.customer_id AND c.deleted_at IS NULL AND c.tenant_id = d.tenant_id
      LEFT JOIN employees e ON d.assigned_to = e.employee_id
      WHERE d.deal_id = $1
    `
    const result = await pool.query(fullQuery, [id])

    res.json({
      success: true,
      message: 'Đã phê duyệt deal. Deal đã vào Pipeline.',
      data: result.rows[0]
    })
  } catch (error) {
    console.error('Lỗi approveDeal:', error)
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi phê duyệt deal.',
      error: error.message
    })
  }
}

/**
 * Xóa mềm deal (chỉ Tenant Admin hoặc người được gán deal)
 * Sales thông thường không được xóa, chỉ được chuyển trạng thái sang Cancelled.
 */
export const deleteDeal = async (req, res) => {
  const { role, id: userId } = req.user
  const { id } = req.params
  const tenantId = getTenantId(req)

  try {
    const dealCheck = await pool.query(
      'SELECT * FROM deals WHERE deal_id = $1 AND tenant_id = $2',
      [id, tenantId]
    )
    if (dealCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Deal không tồn tại.' })
    }
    const deal = dealCheck.rows[0]
    if (deal.is_deleted) {
      return res.status(400).json({ success: false, message: 'Deal đã bị xóa trước đó.' })
    }

    const isAdmin = role === 'admin' || role === 'super_admin'
    const isOwner = deal.assigned_to === userId
    if (!isAdmin && !isOwner) {
      return res.status(403).json({
        success: false,
        message: 'Chỉ Admin hoặc người phụ trách deal mới được xóa deal. Nhân viên Sales chỉ có thể Hủy deal.'
      })
    }

    const now = Date.now()
    await pool.query(
      'UPDATE deals SET is_deleted = true, deleted_at = $1, updated_at = $1 WHERE deal_id = $2 AND tenant_id = $3',
      [now, id, tenantId]
    )

    syncKpiForDealsChange(tenantId, deal, null).catch((e) =>
      console.error('syncKpiForDealsChange (deleteDeal):', e)
    )

    // Detach tasks đang gắn deal: gỡ related_type/related_id (giữ parent_display_code
    // để có thể reattach khi khôi phục). Người dùng vẫn thấy task ở trang Công việc
    // nhưng nó không còn dẫn về deal đã xoá nữa.
    detachTasksFromDeletedDeal(id, tenantId)
      .then(async (count) => {
        if (count > 0) {
          try {
            await pool.query(
              `INSERT INTO deal_activities (id, deal_id, stage, content, type, created_by, tenant_id, created_at)
               VALUES ($1, $2, $3, $4, 'system', $5, $6, $7)`,
              [
                uuidv4(),
                id,
                deal.stage || null,
                `Cơ hội đã bị xoá. ${count} công việc liên quan đã được gỡ liên kết và giữ lại trên trang Công việc.`,
                userId || null,
                tenantId,
                now,
              ]
            )
          } catch (e) {
            console.error('deal_activities insert (deleteDeal):', e)
          }
        }
      })
      .catch((e) => console.error('detachTasksFromDeletedDeal:', e))

    res.json({
      success: true,
      message: 'Đã xóa deal (có thể khôi phục trong Thùng rác).'
    })
  } catch (error) {
    console.error('Lỗi deleteDeal:', error)
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi xóa deal.',
      error: error.message
    })
  }
}

/**
 * Danh sách deal đã xóa mềm (chỉ Admin) - dùng cho Thùng rác
 */
export const getDealsTrash = async (req, res) => {
  const tenantId = getTenantId(req)
  try {
    const result = await pool.query(
      `SELECT d.*,
        c.full_name as customer_full_name, c.phone as customer_phone,
        e.full_name as assigned_employee_name
       FROM deals d
       LEFT JOIN customers c ON d.customer_id = c.customer_id AND c.tenant_id = d.tenant_id
       LEFT JOIN employees e ON d.assigned_to = e.employee_id
       WHERE d.tenant_id = $1 AND (d.is_deleted = true)
       ORDER BY d.deleted_at DESC`,
      [tenantId]
    )
    res.json({ success: true, data: result.rows })
  } catch (error) {
    console.error('Lỗi getDealsTrash:', error)
    res.status(500).json({ success: false, message: 'Lỗi khi lấy danh sách deal đã xóa.', error: error.message })
  }
}

/**
 * Khôi phục deal đã xóa mềm (chỉ Admin)
 */
export const restoreDeal = async (req, res) => {
  const { id } = req.params
  const tenantId = getTenantId(req)
  try {
    const now = Date.now()
    const r = await pool.query(
      'UPDATE deals SET is_deleted = false, deleted_at = NULL, updated_at = $1 WHERE deal_id = $2 AND tenant_id = $3 AND is_deleted = true RETURNING *',
      [now, id, tenantId]
    )
    if (r.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Deal không tồn tại trong thùng rác hoặc đã được khôi phục.' })
    }
    const restored = r.rows[0]
    syncKpiForDealsChange(tenantId, null, restored).catch((e) =>
      console.error('syncKpiForDealsChange (restoreDeal):', e)
    )

    // Cố gắng gắn lại các task đã bị detach (parent_display_code khớp)
    if (restored?.display_code) {
      reattachTasksOnDealRestore(id, restored.display_code, tenantId)
        .then(async (count) => {
          if (count > 0) {
            try {
              await pool.query(
                `INSERT INTO deal_activities (id, deal_id, stage, content, type, created_by, tenant_id, created_at)
                 VALUES ($1, $2, $3, $4, 'system', $5, $6, $7)`,
                [
                  uuidv4(),
                  id,
                  restored.stage || null,
                  `Cơ hội đã được khôi phục. ${count} công việc cũ đã được gắn lại với cơ hội này.`,
                  null,
                  tenantId,
                  now,
                ]
              )
            } catch (e) {
              console.error('deal_activities insert (restoreDeal):', e)
            }
          }
        })
        .catch((e) => console.error('reattachTasksOnDealRestore:', e))
    }

    res.json({ success: true, message: 'Đã khôi phục deal.' })
  } catch (error) {
    console.error('Lỗi restoreDeal:', error)
    res.status(500).json({ success: false, message: 'Lỗi khi khôi phục deal.', error: error.message })
  }
}
