/** Khớp với crm-backend/utils/kpiPeriodLock.js — hạn chốt ngày 5 (VN) tháng sau kỳ. */

const VN_TZ_OFFSET_MS = 7 * 60 * 60 * 1000
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/
export const KPI_CONFIRMATION_DEADLINE_DAY = 5

function nextCalendarMonth(py: number, pm: number) {
  if (pm === 12) return { y: py + 1, m: 1 }
  return { y: py, m: pm + 1 }
}

export function isKpiPeriodActualsLocked(periodYyyyMm: string): boolean {
  const m = String(periodYyyyMm || '').trim()
  if (!PERIOD_RE.test(m)) return false
  const [yStr, moStr] = m.split('-')
  const py = parseInt(yStr, 10)
  const pm = parseInt(moStr, 10)
  const { y: ny, m: nm } = nextCalendarMonth(py, pm)

  const now = new Date(Date.now() + VN_TZ_OFFSET_MS)
  const cy = now.getUTCFullYear()
  const cmon = now.getUTCMonth() + 1
  const cd = now.getUTCDate()

  if (cy > ny) return true
  if (cy < ny) return false
  if (cmon > nm) return true
  if (cmon < nm) return false
  return cd > KPI_CONFIRMATION_DEADLINE_DAY
}

export function formatKpiConfirmationDeadlineDdMmYyyy(periodYyyyMm: string): string | null {
  const m = String(periodYyyyMm || '').trim()
  if (!PERIOD_RE.test(m)) return null
  const [yStr, moStr] = m.split('-')
  const py = parseInt(yStr, 10)
  const pm = parseInt(moStr, 10)
  const { y: ny, m: nm } = nextCalendarMonth(py, pm)
  return `${String(KPI_CONFIRMATION_DEADLINE_DAY).padStart(2, '0')}/${String(nm).padStart(2, '0')}/${ny}`
}
