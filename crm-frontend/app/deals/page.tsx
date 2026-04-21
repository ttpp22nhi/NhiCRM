'use client'

import { Suspense, useState, useEffect, useRef, useMemo } from 'react'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { Navbar } from '@/components/Navbar'
import { apiClient } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Plus, Loader2, Trash2, X, Search } from 'lucide-react'
import toast from 'react-hot-toast'
import { DealModal } from '@/components/DealModal'
import { DealDetailModal } from '@/components/DealDetailModal'
import { CancelDealModal } from '@/components/CancelDealModal'
import { KanbanBoard, type Deal, type Stage } from '@/components/KanbanBoard'

type StatusFilter = 'all' | 'active' | 'won' | 'cancelled_lost'
type DealCategoryFilter = 'MASS' | 'PROJECT' | ''

function formatDealDate(ts: number | string | undefined | null): string {
  const n = ts == null ? NaN : typeof ts === 'string' ? parseInt(ts, 10) : Number(ts)
  if (Number.isNaN(n) || n <= 0) return '—'
  const d = new Date(n.toString().length <= 10 ? n * 1000 : n)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('vi-VN')
}

function ClosedDealsList({
  deals,
  onEdit,
  onViewDetail,
  onDelete,
  canDeleteDeal,
  showLossReason
}: {
  deals: Deal[]
  onEdit: (deal: Deal) => void
  onViewDetail?: (deal: Deal) => void
  onDelete: (deal: Deal) => void
  canDeleteDeal: (deal: Deal) => boolean
  showLossReason: boolean
}) {
  if (deals.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <p className="text-gray-500 p-6 text-center">Chưa có deal nào.</p>
      </div>
    )
  }
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <ul className="divide-y divide-gray-200">
        {deals.map((deal) => (
          <li key={deal.deal_id} className="p-4 flex items-center justify-between hover:bg-gray-50">
            <div>
              <p className="font-medium text-gray-900">{deal.title}</p>
              <p className="text-sm text-gray-600">
                {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(deal.amount || 0)}
                {deal.customer_full_name && ` · ${deal.customer_full_name}`}
              </p>
              {(deal.assigned_employee_name || deal.assigned_employee_username) && (
                <p className="text-xs text-indigo-700 mt-0.5">
                  Người phụ trách: <span className="font-medium">{deal.assigned_employee_name || deal.assigned_employee_username}</span>
                </p>
              )}
              {(deal.created_at != null || deal.time_create != null) && (
                <p className="text-xs text-gray-400 mt-0.5">
                  Ngày tạo: {formatDealDate(deal.created_at ?? deal.time_create)}
                </p>
              )}
              {showLossReason && (deal.status === 'cancelled' || deal.status === 'lost') && deal.loss_reason && (
                <p className="text-xs text-amber-700 mt-1">Lý do: {deal.loss_reason}</p>
              )}
            </div>
            <div className="flex gap-2">
              {onViewDetail && (
                <button onClick={() => onViewDetail(deal)} className="text-sm text-[#0074BD] hover:underline">
                  Xem chi tiết deal
                </button>
              )}
              <button onClick={() => onEdit(deal)} className="text-sm text-[#0074BD] hover:underline">Sửa</button>
              {canDeleteDeal(deal) && (
                <button onClick={() => onDelete(deal)} className="text-sm text-red-600 hover:underline">Xóa</button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

interface AssigneeOption {
  employee_id: string
  full_name?: string
  username?: string
}

function normalizeVN(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .trim()
}

function AssigneePicker({
  employees,
  value,
  onChange,
}: {
  employees: AssigneeOption[]
  value: string
  onChange: (id: string) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = useMemo(
    () => employees.find((e) => e.employee_id === value) || null,
    [employees, value]
  )

  const filtered = useMemo(() => {
    const q = normalizeVN(query)
    if (!q) return employees.slice(0, 100)
    return employees
      .filter((e) => {
        const hay = normalizeVN(`${e.full_name || ''} ${e.username || ''} ${e.employee_id}`)
        return hay.includes(q)
      })
      .slice(0, 50)
  }, [employees, query])

  useEffect(() => {
    setActiveIdx(0)
  }, [query, open])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const pick = (emp: AssigneeOption) => {
    onChange(emp.employee_id)
    setQuery('')
    setOpen(false)
  }

  const clear = () => {
    onChange('')
    setQuery('')
    setOpen(false)
    inputRef.current?.blur()
  }

  const displayText = selected
    ? selected.full_name || selected.username || selected.employee_id
    : ''

  return (
    <div ref={wrapperRef} className="relative min-w-[240px]">
      <div className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-[#0074BD] focus-within:border-transparent">
        <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
        {selected && !open ? (
          <button
            type="button"
            onClick={() => {
              setOpen(true)
              setTimeout(() => inputRef.current?.focus(), 0)
            }}
            className="flex-1 text-left text-sm text-gray-900 font-medium truncate"
          >
            {displayText}
          </button>
        ) : (
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setOpen(true)
                setActiveIdx((i) => Math.min(i + 1, filtered.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActiveIdx((i) => Math.max(i - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                if (filtered[activeIdx]) pick(filtered[activeIdx])
              } else if (e.key === 'Escape') {
                setOpen(false)
              }
            }}
            placeholder={selected ? displayText : 'Gõ tên hoặc username để tìm...'}
            className="flex-1 outline-none text-sm bg-transparent min-w-0"
          />
        )}
        {selected && (
          <button
            type="button"
            onClick={clear}
            className="p-0.5 text-gray-400 hover:text-gray-700 flex-shrink-0"
            title="Xóa bộ lọc"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-72 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500">Không tìm thấy nhân viên phù hợp.</div>
          ) : (
            <ul className="py-1">
              {filtered.map((emp, idx) => {
                const isActive = idx === activeIdx
                const isSelected = emp.employee_id === value
                return (
                  <li key={emp.employee_id}>
                    <button
                      type="button"
                      onMouseEnter={() => setActiveIdx(idx)}
                      onClick={() => pick(emp)}
                      className={`w-full text-left px-3 py-1.5 text-sm flex items-center justify-between ${
                        isActive ? 'bg-[#0074BD]/10' : 'hover:bg-gray-50'
                      } ${isSelected ? 'font-semibold text-[#0074BD]' : 'text-gray-800'}`}
                    >
                      <span className="truncate">
                        {emp.full_name || emp.username || emp.employee_id}
                        {emp.username && emp.full_name && (
                          <span className="text-xs text-gray-400 ml-1.5">@{emp.username}</span>
                        )}
                      </span>
                      {isSelected && <span className="text-xs text-[#0074BD]">Đang chọn</span>}
                    </button>
                  </li>
                )
              })}
              {filtered.length >= 50 && (
                <li className="px-3 py-1.5 text-xs text-gray-400 border-t">
                  Hiển thị 50 kết quả đầu · tiếp tục gõ để thu hẹp
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function DealsPageContent() {
  const { user } = useAuth()
  const searchParams = useSearchParams()
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [createdDateFrom, setCreatedDateFrom] = useState('')
  const [createdDateTo, setCreatedDateTo] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null)
  const [detailDeal, setDetailDeal] = useState<Deal | null>(null)
  const [cancelDeal, setCancelDeal] = useState<Deal | null>(null)
  const [cancelVariant, setCancelVariant] = useState<'cancelled' | 'lost'>('cancelled')
  const [dealCategoryFilter, setDealCategoryFilter] = useState<DealCategoryFilter>('')
  const [pipelineStages, setPipelineStages] = useState<Stage[]>([])
  const [assigneeFilter, setAssigneeFilter] = useState<string>('')
  const [assignableEmployees, setAssignableEmployees] = useState<
    { employee_id: string; full_name?: string; username?: string }[]
  >([])

  const canFilterByAssignee = user?.role !== 'sales'

  useEffect(() => {
    fetchDeals()
  }, [statusFilter, dateFrom, dateTo, createdDateFrom, createdDateTo, dealCategoryFilter, assigneeFilter])

  useEffect(() => {
    if (!canFilterByAssignee) return
    let cancelled = false
    apiClient
      .get('/api/employees/assignable')
      .then((res) => {
        if (cancelled) return
        if (res.data?.success && Array.isArray(res.data.data)) {
          setAssignableEmployees(res.data.data)
        }
      })
      .catch(() => {
        if (!cancelled) setAssignableEmployees([])
      })
    return () => {
      cancelled = true
    }
  }, [canFilterByAssignee])

  useEffect(() => {
    const category = dealCategoryFilter || 'MASS'
    let cancelled = false
    apiClient.get('/api/pipeline-stages', { params: { deal_category: category } }).then((res) => {
      if (!cancelled && res.data?.data) setPipelineStages(res.data.data)
    }).catch(() => { if (!cancelled) setPipelineStages([]) })
    return () => { cancelled = true }
  }, [dealCategoryFilter])

  const openDealIdFromQuery = searchParams.get('openDealId')
  useEffect(() => {
    if (!openDealIdFromQuery || deals.length === 0) return
    const deal = deals.find((d) => d.deal_id === openDealIdFromQuery)
    if (deal) {
      setDetailDeal(deal)
    }
  }, [openDealIdFromQuery, deals])

  const fetchDeals = async () => {
    try {
      setLoading(true)
      const params: { status?: string; from_date?: string; to_date?: string; created_from?: string; created_to?: string; deal_category?: string; assigned_to?: string } = {}
      if (statusFilter === 'active') params.status = 'active'
      else if (statusFilter === 'won') params.status = 'won'
      else if (statusFilter === 'cancelled_lost') params.status = 'cancelled,lost'
      if (dateFrom) params.from_date = dateFrom
      if (dateTo) params.to_date = dateTo
      if (createdDateFrom) params.created_from = createdDateFrom
      if (createdDateTo) params.created_to = createdDateTo
      if (dealCategoryFilter) params.deal_category = dealCategoryFilter
      if (canFilterByAssignee && assigneeFilter) params.assigned_to = assigneeFilter
      const response = await apiClient.get('/api/deals', { params })
      if (response.data.success) {
        const list = response.data.data || []
        setDeals(list)
      }
    } catch (error: any) {
      console.error('Error fetching deals:', error)
      toast.error(error.response?.data?.message || 'Không thể tải danh sách deals')
    } finally {
      setLoading(false)
    }
  }

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin'
  const canDeleteDeal = (deal: Deal) => isAdmin || deal.assigned_to === user?.id
  const canApproveDeal = ['admin', 'super_admin', 'director', 'manager', 'leader'].includes(user?.role || '')

  const handleCancel = (deal: Deal, asLost: boolean) => {
    setCancelDeal(deal)
    setCancelVariant(asLost ? 'lost' : 'cancelled')
  }

  const handleDelete = async (deal: Deal) => {
    if (!confirm('Xóa deal này vào thùng rác? Bạn có thể khôi phục trong Cài đặt > Thùng rác.')) return
    try {
      await apiClient.delete(`/api/deals/${deal.deal_id}`)
      toast.success('Đã chuyển deal vào thùng rác.')
      fetchDeals()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Không thể xóa deal')
    }
  }

  const handleStageChange = async (dealId: string, newStage: string, previousStage: string, note?: string) => {
    setDeals((prevDeals) =>
      prevDeals.map((d) => (d.deal_id === dealId ? { ...d, stage: newStage } : d))
    )

    try {
      await apiClient.patch(`/api/deals/${dealId}`, {
        stage: newStage,
        stage_change_note: note?.trim() || undefined
      })
      toast.success('Cập nhật giai đoạn deal thành công!')
    } catch (error: any) {
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
            <div className="flex items-center gap-3">
              {isAdmin && (
                <Link
                  href="/deals/trash"
                  className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition"
                >
                  <Trash2 className="w-5 h-5" />
                  <span>Thùng rác</span>
                </Link>
              )}
              {statusFilter === 'active' && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-[#0074BD] text-white rounded-lg hover:bg-[#005a94] transition"
                >
                  <Plus className="w-5 h-5" />
                  <span>Tạo Deal mới</span>
                </button>
              )}
            </div>
          </div>

          {/* Bộ lọc: Loại hình + Trạng thái */}
          <div className="flex flex-wrap items-center gap-4 mb-6">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">Loại hình:</span>
              {[
                { key: '' as const, label: 'Tất cả' },
                { key: 'MASS' as const, label: 'MASS' },
                { key: 'PROJECT' as const, label: 'Dự án (Customize)' }
              ].map(({ key, label }) => (
                <button
                  key={key || 'all'}
                  onClick={() => setDealCategoryFilter(key)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    dealCategoryFilter === key
                      ? 'bg-[#0074BD] text-white'
                      : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">Trạng thái:</span>
            {[
              { key: 'all' as const, label: 'Tất cả' },
              { key: 'active' as const, label: 'Đang hoạt động' },
              { key: 'won' as const, label: 'Đã chốt' },
              { key: 'cancelled_lost' as const, label: 'Đã hủy / Thất bại' }
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={`px-4 py-2 rounded-lg font-medium transition ${
                  statusFilter === key
                    ? 'bg-[#0074BD] text-white'
                    : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            ))}
            </div>
            {canFilterByAssignee && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">Người phụ trách:</span>
                <AssigneePicker
                  employees={assignableEmployees}
                  value={assigneeFilter}
                  onChange={setAssigneeFilter}
                />
              </div>
            )}
          </div>

          {/* Bộ lọc theo ngày: 1 row - Dự kiến + Ngày tạo */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 mb-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-gray-700">Dự kiến:</span>
              <span className="text-sm text-gray-500">Từ ngày</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0074BD] focus:border-transparent text-sm"
              />
              <span className="text-sm text-gray-500">Đến ngày</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0074BD] focus:border-transparent text-sm"
              />
              {(dateFrom || dateTo) && (
                <button
                  type="button"
                  onClick={() => { setDateFrom(''); setDateTo('') }}
                  className="text-sm text-gray-600 hover:text-gray-800 underline"
                >
                  Xóa
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-gray-700">Ngày tạo:</span>
              <span className="text-sm text-gray-500">Từ ngày</span>
              <input
                type="date"
                value={createdDateFrom}
                onChange={(e) => setCreatedDateFrom(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0074BD] focus:border-transparent text-sm"
              />
              <span className="text-sm text-gray-500">Đến ngày</span>
              <input
                type="date"
                value={createdDateTo}
                onChange={(e) => setCreatedDateTo(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0074BD] focus:border-transparent text-sm"
              />
              {(createdDateFrom || createdDateTo) && (
                <button
                  type="button"
                  onClick={() => { setCreatedDateFrom(''); setCreatedDateTo('') }}
                  className="text-sm text-gray-600 hover:text-gray-800 underline"
                >
                  Xóa
                </button>
              )}
            </div>
            {(dateFrom || dateTo || createdDateFrom || createdDateTo) && (
              <button
                type="button"
                onClick={() => { setDateFrom(''); setDateTo(''); setCreatedDateFrom(''); setCreatedDateTo('') }}
                className="text-sm px-3 py-1.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100"
              >
                Xóa hết filter
              </button>
            )}
          </div>

          {/* Nội dung theo bộ lọc (lọc theo status để mỗi tab chỉ hiện đúng deal) */}
          {statusFilter === 'all' && (
            <KanbanBoard
              deals={deals}
              stages={pipelineStages.length > 0 ? pipelineStages : undefined}
              showAllStatuses
              onStageChange={handleStageChange}
              onEdit={setEditingDeal}
              onViewDetail={setDetailDeal}
              onCancel={handleCancel}
              onDelete={handleDelete}
              canDelete={canDeleteDeal}
            />
          )}
          {statusFilter === 'active' && (
            <KanbanBoard
              deals={deals.filter((d) => (d.status || 'active') === 'active')}
              stages={pipelineStages.length > 0 ? pipelineStages : undefined}
              onStageChange={handleStageChange}
              onEdit={setEditingDeal}
              onViewDetail={setDetailDeal}
              onCancel={handleCancel}
              onDelete={handleDelete}
              canDelete={canDeleteDeal}
            />
          )}
          {(statusFilter === 'won' || statusFilter === 'cancelled_lost') && (
            <ClosedDealsList
              deals={statusFilter === 'won' ? deals.filter((d) => d.status === 'won') : deals.filter((d) => d.status === 'cancelled' || d.status === 'lost')}
              onEdit={setEditingDeal}
              onViewDetail={setDetailDeal}
              onDelete={handleDelete}
              canDeleteDeal={canDeleteDeal}
              showLossReason={statusFilter === 'cancelled_lost'}
            />
          )}
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

        {detailDeal && (
          <DealDetailModal
            deal={detailDeal}
            onClose={() => setDetailDeal(null)}
            onEdit={(d) => { setDetailDeal(null); setEditingDeal(d) }}
            canApprove={canApproveDeal}
            onApprove={canApproveDeal ? async (deal) => {
              try {
                await apiClient.post(`/api/deals/${deal.deal_id}/approve`)
                toast.success('Đã phê duyệt deal. Deal đã vào Pipeline.')
                fetchDeals()
                setDetailDeal(null)
              } catch (err: any) {
                toast.error(err.response?.data?.message || 'Phê duyệt thất bại.')
              }
            } : undefined}
          />
        )}

        {cancelDeal && (
          <CancelDealModal
            dealId={cancelDeal.deal_id}
            dealTitle={cancelDeal.title}
            variant={cancelVariant}
            onClose={() => setCancelDeal(null)}
            onSuccess={() => {
              setCancelDeal(null)
              fetchDeals()
            }}
          />
        )}
      </div>
    </ProtectedRoute>
  )
}

export default function DealsPage() {
  return (
    <Suspense
      fallback={
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
      }
    >
      <DealsPageContent />
    </Suspense>
  )
}

