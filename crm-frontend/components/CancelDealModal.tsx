'use client'

import { useState } from 'react'
import { apiClient } from '@/lib/api'
import { X, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

const LOSS_REASON_OPTIONS = [
  { value: '', label: '-- Chọn lý do (bắt buộc) --' },
  { value: 'PRICE', label: 'Giá cao hơn đối thủ (PRICE)' },
  { value: 'TECH', label: 'Không đáp ứng yêu cầu kỹ thuật (TECH)' },
  { value: 'RELATIONSHIP', label: 'Quan hệ đối thủ tốt hơn (RELATIONSHIP)' },
  { value: 'CANCEL', label: 'Khách hàng hủy dự án (CANCEL)' },
  { value: 'Khách đổi ý', label: 'Khách đổi ý' },
  { value: 'Đối thủ cạnh tranh', label: 'Đối thủ cạnh tranh' },
  { value: 'Ngân sách không phù hợp', label: 'Ngân sách không phù hợp' },
  { value: 'Khác', label: 'Khác' }
]

interface CancelDealModalProps {
  dealId: string
  dealTitle: string
  variant: 'cancelled' | 'lost'
  onClose: () => void
  onSuccess: () => void
}

export function CancelDealModal({ dealId, dealTitle, variant, onClose, onSuccess }: CancelDealModalProps) {
  const [loading, setLoading] = useState(false)
  const [reasonOption, setReasonOption] = useState('')
  const [reasonCustom, setReasonCustom] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const reason = reasonOption === 'Khác' ? reasonCustom.trim() : reasonOption.trim()
    if (!reason) {
      toast.error('Vui lòng chọn hoặc nhập lý do.')
      return
    }
    setLoading(true)
    try {
      await apiClient.patch(`/api/deals/${dealId}`, {
        status: variant,
        loss_reason: reason
      })
      toast.success(variant === 'cancelled' ? 'Đã hủy deal.' : 'Đã đánh dấu deal thất bại.')
      onSuccess()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Có lỗi xảy ra')
    } finally {
      setLoading(false)
    }
  }

  const title = variant === 'cancelled' ? 'Hủy deal' : 'Đánh dấu thất bại'
  const label = variant === 'cancelled' ? 'Lý do hủy' : 'Lý do thất bại'

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">{title}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-gray-600 mb-4">Deal: <strong>{dealTitle}</strong></p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{label} <span className="text-red-500">*</span></label>
            <select
              value={reasonOption}
              onChange={(e) => setReasonOption(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0074BD] focus:border-transparent"
            >
              {LOSS_REASON_OPTIONS.map((opt) => (
                <option key={opt.value || 'empty'} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          {reasonOption === 'Khác' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nhập lý do</label>
              <textarea
                value={reasonCustom}
                onChange={(e) => setReasonCustom(e.target.value)}
                placeholder="Ghi rõ lý do..."
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0074BD] focus:border-transparent"
              />
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              Đóng
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Xác nhận'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
