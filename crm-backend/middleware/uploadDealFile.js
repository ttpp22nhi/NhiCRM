import multer from 'multer'
import path from 'path'
import fs from 'fs'

const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.pdf', '.docx', '.xlsx']
const MAX_SIZE = 10 * 1024 * 1024 // 10MB

function getExt(originalname) {
  const raw = path.extname((originalname || '').trim()).toLowerCase().trim()
  const ext = raw.replace(/\s+/g, '')
  return ALLOWED_EXT.includes(ext) ? ext : null
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const tenantId = (req.tenantId || req.tenant_id || '').toString().replace(/[^a-zA-Z0-9_-]/g, '') || 'unknown'
    const dealId = (req.params?.id || req.params?.dealId || '').toString().replace(/[^a-zA-Z0-9-]/g, '') || 'unknown'
    const dir = path.join(process.cwd(), 'storage', tenantId, 'deals', dealId)
    fs.mkdirSync(dir, { recursive: true })
    cb(null, dir)
  },
  filename(req, file, cb) {
    const ext = getExt(file.originalname) || '.bin'
    const base = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    cb(null, base + ext)
  }
})

const fileFilter = (req, file, cb) => {
  const ext = getExt(file.originalname)
  if (!ext) {
    return cb(new Error('Chỉ chấp nhận file: .jpg, .png, .pdf, .docx, .xlsx'), false)
  }
  cb(null, true)
}

const multerUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE }
}).single('file')

/** Storage cho thay file: dùng req._replaceDealId (set bởi loadAttachmentForReplace) */
const storageReplace = multer.diskStorage({
  destination(req, file, cb) {
    const tenantId = (req.tenantId || req.tenant_id || '').toString().replace(/[^a-zA-Z0-9_-]/g, '') || 'unknown'
    const dealId = (req._replaceDealId || '').toString().replace(/[^a-zA-Z0-9-]/g, '') || 'unknown'
    const dir = path.join(process.cwd(), 'storage', tenantId, 'deals', dealId)
    fs.mkdirSync(dir, { recursive: true })
    cb(null, dir)
  },
  filename(req, file, cb) {
    const ext = getExt(file.originalname) || '.bin'
    const base = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    cb(null, base + ext)
  }
})

const multerReplace = multer({
  storage: storageReplace,
  fileFilter,
  limits: { fileSize: MAX_SIZE }
}).single('file')

export const uploadDealFile = (req, res, next) => {
  multerUpload(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, message: 'File vượt quá 10MB.' })
      }
      return res.status(400).json({ success: false, message: err.message || 'Lỗi tải file.' })
    }
    if (!req.file && !err) {
      return res.status(400).json({
        success: false,
        message: 'Không nhận được file. Gửi form với field tên "file" (multipart/form-data).'
      })
    }
    next()
  })
}

export const uploadDealFileReplace = (req, res, next) => {
  multerReplace(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, message: 'File vượt quá 10MB.' })
      }
      return res.status(400).json({ success: false, message: err.message || 'Lỗi tải file.' })
    }
    if (!req.file && !err) {
      return res.status(400).json({
        success: false,
        message: 'Không nhận được file. Gửi form với field tên "file" (multipart/form-data).'
      })
    }
    next()
  })
}
