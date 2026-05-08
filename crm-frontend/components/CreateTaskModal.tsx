'use client'

import { useState, useEffect } from 'react'
import { X, Loader2 } from 'lucide-react'
import { apiClient } from '@/lib/api'
import toast from 'react-hot-toast'

export interface TaskForForm {
  task_id: string
  title: string
  /** Nội dung chi tiết / ghi chú (khác kết quả khi hoàn thành) */
  description?: string | null
  display_code?: string
  customer_id?: string
  due_date?: number
  priority: string
  assigned_to?: string
  /** Task từ Deal: không cho đổi khách hàng trên task */
  related_type?: string
  related_id?: string
  parent_display_code?: string
}

interface CreateTaskModalProps {
  onClose: () => void
  onSuccess: () => void
  employees: { employee_id: string; full_name?: string; username?: string }[]
  userRole?: string
  /** Khi có task = chế độ sửa (PATCH), không có = tạo mới (POST) */
  task?: TaskForForm | null
  /** Khi mở từ trang Cơ hội: prefill related_type=DEAL + related_id, ẩn ô khách (dùng KH của deal) */
  presetDeal?: {
    deal_id: string
    display_code?: string
    customer_id?: string | null
    customer_name?: string | null
    assigned_to?: string | null
  } | null
}

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Thấp' },
  { value: 'medium', label: 'Trung bình' },
  { value: 'high', label: 'Cao' },
  { value: 'urgent', label: 'Khẩn cấp' }
]

function toDatetimeLocal(ts?: number | null): string {
  if (!ts) return ''
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${day}T${h}:${min}`
}

export function CreateTaskModal({ onClose, onSuccess, employees, userRole, task, presetDeal }: CreateTaskModalProps) {
  const isEdit = !!task
  const isFromDeal = !!(task?.related_type === 'DEAL' && task?.related_id)
  const isCreateForDeal = !isEdit && !!presetDeal?.deal_id
  const [loading, setLoading] = useState(false)
  const [customers, setCustomers] = useState<{ customer_id: string; full_name?: string; phone?: string }[]>([])
  const [formData, setFormData] = useState({
    title: task?.title ?? '',
    description: task?.description ?? '',
    customer_id: task?.customer_id ?? presetDeal?.customer_id ?? '',
    due_date: toDatetimeLocal(task?.due_date),
    priority: task?.priority ?? 'medium',
    assigned_to: task?.assigned_to ?? presetDeal?.assigned_to ?? ''
  })

  useEffect(() => {
    if (task) {
      setFormData({
        title: task.title ?? '',
        description: task.description ?? '',
        customer_id: task.customer_id ?? '',
        due_date: toDatetimeLocal(task.due_date),
        priority: task.priority ?? 'medium',
        assigned_to: task.assigned_to ?? ''
      })
    }
  }, [task])

  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const res = await apiClient.get('/api/customers')
        if (res.data.success && Array.isArray(res.data.data)) {
          setCustomers(res.data.data)
        }
      } catch (e) {
        console.error('Fetch customers:', e)
      }
    }
    fetchCustomers()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const title = formData.title.trim()
    if (!title) {
      toast.error('Vui lòng nhập tiêu đề công việc.')
      return
    }

    setLoading(true)
    try {
      const descTrim = formData.description.trim()
      const payload: Record<string, unknown> = {
        title,
        description: descTrim || undefined,
        priority: formData.priority,
        customer_id: formData.customer_id || undefined,
        assigned_to: formData.assigned_to || undefined
      }
      if (formData.due_date) {
        payload.due_date = new Date(formData.due_date).getTime()
      }

      if (isEdit && task) {
        const patchPayload: Record<string, unknown> = {
          title: payload.title,
          description: descTrim || null,
          due_date: payload.due_date,
          priority: payload.priority
        }
        if (canAssign && formData.assigned_to) patchPayload.assigned_to = formData.assigned_to
        // Task từ Deal: không gửi customer_id (backend sẽ từ chối nếu gửi). Task độc lập: gửi nếu có.
        if (!isFromDeal && payload.customer_id !== undefined) patchPayload.customer_id = payload.customer_id || null
        const res = await apiClient.patch(`/api/tasks/${task.task_id}`, patchPayload)
        if (res.data.success) {
          toast.success('Cập nhật công việc thành công!')
          onSuccess()
          onClose()
        } else {
          toast.error(res.data.message || 'Cập nhật công việc thất bại.')
        }
      } else {
        if (presetDeal?.deal_id) {
          payload.related_type = 'DEAL'
          payload.related_id = presetDeal.deal_id
          // KH của deal được backend tự gắn cho task khi không truyền customer_id
          delete payload.customer_id
        }
        const res = await apiClient.post('/api/tasks', payload)
        if (res.data.success) {
          toast.success('Tạo công việc thành công!')
          onSuccess()
          onClose()
        } else {
          toast.error(res.data.message || 'Tạo công việc thất bại.')
        }
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || (isEdit ? 'Cập nhật công việc thất bại.' : 'Tạo công việc thất bại.'))
    } finally {
      setLoading(false)
    }
  }

  const canAssign = userRole !== 'sales' && userRole !== undefined

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">{isEdit ? 'Sửa công việc' : 'Thêm công việc'}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isEdit && task?.display_code && (
          <div className="px-4 pt-2">
            <p className="text-sm font-medium text-gray-500">Mã: {task.display_code}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tiêu đề <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="VD: Gọi điện xác nhận báo giá"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0074BD] focus:border-transparent"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nội dung</label>
            <textarea
              rows={4}
              value={formData.description}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Ghi chi tiết công việc cần làm, nội dung cần xác nhận với khách, ghi chú nội bộ..."
              maxLength={4000}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0074BD] focus:border-transparent resize-y min-h-[5rem] text-sm"
            />
            <p className="text-xs text-gray-400 mt-1 text-right">{formData.description.length} / 4000</p>
          </div>

          {isCreateForDeal && (
            <div className="px-3 py-2.5 border border-blue-200 bg-blue-50 rounded-lg text-sm text-blue-800">
              <p className="font-medium">
                Tạo công việc cho cơ hội {presetDeal?.display_code || presetDeal?.deal_id}
              </p>
              {presetDeal?.customer_name && (
                <p className="text-blue-700">Khách hàng: {presetDeal.customer_name}</p>
              )}
              <p className="text-xs text-blue-700/80 mt-1">
                Khách hàng & liên kết Deal sẽ được hệ thống tự gắn theo cơ hội này.
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Khách hàng</label>
            {isFromDeal ? (
              <div className="px-3 py-2.5 border border-amber-200 bg-amber-50 rounded-lg text-sm text-amber-800 space-y-1.5">
                <p className="font-medium">
                  Task này thuộc cơ hội {task?.parent_display_code || 'Deal'}.
                </p>
                <p className="text-amber-700">
                  Để đổi khách hàng, vui lòng chỉnh tại Cơ hội tương ứng.
                </p>
                {task?.related_id && (
                  <button
                    type="button"
                    onClick={() => {
                      window.location.href = `/deals?openDealId=${task.related_id}`
                    }}
                    className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-amber-600 text-white hover:bg-amber-700"
                  >
                    Mở Cơ hội
                  </button>
                )}
              </div>
            ) : isCreateForDeal ? (
              <div className="px-3 py-2 border border-gray-200 bg-gray-50 rounded-lg text-sm text-gray-700">
                {presetDeal?.customer_name || '— Khách của Cơ hội —'}
              </div>
            ) : (
              <select
                value={formData.customer_id}
                onChange={(e) => setFormData((prev) => ({ ...prev, customer_id: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0074BD] focus:border-transparent"
              >
                <option value="">-- Không chọn --</option>
                {customers.map((c) => (
                  <option key={c.customer_id} value={c.customer_id}>
                    {c.full_name || c.phone || c.customer_id}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Hạn hoàn thành</label>
            <input
              type="datetime-local"
              value={formData.due_date}
              onChange={(e) => setFormData((prev) => ({ ...prev, due_date: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0074BD] focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Độ ưu tiên</label>
            <select
              value={formData.priority}
              onChange={(e) => setFormData((prev) => ({ ...prev, priority: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0074BD] focus:border-transparent"
            >
              {PRIORITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {canAssign && employees.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Giao cho</label>
              <select
                value={formData.assigned_to}
                onChange={(e) => setFormData((prev) => ({ ...prev, assigned_to: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0074BD] focus:border-transparent"
              >
                <option value="">-- Tự gán cho mình --</option>
                {employees.map((emp) => (
                  <option key={emp.employee_id} value={emp.employee_id}>
                    {emp.full_name || emp.username || emp.employee_id}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-[#0074BD] text-white rounded-lg hover:bg-[#005a94] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
              {isEdit ? 'Cập nhật' : 'Tạo công việc'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
