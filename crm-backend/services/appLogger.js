/**
 * File logger theo ngày + tenant.
 * - logs/system/app-YYYY-MM-DD.log          (không tenant / hệ thống)
 * - logs/tenants/<tenantId>/app-YYYY-MM-DD.log
 * - error-YYYY-MM-DD.log cùng thư mục (chỉ error)
 * Retention: 60 ngày (2 tháng), gzip ngày cũ.
 *
 * Đường dẫn mặc định: tương đối ./logs (theo process.cwd khi chạy npm start).
 * LOG_DIR chỉ nên set relative (vd: logs, ./logs) — tránh hard-code ổ đĩa khi deploy.
 *
 * Dùng: import { appLog, getRequestLogMeta } from './services/appLogger.js'
 */
import fs from 'fs'
import path from 'path'
import winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'
import { getClientIp } from '../utils/clientIp.js'

/** Relative mặc định — resolve theo cwd lúc runtime (không gắn ổ E:/…). */
const DEFAULT_LOG_DIR_REL = 'logs'

/**
 * Chuẩn hoá thư mục log: ưu tiên relative để deploy portable.
 * - LOG_DIR trống / không set → ./logs (cwd)
 * - LOG_DIR=logs hoặc ./logs → resolve từ cwd
 * - Absolute chỉ khi cố ý set (hiếm)
 */
function resolveLogRootDir() {
  const raw = String(process.env.LOG_DIR || DEFAULT_LOG_DIR_REL).trim() || DEFAULT_LOG_DIR_REL
  if (path.isAbsolute(raw)) {
    return path.normalize(raw)
  }
  return path.resolve(process.cwd(), raw)
}

const ROOT_LOG_DIR = resolveLogRootDir()
/** Giá trị relative để hiển thị / config (không lộ absolute trong log meta mặc định). */
const LOG_DIR_DISPLAY = path.isAbsolute(String(process.env.LOG_DIR || '').trim())
  ? ROOT_LOG_DIR
  : path.relative(process.cwd(), ROOT_LOG_DIR) || DEFAULT_LOG_DIR_REL

const RETENTION = process.env.LOG_RETENTION || '60d'
const LEVEL = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug')

const { combine, timestamp, errors, printf, json } = winston.format

const lineFormat = printf(({ timestamp: ts, level, message, ...meta }) => {
  const rest = { ...meta }
  delete rest.service
  const metaStr = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : ''
  return `${ts} ${level.toUpperCase()} ${message}${metaStr}`
})

/** Chỉ cho phép ký tự an toàn trong tên thư mục tenant. */
export function safeTenantDirName(tenantId) {
  const raw = String(tenantId || '').trim()
  if (!raw) return null
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)
  return cleaned || null
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

/** @type {Map<string, winston.Logger>} */
const loggerCache = new Map()

function createRotateTransport(dirname, filenamePrefix, level) {
  return new DailyRotateFile({
    dirname,
    filename: `${filenamePrefix}-%DATE%.log`,
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxFiles: RETENTION,
    maxSize: '20m',
    auditFile: path.join(dirname, `.${filenamePrefix}-audit.json`),
  })
}

function buildLogger(dirKey, dirname) {
  ensureDir(dirname)

  const transports = [
    createRotateTransport(dirname, 'app', LEVEL),
    createRotateTransport(dirname, 'error', 'error'),
  ]

  if (process.env.LOG_CONSOLE !== '0') {
    transports.push(
      new winston.transports.Console({
        level: LEVEL,
        format: combine(
          timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
          errors({ stack: true }),
          lineFormat
        ),
      })
    )
  }

  return winston.createLogger({
    level: LEVEL,
    defaultMeta: { service: 'crm-backend', log_scope: dirKey },
    format: combine(
      timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
      errors({ stack: true }),
      json()
    ),
    transports,
    exitOnError: false,
  })
}

/**
 * Logger theo tenant (hoặc system nếu không có tenant_id).
 * @param {string|null|undefined} tenantId
 */
export function getLogger(tenantId) {
  const safe = safeTenantDirName(tenantId)
  const dirKey = safe ? `tenant:${safe}` : 'system'
  if (loggerCache.has(dirKey)) return loggerCache.get(dirKey)

  const dirname = safe
    ? path.join(ROOT_LOG_DIR, 'tenants', safe)
    : path.join(ROOT_LOG_DIR, 'system')

  const logger = buildLogger(dirKey, dirname)
  loggerCache.set(dirKey, logger)
  return logger
}

/** Logger hệ thống (scheduler, bootstrap, không gắn tenant). */
export function systemLog() {
  return getLogger(null)
}

/**
 * Meta chuẩn từ Express request.
 */
export function getRequestLogMeta(req, extra = {}) {
  const tenantId =
    req?.tenantId ||
    req?.user?.tenant_id ||
    extra.tenant_id ||
    null
  return {
    request_id: req?.requestId || null,
    ip_client: req?.clientIp || getClientIp(req),
    tenant_id: tenantId || null,
    user_id: req?.user?.id || req?.user?.user_id || null,
    username: req?.user?.username || null,
    role: req?.user?.role || null,
    method: req?.method || null,
    path: req?.originalUrl || req?.url || null,
    user_agent: req?.headers?.['user-agent']
      ? String(req.headers['user-agent']).slice(0, 200)
      : null,
    ...extra,
  }
}

/**
 * Ghi log gắn tenant từ meta hoặc req.
 */
export function appLog(level, message, meta = {}, req = null) {
  const fromReq = req ? getRequestLogMeta(req) : {}
  const merged = { ...fromReq, ...meta }
  const tenantId = merged.tenant_id || null
  const logger = getLogger(tenantId)
  const fn = typeof logger[level] === 'function' ? logger[level].bind(logger) : logger.info.bind(logger)
  fn(message, merged)
}

export function logInfo(message, meta, req) {
  appLog('info', message, meta || {}, req)
}
export function logWarn(message, meta, req) {
  appLog('warn', message, meta || {}, req)
}
export function logError(message, meta, req) {
  appLog('error', message, meta || {}, req)
}
export function logDebug(message, meta, req) {
  appLog('debug', message, meta || {}, req)
}

export function getLogDirRelative() {
  return LOG_DIR_DISPLAY
}

export function getLogDirAbsolute() {
  return ROOT_LOG_DIR
}

ensureDir(ROOT_LOG_DIR)
ensureDir(path.join(ROOT_LOG_DIR, 'system'))
ensureDir(path.join(ROOT_LOG_DIR, 'tenants'))

systemLog().info('App logger ready', {
  log_dir: LOG_DIR_DISPLAY,
  retention: RETENTION,
  level: LEVEL,
})
