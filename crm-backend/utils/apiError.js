export function buildErrorMeta(error) {
  const code = error?.code ? String(error.code) : 'INTERNAL_ERROR'
  const detail = error?.detail || error?.message || 'Unknown error'

  const dbCodeMap = {
    '23505': { status: 409, type: 'db_unique_violation' },
    '23503': { status: 400, type: 'db_foreign_key_violation' },
    '23502': { status: 400, type: 'db_not_null_violation' },
    '22P02': { status: 400, type: 'db_invalid_text_representation' },
    '22001': { status: 400, type: 'db_string_data_right_truncation' },
    '42P01': { status: 500, type: 'db_undefined_table' }
  }

  const mapped = dbCodeMap[code]
  return {
    status: mapped?.status || 500,
    error_code: code,
    error_type: mapped?.type || 'internal_error',
    error_detail: detail
  }
}

export function sendApiError(res, error, fallbackMessage = 'Đã có lỗi xảy ra.') {
  const meta = buildErrorMeta(error)
  return res.status(meta.status).json({
    success: false,
    message: fallbackMessage,
    error_code: meta.error_code,
    error_type: meta.error_type,
    error_detail: meta.error_detail
  })
}

