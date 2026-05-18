'use client'

import { X } from 'lucide-react'
import { useEffect } from 'react'

export interface CbsOrderDetail {
  id: string
  period_ym: string | null
  contract_no: string | null
  contract_type: string | null
  product_name: string | null
  product_code: string | null
  primary_product_code: string | null
  masp: string | null
  external_id1: string | null
  serial: string | null
  customer_name: string | null
  customer_type: string | null
  partner: string | null
  cen_code_dev: string | null
  cbs_staff: string | null
  payment_type: string | null
  price_not_vat: string | number
  price_not_vat_round: string | number
  price_vat: string | number
  vat: string | number
  sub_start_date: string | number | null
  first_date_revenue: string | number | null
  active_date: string | number | null
  payment_date: string | number | null
  claim_status?: string | null
  claimed_by?: string | null
  claimed_by_name?: string | null
  claimed_at?: string | number | null
  approved_by?: string | null
  approved_by_name?: string | null
  approved_at?: string | number | null
  customer_id?: string | null
  deal_id?: string | null
  kpi_kind_at_approve?: string | null
  crm_customer_name?: string | null
  crm_customer_phone?: string | null
  crm_customer_tax_code?: string | null
  crm_customer_kind?: string | null
  deal_display_code?: string | null
  deal_title?: string | null
}

function formatVND(n: number | string | null | undefined): string {
  const x = Number(n ?? 0)
  if (Number.isNaN(x)) return '—'
  try {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
      maximumFractionDigits: 0,
    }).format(x)
  } catch {
    return `${x.toLocaleString('vi-VN')} ₫`
  }
}

function formatDateOnly(ms: string | number | null | undefined): string {
  if (ms == null || ms === '') return '—'
  const n = Number(ms)
  if (!Number.isFinite(n)) return '—'
  const d = new Date(n)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()}`
}

function formatDateTime(ms: string | number | null | undefined): string {
  if (ms == null || ms === '') return '—'
  const n = Number(ms)
  if (!Number.isFinite(n)) return '—'
  const d = new Date(n)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()} ${hh}:${mi}`
}

function Row({
  label,
  value,
  strong,
  mono,
}: {
  label: string
  value: React.ReactNode
  strong?: boolean
  mono?: boolean
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 py-2 border-b border-gray-100 last:border-b-0">
      <div className="text-xs text-gray-500 sm:w-56 sm:flex-shrink-0 sm:pt-0.5">
        {label}
      </div>
      <div
        className={`text-sm ${strong ? 'font-semibold text-gray-900' : 'text-gray-800'} ${
          mono ? 'tabular-nums' : ''
        } break-words`}
      >
        {value ?? '—'}
      </div>
    </div>
  )
}

type CbsOrderDetailView = CbsOrderDetail & {
  _children?: CbsOrderDetail[]
  _childCount?: number
}

export function CbsOrderDetailModal({
  open,
  order,
  onClose,
}: {
  open: boolean
  order: CbsOrderDetailView | null
  onClose: () => void
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !order) return null

  const sellerDisplay = order.claimed_by_name || order.claimed_by || null
  const approverDisplay = order.approved_by_name || order.approved_by || null
  const statusLabel =
    order.claim_status === 'mixed'
      ? 'Nhiều trạng thái (theo dòng)'
      : order.claim_status === 'approved'
      ? 'Đã xác nhận'
      : order.claim_status === 'pending'
      ? 'Chờ duyệt'
      : order.claimed_by
      ? 'Đã tích'
      : 'Chưa có người bán'
  const statusTone =
    order.claim_status === 'mixed'
      ? 'bg-sky-50 text-sky-800 border-sky-200'
      : order.claim_status === 'approved'
      ? 'bg-green-50 text-green-700 border-green-200'
      : order.claim_status === 'pending'
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : order.claimed_by
      ? 'bg-primary-50 text-primary-700 border-primary-200'
      : 'bg-gray-100 text-gray-600 border-gray-200'
  const lineItems =
    order._children && order._children.length > 1 ? order._children : null

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-3xl rounded-xl shadow-2xl flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-4 border-b border-gray-200">
          <div className="min-w-0">
            <div className="text-xs text-gray-500 uppercase tracking-wider">
              Chi tiết đơn CBS
            </div>
            <div
              className="text-lg font-bold text-gray-900 truncate"
              title={order.customer_name || ''}
            >
              {order.customer_name || '—'}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span
                className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full border ${statusTone}`}
              >
                {statusLabel}
              </span>
              {sellerDisplay && (
                <span className="text-xs text-gray-500">
                  Người bán:{' '}
                  <strong className="text-gray-800">{sellerDisplay}</strong>
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md hover:bg-gray-100 text-gray-500"
            title="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
              Khách hàng & Hợp đồng
            </h4>
            <Row label="Đơn vị" value={order.cen_code_dev} />
            <Row
              label="Tên doanh nghiệp"
              value={order.customer_name}
              strong
            />
            <Row label="Mã số thuế" value={order.external_id1} mono />
            <Row label="Loại khách hàng" value={order.customer_type} />
            <Row label="Số hợp đồng" value={order.contract_no} mono />
            <Row label="Loại hợp đồng" value={order.contract_type} />
          </section>

          {lineItems ? (
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                Chi tiết từng dòng ({lineItems.length})
              </h4>
              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="px-2 py-2 text-left font-semibold">Sản phẩm</th>
                      <th className="px-2 py-2 text-left font-semibold">Serial</th>
                      <th className="px-2 py-2 text-right font-semibold">Giá (VAT)</th>
                      <th className="px-2 py-2 text-left font-semibold">Người bán</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {lineItems.map((line) => (
                      <tr key={line.id}>
                        <td className="px-2 py-2 text-gray-800">
                          <div className="font-medium">{line.product_name || '—'}</div>
                          <div className="text-gray-500">{line.product_code || ''}</div>
                        </td>
                        <td className="px-2 py-2 text-gray-600 tabular-nums">{line.serial || '—'}</td>
                        <td className="px-2 py-2 text-right tabular-nums font-medium">
                          {formatVND(line.price_vat)}
                        </td>
                        <td className="px-2 py-2 text-gray-600">
                          {line.claimed_by_name || line.claimed_by || '—'}
                          {line.claim_status === 'pending' && (
                            <span className="ml-1 text-amber-700">(chờ duyệt)</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[11px] text-gray-500">
                Giá trị hợp đồng bên dưới là tổng các dòng. KPI sản phẩm:{' '}
                <strong>1 chỉ tiêu / hợp đồng</strong> khi đã duyệt.
              </p>
            </section>
          ) : (
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                Sản phẩm / Dịch vụ
              </h4>
              <Row
                label="Mã dịch vụ"
                value={order.masp || order.primary_product_code}
                mono
              />
              <Row label="Mã sản phẩm" value={order.product_code} mono />
              <Row label="Tên dịch vụ" value={order.product_name} strong />
              <Row label="Số Serial" value={order.serial} mono />
            </section>
          )}

          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
              Giá trị hợp đồng
            </h4>
            <Row
              label="Giá trị hợp đồng trước thuế"
              value={formatVND(order.price_not_vat)}
              mono
            />
            <Row
              label="Giá trị hợp đồng trước thuế (Làm tròn)"
              value={formatVND(order.price_not_vat_round)}
              mono
            />
            <Row label="Thuế VAT" value={formatVND(order.vat)} mono />
            <Row
              label="Giá trị hợp đồng sau thuế"
              value={formatVND(order.price_vat)}
              strong
              mono
            />
          </section>

          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
              Nhân sự & Đại lý
            </h4>
            <Row label="AM / Đại lý" value={order.cbs_staff} />
            <Row label="Đơn vị phát triển" value={order.partner} />
            <Row label="Loại" value={order.payment_type} />
          </section>

          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
              Thời gian
            </h4>
            <Row label="Ngày thanh toán" value={formatDateOnly(order.payment_date)} />
            <Row label="Ngày kích hoạt" value={formatDateOnly(order.active_date)} />
            <Row
              label="Ngày bắt đầu hợp đồng"
              value={formatDateOnly(order.sub_start_date)}
            />
            <Row
              label="Ngày phát sinh doanh thu lần đầu"
              value={formatDateOnly(order.first_date_revenue)}
            />
          </section>

          {(order.customer_id || order.deal_id) && (
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                Liên kết CRM
              </h4>
              <Row
                label="Khách hàng trong CRM"
                value={
                  order.customer_id ? (
                    <a
                      href={`/customers/${order.customer_id}`}
                      className="text-primary-700 hover:underline font-semibold"
                      title="Mở hồ sơ khách hàng"
                    >
                      {order.crm_customer_name || order.customer_name || order.customer_id}
                    </a>
                  ) : (
                    <span className="text-gray-400 italic">Chưa liên kết</span>
                  )
                }
              />
              {order.customer_id && (
                <>
                  <Row label="Điện thoại CRM" value={order.crm_customer_phone} mono />
                  <Row label="MST CRM" value={order.crm_customer_tax_code} mono />
                </>
              )}
              <Row
                label="Phân loại KPI lúc duyệt"
                value={
                  order.kpi_kind_at_approve ? (
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                        order.kpi_kind_at_approve === 'EXISTING'
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}
                    >
                      {order.kpi_kind_at_approve === 'EXISTING' ? 'Tập hiện hữu' : 'Tập mới'}
                    </span>
                  ) : (
                    <span className="text-gray-400 italic">Chưa duyệt</span>
                  )
                }
              />
              <Row
                label="Cơ hội (Deal) liên kết"
                value={
                  order.deal_id ? (
                    <span className="text-gray-800">
                      <span className="font-mono text-xs text-gray-500">{order.deal_display_code || order.deal_id}</span>
                      {order.deal_title ? <span className="ml-2">— {order.deal_title}</span> : null}
                    </span>
                  ) : (
                    <span className="text-gray-400 italic">
                      Không có deal tương ứng (doanh thu tính trực tiếp từ CBS)
                    </span>
                  )
                }
              />
            </section>
          )}

          {(order.claimed_by || order.approved_by) && (
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                Xác nhận người bán
              </h4>
              <Row
                label="Người bán"
                value={
                  sellerDisplay ? (
                    <span className="font-semibold text-gray-900">
                      {sellerDisplay}
                    </span>
                  ) : (
                    '—'
                  )
                }
              />
              <Row label="Thời điểm tích" value={formatDateTime(order.claimed_at)} />
              <Row label="Người duyệt" value={approverDisplay} />
              <Row label="Thời điểm duyệt" value={formatDateTime(order.approved_at)} />
            </section>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-3 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  )
}
