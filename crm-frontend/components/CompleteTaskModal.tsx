'use client'

import { useState } from 'react'
import { X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { apiClient } from '@/lib/api'
import toast from 'react-hot-toast'

interface CompleteTaskModalProps {
  taskId: string
  taskTitle: string
  customerName?: string
  onSuccess: () => void
  onCancel: () => void
}

export function CompleteTaskModal({
  taskId,
  taskTitle,
  customerName,
  onSuccess,
  onCancel
}: CompleteTaskModalProps) {
  const [completionContent, setCompletionContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!completionContent.trim()) {
      setError('Vui lòng nhập kết quả công việc.')
      return
    }

    setLoading(true)
    try {
      const response = await apiClient.patch(`/api/tasks/${taskId}`, {
        is_completed: true,
        completion_content: completionContent.trim()
      })

      if (response.data.success) {
        toast.success('Hoàn thành công việc thành công!')
        onSuccess()
      } else {
        const errorMsg = response.data.message || 'Hoàn thành công việc thất bại'
        setError(errorMsg)
        toast.error(errorMsg)
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || 'Lỗi khi hoàn thành công việc'
      setError(errorMsg)
      toast.error(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full shadow-xl">
        <div className="flex justify-between items-center p-6 border-b">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Hoàn thành công việc</h2>
              <p className="text-sm text-gray-500 mt-1">Kết quả sẽ được lưu vào lịch sử tương tác</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 transition"
            disabled={loading}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Công việc
            </label>
            <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
              <p className="font-medium text-gray-900">{taskTitle}</p>
              {customerName && (
                <p className="text-sm text-gray-600 mt-1">Khách hàng: {customerName}</p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="completion_content" className="block text-sm font-medium text-gray-700 mb-2">
              Kết quả công việc <span className="text-red-500">*</span>
            </label>
            <textarea
              id="completion_content"
              rows={6}
              value={completionContent}
              onChange={(e) => setCompletionContent(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
              placeholder="Nhập kết quả công việc đã thực hiện..."
            />
            <p className="text-xs text-gray-500 mt-1 text-right">
              {completionContent.length} / 500 ký tự
            </p>
          </div>

          <div className="flex justify-end space-x-4 pt-4 border-t">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={loading || !completionContent.trim()}
              className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Đang lưu...</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span>Hoàn thành</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

