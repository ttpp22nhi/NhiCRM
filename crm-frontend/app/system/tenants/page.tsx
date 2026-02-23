'use client'

import { useState, useEffect, useRef } from 'react'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { Navbar } from '@/components/Navbar'
import { apiClient } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { Settings, Plus, Edit, Loader2, X, Building2, LogOut, LogIn } from 'lucide-react'
import toast from 'react-hot-toast'

interface Tenant {
  id: string
  name: string
  domain: string
  package_type: string
  max_users: number
  max_levels: number
  is_active: boolean
  start_date?: string | null
  end_date?: string | null
  created_at?: number
  updated_at?: number
}

const PACKAGE_OPTIONS = ['Starter', 'Growth', 'Ultimate']

/** API trả về yyyy-mm-dd → hiển thị dd/mm/yyyy trong form */
function isoToDDMMYYYY(iso: string | null | undefined): string {
  if (!iso || typeof iso !== 'string') return ''
  const s = iso.trim()
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (!m) return s
  const [, y, mo, d] = m
  return `${d.padStart(2, '0')}/${mo.padStart(2, '0')}/${y}`
}

/** Chuỗi dd/mm/yyyy từ form → yyyy-mm-dd gửi API */
function ddmmYYYYToIso(s: string): string {
  if (!s || typeof s !== 'string') return ''
  const parts = s.trim().split(/[/-]/).map((p) => p.trim())
  if (parts.length !== 3) return ''
  const [d, m, y] = parts
  const day = d.padStart(2, '0')
  const month = m.padStart(2, '0')
  const year = y.length === 2 ? `20${y}` : y
  if (!/^\d{1,2}$/.test(d) || !/^\d{1,2}$/.test(m) || !/^\d{2,4}$/.test(y)) return ''
  return `${year}-${month}-${day}`
}

export default function SystemTenantsPage() {
  const { user, switchTenant } = useAuth()
  const router = useRouter()
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Tenant | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    domain: '',
    package_type: 'Starter',
    max_users: 10,
    max_levels: 5,
    is_active: true,
    start_date: '',
    end_date: ''
  })
  const [submitting, setSubmitting] = useState(false)
  const hasFetchedRef = useRef(false)

  const fetchTenants = async () => {
    try {
      setLoading(true)
      const res = await apiClient.get('/api/system/tenants')
      if (res.data.success) setTenants(res.data.data || [])
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể tải danh sách công ty')
      if (err.response?.status === 403) router.push('/dashboard')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user?.role !== 'super_admin') return
    if (hasFetchedRef.current) return
    hasFetchedRef.current = true
    fetchTenants()
  }, [user?.role])

  if (user && user.role !== 'super_admin') {
    router.push('/dashboard')
    return null
  }

  const openCreate = () => {
    setEditing(null)
    setFormData({
      name: '',
      domain: '',
      package_type: 'Starter',
      max_users: 10,
      max_levels: 5,
      is_active: true,
      start_date: '',
      end_date: ''
    })
    setShowForm(true)
  }

  const openEdit = (t: Tenant) => {
    setEditing(t)
    setFormData({
      name: t.name,
      domain: t.domain,
      package_type: t.package_type,
      max_users: t.max_users,
      max_levels: t.max_levels,
      is_active: t.is_active,
      start_date: isoToDDMMYYYY(t.start_date),
      end_date: isoToDDMMYYYY(t.end_date)
    })
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const payload = {
        ...formData,
        start_date: ddmmYYYYToIso(formData.start_date) || undefined,
        end_date: ddmmYYYYToIso(formData.end_date) || undefined
      }
      if (editing) {
        await apiClient.put(`/api/system/tenants/${editing.id}`, payload)
        toast.success('Đã cập nhật công ty')
      } else {
        await apiClient.post('/api/system/tenants', payload)
        toast.success('Đã tạo công ty mới')
      }
      setShowForm(false)
      fetchTenants()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Có lỗi xảy ra')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Super Admin đang "vào" một công ty thì có thể thoát về màn hình hệ thống */}
          {user?.tenant_id && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between">
              <span className="text-amber-800 text-sm">
                Bạn đang xem trong phạm vi một công ty. Để quản lý tất cả công ty, thoát và dùng menu Hệ thống.
              </span>
              <button
                type="button"
                onClick={() => {
                  switchTenant(null)
                  router.push('/system/tenants')
                }}
                className="flex items-center gap-2 px-3 py-1.5 text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-lg text-sm font-medium transition"
              >
                <LogOut className="w-4 h-4" />
                Thoát công ty
              </button>
            </div>
          )}

          <div className="flex justify-between items-center mb-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Settings className="w-8 h-8 text-primary-600" />
                <h1 className="text-2xl font-bold text-gray-900">Hệ thống - Quản lý công ty</h1>
              </div>
              <p className="text-gray-600">
                Tạo mới tenant (công ty khách hàng), khóa/mở kích hoạt, cấu hình gói và giới hạn. Chọn &quot;Vào công ty&quot; để quản lý nội bộ công ty đó.
              </p>
              <div className="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-800">
                <strong>Cách tạo Admin cho công ty con:</strong> Nhấn &quot;Vào công ty&quot; tại công ty cần tạo Admin → vào menu <strong>Quản trị → Nhân viên</strong> → <strong>Thêm nhân viên</strong> → chọn vai trò <strong>Quản trị viên</strong>, điền tên đăng nhập và mật khẩu.
              </div>
            </div>
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
            >
              <Plus className="w-5 h-5" />
              Tạo công ty
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Tên</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Domain</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Gói</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Max users</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Max levels</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Thời gian bắt đầu</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Thời gian kết thúc</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Trạng thái</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {tenants.map((t) => (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{t.name}</td>
                      <td className="px-4 py-3 text-gray-600">{t.domain}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 text-xs font-medium rounded bg-blue-100 text-blue-700">
                          {t.package_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{t.max_users}</td>
                      <td className="px-4 py-3 text-gray-600">{t.max_levels}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{t.start_date ? new Date(t.start_date).toLocaleDateString('vi-VN') : '—'}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{t.end_date ? new Date(t.end_date).toLocaleDateString('vi-VN') : '—'}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 text-xs font-medium rounded ${
                            t.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
                          }`}
                        >
                          {t.is_active ? 'Đang dùng' : 'Đã khóa'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {t.is_active && (
                            <button
                              onClick={() => {
                                switchTenant(t.id)
                                router.push('/dashboard')
                                toast.success(`Đã vào công ty: ${t.name}`)
                              }}
                              className="flex items-center gap-1 px-2 py-1.5 text-sm text-primary-600 hover:bg-primary-50 rounded"
                              title="Vào công ty (quản lý nội bộ)"
                            >
                              <LogIn className="w-4 h-4" />
                              Vào công ty
                            </button>
                          )}
                          <button
                            onClick={() => openEdit(t)}
                            className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded"
                            title="Cấu hình"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {tenants.length === 0 && (
                <div className="px-4 py-12 text-center text-gray-500">
                  Chưa có công ty nào. Nhấn &quot;Tạo công ty&quot; để thêm.
                </div>
              )}
            </div>
          )}

          {showForm && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                <div className="flex justify-between items-center p-4 border-b">
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <Building2 className="w-5 h-5" />
                    {editing ? 'Cấu hình công ty' : 'Tạo công ty mới'}
                  </h2>
                  <button type="button" onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tên công ty *</label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      placeholder="VD: Công ty Khách hàng A"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Domain (duy nhất) *</label>
                    <input
                      type="text"
                      required
                      value={formData.domain}
                      onChange={(e) =>
                        setFormData({ ...formData, domain: e.target.value.toLowerCase().replace(/\s+/g, '-') })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      placeholder="vd-cong-ty-a"
                      disabled={!!editing}
                    />
                    {editing && <p className="text-xs text-gray-500 mt-1">Không đổi domain khi đã tạo.</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Gói dịch vụ</label>
                    <select
                      value={formData.package_type}
                      onChange={(e) => setFormData({ ...formData, package_type: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    >
                      {PACKAGE_OPTIONS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Số user tối đa</label>
                      <input
                        type="number"
                        min={1}
                        value={formData.max_users}
                        onChange={(e) => setFormData({ ...formData, max_users: parseInt(e.target.value, 10) || 1 })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Số cấp tổ chức tối đa</label>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={formData.max_levels}
                        onChange={(e) =>
                          setFormData({ ...formData, max_levels: parseInt(e.target.value, 10) || 1 })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Thời gian bắt đầu</label>
                      <input
                        type="text"
                        value={formData.start_date}
                        onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                        placeholder="dd/mm/yyyy"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      />
                      <p className="text-xs text-gray-500 mt-1">Định dạng dd/mm/yyyy — Ngày bắt đầu hợp đồng / gói dịch vụ</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Thời gian kết thúc</label>
                      <input
                        type="text"
                        value={formData.end_date}
                        onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                        placeholder="dd/mm/yyyy"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      />
                      <p className="text-xs text-gray-500 mt-1">Định dạng dd/mm/yyyy — Ngày hết hạn hợp đồng / gói dịch vụ</p>
                    </div>
                  </div>
                  {editing && (
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="is_active"
                        checked={formData.is_active}
                        onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <label htmlFor="is_active" className="text-sm font-medium text-gray-700">
                        Đang kích hoạt (bỏ chọn = khóa tenant)
                      </label>
                    </div>
                  )}
                  <div className="flex justify-end gap-2 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowForm(false)}
                      className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                    >
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : editing ? 'Cập nhật' : 'Tạo'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  )
}
