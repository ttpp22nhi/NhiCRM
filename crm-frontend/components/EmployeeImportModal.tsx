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
  warning_count: number
  created: Array<{ row: number; username: string; full_name: string }>
  errors: RowMsg[]
  warnings: RowMsg[]
}

interface EmployeeImportModalProps {
  onClose: () => void
  onSuccess: () => void
}

export function EmployeeImportModal({ onClose, onSuccess }: EmployeeImportModalProps) {
  const [downloading, setDownloading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const downloadTemplate = async () => {
    setDownloading(true)
    try {
      const res = await apiClient.get('/api/employees/import/template', {
        responseType: 'blob',
      })
      const blob = new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'mau_import_nhan_vien.xlsx'
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
      const res = await apiClient.post('/api/employees/import', fd)
      if (res.data.success && res.data.data) {
        const data = res.data.data as ImportResult
        setResult(data)
        if (data.created_count > 0) {
          toast.success(res.data.message || `Đã tạo ${data.created_count} nhân viên`)
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
          <h2 className="text-lg font-bold text-gray-900">Import nhân viên từ Excel</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <ol className="text-sm text-gray-600 list-decimal list-inside space-y-1">
            <li>Tải file mẫu và điền theo cột hướng dẫn (sheet &quot;Hướng dẫn&quot; trong file).</li>
            <li>Dòng đầu tiên của sheet &quot;Nhân viên&quot; phải là tiêu đề cột (username, password, full_name…).</li>
            <li>
              Cột <strong>rank</strong> (cấp bậc) là <strong>tùy chọn</strong>: ghi theo quy ước nội bộ (vd. 1/2/3, A/B, NV1…) hoặc để
              trống — không bắt buộc và không khớp danh mục có sẵn trong CRM.
            </li>
            <li>Chỉ chấp nhận .xlsx / .xls, tối đa 5MB.</li>
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
              {result.warning_count > 0 && (
                <p className="text-amber-700">Cảnh báo: {result.warning_count} (xem danh sách)</p>
              )}
              {result.error_count > 0 && (
                <div className="flex items-start gap-2 text-red-700">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Lỗi: {result.error_count} dòng</span>
                </div>
              )}
              {result.warnings.length > 0 && (
                <ul className="max-h-24 overflow-y-auto text-xs text-amber-800 bg-amber-50 rounded p-2">
                  {result.warnings.map((w, i) => (
                    <li key={i}>
                      Dòng {w.row}: {w.message}
                    </li>
                  ))}
                </ul>
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
