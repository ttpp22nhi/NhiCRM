/**
 * Gắn request_id + ip_client; ghi HTTP access log khi response xong.
 * Bỏ qua health/swagger/OPTIONS để giảm nhiễu.
 */
import { v4 as uuidv4 } from 'uuid'
import { getClientIp } from '../utils/clientIp.js'
import { getLogger, getRequestLogMeta } from '../services/appLogger.js'

const SKIP_PREFIXES = [
  '/api/health',
  '/api-docs',
  '/swagger.json',
  '/favicon',
]

function shouldSkip(req) {
  if (req.method === 'OPTIONS') return true
  const p = req.originalUrl || req.url || ''
  return SKIP_PREFIXES.some((x) => p === x || p.startsWith(`${x}/`) || p.startsWith(`${x}?`))
}

export function attachClientContext(req, _res, next) {
  req.requestId = req.headers['x-request-id']
    ? String(req.headers['x-request-id']).slice(0, 64)
    : uuidv4()
  req.clientIp = getClientIp(req)
  req.logStartedAt = Date.now()
  next()
}

export function requestAccessLogger(req, res, next) {
  if (shouldSkip(req)) return next()

  res.on('finish', () => {
    try {
      const durationMs = Date.now() - (req.logStartedAt || Date.now())
      const meta = getRequestLogMeta(req, {
        status: res.statusCode,
        duration_ms: durationMs,
      })
      const tenantId = meta.tenant_id
      const logger = getLogger(tenantId)
      const line = `${req.method} ${req.originalUrl || req.url} ${res.statusCode} ${durationMs}ms`

      if (res.statusCode >= 500) {
        logger.error(line, meta)
      } else if (res.statusCode >= 400) {
        logger.warn(line, meta)
      } else {
        logger.info(line, meta)
      }
    } catch {
      // Không để lỗi logger làm crash request
    }
  })

  next()
}
