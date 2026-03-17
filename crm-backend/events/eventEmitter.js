import { EventEmitter } from 'events'

/**
 * EventEmitter trung tâm cho toàn ứng dụng (event-driven automation).
 * Dùng emit() để phát sự kiện; các listener đăng ký qua .on().
 */
const centralEmitter = new EventEmitter()

// Tăng giới hạn listener nếu cần (mặc định 10)
centralEmitter.setMaxListeners(20)

// ---------- Tên sự kiện (constants) ----------
export const EVENT_DEAL_STAGE_CHANGED = 'deal.stage_changed'

export default centralEmitter
