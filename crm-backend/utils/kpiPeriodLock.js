/**
 * Khóa cập nhật KPI “thực tế” (actuals) và hạn chỉnh chỉ tiêu cho tháng đã qua:
 * — Hạn xác nhận: tối đa ngày 05 (giờ VN) của tháng kế sau kỳ KPI.
 * — Từ 00:00 ngày 06 (VN) của tháng đó, kỳ được coi là đã chốt: không cho
 *   recompute actuals; không cho Quản lý/Lãnh đạo sửa chỉ tiêu (chỉ Admin).
 */

const VN_OFFSET_MS = 7 * 60 * 60 * 1000
export const KPI_CONFIRMATION_DEADLINE_DAY = 5

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/

function nextCalendarMonth(py, pm) {
  if (pm === 12) return { y: py + 1, m: 1 }
  return { y: py, m: pm + 1 }
}

/**
 * @param {string} periodYyyyMm
 * @returns {boolean}
 */
export function isKpiPeriodActualsLocked(periodYyyyMm) {
  const m = String(periodYyyyMm || '').trim()
  if (!PERIOD_RE.test(m)) return false
  const [yStr, moStr] = m.split('-')
  const py = parseInt(yStr, 10)
  const pm = parseInt(moStr, 10)
  const { y: ny, m: nm } = nextCalendarMonth(py, pm)

  const now = new Date(Date.now() + VN_OFFSET_MS)
  const cy = now.getUTCFullYear()
  const cmon = now.getUTCMonth() + 1
  const cd = now.getUTCDate()

  if (cy > ny) return true
  if (cy < ny) return false
  if (cmon > nm) return true
  if (cmon < nm) return false
  return cd > KPI_CONFIRMATION_DEADLINE_DAY
}

/**
 * Ngày deadline (ngày 5 tháng sau kỳ), format DD/MM/YYYY để hiển thị.
 * @param {string} periodYyyyMm
 * @returns {string|null}
 */
export function formatKpiConfirmationDeadlineDdMmYyyy(periodYyyyMm) {
  const m = String(periodYyyyMm || '').trim()
  if (!PERIOD_RE.test(m)) return null
  const [yStr, moStr] = m.split('-')
  const py = parseInt(yStr, 10)
  const pm = parseInt(moStr, 10)
  const { y: ny, m: nm } = nextCalendarMonth(py, pm)
  return `${String(KPI_CONFIRMATION_DEADLINE_DAY).padStart(2, '0')}/${String(nm).padStart(2, '0')}/${ny}`
}
