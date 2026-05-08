'use client'

import { useEffect, useState } from 'react'
import { X, Loader2, Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'
import { apiClient } from '@/lib/api'

interface CbsConfig {
  tenant_id: string
  base_url: string
  username: string
  password_is_set: boolean
  unit: number
  report_config_code: string
  auto_sync: boolean
  last_synced_at: number | null
  last_sync_status: string | null
  last_sync_message: string | null
}

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
}

export function CbsConfigModal({ open, onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [cfg, setCfg] = useState<CbsConfig | null>(null)
  const [baseUrl, setBaseUrl] = useState('https://cbs.mobifone.vn')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [unit, setUnit] = useState<string>('880')
  const [reportCode, setReportCode] = useState('REPORT_INVOICING_PREPAID')
  const [autoSync, setAutoSync] = useState(true)

  useEffect(() => {
    if (!open) return
    let alive = true
    const load = async () => {
      setLoading(true)
      try {
        const res = await apiClient.get<{ success: boolean; data: CbsConfig | null }>(
          '/api/cbs/config'
        )
        if (!alive) return
        const c = res.data.data
        setCfg(c)
        if (c) {
          setBaseUrl(c.base_url || 'https://cbs.mobifone.vn')
          setUsername(c.username || '')
          setUnit(String(c.unit ?? 880))
          setReportCode(c.report_config_code || 'REPORT_INVOICING_PREPAID')
          setAutoSync(!!c.auto_sync)
          setPassword('')
        } else {
          setBaseUrl('https://cbs.mobifone.vn')
          setUsername('')
          setUnit('880')
          setReportCode('REPORT_INVOICING_PREPAID')
          setAutoSync(true)
          setPassword('')
        }
      } catch (e: unknown) {
        const err = e as { response?: { data?: { message?: string } } }
        toast.error(err.response?.data?.message || 'Không tải được cấu hình CBS.')
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => {
      alive = false
    }
  }, [open])

  if (!open) return null

  const save = async () => {
    if (!username.trim()) {
      toast.error('Vui lòng nhập username.')
      return
    }
    const unitNum = Number(unit)
    if (!Number.isFinite(unitNum) || unitNum < 0) {
      toast.error('Unit không hợp lệ.')
      return
    }
    if (!cfg?.password_is_set && !password.trim()) {
      toast.error('Lần đầu cấu hình cần nhập password.')
      return
    }
    setSaving(true)
    try {
      await apiClient.put('/api/cbs/config', {
        base_url: baseUrl.trim(),
        username: username.trim(),
        password: password ? password : undefined,
        unit: unitNum,
        report_config_code: reportCode.trim(),
        auto_sync: autoSync,
      })
      toast.success('Đã lưu cấu hình CBS.')
      onSaved()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } }
      toast.error(err.response?.data?.message || 'Lưu cấu hình thất bại.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h3 className="text-base font-semibold text-gray-900">Cấu hình CBS</h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-700"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto text-sm">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Base URL
                </label>
                <input
                  type="url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  placeholder="https://cbs.mobifone.vn"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Username CBS
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  placeholder="vd: nhi"
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Password CBS{' '}
                  {cfg?.password_is_set && (
                    <span className="text-gray-400 font-normal">
                      (để trống nếu không đổi)
                    </span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 pr-10"
                    placeholder={
                      cfg?.password_is_set ? '********' : 'Nhập password'
                    }
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                    tabIndex={-1}
                  >
                    {showPass ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Unit (đơn vị CBS)
                  </label>
                  <input
                    type="number"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Report code
                  </label>
                  <input
                    type="text"
                    value={reportCode}
                    onChange={(e) => setReportCode(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 font-mono text-xs"
                  />
                </div>
              </div>
              <label className="inline-flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  checked={autoSync}
                  onChange={(e) => setAutoSync(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-sm text-gray-700">
                  Bật đồng bộ tự động lúc 06:00 và 18:00 (giờ VN)
                </span>
              </label>
              {cfg?.last_synced_at && (
                <div className="text-xs text-gray-500 pt-2 border-t">
                  Đồng bộ gần nhất:{' '}
                  {new Date(cfg.last_synced_at).toLocaleString('vi-VN')} —{' '}
                  <span
                    className={
                      cfg.last_sync_status === 'error'
                        ? 'text-red-600'
                        : 'text-green-700'
                    }
                  >
                    {cfg.last_sync_status || '—'}
                  </span>
                  {cfg.last_sync_message && (
                    <div className="text-gray-400 mt-1">
                      {cfg.last_sync_message}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
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
            disabled={saving || loading}
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
