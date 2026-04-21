'use client'

import { useState, useRef } from 'react'
import { apiClient } from '@/lib/api'
import { X, Download, Upload, Loader2, AlertCircle, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'

interface RowMsg {
  row: number
  message: string
}

interface ImportResult {
  created_count: number
  error_count: number
  created: Array<{ row: number; full_name: string; phone: string }>
  errors: RowMsg[]
}

interface CustomerImportModalProps {
  onClose: () => void
  onSuccess: () => void
}

export function CustomerImportModal({ onClose, onSuccess }: CustomerImportModalProps) {
  const [downloading, setDownloading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const downloadTemplate = async () => {
    setDownloading(true)
    try {
      const res = await apiClient.get('/api/customers/import/template', {
        responseType: 'blob',
      })
      const blob = new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'mau_import_khach_hang.xlsx'
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Đã tải file mẫu')
    } catch (e: unknown) {
      const msg =
        typeof e === 'object' && e !== null && 'response' in e
          ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined
      toast.error(msg || 'Không tải được file mẫu')
    } finally {
      setDownloading(false)
    }
  }

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setResult(null)
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await apiClient.post('/api/customers/import', fd)
      if (res.data.success && res.data.data) {
        const data = res.data.data as ImportResult
        setResult(data)
        if (data.created_count > 0) {
          toast.success(res.data.message || `Đã tạo ${data.created_count} khách hàng`)
          onSuccess()
        } else if (data.error_count > 0) {
          toast.error('Không có dòng nào import thành công. Xem chi tiết bên dưới.')
        }
      }
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string } } }
      toast.error(ax.response?.data?.message || 'Import thất bại')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="flex justify-between items-center p-5 border-b">
          <h2 className="text-lg font-bold text-gray-900">Import khách hàng từ Excel</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <ol className="text-sm text-gray-600 list-decimal list-inside space-y-1">
            <li>
              Tải file mẫu; sheet &quot;Khách hàng&quot;: cột <strong>customer_type</strong> (E) và{' '}
              <strong>kpi_customer_kind</strong> (F, NEW/EXISTING) có danh sách chọn — đồng bộ form Thêm khách hàng; sheet
              &quot;Hướng dẫn&quot; có quy tắc.
            </li>
            <li>
              <strong>Sales:</strong> mọi dòng được gán <strong>Nhân viên chăm sóc</strong> = chính bạn; cột{' '}
              <code className="text-xs bg-gray-100 px-1 rounded">assigned_username</code> /{' '}
              <code className="text-xs bg-gray-100 px-1 rounded">assigned_to</code> bị bỏ qua.
            </li>
            <li>
              Các vai trò khác: có thể điền username nhân viên hoặc UUID (<code className="text-xs bg-gray-100 px-1">assigned_to</code>
              ); để trống → gán cho người đang import.
            </li>
            <li>Trùng số điện thoại (hoặc MST nếu có) trong công ty sẽ báo lỗi theo dòng.</li>
          </ol>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={downloadTemplate}
              disabled={downloading}
              className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Tải file mẫu
            </button>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Chọn file Excel
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="hidden"
              onChange={onFile}
            />
          </div>
          {result && (
            <div className="border rounded-lg p-3 text-sm space-y-2">
              <div className="flex items-center gap-2 text-green-700">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>Thành công: {result.created_count} dòng</span>
              </div>
              {result.error_count > 0 && (
                <div className="flex items-start gap-2 text-red-700">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Lỗi: {result.error_count} dòng</span>
                </div>
              )}
              {result.errors.length > 0 && (
                <ul className="max-h-32 overflow-y-auto text-xs text-red-800 bg-red-50 rounded p-2">
                  {result.errors.map((er, i) => (
                    <li key={i}>
                      Dòng {er.row}: {er.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
