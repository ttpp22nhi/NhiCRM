import pool from '../database.js'
import { v4 as uuidv4 } from 'uuid'
import jwt from 'jsonwebtoken'
import { getTenantId } from '../utils/tenantHelper.js'
import { getAccessScope, buildDealFilter } from '../services/permissionService.js'
import path from 'path'
import fs from 'fs'

const JWT_SECRET = process.env.JWT_SECRET || 'crm_secret_key_2025'
const PREVIEW_TOKEN_EXPIRY_SEC = 300 // 5 phút

/**
 * Kiểm tra user có quyền xem deal (cùng tenant + scope read)
 */
async function canAccessDeal(userId, dealId, tenantId) {
  const dealRow = await pool.query(
    'SELECT deal_id, assigned_to FROM deals WHERE deal_id = $1 AND tenant_id = $2 AND (COALESCE(is_deleted, false) = false)',
    [dealId, tenantId]
  )
  if (dealRow.rows.length === 0) return false
  const access = await getAccessScope(userId, 'deals', 'read', tenantId)
  const { clause, params } = buildDealFilter(access, 3)
  const check = await pool.query(
    `SELECT 1 FROM deals d WHERE d.deal_id = $1 AND d.tenant_id = $2 AND (${clause})`,
    [dealId, tenantId, ...params]
  )
  return check.rows.length > 0
}

/**
 * GET /api/deals/:id/activities - Lấy timeline (activities) của deal
 */
export const getDealActivities = async (req, res) => {
  const { id: userId } = req.user
  const { id: dealId } = req.params
  const tenantId = getTenantId(req)

  try {
    const allowed = await canAccessDeal(userId, dealId, tenantId)
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền xem deal này.' })
    }

    const result = await pool.query(
      `SELECT a.id, a.deal_id, a.stage, a.content, a.type, a.created_by, a.created_at, a.task_id,
        e.full_name as created_by_name
       FROM deal_activities a
       LEFT JOIN employees e ON a.created_by = e.employee_id
       WHERE a.deal_id = $1 AND a.tenant_id = $2
       ORDER BY a.created_at DESC`,
      [dealId, tenantId]
    )

    res.json({ success: true, data: result.rows })
  } catch (error) {
    console.error('getDealActivities:', error)
    res.status(500).json({ success: false, message: 'Lỗi khi lấy hoạt động deal.', error: error.message })
  }
}

/**
 * POST /api/deals/:id/activities - Thêm ghi chú (note) vào timeline
 */
export const addDealNote = async (req, res) => {
  const { id: userId } = req.user
  const { id: dealId } = req.params
  const { content } = req.body
  const tenantId = getTenantId(req)

  try {
    const allowed = await canAccessDeal(userId, dealId, tenantId)
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền thêm ghi chú cho deal này.' })
    }

    const dealRow = await pool.query(
      'SELECT stage FROM deals WHERE deal_id = $1 AND tenant_id = $2',
      [dealId, tenantId]
    )
    const currentStage = dealRow.rows[0]?.stage || null

    const text = (content && String(content).trim()) ? String(content).trim() : ''
    if (!text) {
      return res.status(400).json({ success: false, message: 'Nội dung ghi chú không được để trống.' })
    }

    const id = uuidv4()
    const now = Date.now()
    await pool.query(
      `INSERT INTO deal_activities (id, deal_id, stage, content, type, created_by, tenant_id, created_at)
       VALUES ($1, $2, $3, $4, 'note', $5, $6, $7)`,
      [id, dealId, currentStage, text, userId, tenantId, now]
    )

    const row = await pool.query(
      `SELECT a.id, a.deal_id, a.stage, a.content, a.type, a.created_by, a.created_at,
        e.full_name as created_by_name
       FROM deal_activities a
       LEFT JOIN employees e ON a.created_by = e.employee_id
       WHERE a.id = $1`,
      [id]
    )

    res.status(201).json({ success: true, message: 'Đã thêm ghi chú.', data: row.rows[0] })
  } catch (error) {
    console.error('addDealNote:', error)
    res.status(500).json({ success: false, message: 'Lỗi khi thêm ghi chú.', error: error.message })
  }
}

/**
 * GET /api/deals/:id/attachments - Lấy danh sách tài liệu tổng hợp cho Deal
 * Bao gồm: file của Deal (owner_type=DEAL, owner_id=dealId) và file của Task liên quan (context_deal_id=dealId).
 * Chỉ user cùng tenant_id mới được truy vấn.
 */
export const getDealAttachments = async (req, res) => {
  const { id: userId } = req.user
  const { id: dealId } = req.params
  const tenantId = getTenantId(req)

  try {
    const allowed = await canAccessDeal(userId, dealId, tenantId)
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền xem tài liệu deal này.' })
    }

    const result = await pool.query(
      `SELECT a.id, a.deal_id, a.stage, a.doc_type, a.file_name, a.file_path, a.file_size, a.uploaded_by, a.created_at,
        a.owner_type, a.owner_id, a.context_deal_id,
        e.full_name as uploaded_by_name
       FROM deal_attachments a
       LEFT JOIN employees e ON a.uploaded_by = e.employee_id
       WHERE a.tenant_id = $1
         AND (
           (a.owner_type = 'DEAL' AND a.owner_id = $2)
           OR a.context_deal_id = $2
           OR (a.deal_id = $2 AND a.owner_type IS NULL)
         )
       ORDER BY a.created_at DESC`,
      [tenantId, dealId]
    )

    res.json({ success: true, data: result.rows })
  } catch (error) {
    console.error('getDealAttachments:', error)
    res.status(500).json({ success: false, message: 'Lỗi khi lấy tài liệu.', error: error.message })
  }
}

/**
 * POST /api/deals/:id/upload - Upload file đính kèm (multer .single('file'))
 * req.file được gắn bởi middleware uploadDealFile
 */
export const uploadDealAttachment = async (req, res) => {
  const { id: userId } = req.user
  const { id: dealId } = req.params
  const tenantId = getTenantId(req)
  const docTypeRaw = req.body?.doc_type
  const docType = docTypeRaw != null && String(docTypeRaw).trim() ? String(docTypeRaw).trim().slice(0, 50) : null

  if (!req.file || !req.file.path) {
    return res.status(400).json({ success: false, message: 'Chưa chọn file hoặc định dạng không hợp lệ. Chỉ chấp nhận: .jpg, .png, .pdf, .docx, .xlsx (tối đa 10MB).' })
  }

  try {
    const allowed = await canAccessDeal(userId, dealId, tenantId)
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền đính kèm tài liệu cho deal này.' })
    }

    const dealRow = await pool.query(
      'SELECT stage FROM deals WHERE deal_id = $1 AND tenant_id = $2',
      [dealId, tenantId]
    )
    const currentStage = dealRow.rows[0]?.stage || null

    const filePathRelative = path.relative(process.cwd(), req.file.path)
    const fileName = req.file.originalname || path.basename(req.file.path)
    const fileSize = req.file.size || 0

    const id = uuidv4()
    const now = Date.now()
    await pool.query(
      `INSERT INTO deal_attachments (id, deal_id, stage, doc_type, file_name, file_path, file_size, uploaded_by, tenant_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [id, dealId, currentStage, docType, fileName, filePathRelative, fileSize, userId, tenantId, now]
    )

    const row = await pool.query(
      `SELECT id, deal_id, stage, doc_type, file_name, file_path, file_size, uploaded_by, created_at
       FROM deal_attachments WHERE id = $1`,
      [id]
    )

    res.status(201).json({ success: true, message: 'Đã tải lên tài liệu.', data: row.rows[0] })
  } catch (error) {
    console.error('uploadDealAttachment:', error)
    res.status(500).json({ success: false, message: 'Lỗi khi tải lên file.', error: error.message })
  }
}

/**
 * GET /api/deals/download/:fileId - Stream file (kiểm tra tenant_id)
 */
export const downloadDealAttachment = async (req, res) => {
  const { id: userId } = req.user
  const { fileId } = req.params
  const tenantId = getTenantId(req)

  try {
    const row = await pool.query(
      'SELECT id, deal_id, context_deal_id, file_name, file_path, tenant_id FROM deal_attachments WHERE id = $1',
      [fileId]
    )
    if (row.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'File không tồn tại.' })
    }
    const att = row.rows[0]
    if (att.tenant_id !== tenantId) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền tải file này.' })
    }

    const dealIdToCheck = att.deal_id || att.context_deal_id
    if (!dealIdToCheck) {
      return res.status(403).json({ success: false, message: 'Tài liệu không liên kết deal.' })
    }
    const allowed = await canAccessDeal(userId, dealIdToCheck, tenantId)
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền tải tài liệu deal này.' })
    }

    const fullPath = path.join(process.cwd(), att.file_path)
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ success: false, message: 'File không tìm thấy trên đĩa.' })
    }

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(att.file_name)}"`)
    res.setHeader('Content-Type', 'application/octet-stream')
    const stream = fs.createReadStream(fullPath)
    stream.pipe(res)
  } catch (error) {
    console.error('downloadDealAttachment:', error)
    res.status(500).json({ success: false, message: 'Lỗi khi tải file.', error: error.message })
  }
}

/**
 * Trả về Content-Type phù hợp để trình duyệt hiển thị (preview)
 */
function getContentTypeForPreview(fileName) {
  const ext = (fileName || '').split('.').pop()?.toLowerCase()
  const map = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    pdf: 'application/pdf'
  }
  return map[ext] || 'application/octet-stream'
}

/**
 * GET /api/deals/attachments/:fileId/preview-url
 * Trả về Temporary Signed URL để xem file (chỉ khi user có quyền xem deal).
 * Kiểm tra attachment.tenant_id và quyền deal trước khi sinh token.
 */
export const getPreviewUrl = async (req, res) => {
  const { id: userId } = req.user
  const { fileId } = req.params
  const tenantId = getTenantId(req)

  try {
    const row = await pool.query(
      'SELECT id, deal_id, context_deal_id, file_name, file_path, tenant_id FROM deal_attachments WHERE id = $1',
      [fileId]
    )
    if (row.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'File không tồn tại.' })
    }
    const att = row.rows[0]
    if (att.tenant_id !== tenantId) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền xem file này.' })
    }

    const dealIdToCheck = att.deal_id || att.context_deal_id
    if (!dealIdToCheck) {
      return res.status(403).json({ success: false, message: 'Tài liệu không liên kết deal.' })
    }
    const allowed = await canAccessDeal(userId, dealIdToCheck, tenantId)
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền xem tài liệu deal này.' })
    }

    const ext = (att.file_name || '').split('.').pop()?.toLowerCase()
    const previewable = ['jpg', 'jpeg', 'png', 'pdf'].includes(ext)
    if (!previewable) {
      return res.status(400).json({
        success: false,
        message: 'Chỉ hỗ trợ xem nhanh file .jpg, .png, .pdf. Các loại khác vui lòng tải xuống.'
      })
    }

    const token = jwt.sign(
      { fileId, tenantId, exp: Math.floor(Date.now() / 1000) + PREVIEW_TOKEN_EXPIRY_SEC },
      JWT_SECRET
    )
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`
    const url = `${baseUrl}/api/deals/attachments/${fileId}/preview?token=${token}`

    res.json({ success: true, data: { url } })
  } catch (error) {
    console.error('getPreviewUrl:', error)
    res.status(500).json({ success: false, message: 'Lỗi khi tạo link xem.', error: error.message })
  }
}

/**
 * GET /api/deals/attachments/:fileId/preview?token=...
 * Stream file với Content-Disposition: inline để trình duyệt hiển thị (không tải xuống).
 * Không dùng verifyToken; quyền được xác minh qua JWT trong query.
 */
export const streamPreview = async (req, res) => {
  const { fileId } = req.params
  const { token } = req.query

  if (!token || typeof token !== 'string') {
    return res.status(401).json({ success: false, message: 'Thiếu token xem file.' })
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    if (decoded.fileId !== fileId) {
      return res.status(403).json({ success: false, message: 'Token không khớp file.' })
    }

    const row = await pool.query(
      'SELECT id, deal_id, context_deal_id, file_name, file_path, tenant_id FROM deal_attachments WHERE id = $1',
      [fileId]
    )
    if (row.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'File không tồn tại.' })
    }
    const att = row.rows[0]
    if (att.tenant_id !== decoded.tenantId) {
      return res.status(403).json({ success: false, message: 'Token không hợp lệ.' })
    }

    const fullPath = path.join(process.cwd(), att.file_path)
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ success: false, message: 'File không tìm thấy trên đĩa.' })
    }

    const contentType = getContentTypeForPreview(att.file_name)
    res.setHeader('Content-Type', contentType)
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(att.file_name)}"`)
    const stream = fs.createReadStream(fullPath)
    stream.pipe(res)
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Link xem file đã hết hạn.' })
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, message: 'Token không hợp lệ.' })
    }
    console.error('streamPreview:', err)
    res.status(500).json({ success: false, message: 'Lỗi khi xem file.', error: err.message })
  }
}

/**
 * Middleware: load attachment by fileId, check quyền, gắn req._replaceAttachment và req._replaceDealId cho route thay file
 */
export const loadAttachmentForReplace = async (req, res, next) => {
  const { id: userId } = req.user
  const { fileId } = req.params
  const tenantId = getTenantId(req)

  try {
    const row = await pool.query(
      'SELECT id, deal_id, file_name, file_path, tenant_id FROM deal_attachments WHERE id = $1',
      [fileId]
    )
    if (row.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'File không tồn tại.' })
    }
    const att = row.rows[0]
    if (att.tenant_id !== tenantId) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền sửa file này.' })
    }
    const allowed = await canAccessDeal(userId, att.deal_id, tenantId)
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền sửa tài liệu deal này.' })
    }
    req._replaceAttachment = att
    req._replaceDealId = att.deal_id
    next()
  } catch (error) {
    console.error('loadAttachmentForReplace:', error)
    res.status(500).json({ success: false, message: 'Lỗi kiểm tra quyền.', error: error.message })
  }
}

/**
 * PATCH /api/deals/attachments/:fileId - Thay file (multipart, field "file")
 * Middleware: loadAttachmentForReplace -> uploadDealFileReplace -> replaceDealAttachment
 */
export const replaceDealAttachment = async (req, res) => {
  const { id: userId } = req.user
  const { fileId } = req.params
  const tenantId = getTenantId(req)
  const oldAtt = req._replaceAttachment

  if (!req.file || !req.file.path) {
    return res.status(400).json({ success: false, message: 'Chưa chọn file hoặc định dạng không hợp lệ. Chỉ chấp nhận: .jpg, .png, .pdf, .docx, .xlsx (tối đa 10MB).' })
  }

  try {
    const fullPathOld = path.join(process.cwd(), oldAtt.file_path)
    if (fs.existsSync(fullPathOld)) {
      try {
        fs.unlinkSync(fullPathOld)
      } catch (e) {
        console.warn('replaceDealAttachment: could not unlink old file', fullPathOld, e)
      }
    }

    const filePathRelative = path.relative(process.cwd(), req.file.path)
    const fileName = req.file.originalname || path.basename(req.file.path)
    const fileSize = req.file.size || 0

    await pool.query(
      'UPDATE deal_attachments SET file_name = $1, file_path = $2, file_size = $3 WHERE id = $4 AND tenant_id = $5',
      [fileName, filePathRelative, fileSize, fileId, tenantId]
    )

    const updated = await pool.query(
      `SELECT a.id, a.deal_id, a.stage, a.doc_type, a.file_name, a.file_path, a.file_size, a.uploaded_by, a.created_at,
        e.full_name as uploaded_by_name
       FROM deal_attachments a
       LEFT JOIN employees e ON a.uploaded_by = e.employee_id
       WHERE a.id = $1`,
      [fileId]
    )

    res.json({ success: true, message: 'Đã thay file.', data: updated.rows[0] })
  } catch (error) {
    console.error('replaceDealAttachment:', error)
    res.status(500).json({ success: false, message: 'Lỗi khi thay file.', error: error.message })
  }
}

/**
 * DELETE /api/deals/attachments/:fileId - Xóa file đính kèm (và file trên đĩa nếu có)
 */
export const deleteDealAttachment = async (req, res) => {
  const { id: userId } = req.user
  const { fileId } = req.params
  const tenantId = getTenantId(req)

  try {
    const row = await pool.query(
      'SELECT id, deal_id, file_path, tenant_id FROM deal_attachments WHERE id = $1',
      [fileId]
    )
    if (row.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'File không tồn tại.' })
    }
    const att = row.rows[0]
    if (att.tenant_id !== tenantId) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền xóa file này.' })
    }

    const allowed = await canAccessDeal(userId, att.deal_id, tenantId)
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền xóa tài liệu deal này.' })
    }

    const fullPath = path.join(process.cwd(), att.file_path)
    if (fs.existsSync(fullPath)) {
      try {
        fs.unlinkSync(fullPath)
      } catch (e) {
        console.warn('deleteDealAttachment: could not unlink file', fullPath, e)
      }
    }

    await pool.query('DELETE FROM deal_attachments WHERE id = $1 AND tenant_id = $2', [fileId, tenantId])

    res.json({ success: true, message: 'Đã xóa tài liệu.' })
  } catch (error) {
    console.error('deleteDealAttachment:', error)
    res.status(500).json({ success: false, message: 'Lỗi khi xóa file.', error: error.message })
  }
}
