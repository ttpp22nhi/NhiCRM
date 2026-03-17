'use client'

import { useState, useEffect } from 'react'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { Navbar } from '@/components/Navbar'
import { apiClient } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import Link from 'next/link'
import { ArrowLeft, Loader2, RotateCcw } from 'lucide-react'
import toast from 'react-hot-toast'

interface TrashDeal {
  deal_id: string
  title: string
  amount: number
  stage: string
  status: string
  loss_reason?: string | null
  customer_full_name?: string
  assigned_employee_name?: string
  deleted_at?: number
}

export default function DealsTrashPage() {
  const { user } = useAuth()
  const [deals, setDeals] = useState<TrashDeal[]>([])
  const [loading, setLoading] = useState(true)

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin'

  useEffect(() => {
    if (isAdmin) fetchTrash()
    else setLoading(false)
  }, [isAdmin])

  const fetchTrash = async () => {
    try {
      setLoading(true)
      const response = await apiClient.get('/api/deals/trash')
      if (response.data.success) {
        setDeals(response.data.data || [])
      }
    } catch (error: any) {
      console.error('Error fetching trash:', error)
      toast.error(error.response?.data?.message || 'Không thể tải thùng rác')
    } finally {
      setLoading(false)
    }
  }

  const handleRestore = async (dealId: string) => {
    try {
      await apiClient.post(`/api/deals/${dealId}/restore`)
      toast.success('Đã khôi phục deal.')
      fetchTrash()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Không thể khôi phục')
    }
  }

  const formatDate = (ts?: number) => {
    if (!ts) return '—'
    const d = new Date(ts.toString().length <= 10 ? ts * 1000 : ts)
    return d.toLocaleString('vi-VN')
  }

  if (!isAdmin) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50">
          <Navbar />
          <div className="max-w-7xl mx-auto px-4 py-8">
            <p className="text-gray-600">Chỉ Admin mới có quyền xem Thùng rác.</p>
            <Link href="/deals" className="text-[#0074BD] hover:underline mt-2 inline-block">← Quay lại Cơ hội</Link>
          </div>
        </div>
      </ProtectedRoute>
    )
  }

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50">
          <Navbar />
          <div className="max-w-7xl mx-auto px-4 py-8 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-[#0074BD]" />
          </div>
        </div>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Link
            href="/deals"
            className="inline-flex items-center gap-2 text-gray-600 hover:text-[#0074BD] mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Quay lại Quản lý Cơ hội
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Thùng rác (Deals)</h1>
          <p className="text-gray-600 mb-6">Các deal đã bị xóa mềm. Chỉ Admin có thể khôi phục.</p>

          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            {deals.length === 0 ? (
              <p className="text-gray-500 p-6 text-center">Thùng rác trống.</p>
            ) : (
              <ul className="divide-y divide-gray-200">
                {deals.map((deal) => (
                  <li key={deal.deal_id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                    <div>
                      <p className="font-medium text-gray-900">{deal.title}</p>
                      <p className="text-sm text-gray-600">
                        {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(deal.amount || 0)}
                        {deal.customer_full_name && ` · ${deal.customer_full_name}`}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">Xóa lúc: {formatDate(deal.deleted_at)}</p>
                    </div>
                    <button
                      onClick={() => handleRestore(deal.deal_id)}
                      className="flex items-center gap-2 px-3 py-2 text-[#0074BD] hover:bg-blue-50 rounded-lg transition"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Khôi phục
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  )
}
