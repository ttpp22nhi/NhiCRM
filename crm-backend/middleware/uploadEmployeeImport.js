import multer from 'multer'

const storage = multer.memoryStorage()

export const uploadEmployeeImportExcel = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = String(file.originalname || '').toLowerCase()
    const ok = name.endsWith('.xlsx') || name.endsWith('.xls')
    cb(
      ok ? null : new Error('Chỉ chấp nhận file Excel (.xlsx hoặc .xls).'),
      ok
    )
  },
})
