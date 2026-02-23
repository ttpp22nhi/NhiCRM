'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { Navbar } from '@/components/Navbar'
import { apiClient } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { Building2, Plus, Edit, Trash2, ChevronDown, ChevronRight, Loader2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAlert } from '@/components/AlertModal'
import Link from 'next/link'

interface Department {
  id: string
  name: string
  parent_id: string | null
  path?: string
  type: string
  created_at?: number
  updated_at?: number
}

interface OrgLevel {
  id: string
  level_order: number
  level_name: string
}

export default function OrganizationPage() {
  const { user } = useAuth()
  const router = useRouter()
  const { showConfirm, AlertComponent } = useAlert()
  const [departments, setDepartments] = useState<Department[]>([])
  const [orgLevels, setOrgLevels] = useState<OrgLevel[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Department | null>(null)
  const [parentForAdd, setParentForAdd] = useState<Department | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    parent_id: '' as string,
    type: 'Phòng'
  })
  const [submitting, setSubmitting] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: Department } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  if (user && user.role !== 'admin' && user.role !== 'super_admin') {
    router.push('/dashboard')
    return null
  }

  const fetchDepartments = useCallback(async () => {
    try {
      setLoading(true)
      const [deptRes, levelRes] = await Promise.all([
        apiClient.get('/api/departments'),
        apiClient.get('/api/organization-levels')
      ])
      if (deptRes.data.success) setDepartments(deptRes.data.data || [])
      if (levelRes.data.success) setOrgLevels(levelRes.data.data || [])
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể tải dữ liệu')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDepartments()
  }, [fetchDepartments])

  const getDepth = (d: Department): number => {
    if (!d.parent_id) return 1
    const parent = departments.find((x) => x.id === d.parent_id)
    return parent ? getDepth(parent) + 1 : 1
  }

  const getLevelNameForDepth = (depth: number): string => {
    const level = orgLevels.find((l) => l.level_order === depth)
    return level?.level_name || 'Phòng'
  }

  useEffect(() => {
    const handleClick = () => setContextMenu(null)
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  const buildTree = (items: Department[], parentId: string | null = null): Department[] =>
    items.filter((d) => d.parent_id === parentId)

  const openAddChild = (parent: Department) => {
    setParentForAdd(parent)
    setEditing(null)
    const childDepth = getDepth(parent) + 1
    setFormData({
      name: '',
      parent_id: parent.id,
      type: getLevelNameForDepth(childDepth)
    })
    setShowForm(true)
    setContextMenu(null)
    if (!expanded.has(parent.id)) {
      setExpanded((prev) => new Set([...prev, parent.id]))
    }
  }

  const openAddRoot = () => {
    setParentForAdd(null)
    setEditing(null)
    setFormData({
      name: '',
      parent_id: '',
      type: getLevelNameForDepth(1)
    })
    setShowForm(true)
  }

  const openEdit = (d: Department) => {
    setEditing(d)
    setParentForAdd(null)
    setFormData({
      name: d.name,
      parent_id: d.parent_id || '',
      type: d.type || 'Phòng'
    })
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    const parentId = parentForAdd ? parentForAdd.id : (formData.parent_id || null)
    try {
      const payload = {
        name: formData.name.trim(),
        parent_id: parentId,
        type: formData.type.trim() || 'Phòng'
      }
      if (editing) {
        await apiClient.put(`/api/departments/${editing.id}`, payload)
        toast.success('Cập nhật đơn vị thành công!')
      } else {
        await apiClient.post('/api/departments', payload)
        toast.success('Tạo đơn vị thành công!')
      }
      fetchDepartments()
      setShowForm(false)
      setEditing(null)
      setParentForAdd(null)
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Có lỗi xảy ra')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (d: Department) => {
    const ok = await showConfirm({
      title: 'Xác nhận xóa',
      message: `Bạn có chắc muốn xóa "${d.name}"? Các đơn vị con (nếu có) phải được xóa trước.`,
      confirmText: 'Xóa',
      cancelText: 'Hủy'
    })
    if (!ok) return
    try {
      await apiClient.delete(`/api/departments/${d.id}`)
      toast.success('Đã xóa đơn vị')
      fetchDepartments()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể xóa đơn vị')
    }
  }

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleContextMenu = (e: React.MouseEvent, node: Department) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, node })
  }

  const renderNode = (d: Department, level: number) => {
    const children = buildTree(departments, d.id)
    const hasChildren = children.length > 0
    const isExpanded = expanded.has(d.id)

    return (
      <div key={d.id} className="mb-0.5">
        <div
          onContextMenu={(e) => handleContextMenu(e, d)}
          style={{ paddingLeft: level * 24 }}
          className="flex items-center gap-2 py-2 px-3 rounded hover:bg-gray-50 group cursor-context-menu"
        >
          <button
            type="button"
            onClick={() => hasChildren && toggleExpand(d.id)}
            className="w-6 h-6 flex items-center justify-center text-gray-500 flex-shrink-0"
          >
            {hasChildren ? (
              isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
            ) : (
              <span className="w-4" />
            )}
          </button>
          <span className="px-2 py-0.5 text-xs font-medium rounded bg-blue-100 text-blue-700 flex-shrink-0">
            {d.type || 'Phòng'}
          </span>
          <span className="font-medium text-gray-900 truncate">{d.name}</span>
          <div className="ml-auto flex gap-1 opacity-0 group-hover:opacity-100 transition flex-shrink-0">
            <button
              type="button"
              onClick={() => openAddChild(d)}
              className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded"
              title="Thêm cấp con"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => openEdit(d)}
              className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded"
            >
              <Edit className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => handleDelete(d)}
              className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
        {hasChildren && isExpanded && (
          <div>{children.map((c) => renderNode(c, level + 1))}</div>
        )}
      </div>
    )
  }

  const rootItems = buildTree(departments, null)

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50" ref={containerRef}>
        <Navbar />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex justify-between items-center mb-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Building2 className="w-8 h-8 text-primary-600" />
                <h1 className="text-2xl font-bold text-gray-900">Quản lý tổ chức</h1>
              </div>
              <p className="text-gray-600">Cấu trúc động (Tree-view). Chuột phải để thêm cấp con.</p>
            </div>
            <div className="flex gap-2">
              <Link
                href="/organization-structure"
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
              >
                Cây cấu trúc công ty
              </Link>
              <button
                onClick={openAddRoot}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
              >
                <Plus className="w-5 h-5" />
                Thêm đơn vị (cấp cao)
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
              <span className="ml-3 text-gray-600">Đang tải...</span>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow border border-gray-200 p-4">
              {rootItems.length === 0 ? (
                <p className="text-gray-500 py-8 text-center">
                  Chưa có đơn vị nào. Nhấn &quot;Thêm đơn vị (cấp cao)&quot; hoặc chuột phải để thêm.
                </p>
              ) : (
                rootItems.map((d) => renderNode(d, 0))
              )}
            </div>
          )}
        </div>

        {contextMenu && (
          <div
            className="fixed z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[180px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              type="button"
              onClick={() => openAddChild(contextMenu.node)}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Thêm cấp con
            </button>
            <button
              type="button"
              onClick={() => openEdit(contextMenu.node)}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
            >
              <Edit className="w-4 h-4" />
              Chỉnh sửa
            </button>
            <button
              type="button"
              onClick={() => handleDelete(contextMenu.node)}
              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Xóa
            </button>
          </div>
        )}

        {showForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
              <div className="flex justify-between items-center p-4 border-b">
                <h2 className="text-lg font-bold">
                  {editing ? 'Chỉnh sửa đơn vị' : parentForAdd ? `Thêm đơn vị con của "${parentForAdd.name}"` : 'Thêm đơn vị (cấp cao)'}
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false)
                    setEditing(null)
                    setParentForAdd(null)
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tên <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    placeholder="VD: Phòng Kinh doanh"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Loại cấp bậc
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  >
                    {orgLevels.length > 0 ? (
                      orgLevels.map((l) => (
                        <option key={l.id} value={l.level_name}>
                          Cấp {l.level_order}: {l.level_name}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="Công ty">Công ty</option>
                        <option value="Chi nhánh">Chi nhánh</option>
                        <option value="Phòng">Phòng</option>
                        <option value="Tổ">Tổ</option>
                        <option value="Trạm">Trạm</option>
                      </>
                    )}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Chọn theo Cây cấu trúc công ty để đồng nhất tên cấp
                  </p>
                </div>
                {!parentForAdd && !editing && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Đơn vị cha (tùy chọn)</label>
                    <select
                      value={formData.parent_id}
                      onChange={(e) => {
                        const pid = e.target.value
                        const parent = pid ? departments.find((d) => d.id === pid) : null
                        const depth = parent ? getDepth(parent) + 1 : 1
                        setFormData({
                          ...formData,
                          parent_id: pid,
                          type: getLevelNameForDepth(depth)
                        })
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="">-- Không (cấp cao) --</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id} disabled={editing?.id === d.id}>
                          {d.type}: {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {parentForAdd && (
                  <p className="text-sm text-gray-500">Đơn vị cha: {parentForAdd.type} - {parentForAdd.name}</p>
                )}
                <div className="flex justify-end gap-2 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false)
                      setEditing(null)
                      setParentForAdd(null)
                    }}
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

        {AlertComponent}
      </div>
    </ProtectedRoute>
  )
}
