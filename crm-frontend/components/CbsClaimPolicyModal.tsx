'use client'

import { useEffect, useState } from 'react'
import { X, Loader2, Clock, CheckCircle2, ShieldCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import { apiClient } from '@/lib/api'

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
  cbsConfigured: boolean
  initialAutoApprove: boolean
}

export function CbsClaimPolicyModal({
  open,
  onClose,
  onSaved,
  cbsConfigured,
  initialAutoApprove,
}: Props) {
  const [autoApprove, setAutoApprove] = useState(initialAutoApprove)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) setAutoApprove(initialAutoApprove)
  }, [open, initialAutoApprove])

  if (!open) return null

  const save = async () => {
    if (!cbsConfigured) {
      toast.error('Cần cấu hình CBS trước khi đặt quy trình duyệt đơn.')
      return
    }
    if (autoApprove === initialAutoApprove) {
      onClose()
      return
    }
    setSaving(true)
    try {
      const r = await apiClient.patch<{ success: boolean; message: string }>(
        '/api/cbs/config/claim-policy',
        { sales_claim_auto_approve: autoApprove }
      )
      toast.success(r.data.message || 'Đã lưu quy trình duyệt đơn.')
      onSaved()
      onClose()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } }
      toast.error(err.response?.data?.message || 'Không lưu được quy trình duyệt đơn.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary-600" />
            <h3 className="text-base font-semibold text-gray-900">Cấu hình duyệt đơn</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-700"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 text-sm space-y-4">
          <p className="text-gray-600">
            Chọn quy trình khi <strong>Sales tự tích đơn</strong> trên trang Doanh thu CBS. Thiết
            lập áp dụng cho toàn bộ nhân viên trong tenant.
          </p>

          {!cbsConfigured && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Cần <strong>Cấu hình CBS</strong> (tài khoản đồng bộ) trước khi lưu quy trình duyệt
              đơn.
            </div>
          )}

          <div className="space-y-2">
            <label
              className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition ${
                !autoApprove
                  ? 'border-primary-300 bg-primary-50/60 ring-1 ring-primary-200'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                name="claim-policy"
                checked={!autoApprove}
                onChange={() => setAutoApprove(false)}
                className="mt-1"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 font-medium text-gray-900">
                  <Clock className="w-4 h-4 text-primary-600 shrink-0" />
                  Cần kiểm duyệt đơn
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Sales tích đơn → trạng thái <strong>chờ duyệt</strong>. Admin / Quản lý / Leader
                  xác nhận trước khi tính vào KPI.
                </p>
              </div>
            </label>

            <label
              className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition ${
                autoApprove
                  ? 'border-green-300 bg-green-50/60 ring-1 ring-green-200'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                name="claim-policy"
                checked={autoApprove}
                onChange={() => setAutoApprove(true)}
                className="mt-1"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 font-medium text-gray-900">
                  <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                  Tự động duyệt đơn
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Sales tích đơn → <strong>duyệt ngay</strong>, tính KPI và liên kết khách hàng /
                  deal tương ứng không cần bước xác nhận thêm.
                </p>
              </div>
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t bg-gray-50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md"
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !cbsConfigured}
            className="inline-flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-primary-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Lưu cấu hình
          </button>
        </div>
      </div>
    </div>
  )
}
