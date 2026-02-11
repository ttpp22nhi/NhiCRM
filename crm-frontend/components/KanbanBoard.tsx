'use client'

import { useState } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { KanbanColumn } from './KanbanColumn'

export interface Deal {
  deal_id: string
  title: string
  amount: number
  stage: string
  status: string
  customer_id?: string
  customer_full_name?: string
  customer_phone?: string
  assigned_to?: string
  assigned_employee_name?: string
  assigned_employee_username?: string
  expected_closing_date?: number
  created_at: number
  updated_at?: number
}

export interface Stage {
  id: string
  label: string
  color: string
}

const STAGES: Stage[] = [
  { id: 'tiep_can', label: 'Tiếp cận', color: 'bg-blue-100 border-blue-300' },
  { id: 'tu_van', label: 'Tư vấn', color: 'bg-yellow-100 border-yellow-300' },
  { id: 'bao_gia', label: 'Báo giá', color: 'bg-orange-100 border-orange-300' },
  { id: 'thuong_thao', label: 'Thương thảo', color: 'bg-purple-100 border-purple-300' },
  { id: 'thanh_cong', label: 'Thành công', color: 'bg-green-100 border-green-300' }
]

interface KanbanBoardProps {
  deals: Deal[]
  onStageChange: (dealId: string, newStage: string, previousStage: string) => void
  onEdit: (deal: Deal) => void
}

export function KanbanBoard({ deals, onStageChange, onEdit }: KanbanBoardProps) {
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  )

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event
    const deal = deals.find((d) => d.deal_id === active.id)
    setActiveDeal(deal || null)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveDeal(null)

    if (!over) return

    const dealId = active.id as string
    const currentDeal = deals.find((d) => d.deal_id === dealId)
    if (!currentDeal) return

    const overId = over.id as string
    // Thả lên cột (droppable stage id) hoặc lên một card (deal_id -> lấy stage của deal đó)
    const isStageId = STAGES.some((s) => s.id === overId)
    const newStage = isStageId ? overId : deals.find((d) => d.deal_id === overId)?.stage

    if (!newStage || newStage === currentDeal.stage) return

    onStageChange(dealId, newStage, currentDeal.stage)
  }

  const getDealsByStage = (stageId: string) => {
    return deals.filter((d) => d.stage === stageId && d.status === 'active')
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.map((stage) => (
          <KanbanColumn
            key={stage.id}
            stage={stage}
            deals={getDealsByStage(stage.id)}
            onEdit={onEdit}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeDeal ? (
          <div
            className="bg-white rounded-lg shadow-xl p-4 border-l-4 border-[#0074BD] w-64 cursor-grabbing"
            style={{
              transform: 'rotate(2deg) scale(1.02)',
              boxShadow: '0 10px 25px rgba(0,0,0,0.15)'
            }}
          >
            <h3 className="font-semibold text-gray-900 mb-2">{activeDeal.title}</h3>
            <div className="text-sm font-bold text-gray-700 mb-1">{formatCurrency(activeDeal.amount)}</div>
            {activeDeal.customer_full_name && (
              <div className="text-sm text-gray-600">{activeDeal.customer_full_name}</div>
            )}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

