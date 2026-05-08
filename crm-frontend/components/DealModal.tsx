'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { X, Loader2, ChevronDown } from 'lucide-react'
import toast from 'react-hot-toast'
import { DealTimeline } from './DealTimeline'

interface Deal {
  deal_id: string
  title: string
  amount: number
  stage: string
  status?: string
  loss_reason?: string | null
  customer_id?: string
  assigned_to?: string | null
  expected_closing_date?: number | string
  product_name?: string | null
  quantity?: number | null
  invoice_info?: string | null
  notes?: string | null
  description?: string | null
  display_code?: string | null
  deal_category?: 'MASS' | 'PROJECT' | string | null
  confidence_level?: 'high' | 'medium' | 'low' | string | null
  confidence_note?: string | null
  primary_product_code?: string | null
  first_contact_date?: number | string | null
}

const STATUS_OPTIONS = [
  { id: 'active', label: 'Đang hoạt động' },
  { id: 'won', label: 'Đã chốt' },
  { id: 'cancelled', label: 'Đã hủy' },
  { id: 'lost', label: 'Thất bại' }
]

const STAGES_MASS = [
  { id: 'tiep_can', label: 'Tiếp cận' },
  { id: 'tu_van', label: 'Tư vấn' },
  { id: 'bao_gia', label: 'Báo giá' },
  { id: 'thuong_thao', label: 'Thương thảo' },
  { id: 'thanh_cong', label: 'Thành công' }
]
const STAGES_PROJECT = [
  { id: 'tiep_can', label: 'Tiếp cận' },
  { id: 'tu_van', label: 'Tư vấn' },
  { id: 'khao_sat', label: 'Khảo sát' },
  { id: 'bao_gia', label: 'Báo giá' },
  { id: 'thuong_thao', label: 'Thương thảo' },
  { id: 'thanh_cong', label: 'Thành công' }
]

interface DealModalProps {
  deal: Deal | null
  customerId?: string
  onClose: () => void
  onSuccess: () => void
}

function parseExpectedClosingDate(value: number | string | null | undefined): string {
  if (value == null || value === '') return ''
  const num = typeof value === 'string' ? parseInt(value, 10) : value
  if (Number.isNaN(num) || num <= 0) return ''
  const ms = num.toString().length <= 10 ? num * 1000 : num
  const date = new Date(ms)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().split('T')[0]
}

export function DealModal({ deal, customerId, onClose, onSuccess }: DealModalProps) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [showSuccessDetails, setShowSuccessDetails] = useState(false)
  const [formData, setFormData] = useState({
    title: deal?.title || '',
    amount: deal?.amount || 0,
    stage: deal?.stage || 'tiep_can',
    status: deal?.status || 'active',
    loss_reason: deal?.loss_reason ?? '',
    customer_id: deal?.customer_id || customerId || '',
    assigned_to: deal?.assigned_to || (typeof user?.id === 'string' ? user.id : ''),
    expected_closing_date: parseExpectedClosingDate(deal?.expected_closing_date),
    product_name: deal?.product_name ?? '',
    quantity: deal?.quantity ?? '',
    invoice_info: deal?.invoice_info ?? '',
    notes: deal?.notes ?? '',
    description: deal?.description ?? '',
    deal_category: (deal?.deal_category as 'MASS' | 'PROJECT') || 'MASS',
    confidence_level: (deal?.confidence_level as 'high' | 'medium' | 'low') || 'medium',
    confidence_note: deal?.confidence_note ?? '',
    primary_product_code: deal?.primary_product_code ?? '',
    first_contact_date: parseExpectedClosingDate(deal?.first_contact_date)
  })
  const [customers, setCustomers] = useState<any[]>([])
  const [assignableEmployees, setAssignableEmployees] = useState<{ employee_id: string; full_name?: string; username?: string }[]>([])
  const [stageOptions, setStageOptions] = useState<{ id: string; label: string }[]>(STAGES_MASS)

  useEffect(() => {
    if (!customerId) fetchCustomers()
  }, [customerId])

  useEffect(() => {
    if (user && user.role !== 'sales') {
      apiClient.get('/api/employees/assignable').then((res) => {
        if (res.data?.success && Array.isArray(res.data.data)) setAssignableEmployees(res.data.data)
      }).catch(() => setAssignableEmployees([]))
    }
  }, [user])

  useEffect(() => {
    setStageOptions(formData.deal_category === 'PROJECT' ? STAGES_PROJECT : STAGES_MASS)
  }, [formData.deal_category])

  useEffect(() => {
    if (deal) {
      const category = (deal.deal_category as 'MASS' | 'PROJECT') || 'MASS'
      setFormData((prev) => ({
        ...prev,
        title: deal.title,
        amount: deal.amount ?? 0,
        stage: deal.stage || 'tiep_can',
        status: deal.status || 'active',
        loss_reason: deal.loss_reason ?? '',
        customer_id: deal.customer_id || customerId || '',
        assigned_to: deal.assigned_to ?? '',
        expected_closing_date: parseExpectedClosingDate(deal.expected_closing_date),
        product_name: deal.product_name ?? '',
        quantity: deal.quantity ?? '',
        invoice_info: deal.invoice_info ?? '',
        notes: deal.notes ?? '',
        description: deal.description ?? '',
        deal_category: category,
        confidence_level: (deal.confidence_level as 'high' | 'medium' | 'low') || 'medium',
        confidence_note: deal.confidence_note ?? '',
        primary_product_code: deal.primary_product_code ?? '',
        first_contact_date: parseExpectedClosingDate(deal.first_contact_date)
      }))
      setStageOptions(category === 'PROJECT' ? STAGES_PROJECT : STAGES_MASS)
    }
  }, [deal, customerId])

  const fetchCustomers = async () => {
    try {
      const response = await apiClient.get('/api/customers')
      if (response.data.success) {
        setCustomers(response.data.data || [])
      }
    } catch (error) {
      console.error('Error fetching customers:', error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if ((formData.status === 'cancelled' || formData.status === 'lost') && !(formData.loss_reason ?? '').trim()) {
      toast.error('Vui lòng nhập lý do khi trạng thái là Đã hủy hoặc Thất bại.')
      return
    }
    if (formData.confidence_level === 'low' && !(formData.confidence_note ?? '').trim()) {
      toast.error('Khi mức độ tự tin là "Khả năng thất bại cao" (Đỏ), bắt buộc nhập ghi chú lý do.')
      return
    }
    setLoading(true)

    try {
      const payload: Record<string, unknown> = {
        ...formData,
        deal_category: formData.deal_category || 'MASS',
        amount: parseFloat(formData.amount.toString()),
        assigned_to: formData.assigned_to || (user?.id ?? null),
        expected_closing_date: formData.expected_closing_date
          ? new Date(formData.expected_closing_date).getTime()
          : null,
        product_name: formData.product_name?.trim() || null,
        quantity: formData.quantity !== '' && formData.quantity != null ? Number(formData.quantity) : null,
        invoice_info: formData.invoice_info?.trim() || null,
        notes: formData.notes?.trim() || null,
        description: formData.description?.trim() || null,
        confidence_level: formData.confidence_level || 'medium',
        confidence_note: formData.confidence_level === 'low' ? (formData.confidence_note?.trim() || null) : (formData.confidence_note?.trim() || null),
        primary_product_code: formData.primary_product_code?.trim() ? formData.primary_product_code.trim().toUpperCase() : null,
        first_contact_date: formData.first_contact_date
          ? new Date(formData.first_contact_date).getTime()
          : null
      }
      if (deal) {
        payload.status = formData.status
        if (formData.status === 'cancelled' || formData.status === 'lost') {
          payload.loss_reason = (formData.loss_reason ?? '').trim() || null
        }
      }

      if (deal) {
        await apiClient.patch(`/api/deals/${deal.deal_id}`, payload)
        toast.success('Cập nhật deal thành công!')
      } else {
        await apiClient.post('/api/deals', payload)
        toast.success('Tạo deal thành công!')
      }
      onSuccess()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Có lỗi xảy ra')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">
            {deal ? 'Chỉnh sửa Deal' : 'Tạo Deal mới'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {deal?.display_code && (
          <p className="text-sm font-medium text-gray-500 mb-3">Mã: {deal.display_code}</p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Loại hình kinh doanh</label>
            <select
              value={formData.deal_category}
              onChange={(e) => {
                const v = e.target.value as 'MASS' | 'PROJECT'
                const stages = v === 'PROJECT' ? STAGES_PROJECT : STAGES_MASS
                const firstStage = stages[0].id
                setFormData((prev) => ({
                  ...prev,
                  deal_category: v,
                  stage: stages.some((s) => s.id === prev.stage) ? prev.stage : firstStage
                }))
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0074BD] focus:border-transparent"
            >
              <option value="MASS">MASS (Sản phẩm đại trà)</option>
              <option value="PROJECT">Dự án (Customize)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tiêu đề <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0074BD] focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nội dung</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Mô tả nhu cầu, diễn biến trao đổi, công việc cần làm tiếp theo…"
              rows={4}
              maxLength={4000}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0074BD] focus:border-transparent text-sm resize-y min-h-[5rem]"
            />
            <p className="text-xs text-gray-400 mt-1 text-right">{formData.description.length} / 4000</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phân loại chất lượng cơ hội (Mức độ tự tin)</label>
            <select
              value={formData.confidence_level}
              onChange={(e) => setFormData({ ...formData, confidence_level: e.target.value as 'high' | 'medium' | 'low' })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0074BD] focus:border-transparent"
            >
              <option value="high">Chắc chắn thành công (Xanh)</option>
              <option value="medium">50/50 (Vàng)</option>
              <option value="low">Khả năng thất bại cao (Đỏ)</option>
            </select>
            {formData.confidence_level === 'low' && (
              <div className="mt-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ghi chú lý do <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  value={formData.confidence_note}
                  onChange={(e) => setFormData({ ...formData, confidence_note: e.target.value })}
                  placeholder="VD: Ngân sách khách hàng bị cắt giảm, đối thủ phá giá..."
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0074BD] focus:border-transparent"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Giá trị (VND)</label>
              <input
                type="number"
                min="0"
                step="1000"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0074BD] focus:border-transparent"
              />
              {user?.role === 'sales' && formData.amount > 500_000_000 && (
                <p className="text-xs text-amber-700 mt-1">Deal &gt; 500 triệu sẽ chờ Leader/Manager phê duyệt trước khi vào Pipeline.</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Giai đoạn</label>
              <select
                value={formData.stage}
                onChange={(e) => setFormData({ ...formData, stage: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0074BD] focus:border-transparent"
              >
                {stageOptions.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {deal && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Trạng thái</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0074BD] focus:border-transparent"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">Chọn &quot;Đang hoạt động&quot; để đưa deal lại vào bảng Kanban.</p>
              </div>
              {(formData.status === 'cancelled' || formData.status === 'lost') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Lý do hủy / thất bại <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={formData.loss_reason}
                    onChange={(e) => setFormData({ ...formData, loss_reason: e.target.value })}
                    placeholder="VD: Khách đổi ý, Đối thủ cạnh tranh..."
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0074BD] focus:border-transparent"
                  />
                </div>
              )}
            </>
          )}

          <div className={`grid gap-4 ${!customerId ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {!customerId && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Khách hàng</label>
                <select
                  value={formData.customer_id}
                  onChange={(e) => setFormData({ ...formData, customer_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0074BD] focus:border-transparent"
                >
                  <option value="">-- Chọn khách hàng --</option>
                  {customers.map((customer) => (
                    <option key={customer.customer_id} value={customer.customer_id}>
                      {customer.full_name} - {customer.phone}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ngày tiếp cận lần đầu</label>
              <input
                type="date"
                value={formData.first_contact_date}
                onChange={(e) => setFormData({ ...formData, first_contact_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0074BD] focus:border-transparent"
              />
              <p className="text-xs text-gray-400 mt-1">Bỏ trống nếu trùng ngày tạo deal.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ngày dự kiến đóng deal</label>
              <input
                type="date"
                value={formData.expected_closing_date}
                onChange={(e) => setFormData({ ...formData, expected_closing_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0074BD] focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mã dịch vụ chính</label>
              <input
                type="text"
                value={formData.primary_product_code}
                onChange={(e) => setFormData({ ...formData, primary_product_code: e.target.value })}
                placeholder="VD: INTERNET_DN, TMQT123…"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0074BD] focus:border-transparent uppercase"
              />
              <p className="text-xs text-gray-400 mt-1">Khớp với mã dịch vụ CBS để tự link khi có doanh thu.</p>
            </div>
            {user?.role !== 'sales' && assignableEmployees.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Người phụ trách</label>
                <select
                  value={formData.assigned_to}
                  onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0074BD] focus:border-transparent"
                >
                  <option value="">-- Chọn người phụ trách --</option>
                  {assignableEmployees.map((emp) => (
                    <option key={emp.employee_id} value={emp.employee_id}>
                      {emp.full_name || emp.username || emp.employee_id}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="border-t border-gray-200 pt-4 mt-4">
            <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
              <button
                type="button"
                onClick={() => setShowSuccessDetails((v) => !v)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50"
                aria-expanded={showSuccessDetails}
              >
                <div className="text-left">
                  <p className="text-sm font-semibold text-gray-900">Chi tiết khi thành công</p>
                  <p className="text-xs text-gray-500">Tuỳ chọn · chỉ cần nhập khi chốt deal</p>
                </div>
                <ChevronDown
                  className={`w-5 h-5 text-gray-400 transition-transform ${showSuccessDetails ? 'rotate-180' : 'rotate-0'}`}
                />
              </button>

              {showSuccessDetails && (
                <div className="px-4 pb-4 pt-1 space-y-3 bg-white">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Tên sản phẩm</label>
                      <input
                        type="text"
                        value={formData.product_name}
                        onChange={(e) => setFormData({ ...formData, product_name: e.target.value })}
                        placeholder="VD: Gói cước DN"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0074BD] focus:border-transparent text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Số lượng</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={formData.quantity}
                        onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                        placeholder="0"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0074BD] focus:border-transparent text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Thông tin hóa đơn</label>
                    <textarea
                      value={formData.invoice_info}
                      onChange={(e) => setFormData({ ...formData, invoice_info: e.target.value })}
                      placeholder="Số HĐ, mã HĐ..."
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0074BD] focus:border-transparent text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Ghi chú thêm</label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      placeholder="Ghi chú nội bộ..."
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0074BD] focus:border-transparent text-sm"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {deal && (
            <div className="border-t border-gray-200 pt-4 mt-4">
              <DealTimeline dealId={deal.deal_id} onRefresh={() => {}} />
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-[#0074BD] text-white rounded-lg hover:bg-[#005a94] transition disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : deal ? 'Cập nhật' : 'Tạo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
