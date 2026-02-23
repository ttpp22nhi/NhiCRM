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

const ROLES = ['super_admin', 'admin', 'director', 'manager', 'leader', 'sales']

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
              <h1 className="text-2xl font-bold text-gray-900">Ma trận phân quyền</h1>
            </div>
            <Link
              href="/organization"
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
            >
              Quản lý tổ chức
            </Link>
          </div>
          <p className="text-gray-600 mb-6">
            Chọn Resource (Khách hàng/Cơ hội) và Scope (Cá nhân/Đơn vị/Nhánh con/Toàn công ty) cho từng Vai trò.
          </p>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
              <span className="ml-3 text-gray-600">Đang tải...</span>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow border border-gray-200 overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                      Vai trò
                    </th>
                    {RESOURCES.map((res) =>
                      ACTIONS.map((act) => (
                        <th
                          key={`${res.id}-${act.id}`}
                          className="px-3 py-2 text-center text-xs font-medium text-gray-500"
                        >
                          {res.label} - {act.label}
                        </th>
                      ))
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {ROLES.map((role) => (
                    <tr key={role} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                        {getRoleLabel(role)}
                      </td>
                      {RESOURCES.map((res) =>
                        ACTIONS.map((act) => (
                          <td key={`${role}-${res.id}-${act.id}`} className="px-3 py-2">
                            <div className="flex flex-col gap-1">
                              <select
                                value={matrix[role]?.[res.id]?.[act.id] || 'personal'}
                                onChange={(e) =>
                                  setScope(role, res.id, act.id, e.target.value)
                                }
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-primary-500"
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
                                className="text-xs px-2 py-1 bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
                              >
                                {saving === `${role}-${res.id}-${act.id}` ? (
                                  <Loader2 className="w-3 h-3 animate-spin mx-auto" />
                                ) : (
                                  <Save className="w-3 h-3 mx-auto" />
                                )}
                              </button>
                            </div>
                          </td>
                        ))
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  )
}
