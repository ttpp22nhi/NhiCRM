'use client'

import { useState, useEffect } from 'react'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { Navbar } from '@/components/Navbar'
import { apiClient } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { GitBranch, Edit, Save, Loader2, Plus, Trash2, ChevronUp, ChevronDown, X } from 'lucide-react'
import toast from 'react-hot-toast'
import Link from 'next/link'
import { useAlert } from '@/components/AlertModal'

interface OrgLevel {
  id: string
  level_order: number
  level_name: string
}

export default function OrganizationStructurePage() {
  const { user } = useAuth()
  const router = useRouter()
  const { showConfirm, AlertComponent } = useAlert()
  const [levels, setLevels] = useState<OrgLevel[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newLevelName, setNewLevelName] = useState('')

  if (user && user.role !== 'admin' && user.role !== 'super_admin') {
    router.push('/dashboard')
    return null
  }

  useEffect(() => {
    fetchLevels()
  }, [])

  const fetchLevels = async () => {
    try {
      setLoading(true)
      const res = await apiClient.get('/api/organization-levels')
      if (res.data.success) setLevels(res.data.data || [])
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể tải định nghĩa cấp bậc')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (id: string) => {
    if (!editValue.trim()) {
      toast.error('Tên cấp bậc không được để trống')
      return
    }
    const nameLower = editValue.trim().toLowerCase()
    if (levels.some((l) => l.id !== id && (l.level_name || '').trim().toLowerCase() === nameLower)) {
      toast.error('Tên cấp bậc đã tồn tại')
      return
    }
    setSaving(true)
    try {
      await apiClient.put(`/api/organization-levels/${id}`, { level_name: editValue.trim() })
      toast.success('Đã cập nhật tên cấp bậc')
      setEditingId(null)
      fetchLevels()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể cập nhật')
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (item: OrgLevel) => {
    setEditingId(item.id)
    setEditValue(item.level_name)
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newLevelName.trim()) {
      toast.error('Tên cấp bậc không được để trống')
      return
    }
    const nameLower = newLevelName.trim().toLowerCase()
    if (levels.some((l) => (l.level_name || '').trim().toLowerCase() === nameLower)) {
      toast.error('Tên cấp bậc đã tồn tại')
      return
    }
    setSaving(true)
    try {
      const nextOrder = levels.length > 0 ? Math.max(...levels.map((l) => l.level_order)) + 1 : 1
      await apiClient.post('/api/organization-levels', {
        level_order: nextOrder,
        level_name: newLevelName.trim()
      })
      toast.success('Đã thêm cấp bậc')
      setShowAddForm(false)
      setNewLevelName('')
      fetchLevels()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể thêm')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (item: OrgLevel) => {
    const ok = await showConfirm({
      title: 'Xác nhận xóa',
      message: `Bạn có chắc muốn xóa cấp "${item.level_name}"? Thứ tự các cấp còn lại sẽ được cập nhật.`,
      confirmText: 'Xóa',
      cancelText: 'Hủy'
    })
    if (!ok) return
    try {
      await apiClient.delete(`/api/organization-levels/${item.id}`)
      toast.success('Đã xóa cấp bậc')
      setEditingId(null)
      fetchLevels()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể xóa')
    }
  }

  const handleMove = async (id: string, direction: 'up' | 'down') => {
    try {
      await apiClient.post(`/api/organization-levels/${id}/move`, { direction })
      toast.success('Đã đổi thứ tự')
      setEditingId(null)
      fetchLevels()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể đổi thứ tự')
    }
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex justify-between items-center mb-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <GitBranch className="w-8 h-8 text-primary-600" />
                <h1 className="text-2xl font-bold text-gray-900">Cây cấu trúc công ty</h1>
              </div>
              <p className="text-gray-600">
                Định nghĩa tên cho từng cấp bậc. Khi thêm đơn vị trong Quản lý tổ chức, cấp tương ứng sẽ dùng tên này.
              </p>
            </div>
            <Link
              href="/organization"
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
            >
              Quản lý tổ chức
            </Link>
          </div>

          <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
              <div>
                <h2 className="font-semibold text-gray-900">Các cấp bậc (từ gốc xuống)</h2>
                <p className="text-xs text-gray-500 mt-1">
                  Cấp 1 = gốc (chỉ sửa tên; không đổi thứ tự hay xóa). Cấp 2 = con trực tiếp của gốc, ...
                </p>
              </div>
              <button
                onClick={() => setShowAddForm(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition"
              >
                <Plus className="w-4 h-4" />
                Thêm cấp
              </button>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
              </div>
            ) : (
              <ul className="divide-y divide-gray-200">
                {levels.map((item, idx) => {
                  const isRoot = idx === 0
                  return (
                    <li key={item.id} className={`flex items-center justify-between px-4 py-3 hover:bg-gray-50 group ${isRoot ? 'bg-gray-50/50' : ''}`}>
                      <div className="flex items-center gap-4">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary-100 text-primary-700 font-semibold text-sm flex-shrink-0">
                          {item.level_order}
                        </span>
                        {isRoot && (
                          <span className="text-xs font-medium text-gray-500 bg-gray-200 px-2 py-0.5 rounded">Gốc</span>
                        )}
                        {editingId === item.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
                              placeholder="VD: Công ty, Phòng"
                              autoFocus
                            />
                            <button
                              onClick={() => handleSave(item.id)}
                              disabled={saving}
                              className="p-2 text-green-600 hover:bg-green-50 rounded"
                            >
                              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            </button>
                          </div>
                        ) : (
                          <span className="font-medium text-gray-900">{item.level_name}</span>
                        )}
                      </div>
                      {editingId !== item.id && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleMove(item.id, 'up')}
                            disabled={isRoot || idx === 0}
                            className="p-2 text-gray-500 hover:text-primary-600 hover:bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed"
                            title={isRoot ? 'Cấp gốc không đổi thứ tự' : 'Lên trên'}
                          >
                            <ChevronUp className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleMove(item.id, 'down')}
                            disabled={isRoot || idx === levels.length - 1}
                            className="p-2 text-gray-500 hover:text-primary-600 hover:bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed"
                            title={isRoot ? 'Cấp gốc không đổi thứ tự' : 'Xuống dưới'}
                          >
                            <ChevronDown className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => startEdit(item)}
                            className="p-2 text-gray-500 hover:text-primary-600 hover:bg-gray-100 rounded"
                            title="Sửa tên"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          {!isRoot && (
                            <button
                              onClick={() => handleDelete(item)}
                              className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                              title="Xóa"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="mt-4 p-4 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-800">
            <strong>Lưu ý:</strong> Cấp 1 dùng cho đơn vị gốc (VD: Công ty), cấp 2 cho đơn vị con trực tiếp (VD: Chi nhánh), cấp 3 cho cấp tiếp theo (VD: Phòng)... Khi thêm đơn vị mới trong Quản lý tổ chức, hệ thống tự gán tên cấp theo độ sâu của cây.
          </div>

          {showAddForm && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                <div className="flex justify-between items-center p-4 border-b">
                  <h2 className="text-lg font-bold">Thêm cấp bậc mới</h2>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddForm(false)
                      setNewLevelName('')
                    }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <form onSubmit={handleAdd} className="p-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tên cấp bậc</label>
                    <input
                      type="text"
                      value={newLevelName}
                      onChange={(e) => setNewLevelName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      placeholder="VD: Đội, Nhóm"
                      autoFocus
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Cấp mới sẽ được thêm ở cuối danh sách. Dùng nút Lên/Xuống để đổi thứ tự.
                    </p>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddForm(false)
                        setNewLevelName('')
                      }}
                      className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="w-4 h-4 animate-spin inline" /> : 'Thêm'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {AlertComponent}
        </div>
      </div>
    </ProtectedRoute>
  )
}
