'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { DollarSign, Calendar, User, Edit, Package, FileText, StickyNote, XCircle, ThumbsDown, Trash2, Eye, CheckSquare } from 'lucide-react'
import type { Deal } from './KanbanBoard'

interface DealCardProps {
  deal: Deal
  onEdit: (deal: Deal) => void
  onViewDetail?: (deal: Deal) => void
  onCancel?: (deal: Deal, asLost: boolean) => void
  onDelete?: (deal: Deal) => void
  canDelete?: boolean
}

export function DealCard({ deal, onEdit, onViewDetail, onCancel, onDelete, canDelete }: DealCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: deal.deal_id
  })

  const baseTransform = CSS.Transform.toString(transform)
  const dragTransform =
    baseTransform && baseTransform !== 'none'
      ? `${baseTransform} ${isDragging ? 'rotate(2deg) scale(1.02)' : ''}`
      : isDragging
      ? 'rotate(2deg) scale(1.02)'
      : undefined

  const style = {
    transform: dragTransform,
    transition,
    boxShadow: isDragging ? '0 10px 25px rgba(0,0,0,0.15)' : undefined,
    zIndex: isDragging ? 50 : undefined
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount)
  }

  const formatDate = (timestamp?: number | string | null) => {
    const n = timestamp == null ? NaN : typeof timestamp === 'string' ? parseInt(timestamp, 10) : Number(timestamp)
    if (Number.isNaN(n) || n <= 0) return 'N/A'
    const date = new Date(n.toString().length <= 10 ? n * 1000 : n)
    if (Number.isNaN(date.getTime())) return 'N/A'
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()
    return `${day}/${month}/${year}`
  }

  const isImportant = deal.amount >= 100000000 // >= 100 triệu VND
  const isSuccessStage = deal.stage === 'thanh_cong'
  const isFailed = deal.status && deal.status !== 'active'
  const confidenceLevel = (deal.confidence_level as 'high' | 'medium' | 'low') || 'medium'
  const confidenceDotColor =
    confidenceLevel === 'high' ? 'bg-emerald-500' : confidenceLevel === 'low' ? 'bg-red-500' : 'bg-amber-400'

  const borderClass = isFailed
    ? 'border-gray-300'
    : isSuccessStage
    ? 'border-green-500'
    : isImportant
    ? 'border-[#0074BD]'
    : 'border-gray-300'

  const opacityClass = isFailed ? 'opacity-60' : 'opacity-100'

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`bg-white rounded-lg shadow-md p-4 mb-3 cursor-move hover:shadow-lg transition-shadow border-l-4 ${borderClass} ${opacityClass}`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="min-w-0 flex-1 flex items-start gap-2">
          <span
            className={`flex-shrink-0 w-2.5 h-2.5 rounded-full mt-1.5 ${confidenceDotColor}`}
            title={confidenceLevel === 'high' ? 'Chắc chắn thành công' : confidenceLevel === 'low' ? 'Khả năng thất bại cao' : '50/50'}
          />
          <div className="min-w-0">
          {deal.display_code && (
            <span className="text-xs font-medium text-gray-500 block mb-0.5">{deal.display_code}</span>
          )}
          <h3 className={`font-semibold text-gray-900 ${isImportant ? 'text-[#0074BD]' : ''}`}>
            {deal.title}
          </h3>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {onCancel && deal.status === 'active' && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); onCancel(deal, false) }}
                className="text-amber-600 hover:text-amber-700 p-1 rounded"
                title="Hủy deal"
              >
                <XCircle className="w-4 h-4" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onCancel(deal, true) }}
                className="text-gray-500 hover:text-gray-700 p-1 rounded"
                title="Đánh dấu thất bại"
              >
                <ThumbsDown className="w-4 h-4" />
              </button>
            </>
          )}
          {onDelete && canDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(deal) }}
              className="text-red-500 hover:text-red-600 p-1 rounded"
              title="Xóa (chuyển vào thùng rác)"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          {onViewDetail && (
            <button
              onClick={(e) => { e.stopPropagation(); onViewDetail(deal) }}
              className="text-gray-400 hover:text-[#0074BD] transition p-1"
              title="Xem chi tiết deal"
            >
              <Eye className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(deal) }}
            className="text-gray-400 hover:text-gray-600 transition p-1"
            title="Chỉnh sửa"
          >
            <Edit className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-green-600" />
          <span className={`font-bold ${isImportant ? 'text-[#0074BD]' : 'text-gray-700'}`}>
            {formatCurrency(deal.amount)}
          </span>
        </div>

        {deal.customer_full_name && (
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-700">{deal.customer_full_name}</span>
          </div>
        )}

        {deal.expected_closing_date && (
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-600">
              Dự kiến: {formatDate(deal.expected_closing_date)}
            </span>
          </div>
        )}

        {deal.metadata != null && typeof deal.metadata.task_total === 'number' && deal.metadata.task_total > 0 && (
          <div className="flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-600">
              {deal.metadata.task_completed ?? 0}/{deal.metadata.task_total} công việc đã hoàn thành
            </span>
          </div>
        )}

        {(deal.created_at != null || deal.time_create != null) && (() => {
          const label = formatDate(deal.created_at ?? deal.time_create)
          return label !== 'N/A' ? <span className="text-xs text-gray-400 block">Ngày tạo: {label}</span> : null
        })()}

        {(deal.status === 'cancelled' || deal.status === 'lost') && deal.loss_reason && (
          <div className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 mt-1">
            Lý do: {deal.loss_reason}
          </div>
        )}
        {(deal.product_name || deal.quantity != null || deal.invoice_info || deal.notes) && (
          <div className="mt-2 pt-2 border-t border-gray-100 space-y-1.5">
            {deal.product_name && (
              <div className="flex items-center gap-2">
                <Package className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                <span className="text-xs text-gray-600 truncate">{deal.product_name}</span>
              </div>
            )}
            {deal.quantity != null && String(deal.quantity) !== '' && (
              <div className="text-xs text-gray-600">
                SL: {Number(deal.quantity)}
              </div>
            )}
            {deal.invoice_info && (
              <div className="flex items-start gap-2">
                <FileText className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
                <span className="text-xs text-gray-600 line-clamp-2">{deal.invoice_info}</span>
              </div>
            )}
            {deal.notes && (
              <div className="flex items-start gap-2">
                <StickyNote className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
                <span className="text-xs text-gray-500 line-clamp-2">{deal.notes}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

