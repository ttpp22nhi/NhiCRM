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
  loss_reason?: string | null
  customer_id?: string
  customer_full_name?: string
  customer_phone?: string
  assigned_to?: string
  assigned_employee_name?: string
  assigned_employee_username?: string
  expected_closing_date?: number
  created_at?: number
  time_create?: number
  updated_at?: number
  product_name?: string | null
  quantity?: number | null
  invoice_info?: string | null
  notes?: string | null
  metadata?: { task_total?: number; task_completed?: number }
  display_code?: string | null
  deal_category?: 'MASS' | 'PROJECT' | string | null
  confidence_level?: 'high' | 'medium' | 'low' | string | null
  confidence_note?: string | null
}

export interface Stage {
  id: string
  label: string
  color: string
}

const DEFAULT_STAGES: Stage[] = [
  { id: 'tiep_can', label: 'Tiếp cận', color: 'bg-blue-100 border-blue-300' },
  { id: 'tu_van', label: 'Tư vấn', color: 'bg-yellow-100 border-yellow-300' },
  { id: 'bao_gia', label: 'Báo giá', color: 'bg-orange-100 border-orange-300' },
  { id: 'thuong_thao', label: 'Thương thảo', color: 'bg-purple-100 border-purple-300' },
  { id: 'thanh_cong', label: 'Thành công', color: 'bg-green-100 border-green-300' }
]

interface KanbanBoardProps {
  deals: Deal[]
  stages?: Stage[]
  onStageChange: (dealId: string, newStage: string, previousStage: string, note?: string) => void
  onEdit: (deal: Deal) => void
  onViewDetail?: (deal: Deal) => void
  onCancel?: (deal: Deal, asLost: boolean) => void
  onDelete?: (deal: Deal) => void
  canDelete?: (deal: Deal) => boolean
}

type PendingStageChange = { dealId: string; newStage: string; previousStage: string; dealTitle: string }

export function KanbanBoard({ deals, stages: stagesProp, onStageChange, onEdit, onViewDetail, onCancel, onDelete, canDelete }: KanbanBoardProps) {
  const stages = stagesProp && stagesProp.length > 0 ? stagesProp : DEFAULT_STAGES
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null)
  const [pendingStageChange, setPendingStageChange] = useState<PendingStageChange | null>(null)
  const [stageChangeNote, setStageChangeNote] = useState('')
  const [stageChangeSubmitting, setStageChangeSubmitting] = useState(false)

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
    const isStageId = stages.some((s) => s.id === overId)
    const newStage = isStageId ? overId : deals.find((d) => d.deal_id === overId)?.stage

    if (!newStage || newStage === currentDeal.stage) return

    setPendingStageChange({
      dealId,
      newStage,
      previousStage: currentDeal.stage,
      dealTitle: currentDeal.title || 'Deal'
    })
    setStageChangeNote('')
  }

  const handleConfirmStageChange = async () => {
    if (!pendingStageChange) return
    setStageChangeSubmitting(true)
    try {
      await Promise.resolve(
        onStageChange(
          pendingStageChange.dealId,
          pendingStageChange.newStage,
          pendingStageChange.previousStage,
          stageChangeNote.trim() || undefined
        )
      )
      setPendingStageChange(null)
      setStageChangeNote('')
    } finally {
      setStageChangeSubmitting(false)
    }
  }

  const handleCancelStageChange = () => {
    setPendingStageChange(null)
    setStageChangeNote('')
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
        {stages.map((stage) => (
          <KanbanColumn
            key={stage.id}
            stage={stage}
            deals={getDealsByStage(stage.id)}
            onEdit={onEdit}
            onViewDetail={onViewDetail}
            onCancel={onCancel}
            onDelete={onDelete}
            canDelete={canDelete}
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

      {/* Modal nhập lý do chuyển giai đoạn */}
      {pendingStageChange && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Chuyển giai đoạn deal</h3>
            <p className="text-sm text-gray-600 mb-3">
              <span className="font-medium">{pendingStageChange.dealTitle}</span>
              <br />
              <span className="text-gray-500">
                {stages.find((s) => s.id === pendingStageChange.previousStage)?.label || pendingStageChange.previousStage}
                {' → '}
                {stages.find((s) => s.id === pendingStageChange.newStage)?.label || pendingStageChange.newStage}
              </span>
            </p>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nội dung hiển thị trong workflow (lý do chuyển)
            </label>
            <textarea
              value={stageChangeNote}
              onChange={(e) => setStageChangeNote(e.target.value)}
              placeholder="VD: Đã gửi báo giá, Khách đồng ý thương thảo..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0074BD] focus:border-transparent text-sm resize-none"
              autoFocus
            />
            <div className="flex gap-2 mt-4 justify-end">
              <button
                type="button"
                onClick={handleCancelStageChange}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 text-sm"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmStageChange}
                disabled={stageChangeSubmitting}
                className="px-4 py-2 bg-[#0074BD] text-white rounded-lg hover:bg-[#005a94] text-sm disabled:opacity-50"
              >
                {stageChangeSubmitting ? 'Đang lưu...' : 'Xác nhận'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DndContext>
  )
}

