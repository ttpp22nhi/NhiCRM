'use client'

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { Deal, Stage } from './KanbanBoard'
import { DealCard } from './DealCard'

interface KanbanColumnProps {
  stage: Stage
  deals: Deal[]
  droppable?: boolean
  onEdit: (deal: Deal) => void
  onViewDetail?: (deal: Deal) => void
  onCancel?: (deal: Deal, asLost: boolean) => void
  onDelete?: (deal: Deal) => void
  canDelete?: (deal: Deal) => boolean
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND'
  }).format(amount)
}

export function KanbanColumn({ stage, deals, droppable = true, onEdit, onViewDetail, onCancel, onDelete, canDelete }: KanbanColumnProps) {
  const totalAmount = deals.reduce((sum, deal) => sum + (deal.amount || 0), 0)
  const { setNodeRef, isOver } = useDroppable({ id: stage.id, disabled: !droppable })

  return (
    <div
      ref={droppable ? setNodeRef : undefined}
      className={`flex-1 min-w-[280px] rounded-lg border-2 p-4 transition-colors ${stage.color} ${
        droppable && isOver ? 'ring-2 ring-[#0074BD] ring-offset-2' : ''
      }`}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-bold text-gray-800">{stage.label}</h2>
          <p className="text-xs text-gray-600 mt-1">
            Tổng:{' '}
            <span className="font-semibold">
              {formatCurrency(totalAmount)}
            </span>
          </p>
        </div>
        <span className="bg-white px-2 py-1 rounded-full text-sm font-semibold text-gray-700">
          {deals.length}
        </span>
      </div>

      <SortableContext id={stage.id} items={deals.map((d) => d.deal_id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2 min-h-[200px]">
          {deals.map((deal) => (
            <DealCard
              key={deal.deal_id}
              deal={deal}
              onEdit={onEdit}
              onViewDetail={onViewDetail}
              onCancel={onCancel}
              onDelete={onDelete}
              canDelete={canDelete ? canDelete(deal) : false}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  )
}

