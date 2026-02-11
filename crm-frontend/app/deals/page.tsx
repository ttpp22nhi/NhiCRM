'use client'

import { useState, useEffect } from 'react'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { Navbar } from '@/components/Navbar'
import { apiClient } from '@/lib/api'
import { Plus, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { DealModal } from '@/components/DealModal'
import { KanbanBoard, type Deal } from '@/components/KanbanBoard'

export default function DealsPage() {
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null)

  useEffect(() => {
    fetchDeals()
  }, [])

  const fetchDeals = async () => {
    try {
      setLoading(true)
      const response = await apiClient.get('/api/deals')
      if (response.data.success) {
        setDeals(response.data.data || [])
      }
    } catch (error: any) {
      console.error('Error fetching deals:', error)
      toast.error(error.response?.data?.message || 'Không thể tải danh sách deals')
    } finally {
      setLoading(false)
    }
  }

  const handleStageChange = async (dealId: string, newStage: string, previousStage: string) => {
    // Optimistic update
    setDeals((prevDeals) =>
      prevDeals.map((d) => (d.deal_id === dealId ? { ...d, stage: newStage } : d))
    )

    try {
      await apiClient.patch(`/api/deals/${dealId}`, { stage: newStage })
      toast.success('Cập nhật giai đoạn deal thành công!')
    } catch (error: any) {
      // Rollback nếu có lỗi
      setDeals((prevDeals) =>
        prevDeals.map((d) => (d.deal_id === dealId ? { ...d, stage: previousStage } : d))
      )
      toast.error(error.response?.data?.message || 'Không thể cập nhật giai đoạn deal')
    }
  }

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50">
          <Navbar />
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-[#0074BD]" />
              <span className="ml-3 text-gray-600">Đang tải deals...</span>
            </div>
          </div>
        </div>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Quản lý Cơ hội</h1>
              <p className="text-gray-600 mt-2">Theo dõi và quản lý các deal bán hàng</p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[#0074BD] text-white rounded-lg hover:bg-[#005a94] transition"
            >
              <Plus className="w-5 h-5" />
              <span>Tạo Deal mới</span>
            </button>
          </div>

          {/* Kanban Board */}
          <KanbanBoard deals={deals} onStageChange={handleStageChange} onEdit={setEditingDeal} />
        </div>

        {/* Create/Edit Deal Modal */}
        {(showCreateModal || editingDeal) && (
          <DealModal
            deal={editingDeal}
            onClose={() => {
              setShowCreateModal(false)
              setEditingDeal(null)
            }}
            onSuccess={() => {
              fetchDeals()
              setShowCreateModal(false)
              setEditingDeal(null)
            }}
          />
        )}
      </div>
    </ProtectedRoute>
  )
}

