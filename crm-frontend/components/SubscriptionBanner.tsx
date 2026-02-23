'use client'

import { useSubscription } from '@/contexts/SubscriptionContext'
import { AlertTriangle, Calendar } from 'lucide-react'

export function SubscriptionBanner() {
  const { expired, daysRemaining, soonExpiring, subscription } = useSubscription()

  if (expired && subscription?.end_date_formatted) {
    return (
      <div className="bg-red-600 text-white px-3 py-2 text-center text-sm font-medium flex items-center justify-center gap-2 flex-wrap">
        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
        <span>
          Gói dịch vụ đã hết hạn vào ngày {subscription.end_date_formatted}. Vui lòng gia hạn để tiếp tục sử dụng. Hiện bạn chỉ có thể xem dữ liệu.
        </span>
      </div>
    )
  }

  if (soonExpiring && daysRemaining !== null) {
    return (
      <div className="bg-amber-500 text-white px-3 py-2 text-center text-sm font-medium flex items-center justify-center gap-2 flex-wrap">
        <Calendar className="w-4 h-4 flex-shrink-0" />
        <span>
          Gói dịch vụ của bạn sẽ hết hạn sau {daysRemaining} ngày. Vui lòng gia hạn để tiếp tục sử dụng đầy đủ tính năng.
        </span>
      </div>
    )
  }

  return null
}
