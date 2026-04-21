'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { apiClient } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { Users, Mail, Shield, AlertCircle, Key, Copy, X, CheckCircle, Edit, Eye, MoreVertical, ArrowRightLeft, Filter } from 'lucide-react'
import { EditEmployeeForm } from './EditEmployeeForm'
import { EmployeeDetailView } from './EmployeeDetailView'
import { TransferCustomersModal } from './TransferCustomersModal'
import toast from 'react-hot-toast'
import { useAlert } from './AlertModal'

interface Employee {
  employee_id: string
  username: string
  full_name: string
  email: string
  role: string
  is_active: boolean
  created_at: number | string
  department_id?: string
  department_name?: string
  title?: string
  rank?: string
  territory?: string | null
}

interface EmployeeListProps {
  refreshKey?: number
}

export function EmployeeList({ refreshKey = 0 }: EmployeeListProps) {
  const { user } = useAuth()
  const { showConfirm, AlertComponent } = useAlert()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [resetPasswordData, setResetPasswordData] = useState<{
    employee: { full_name: string; username: string; email: string }
    newPassword: string
  } | null>(null)
  const [resettingId, setResettingId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)
  const [viewingEmployee, setViewingEmployee] = useState<Employee | null>(null)
  const [transferringEmployee, setTransferringEmployee] = useState<Employee | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null)
  const [roleFilter, setRoleFilter] = useState<string>('')
  const actionButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  const ROLE_FILTER_OPTIONS: { value: string; label: string }[] = [
    { value: 'super_admin', label: 'Super Admin' },
    { value: 'admin', label: 'Quản trị viên' },
    { value: 'director', label: 'Giám đốc' },
    { value: 'manager', label: 'Quản lý' },
    { value: 'leader', label: 'Tổ trưởng' },
    { value: 'sales', label: 'Nhân viên bán hàng' },
  ]

  const filteredEmployees = useMemo(() => {
    if (!roleFilter) return employees
    const r = roleFilter.toLowerCase()
    return employees.filter((e) => String(e.role || '').toLowerCase() === r)
  }, [employees, roleFilter])

  const hasAdminLikeAccess =
    user?.role === 'admin' ||
    user?.role === 'super_admin' ||
    user?.role === 'director' ||
    user?.role === 'manager'
  const canEditEmployee = user?.role === 'admin' || user?.role === 'super_admin'
  const canResetPassword = user?.role === 'admin' || user?.role === 'super_admin'

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'super_admin': return 'Super Admin'
      case 'admin': return 'Quản trị viên'
      case 'director': return 'Giám đốc'
      case 'manager': return 'Quản lý'
      case 'leader': return 'Tổ trưởng'
      case 'sales': return 'Nhân viên bán hàng'
      default: return role
    }
  }

  const getRoleBadgeClass = (role: string) => {
    switch (role) {
      case 'super_admin': return 'bg-red-100 text-red-800'
      case 'admin': return 'bg-purple-100 text-purple-800'
      case 'director':
      case 'manager': return 'bg-indigo-100 text-indigo-800'
      case 'leader': return 'bg-cyan-100 text-cyan-800'
      case 'sales':
      default: return 'bg-blue-100 text-blue-800'
    }
  }

  useEffect(() => {
    fetchEmployees()
  }, [refreshKey])

  // Cập nhật vị trí dropdown khi mở và khi scroll/resize
  useEffect(() => {
    if (!openMenuId) {
      setMenuPosition(null)
      return
    }
    const btn = actionButtonRefs.current[openMenuId]
    const updatePos = () => {
      if (btn) {
        const rect = btn.getBoundingClientRect()
        setMenuPosition({ top: rect.bottom + 4, left: rect.right - 192 })
      }
    }
    updatePos()
    window.addEventListener('scroll', updatePos, true)
    window.addEventListener('resize', updatePos)
    return () => {
      window.removeEventListener('scroll', updatePos, true)
      window.removeEventListener('resize', updatePos)
    }
  }, [openMenuId])

  // Đóng menu khi click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('.action-menu-container') && !target.closest('.action-menu-dropdown-portal')) {
        setOpenMenuId(null)
      }
    }

    if (openMenuId) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [openMenuId])

  useEffect(() => {
    setOpenMenuId(null)
  }, [roleFilter])

  const fetchEmployees = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await apiClient.get('/api/employees')
      if (response.data.success) {
        setEmployees(response.data.data || [])
      } else {
        setError('Không thể tải danh sách nhân viên')
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Lỗi khi tải danh sách nhân viên')
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async (employeeId: string, employeeName: string, username: string, email: string) => {
    const confirmed = await showConfirm({
      title: 'Xác nhận reset password',
      message: `Bạn có chắc chắn muốn reset password cho ${employeeName}?`,
      confirmText: 'Xác nhận',
      cancelText: 'Hủy'
    })

    if (!confirmed) {
      return
    }

    try {
      setResettingId(employeeId)
      const response = await apiClient.post(`/api/employees/${employeeId}/reset-password`)
      
      if (response.data.success) {
        setResetPasswordData({
          employee: {
            full_name: employeeName,
            username: username,
            email: email
          },
          newPassword: response.data.data.new_password
        })
        setCopied(false)
        toast.success(`Đã reset password cho ${employeeName}!`)
      } else {
        const errorMsg = response.data.message || 'Reset password thất bại'
        toast.error(errorMsg)
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || 'Lỗi khi reset password'
      toast.error(errorMsg)
    } finally {
      setResettingId(null)
    }
  }

  const handleCopyPassword = () => {
    if (resetPasswordData) {
      navigator.clipboard.writeText(resetPasswordData.newPassword)
      setCopied(true)
      toast.success('Đã copy password vào clipboard!')
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const formatDate = (timestamp: number | string) => {
    // Chuyển đổi sang number nếu là string
    const ts = typeof timestamp === 'string' ? parseInt(timestamp, 10) : timestamp
    
    // Kiểm tra nếu không phải là số hợp lệ
    if (isNaN(ts) || ts === null || ts === undefined || ts === 0) {
      console.warn('Invalid timestamp:', timestamp, 'Type:', typeof timestamp)
      return 'N/A'
    }
    
    // Kiểm tra nếu timestamp là seconds (10 chữ số) thì nhân 1000 để chuyển thành milliseconds
    const timestampMs = ts.toString().length === 10 ? ts * 1000 : ts
    const date = new Date(timestampMs)
    
    // Kiểm tra nếu date không hợp lệ
    if (isNaN(date.getTime())) {
      console.warn('Invalid date from timestamp:', timestamp, 'Converted:', timestampMs)
      return 'N/A'
    }
    
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')
    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-yellow-900 mb-1">Thông báo</p>
            <p className="text-yellow-700">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  if (employees.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-12 text-center">
        <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Chưa có nhân viên</h3>
        <p className="text-gray-600">Bắt đầu bằng cách thêm nhân viên đầu tiên</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 border-b border-gray-200 bg-gray-50/90">
        <div className="flex items-center gap-2 text-sm text-gray-700">
          <Filter className="w-4 h-4 text-gray-500 shrink-0" />
          <label htmlFor="employee-role-filter" className="font-medium text-gray-700 shrink-0">
            Vai trò
          </label>
          <select
            id="employee-role-filter"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none min-w-[200px]"
          >
            <option value="">Tất cả</option>
            {ROLE_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <p className="text-xs text-gray-500 sm:text-right">
          Hiển thị{' '}
          <span className="font-semibold text-gray-700">{filteredEmployees.length}</span>
          {employees.length !== filteredEmployees.length && (
            <>
              {' '}
              / {employees.length}
            </>
          )}{' '}
          nhân viên
        </p>
      </div>
      {filteredEmployees.length === 0 ? (
        <div className="p-10 text-center text-gray-600 text-sm">
          Không có nhân viên nào khớp vai trò đã chọn.{' '}
          <button
            type="button"
            onClick={() => setRoleFilter('')}
            className="text-primary-600 hover:underline font-medium"
          >
            Xóa bộ lọc
          </button>
        </div>
      ) : (
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Nhân viên
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Vai trò
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider max-w-[140px]">
                Địa bàn
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Trạng thái
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Ngày tạo
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Thao tác
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredEmployees.map((employee) => (
              <tr key={employee.employee_id} className="hover:bg-gray-50 transition">
                <td className="px-3 py-3">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 h-8 w-8 bg-primary-100 rounded-full flex items-center justify-center">
                      <span className="text-primary-600 font-semibold text-xs">
                        {employee.full_name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="ml-3 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{employee.full_name}</div>
                      <div className="text-xs text-gray-500 truncate">@{employee.username}</div>
                      <div className="text-xs text-gray-500 truncate flex items-center gap-1 mt-0.5">
                        <Mail className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{employee.email}</span>
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <span className={`px-2 py-1 inline-flex text-xs leading-4 font-semibold rounded-full ${getRoleBadgeClass(employee.role)}`}>
                    {(employee.role === 'admin' || employee.role === 'super_admin') && (
                      <Shield className="w-3 h-3 mr-1 flex-shrink-0" />
                    )}
                    <span className="hidden sm:inline">{getRoleLabel(employee.role)}</span>
                    <span className="sm:hidden">
                      {employee.role === 'admin' || employee.role === 'super_admin' ? 'Admin' : employee.role === 'manager' ? 'QL' : employee.role === 'director' ? 'GĐ' : employee.role === 'leader' ? 'TT' : 'Sales'}
                    </span>
                  </span>
                </td>
                <td className="px-3 py-3 text-xs text-gray-700 max-w-[160px]">
                  <span className="line-clamp-2" title={employee.territory || undefined}>
                    {employee.territory?.trim() ? employee.territory : '—'}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <span className={`px-2 py-1 inline-flex text-xs leading-4 font-semibold rounded-full ${
                    employee.is_active 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {employee.is_active ? 'Hoạt động' : 'Đã khóa'}
                  </span>
                </td>
                <td className="px-3 py-3 text-xs text-gray-500">
                  <div className="whitespace-nowrap">
                    {formatDate(employee.created_at).split(' ')[0]}
                  </div>
                  <div className="text-xs text-gray-400 hidden lg:block">
                    {formatDate(employee.created_at).split(' ')[1]}
                  </div>
                </td>
                <td className="px-3 py-3">
                  <div className="relative action-menu-container">
                    <button
                      ref={el => { actionButtonRefs.current[employee.employee_id] = el }}
                      onClick={() => setOpenMenuId(openMenuId === employee.employee_id ? null : employee.employee_id)}
                      className="inline-flex items-center justify-center w-8 h-8 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition"
                      title="Thao tác"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {/* Dropdown Thao tác render qua Portal để không bị cắt bởi overflow */}
      {openMenuId && menuPosition && typeof document !== 'undefined' && (() => {
        const employee = filteredEmployees.find(e => e.employee_id === openMenuId) ?? employees.find(e => e.employee_id === openMenuId)
        if (!employee) return null
        const menu = (
          <div
            className="action-menu-dropdown-portal fixed w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-[9999]"
            style={{ top: menuPosition.top, left: menuPosition.left }}
          >
            <button
              onClick={() => {
                setViewingEmployee(employee)
                setOpenMenuId(null)
              }}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition text-left"
            >
              <Eye className="w-4 h-4" />
              <span>Xem chi tiết</span>
            </button>
            {canEditEmployee && (
              <button
                onClick={() => {
                  setEditingEmployee(employee)
                  setOpenMenuId(null)
                }}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-blue-700 hover:bg-blue-50 transition text-left"
              >
                <Edit className="w-4 h-4" />
                <span>Sửa thông tin</span>
              </button>
            )}
            {canResetPassword && (
              <button
                onClick={() => {
                  handleResetPassword(employee.employee_id, employee.full_name, employee.username, employee.email)
                  setOpenMenuId(null)
                }}
                disabled={resettingId === employee.employee_id}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-orange-700 hover:bg-orange-50 transition text-left disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Key className="w-4 h-4" />
                <span>{resettingId === employee.employee_id ? 'Đang reset...' : 'Reset mật khẩu'}</span>
              </button>
            )}
            {hasAdminLikeAccess && (
              <button
                onClick={() => {
                  setTransferringEmployee(employee)
                  setOpenMenuId(null)
                }}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-purple-700 hover:bg-purple-50 transition text-left"
              >
                <ArrowRightLeft className="w-4 h-4" />
                <span>Chuyển giao khách hàng</span>
              </button>
            )}
          </div>
        )
        return createPortal(menu, document.body)
      })()}

      {/* Modal xem thông tin nhân viên */}
      {viewingEmployee && (
        <EmployeeDetailView
          employee={viewingEmployee}
          onClose={() => setViewingEmployee(null)}
        />
      )}

      {/* Modal sửa thông tin nhân viên */}
      {editingEmployee && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-xl font-bold text-gray-900">Sửa thông tin nhân viên</h2>
              <button
                onClick={() => setEditingEmployee(null)}
                className="text-gray-400 hover:text-gray-600 transition"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6">
              <EditEmployeeForm
                employee={editingEmployee}
                onSuccess={() => {
                  setEditingEmployee(null)
                  fetchEmployees()
                }}
                onCancel={() => setEditingEmployee(null)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal chuyển giao khách hàng */}
      {transferringEmployee && (
        <TransferCustomersModal
          fromEmployee={transferringEmployee}
          onClose={() => setTransferringEmployee(null)}
          onSuccess={() => {
            setTransferringEmployee(null)
            fetchEmployees()
          }}
        />
      )}

      {/* Modal hiển thị password mới */}
      {resetPasswordData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full shadow-xl">
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-xl font-bold text-gray-900">Password đã được reset</h2>
              <button
                onClick={() => setResetPasswordData(null)}
                className="text-gray-400 hover:text-gray-600 transition"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6">
              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-2">Thông tin nhân viên:</p>
                <p className="font-semibold text-gray-900">{resetPasswordData.employee.full_name}</p>
                <p className="text-sm text-gray-600">@{resetPasswordData.employee.username}</p>
                <p className="text-sm text-gray-600">{resetPasswordData.employee.email}</p>
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Password mới:
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg font-mono text-lg font-semibold text-gray-900">
                    {resetPasswordData.newPassword}
                  </div>
                  <button
                    onClick={handleCopyPassword}
                    className="px-4 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition flex items-center gap-2"
                  >
                    {copied ? (
                      <>
                        <CheckCircle className="w-5 h-5" />
                        <span>Đã copy</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-5 h-5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-yellow-800">
                  <strong>Lưu ý:</strong> Vui lòng gửi password này cho nhân viên một cách an toàn. 
                  Password này chỉ hiển thị một lần duy nhất.
                </p>
              </div>
            </div>
            <div className="flex justify-end p-6 border-t">
              <button
                onClick={() => setResetPasswordData(null)}
                className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-medium"
              >
                Đã ghi nhận
              </button>
            </div>
          </div>
        </div>
      )}
      {AlertComponent}
    </div>
  )
}

