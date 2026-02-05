'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api'
import { X, Calendar, FileText, Phone, Mail, Users, MessageSquare } from 'lucide-react'
import toast from 'react-hot-toast'

interface AddInteractionModalProps {
  customerId: string
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function AddInteractionModal({ customerId, isOpen, onClose, onSuccess }: AddInteractionModalProps) {
  const [formData, setFormData] = useState({
    interaction_type: 'call',
    status: 'thành công',
    interaction_date: '',
    content: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Set default interaction_date khi modal mở
  useEffect(() => {
    if (isOpen) {
      const now = new Date()
      const year = now.getFullYear()
      const month = String(now.getMonth() + 1).padStart(2, '0')
      const day = String(now.getDate()).padStart(2, '0')
      const hours = String(now.getHours()).padStart(2, '0')
      const minutes = String(now.getMinutes()).padStart(2, '0')
      
      // Format: YYYY-MM-DDTHH:mm (cho input datetime-local)
      const datetimeLocal = `${year}-${month}-${day}T${hours}:${minutes}`
      
      setFormData(prev => ({
        ...prev,
        interaction_date: datetimeLocal,
        content: ''
      }))
      setError('')
    }
  }, [isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // Validate
      if (!formData.content || formData.content.trim() === '') {
        setError('Vui lòng nhập nội dung trao đổi')
        setLoading(false)
        return
      }

      // Convert datetime-local to timestamp
      let interactionDateTimestamp: number
      if (formData.interaction_date) {
        const date = new Date(formData.interaction_date)
        interactionDateTimestamp = date.getTime()
      } else {
        interactionDateTimestamp = Date.now()
      }

      // Gọi API
      const response = await apiClient.post('/api/interactions', {
        customer_id: customerId,
        interaction_type: formData.interaction_type,
        status: formData.status,
        interaction_date: interactionDateTimestamp,
        content: formData.content.trim()
      })

      if (response.data.success) {
        toast.success('Thêm tương tác thành công!')
        onSuccess() // Refresh timeline
        onClose() // Đóng modal
        // Reset form
        setFormData({
          interaction_type: 'call',
          status: 'thành công',
          interaction_date: '',
          content: ''
        })
      } else {
        const errorMsg = response.data.message || 'Thêm tương tác thất bại'
        setError(errorMsg)
        toast.error(errorMsg)
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || 'Lỗi khi thêm tương tác'
      setError(errorMsg)
      toast.error(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (!loading) {
      setError('')
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b bg-gray-50">
          <h2 className="text-xl font-bold text-gray-900">Thêm tương tác mới</h2>
          <button
            onClick={handleClose}
            disabled={loading}
            className="text-gray-400 hover:text-gray-600 transition p-1 rounded-full hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6">
          <div className="space-y-4">
            {/* Loại tương tác */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Loại tương tác <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.interaction_type}
                onChange={(e) => setFormData({ ...formData, interaction_type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                required
              >
                <option value="call">Cuộc gọi (Call)</option>
                <option value="email">Email</option>
                <option value="meeting">Cuộc họp (Meeting)</option>
                <option value="zalo">Zalo</option>
              </select>
            </div>

            {/* Trạng thái */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Trạng thái
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="thành công">Thành công</option>
                <option value="khách bận">Khách bận</option>
                <option value="hẹn gọi lại">Hẹn gọi lại</option>
                <option value="khách từ chối">Khách từ chối</option>
              </select>
            </div>

            {/* Ngày giờ tương tác */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Ngày giờ tương tác
                </div>
              </label>
              <input
                type="datetime-local"
                value={formData.interaction_date}
                onChange={(e) => setFormData({ ...formData, interaction_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                required
              />
            </div>

            {/* Nội dung */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Nội dung trao đổi <span className="text-red-500">*</span>
                </div>
              </label>
              <textarea
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                rows={6}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
                placeholder="Nhập nội dung trao đổi với khách hàng..."
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                {formData.content.length} ký tự
              </p>
            </div>

            {/* Error message */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 mt-6 pt-6 border-t">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Đang lưu...</span>
                </>
              ) : (
                <>
                  <span>Lưu tương tác</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}




