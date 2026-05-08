'use client'

import { X, Calendar, User, CheckSquare, AlertCircle, ExternalLink } from 'lucide-react'

export interface TaskForDetail {
  task_id: string
  title: string
  description?: string | null
  display_code?: string
  parent_display_code?: string
  related_type?: string
  related_id?: string
  customer_id?: string
  customer_full_name?: string
  due_date?: number
  priority: string
  is_completed: boolean
  assigned_employee_name?: string
}

interface TaskDetailModalProps {
  task: TaskForDetail
  onClose: () => void
  /** Khi user click vào mã Deal (để quay lại cơ hội). Từ trang Deals chỉ cần đóng modal; từ trang Tasks cần navigate sang /deals và mở deal. */
  onOpenDeal?: (dealId: string) => void
}

function formatDate(ts?: number | null): string {
  if (ts == null) return '—'
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('vi-VN')
}

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Thấp',
  medium: 'Trung bình',
  high: 'Cao',
  urgent: 'Khẩn cấp'
}

export function TaskDetailModal({ task, onClose, onOpenDeal }: TaskDetailModalProps) {
  const dealId = task.related_type === 'DEAL' ? task.related_id : null
  const dealCode = task.parent_display_code || (task.related_type === 'DEAL' ? undefined : null)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">Chi tiết công việc</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto space-y-4">
          {task.display_code && (
            <p className="text-sm font-medium text-gray-500">Mã: {task.display_code}</p>
          )}
          <div>
            <h3 className="text-base font-semibold text-gray-900">{task.title}</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${task.is_completed ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                {task.is_completed ? 'Đã hoàn thành' : 'Chưa hoàn thành'}
              </span>
              <span className="text-xs text-gray-500">{PRIORITY_LABELS[task.priority] || task.priority}</span>
            </div>
          </div>

          {task.description && String(task.description).trim() && (
            <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
              <p className="text-xs text-gray-500 mb-0.5">Nội dung</p>
              <p className="text-sm text-gray-900 whitespace-pre-wrap">{String(task.description).trim()}</p>
            </div>
          )}

          {task.customer_full_name && (
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <User className="w-5 h-5 text-gray-500 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-500">Khách hàng</p>
                <p className="font-medium text-gray-900">{task.customer_full_name}</p>
              </div>
            </div>
          )}

          {task.due_date && (
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <Calendar className="w-5 h-5 text-gray-500 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-500">Hạn hoàn thành</p>
                <p className="text-gray-900">{formatDate(task.due_date)}</p>
              </div>
            </div>
          )}

          {task.assigned_employee_name && (
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <User className="w-5 h-5 text-gray-500 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-500">Người thực hiện</p>
                <p className="text-gray-900">{task.assigned_employee_name}</p>
              </div>
            </div>
          )}

          {/* Công việc này thuộc Cơ hội: [DEAL-2602-001] - click để quay lại Deal */}
          {(dealId || dealCode) && (
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg">
              <p className="text-xs text-gray-500 mb-1">Liên kết cơ hội</p>
              <p className="text-sm text-gray-900">
                Công việc này thuộc Cơ hội:{' '}
                {(onOpenDeal && dealId) ? (
                  <button
                    type="button"
                    onClick={() => onOpenDeal(dealId)}
                    className="inline-flex items-center gap-1 text-[#0074BD] font-medium hover:underline"
                  >
                    [{dealCode || dealId}]
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <span className="font-medium">[{dealCode || dealId}]</span>
                )}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
