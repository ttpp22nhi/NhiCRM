'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { DollarSign, Calendar, User, Edit } from 'lucide-react'
import type { Deal } from './KanbanBoard'

interface DealCardProps {
  deal: Deal
  onEdit: (deal: Deal) => void
}

export function DealCard({ deal, onEdit }: DealCardProps) {
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

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return 'N/A'
    const date = new Date(timestamp.toString().length === 10 ? timestamp * 1000 : timestamp)
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()
    return `${day}/${month}/${year}`
  }

  const isImportant = deal.amount >= 100000000 // >= 100 triệu VND
  const isSuccessStage = deal.stage === 'thanh_cong'
  const isFailed = deal.status && deal.status !== 'active'

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
        <h3 className={`font-semibold text-gray-900 ${isImportant ? 'text-[#0074BD]' : ''}`}>
          {deal.title}
        </h3>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onEdit(deal)
          }}
          className="text-gray-400 hover:text-gray-600 transition"
        >
          <Edit className="w-4 h-4" />
        </button>
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
      </div>
    </div>
  )
}

