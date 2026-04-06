'use client'

import { useState, useEffect } from 'react'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { Navbar } from '@/components/Navbar'
import { apiClient } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { Shield, Loader2, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import Link from 'next/link'

interface Permission {
  id: string
  role_name: string
  resource: string
  action: string
  scope: string
}

const RESOURCES = [
  { id: 'customers', label: 'Khách hàng' },
  { id: 'deals', label: 'Cơ hội' }
]

const ACTIONS = [
  { id: 'create', label: 'Tạo' },
  { id: 'read', label: 'Xem' },
  { id: 'update', label: 'Sửa' },
  { id: 'delete', label: 'Xóa' }
]

const SCOPES = [
  { id: 'personal', label: 'Cá nhân' },
  { id: 'current_node', label: 'Đơn vị hiện tại' },
  { id: 'sub_tree', label: 'Nhánh con' },
  { id: 'global', label: 'Toàn công ty' }
]

const ALL_ROLES = ['super_admin', 'admin', 'director', 'manager', 'leader', 'sales']

export default function PermissionsPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [matrix, setMatrix] = useState<Record<string, Record<string, Record<string, string>>>>({})

  if (user && user.role !== 'admin' && user.role !== 'super_admin') {
    router.push('/dashboard')
    return null
  }

  // Chỉ super_admin được xem và phân quyền cho vai trò super_admin; admin chỉ thấy các vai trò còn lại
  const ROLES = user?.role === 'super_admin' ? ALL_ROLES : ALL_ROLES.filter((r) => r !== 'super_admin')

  useEffect(() => {
    fetchPermissions()
  }, [])

  const fetchPermissions = async () => {
    try {
      setLoading(true)
      const res = await apiClient.get('/api/permissions')
      if (res.data.success) {
        const list: Permission[] = res.data.data || []
        setPermissions(list)
        const m: Record<string, Record<string, Record<string, string>>> = {}
        for (const role of ROLES) {
          m[role] = {}
          for (const r of RESOURCES) {
            m[role][r.id] = {}
            for (const a of ACTIONS) {
              const p = list.find(
                (x) => x.role_name === role && x.resource === r.id && x.action === a.id
              )
              m[role][r.id][a.id] = p?.scope || 'personal'
            }
          }
        }
        setMatrix(m)
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể tải ma trận phân quyền')
    } finally {
      setLoading(false)
    }
  }

  const setScope = (role: string, resource: string, action: string, scope: string) => {
    setMatrix((prev) => ({
      ...prev,
      [role]: {
        ...prev[role],
        [resource]: {
          ...(prev[role]?.[resource] || {}),
          [action]: scope
        }
      }
    }))
  }

  const savePermission = async (role: string, resource: string, action: string) => {
    const scope = matrix[role]?.[resource]?.[action] || 'personal'
    setSaving(`${role}-${resource}-${action}`)
    try {
      await apiClient.post('/api/permissions', {
        role_name: role,
        resource,
        action,
        scope
      })
      toast.success(`Đã cập nhật phân quyền`)
      fetchPermissions()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi cập nhật')
    } finally {
      setSaving(null)
    }
  }

  const getRoleLabel = (r: string) => {
    const map: Record<string, string> = {
      super_admin: 'Super Admin',
      admin: 'Admin',
      director: 'Giám đốc',
      manager: 'Quản lý',
      leader: 'Tổ trưởng',
      sales: 'Sales'
    }
    return map[r] || r
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Shield className="w-8 h-8 text-primary-600" />
              <h1 className="text-2xl font-bold text-gray-900">Phân quyền theo vai trò</h1>
            </div>
            <Link
              href="/organization"
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
            >
              Quản lý tổ chức
            </Link>
          </div>
          <p className="text-gray-600 mb-6">
            Thiết lập phạm vi quyền theo từng vai trò. Giao diện dạng thẻ giúp dễ xem hơn thay vì ma trận bảng.
          </p>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
              <span className="ml-3 text-gray-600">Đang tải...</span>
            </div>
          ) : (
            <div className="space-y-6">
              {ROLES.map((role) => (
                <section
                  key={role}
                  className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
                >
                  <div className="px-5 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-gray-900">{getRoleLabel(role)}</h2>
                    <span className="text-xs px-2 py-1 rounded-full bg-white border border-gray-200 text-gray-600">
                      {role}
                    </span>
                  </div>

                  <div className="p-5 space-y-5">
                    {RESOURCES.map((res) => (
                      <div key={`${role}-${res.id}`} className="rounded-lg border border-gray-200 p-4">
                        <h3 className="text-sm font-semibold text-gray-800 mb-3">{res.label}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {ACTIONS.map((act) => (
                            <div
                              key={`${role}-${res.id}-${act.id}`}
                              className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3"
                            >
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-800">{act.label}</p>
                                <p className="text-xs text-gray-500">{res.label}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <select
                                  value={matrix[role]?.[res.id]?.[act.id] || 'personal'}
                                  onChange={(e) => setScope(role, res.id, act.id, e.target.value)}
                                  className="px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-primary-500 bg-white"
                                >
                                  {SCOPES.map((s) => (
                                    <option key={s.id} value={s.id}>
                                      {s.label}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  onClick={() => savePermission(role, res.id, act.id)}
                                  disabled={!!saving}
                                  className="inline-flex items-center justify-center w-8 h-8 bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
                                  title="Lưu quyền"
                                >
                                  {saving === `${role}-${res.id}-${act.id}` ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Save className="w-4 h-4" />
                                  )}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  )
}
