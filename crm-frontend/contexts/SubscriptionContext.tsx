'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { apiClient } from '@/lib/api'

export interface TenantSubscription {
  is_active: boolean
  end_date: string | null
  expired: boolean
  end_date_formatted: string | null
  days_remaining: number | null
}

interface SubscriptionContextType {
  subscription: TenantSubscription | null
  loading: boolean
  /** Gói đã hết hạn -> disable Thêm/Sửa/Xóa */
  expired: boolean
  /** Số ngày còn lại (null nếu không có end_date hoặc đã hết hạn) */
  daysRemaining: number | null
  /** Còn dưới 15 ngày (hiển thị banner cảnh báo) */
  soonExpiring: boolean
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined)

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [subscription, setSubscription] = useState<TenantSubscription | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!user?.tenant_id) {
      setSubscription(null)
      return
    }
    let cancelled = false
    setLoading(true)
    apiClient
      .get('/api/tenant/subscription')
      .then((res) => {
        if (!cancelled && res.data?.success) setSubscription(res.data.data || null)
      })
      .catch(() => {
        if (!cancelled) setSubscription(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [user?.tenant_id])

  const expired = subscription?.expired ?? false
  const daysRemaining = subscription?.days_remaining ?? null
  const soonExpiring = daysRemaining !== null && daysRemaining < 15 && !expired

  const value: SubscriptionContextType = {
    subscription,
    loading,
    expired,
    daysRemaining,
    soonExpiring
  }

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  )
}

export function useSubscription() {
  const ctx = useContext(SubscriptionContext)
  if (ctx === undefined) throw new Error('useSubscription must be used within SubscriptionProvider')
  return ctx
}
