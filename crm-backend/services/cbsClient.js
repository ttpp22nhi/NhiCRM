/**
 * CBS (Mobifone) HTTP client.
 * - loginCbs: lấy Bearer accessToken
 * - fetchMonthlyReport: gọi /api/v1/report/export-report-online để lấy danh sách đơn hàng doanh thu của tháng
 */

const DEFAULT_TIMEOUT_MS = 45_000

function buildUrl(baseUrl, path) {
  const base = String(baseUrl || '').replace(/\/+$/, '')
  const p = String(path || '').replace(/^\/+/, '')
  return `${base}/${p}`
}

async function fetchJson(url, { method = 'GET', headers = {}, body, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController()
  const to = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...headers,
      },
      body: body == null ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
      signal: controller.signal,
    })
    const text = await res.text()
    let payload
    try {
      payload = text ? JSON.parse(text) : null
    } catch {
      payload = { _raw: text }
    }
    if (!res.ok) {
      const msg =
        (payload && (payload.message || payload.error || payload.resultMsg)) ||
        `HTTP ${res.status} ${res.statusText}`
      const err = new Error(`CBS ${method} ${url} → ${msg}`)
      err.status = res.status
      err.payload = payload
      throw err
    }
    return payload
  } finally {
    clearTimeout(to)
  }
}

/**
 * @param {{baseUrl:string, username:string, password:string}} cfg
 * @returns {Promise<{accessToken:string, info:object, type:string}>}
 */
export async function loginCbs(cfg) {
  if (!cfg?.username || !cfg?.password) {
    throw new Error('Thiếu username / password khi đăng nhập CBS.')
  }
  const url = buildUrl(cfg.baseUrl || 'https://cbs.mobifone.vn', '/api/v1/auth/login')
  const payload = await fetchJson(url, {
    method: 'POST',
    body: { userName: cfg.username, password: cfg.password },
  })
  if (!payload?.accessToken) {
    const err = new Error('CBS login không trả về accessToken.')
    err.payload = payload
    throw err
  }
  return {
    accessToken: payload.accessToken,
    type: payload.type || 'BEARER',
    info: payload.info || null,
  }
}

/**
 * @param {{baseUrl:string, accessToken:string, unit:number, reportConfigCode?:string, from:Date, to:Date}} args
 * @returns {Promise<Array<object>>}
 */
export async function fetchMonthlyReport({
  baseUrl = 'https://cbs.mobifone.vn',
  accessToken,
  unit,
  reportConfigCode = 'REPORT_INVOICING_PREPAID',
  from,
  to,
}) {
  if (!accessToken) throw new Error('Thiếu accessToken để gọi báo cáo CBS.')
  const fromStr = formatDDMMYYYY(from)
  const toStr = formatDDMMYYYY(to)
  const url = buildUrl(baseUrl, '/api/v1/report/export-report-online')
  const body = {
    reportConfigCode,
    param: JSON.stringify({
      unit: Number(unit) || 880,
      from_month_year: fromStr,
      to_month_year: toStr,
    }),
    docType: 'json',
    preview: 1,
  }
  const payload = await fetchJson(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body,
    timeoutMs: 60_000,
  })
  const code = String(payload?.resultCode ?? '0')
  if (code !== '0') {
    const err = new Error(`CBS trả resultCode=${code}: ${payload?.resultMsg || 'Lỗi không rõ'}`)
    err.payload = payload
    throw err
  }
  const d = payload?.data
  if (Array.isArray(d)) return d
  if (Array.isArray(d?.items)) return d.items
  if (Array.isArray(d?.rows)) return d.rows
  if (Array.isArray(payload?.items)) return payload.items
  return []
}

function formatDDMMYYYY(d) {
  const x = d instanceof Date ? d : new Date(d)
  // Luôn dùng UTC: from/to được tạo bằng Date.UTC — tránh server ở TZ khác VN gửi sai 01/04…/30/04.
  const dd = String(x.getUTCDate()).padStart(2, '0')
  const mm = String(x.getUTCMonth() + 1).padStart(2, '0')
  const yyyy = x.getUTCFullYear()
  return `${dd}/${mm}/${yyyy}`
}

/** Lấy [from, to] (Date) của tháng yyyy-mm theo lịch (first/last day), dùng UTC date components giống currentVNMonthRange. */
export function vnMonthRangeFromYyyyMm(yyyyMm) {
  const raw = String(yyyyMm || '').trim()
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) return null
  const [ys, mos] = raw.split('-')
  const y = parseInt(ys, 10)
  const m0 = parseInt(mos, 10) - 1
  if (m0 < 0 || m0 > 11) return null
  const from = new Date(Date.UTC(y, m0, 1))
  const to = new Date(Date.UTC(y, m0 + 1, 0))
  return { from, to, year: y, month: m0 + 1 }
}

/** Lấy [from, to] (Date) của tháng hiện tại theo giờ VN (GMT+7). */
export function currentVNMonthRange(now = new Date()) {
  // Quy về giờ VN để không bị lệch khi server chạy UTC.
  const vnNow = new Date(now.getTime() + 7 * 60 * 60 * 1000)
  const y = vnNow.getUTCFullYear()
  const m = vnNow.getUTCMonth()
  const from = new Date(Date.UTC(y, m, 1))
  const to = new Date(Date.UTC(y, m + 1, 0))
  return { from, to, year: y, month: m + 1 }
}

/**
 * Kỳ đồng bộ CBS mặc định theo giờ VN:
 * - Ngày 1: tháng trước (CBS còn đổ nốt dữ liệu tháng cũ)
 * - Từ ngày 2: tháng hiện tại
 */
export function defaultCbsSyncMonthRange(now = new Date()) {
  const vnNow = new Date(now.getTime() + 7 * 60 * 60 * 1000)
  let y = vnNow.getUTCFullYear()
  let m = vnNow.getUTCMonth() // 0-based
  const day = vnNow.getUTCDate()

  if (day === 1) {
    m -= 1
    if (m < 0) {
      m = 11
      y -= 1
    }
  }

  const from = new Date(Date.UTC(y, m, 1))
  const to = new Date(Date.UTC(y, m + 1, 0))
  return { from, to, year: y, month: m + 1 }
}
