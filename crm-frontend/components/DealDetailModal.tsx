'use client'

import { useEffect, useState, useCallback } from 'react'
import { X, Edit2, DollarSign, User, Calendar, Package, FileText, StickyNote, Briefcase, CheckSquare, ChevronDown, Receipt, Plus, Clock as ClockIcon } from 'lucide-react'
import type { Deal } from './KanbanBoard'
import { DealTimeline } from './DealTimeline'
import { apiClient } from '@/lib/api'
import { CreateTaskModal } from './CreateTaskModal'
import { CompleteTaskModal } from './CompleteTaskModal'
import { useAuth } from '@/contexts/AuthContext'
import toast from 'react-hot-toast'

const STAGE_LABELS: Record<string, string> = {
  tiep_can: 'Tiếp cận',
  tu_van: 'Tư vấn',
  bao_gia: 'Báo giá',
  thuong_thao: 'Thương thảo',
  thanh_cong: 'Thành công'
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Đang hoạt động',
  pending_approval: 'Chờ phê duyệt',
  won: 'Đã chốt',
  cancelled: 'Đã hủy',
  lost: 'Thất bại'
}

function formatDate(ts?: number | string | null): string {
  const n = ts == null ? NaN : typeof ts === 'string' ? parseInt(ts, 10) : Number(ts)
  if (Number.isNaN(n) || n <= 0) return '—'
  const d = new Date(n.toString().length <= 10 ? n * 1000 : n)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('vi-VN')
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount)
}

interface DealDetailModalProps {
  deal: Deal
  onClose: () => void
  onEdit?: (deal: Deal) => void
  onApprove?: (deal: Deal) => void | Promise<void>
  canApprove?: boolean
}

interface DealTask {
  task_id: string
  display_code?: string
  title: string
  description?: string | null
  is_completed: boolean
  due_date?: number | null
  priority?: string
  assigned_to?: string | null
  assigned_employee_name?: string | null
}

interface LinkedCbsOrder {
  id: string
  period_ym: string | null
  contract_no: string | null
  product_name: string | null
  customer_name: string | null
  price_not_vat_round: string | number | null
  price_not_vat: string | number | null
  price_vat: string | number | null
  payment_date: string | number | null
  claim_status: string | null
  claimed_by_name: string | null
  approved_by_name: string | null
  approved_at: string | number | null
  kpi_kind_at_approve: string | null
}

export function DealDetailModal({ deal, onClose, onEdit, onApprove, canApprove }: DealDetailModalProps) {
  const { user } = useAuth()
  const showApprove = deal.status === 'pending_approval' && canApprove && onApprove
  const [showSuccessDetails, setShowSuccessDetails] = useState(false)
  const [cbsOrders, setCbsOrders] = useState<LinkedCbsOrder[]>([])
  const [loadingCbs, setLoadingCbs] = useState(false)
  const [tasks, setTasks] = useState<DealTask[]>([])
  const [loadingTasks, setLoadingTasks] = useState(false)
  const [showCreateTask, setShowCreateTask] = useState(false)
  const [employees, setEmployees] = useState<{ employee_id: string; full_name?: string; username?: string }[]>([])
  const [completingTask, setCompletingTask] = useState<DealTask | null>(null)
  const [tasksRefresh, setTasksRefresh] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoadingCbs(true)
    apiClient
      .get(`/api/deals/${deal.deal_id}/cbs-orders`)
      .then((res) => {
        if (cancelled) return
        if (res.data?.success && Array.isArray(res.data.data)) {
          setCbsOrders(res.data.data)
        }
      })
      .catch(() => {
        if (!cancelled) setCbsOrders([])
      })
      .finally(() => {
        if (!cancelled) setLoadingCbs(false)
      })
    return () => {
      cancelled = true
    }
  }, [deal.deal_id])

  const reloadTasks = useCallback(async () => {
    setLoadingTasks(true)
    try {
      const res = await apiClient.get('/api/tasks', {
        params: { related_type: 'DEAL', related_id: deal.deal_id },
      })
      if (res.data?.success) setTasks(res.data.data || [])
    } catch {
      setTasks([])
    } finally {
      setLoadingTasks(false)
    }
  }, [deal.deal_id])

  useEffect(() => {
    reloadTasks()
  }, [reloadTasks, tasksRefresh])

  useEffect(() => {
    let cancelled = false
    apiClient
      .get('/api/employees/assignable')
      .then((r) => {
        if (!cancelled && r.data?.success) setEmployees(r.data.data || [])
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const totalCbs = cbsOrders.reduce(
    (sum, o) => sum + Number(o.price_not_vat_round ?? o.price_not_vat ?? 0),
    0
  )

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">Chi tiết Deal</h2>
          <div className="flex items-center gap-2">
            {showApprove && (
              <button
                type="button"
                onClick={() => onApprove(deal)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
              >
                Phê duyệt
              </button>
            )}
            {onEdit && (
              <button
                type="button"
                onClick={() => { onEdit(deal); onClose() }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-[#0074BD] text-white rounded-lg hover:bg-[#005a94]"
              >
                <Edit2 className="w-4 h-4" />
                Chỉnh sửa
              </button>
            )}
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-4 overflow-y-auto space-y-4">
          <div>
            {deal.display_code && (
              <p className="text-sm font-medium text-gray-500 mb-1">Mã: {deal.display_code}</p>
            )}
            <h3 className="text-base font-semibold text-gray-900 mb-1">{deal.title}</h3>
            <div className="flex flex-wrap gap-2 mt-1">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                {STATUS_LABELS[deal.status] || deal.status}
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">
                {STAGE_LABELS[deal.stage] || deal.stage}
              </span>
              {deal.confidence_level && (
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    deal.confidence_level === 'high'
                      ? 'bg-emerald-100 text-emerald-800'
                      : deal.confidence_level === 'low'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {deal.confidence_level === 'high'
                    ? 'Chắc chắn (Xanh)'
                    : deal.confidence_level === 'low'
                    ? 'Rủi ro cao (Đỏ)'
                    : '50/50 (Vàng)'}
                </span>
              )}
            </div>
            {deal.confidence_note && (
              <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-sm text-amber-900">
                <span className="font-medium">Ghi chú mức độ tự tin: </span>
                {deal.confidence_note}
              </div>
            )}
            {deal.description && String(deal.description).trim() && (
              <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <p className="text-xs font-medium text-slate-600 mb-1">Nội dung</p>
                <p className="text-sm text-gray-900 whitespace-pre-wrap break-words">{String(deal.description).trim()}</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 text-sm">
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <DollarSign className="w-5 h-5 text-green-600 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-500">Giá trị</p>
                <p className="font-semibold text-gray-900">{formatCurrency(deal.amount ?? 0)}</p>
              </div>
            </div>

            {deal.customer_full_name && (
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <User className="w-5 h-5 text-gray-500 flex-shrink-0" />
                <div>
                  <p className="text-xs text-gray-500">Khách hàng</p>
                  <p className="font-medium text-gray-900">{deal.customer_full_name}</p>
                  {deal.customer_phone && <p className="text-gray-600 text-xs">{deal.customer_phone}</p>}
                </div>
              </div>
            )}

            {deal.assigned_employee_name && (
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <Briefcase className="w-5 h-5 text-gray-500 flex-shrink-0" />
                <div>
                  <p className="text-xs text-gray-500">Người phụ trách</p>
                  <p className="font-medium text-gray-900">{deal.assigned_employee_name}</p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <Calendar className="w-5 h-5 text-gray-500 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-gray-500">Ngày dự kiến đóng</p>
                <p className="text-gray-900">{deal.expected_closing_date ? formatDate(deal.expected_closing_date) : '—'}</p>
                {(deal.created_at != null || deal.time_create != null) && (
                  <p className="text-xs text-gray-400 mt-0.5">Ngày tạo: {formatDate(deal.created_at ?? deal.time_create)}</p>
                )}
              </div>
            </div>


            {(deal.status === 'cancelled' || deal.status === 'lost') && deal.loss_reason && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-xs text-amber-800 font-medium">Lý do hủy / thất bại</p>
                <p className="text-sm text-amber-900 mt-0.5">{deal.loss_reason}</p>
              </div>
            )}

            {(deal.product_name || deal.quantity != null || deal.invoice_info || deal.notes) && (
              <div className="border-t border-gray-200 pt-3 space-y-3">
                <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
                  <button
                    type="button"
                    onClick={() => setShowSuccessDetails((v) => !v)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50"
                    aria-expanded={showSuccessDetails}
                  >
                    <div className="text-left">
                      <p className="text-sm font-semibold text-gray-900">Chi tiết khi thành công</p>
                      <p className="text-xs text-gray-500 normal-case">Tuỳ chọn · chỉ cần khi chốt deal</p>
                    </div>
                    <ChevronDown
                      className={`w-5 h-5 text-gray-400 transition-transform ${showSuccessDetails ? 'rotate-180' : 'rotate-0'}`}
                    />
                  </button>
                  {!showSuccessDetails ? null : (
                    <div className="px-4 pb-4 pt-1 space-y-3 bg-white">
                {deal.product_name && (
                  <div className="flex gap-3">
                    <Package className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-gray-500">Sản phẩm</p>
                      <p className="text-gray-900">{deal.product_name}</p>
                    </div>
                  </div>
                )}
                {deal.quantity != null && String(deal.quantity) !== '' && (
                  <div className="flex gap-3">
                    <Package className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-gray-500">Số lượng</p>
                      <p className="text-gray-900">{Number(deal.quantity)}</p>
                    </div>
                  </div>
                )}
                {deal.invoice_info && (
                  <div className="flex gap-3">
                    <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-gray-500">Thông tin hóa đơn</p>
                      <p className="text-gray-900 whitespace-pre-wrap">{deal.invoice_info}</p>
                    </div>
                  </div>
                )}
                {deal.notes && (
                  <div className="flex gap-3">
                    <StickyNote className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-gray-500">Ghi chú</p>
                      <p className="text-gray-900 whitespace-pre-wrap">{deal.notes}</p>
                    </div>
                  </div>
                )}
                    </div>
                  )}
                </div>
              </div>
            )}

          {/* Công việc liên quan */}
          <div className="border-t border-gray-200 pt-4 mt-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-primary-600" />
                <h3 className="text-sm font-semibold text-gray-900">Công việc của cơ hội</h3>
                <span className="text-xs text-gray-500">
                  ({tasks.filter((t) => t.is_completed).length}/{tasks.length})
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateTask(true)}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-primary-600 text-white rounded-md hover:bg-primary-700"
              >
                <Plus className="w-3.5 h-3.5" />
                Công việc
              </button>
            </div>
            {loadingTasks ? (
              <div className="text-xs text-gray-400">Đang tải...</div>
            ) : tasks.length === 0 ? (
              <div className="text-xs text-gray-500 italic">
                Chưa có công việc nào. Bấm “+ Công việc” để tạo việc cần làm cho cơ hội này.
              </div>
            ) : (
              <ul className="space-y-1.5">
                {tasks.map((t) => (
                  <li
                    key={t.task_id}
                    className={`flex items-start gap-2 p-2 rounded-md border ${
                      t.is_completed
                        ? 'bg-green-50 border-green-100'
                        : 'bg-white border-gray-200'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={!!t.is_completed}
                      onChange={async () => {
                        if (t.is_completed) return
                        setCompletingTask(t)
                      }}
                      className="mt-0.5"
                      disabled={t.is_completed}
                      title={t.is_completed ? 'Đã hoàn thành' : 'Tick để mở form ghi kết quả'}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {t.display_code && (
                          <span className="text-[10px] font-medium text-gray-500">{t.display_code}</span>
                        )}
                        <span
                          className={`text-sm font-medium text-gray-900 truncate ${
                            t.is_completed ? 'line-through text-gray-500' : ''
                          }`}
                        >
                          {t.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-gray-500 mt-0.5">
                        {t.assigned_employee_name && (
                          <span className="inline-flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {t.assigned_employee_name}
                          </span>
                        )}
                        {t.due_date && (
                          <span className="inline-flex items-center gap-1">
                            <ClockIcon className="w-3 h-3" />
                            {formatDate(t.due_date)}
                          </span>
                        )}
                      </div>
                      {t.description && String(t.description).trim() && (
                        <p
                          className="text-[11px] text-gray-600 mt-1 whitespace-pre-wrap break-words max-h-20 overflow-y-auto leading-snug"
                          title="Nội dung công việc"
                        >
                          {String(t.description).trim()}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Đơn CBS liên kết */}
          {(loadingCbs || cbsOrders.length > 0) && (
            <div className="border-t border-gray-200 pt-4 mt-4">
              <div className="flex items-center gap-2 mb-2">
                <Receipt className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-semibold text-gray-900">Đơn CBS liên kết</h3>
                {cbsOrders.length > 0 && (
                  <span className="text-xs text-gray-500">
                    ({cbsOrders.length} đơn · tổng {formatCurrency(totalCbs)} chưa VAT)
                  </span>
                )}
              </div>
              {loadingCbs ? (
                <div className="text-xs text-gray-400">Đang tải...</div>
              ) : (
                <div className="space-y-2">
                  {cbsOrders.map((o) => {
                    const amt = Number(o.price_not_vat_round ?? o.price_not_vat ?? 0)
                    return (
                      <div
                        key={o.id}
                        className="text-sm bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium text-gray-900 truncate">
                            {o.contract_no || o.id}
                            {o.period_ym && (
                              <span className="ml-2 text-xs text-gray-500">Kỳ {o.period_ym}</span>
                            )}
                          </div>
                          <div className="text-emerald-700 font-semibold flex-shrink-0">
                            {formatCurrency(amt)}
                          </div>
                        </div>
                        {o.product_name && (
                          <div className="text-xs text-gray-600 truncate">{o.product_name}</div>
                        )}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 mt-1">
                          {o.claim_status === 'approved' ? (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                              Đã duyệt
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700">
                              {o.claim_status || '—'}
                            </span>
                          )}
                          {o.kpi_kind_at_approve && (
                            <span
                              className={`px-1.5 py-0.5 rounded ${
                                o.kpi_kind_at_approve === 'NEW'
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-gray-100 text-gray-700'
                              }`}
                            >
                              {o.kpi_kind_at_approve === 'NEW' ? 'KH Mới' : 'KH Cũ'}
                            </span>
                          )}
                          {o.claimed_by_name && <span>Bán: {o.claimed_by_name}</span>}
                          {o.payment_date && (
                            <span>TT: {formatDate(o.payment_date as number)}</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Workflow (timeline) + File đính kèm */}
          <div className="border-t border-gray-200 pt-4 mt-4">
            <DealTimeline
              key={`tl-${tasksRefresh}`}
              dealId={deal.deal_id}
              onRefresh={() => setTasksRefresh((v) => v + 1)}
            />
          </div>
          </div>
        </div>
      </div>

      {showCreateTask && (
        <CreateTaskModal
          onClose={() => setShowCreateTask(false)}
          onSuccess={() => {
            setShowCreateTask(false)
            setTasksRefresh((v) => v + 1)
          }}
          employees={employees}
          userRole={user?.role}
          presetDeal={{
            deal_id: deal.deal_id,
            display_code: deal.display_code,
            customer_id: deal.customer_id ?? null,
            customer_name: deal.customer_full_name ?? null,
            assigned_to: deal.assigned_to ?? null,
          }}
        />
      )}

      {completingTask && (
        <CompleteTaskModal
          taskId={completingTask.task_id}
          taskTitle={completingTask.title}
          customerName={deal.customer_full_name}
          onSuccess={() => {
            setCompletingTask(null)
            setTasksRefresh((v) => v + 1)
            toast.success('Đã hoàn thành công việc.')
          }}
          onCancel={() => setCompletingTask(null)}
        />
      )}
    </div>
  )
}
