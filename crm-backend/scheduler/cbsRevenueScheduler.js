/**
 * Lịch đồng bộ doanh thu CBS: chạy 06:00 và 18:00 hằng ngày theo giờ Việt Nam (Asia/Ho_Chi_Minh = UTC+7).
 * Không phụ thuộc thư viện cron để giữ footprint gọn.
 */

import { syncAllTenants } from '../services/cbsRevenueSyncService.js'
import { refreshKpiCustomerKindForAllTenants } from '../services/customerKindRefreshService.js'
import { createAutoTasksForAllTenants } from '../services/cbsAutoTaskService.js'

const VN_OFFSET_MS = 7 * 60 * 60 * 1000
const SCHEDULE_HOURS_VN = [6, 18] // 06:00 và 18:00 VN
const MAX_TIMER_MS = 2 ** 31 - 1 // ~24.8 ngày — an toàn cho setTimeout

let currentTimer = null
let started = false

function nextRunAtMs(nowMs = Date.now()) {
  // Quy đổi sang giờ VN rồi tìm giờ 06:00 / 18:00 gần nhất trong tương lai.
  const vnNow = nowMs + VN_OFFSET_MS
  const d = new Date(vnNow)
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()
  const day = d.getUTCDate()

  const candidates = []
  for (const h of SCHEDULE_HOURS_VN) {
    // Mốc hôm nay theo giờ VN, đổi về UTC ms
    const todayVnMs = Date.UTC(y, m, day, h, 0, 0) - VN_OFFSET_MS
    if (todayVnMs > nowMs) candidates.push(todayVnMs)
    // Mốc ngày mai
    candidates.push(Date.UTC(y, m, day + 1, h, 0, 0) - VN_OFFSET_MS)
  }
  return Math.min(...candidates)
}

function formatVN(ms) {
  const d = new Date(ms + VN_OFFSET_MS)
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mi = String(d.getUTCMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${mi} (GMT+7)`
}

async function runOnce() {
  const startedAt = Date.now()
  console.log(`[CBS scheduler] ⏰ Bắt đầu đồng bộ CBS (${formatVN(startedAt)})`)
  try {
    const results = await syncAllTenants()
    const ok = results.filter((r) => r.ok).length
    const fail = results.length - ok
    console.log(`[CBS scheduler] ✅ Đồng bộ: ${ok} thành công, ${fail} lỗi / ${results.length} tenant.`)
    for (const r of results) {
      if (r.ok) {
        console.log(`  • tenant=${r.tenantId} inserted=${r.inserted} updated=${r.updated} total=${r.total}`)
      } else {
        console.warn(`  • tenant=${r.tenantId} ERROR: ${r.error}`)
      }
    }
  } catch (err) {
    console.error('[CBS scheduler] ❌ Lỗi đồng bộ CBS:', err)
  }

  // Sau khi sync CBS: refresh NEW→EXISTING cho customers dựa vào deal/CBS đã có.
  try {
    const r = await refreshKpiCustomerKindForAllTenants()
    const totalPromoted = r.reduce((s, x) => s + (x.promoted || 0), 0)
    if (totalPromoted > 0) {
      console.log(`[CBS scheduler] 🔄 Đã chuyển ${totalPromoted} khách hàng NEW → EXISTING (${r.length} tenant).`)
    }
  } catch (err) {
    console.error('[CBS scheduler] ❌ Refresh kpi_customer_kind lỗi:', err)
  }

  // Sinh task nhắc xác nhận người bán cho đơn CBS còn "mồ côi".
  try {
    const r = await createAutoTasksForAllTenants()
    const totalCreated = r.reduce((s, x) => s + (x.created || 0), 0)
    if (totalCreated > 0) {
      console.log(`[CBS scheduler] 📝 Tạo ${totalCreated} task nhắc duyệt CBS (${r.length} tenant).`)
    }
  } catch (err) {
    console.error('[CBS scheduler] ❌ Auto-task CBS lỗi:', err)
  }
}

function scheduleNext() {
  const next = nextRunAtMs()
  const delay = Math.min(Math.max(next - Date.now(), 1000), MAX_TIMER_MS)
  console.log(`[CBS scheduler] Lần chạy kế tiếp: ${formatVN(next)} (sau ${Math.round(delay / 1000)}s).`)
  currentTimer = setTimeout(async () => {
    try {
      await runOnce()
    } finally {
      scheduleNext()
    }
  }, delay)
  if (typeof currentTimer.unref === 'function') currentTimer.unref()
}

export function startCbsScheduler() {
  if (started) return
  started = true
  console.log('[CBS scheduler] 🕒 Đã bật: tự động đồng bộ doanh thu CBS lúc 06:00 và 18:00 (giờ VN).')
  scheduleNext()
}

export function stopCbsScheduler() {
  if (currentTimer) clearTimeout(currentTimer)
  currentTimer = null
  started = false
}
