'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { X, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

interface Deal {
  deal_id: string
  title: string
  amount: number
  stage: string
  status?: string
  customer_id?: string
  expected_closing_date?: number | string
}

const STAGES = [
  { id: 'tiep_can', label: 'Tiếp cận' },
  { id: 'tu_van', label: 'Tư vấn' },
  { id: 'bao_gia', label: 'Báo giá' },
  { id: 'thuong_thao', label: 'Thương thảo' },
  { id: 'thanh_cong', label: 'Thành công' }
]

interface DealModalProps {
  deal: Deal | null
  customerId?: string
  onClose: () => void
  onSuccess: () => void
}

function parseExpectedClosingDate(value: number | string | null | undefined): string {
  if (value == null || value === '') return ''
  const num = typeof value === 'string' ? parseInt(value, 10) : value
  if (Number.isNaN(num) || num <= 0) return ''
  const ms = num.toString().length <= 10 ? num * 1000 : num
  const date = new Date(ms)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().split('T')[0]
}

export function DealModal({ deal, customerId, onClose, onSuccess }: DealModalProps) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    title: deal?.title || '',
    amount: deal?.amount || 0,
    stage: deal?.stage || 'tiep_can',
    customer_id: deal?.customer_id || customerId || '',
    expected_closing_date: parseExpectedClosingDate(deal?.expected_closing_date)
  })
  const [customers, setCustomers] = useState<any[]>([])

  useEffect(() => {
    if (!customerId) {
      fetchCustomers()
    }
  }, [customerId])

  const fetchCustomers = async () => {
    try {
      const response = await apiClient.get('/api/customers')
      if (response.data.success) {
        setCustomers(response.data.data || [])
      }
    } catch (error) {
      console.error('Error fetching customers:', error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const payload = {
        ...formData,
        amount: parseFloat(formData.amount.toString()),
        expected_closing_date: formData.expected_closing_date
          ? new Date(formData.expected_closing_date).getTime()
          : null
      }

      if (deal) {
        await apiClient.patch(`/api/deals/${deal.deal_id}`, payload)
        toast.success('Cập nhật deal thành công!')
      } else {
        await apiClient.post('/api/deals', payload)
        toast.success('Tạo deal thành công!')
      }
      onSuccess()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Có lỗi xảy ra')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">
            {deal ? 'Chỉnh sửa Deal' : 'Tạo Deal mới'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tiêu đề <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0074BD] focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Giá trị (VND)
            </label>
            <input
              type="number"
              min="0"
              step="1000"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0074BD] focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Giai đoạn
            </label>
            <select
              value={formData.stage}
              onChange={(e) => setFormData({ ...formData, stage: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0074BD] focus:border-transparent"
            >
              {STAGES.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.label}
                </option>
              ))}
            </select>
          </div>

          {!customerId && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Khách hàng
              </label>
              <select
                value={formData.customer_id}
                onChange={(e) => setFormData({ ...formData, customer_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0074BD] focus:border-transparent"
              >
                <option value="">-- Chọn khách hàng --</option>
                {customers.map((customer) => (
                  <option key={customer.customer_id} value={customer.customer_id}>
                    {customer.full_name} - {customer.phone}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ngày dự kiến đóng deal
            </label>
            <input
              type="date"
              value={formData.expected_closing_date}
              onChange={(e) => setFormData({ ...formData, expected_closing_date: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0074BD] focus:border-transparent"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-[#0074BD] text-white rounded-lg hover:bg-[#005a94] transition disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : deal ? 'Cập nhật' : 'Tạo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
