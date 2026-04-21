'use client'

import { Mail, Shield, UserCheck, Calendar, User, CheckCircle, XCircle, MapPin } from 'lucide-react'

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

interface EmployeeDetailViewProps {
  employee: Employee
  onClose: () => void
}

export function EmployeeDetailView({ employee, onClose }: EmployeeDetailViewProps) {
  const formatDate = (timestamp: number | string) => {
    const ts = typeof timestamp === 'string' ? parseInt(timestamp, 10) : timestamp
    
    if (isNaN(ts) || ts === null || ts === undefined || ts === 0) {
      return 'N/A'
    }
    
    const timestampMs = ts.toString().length === 10 ? ts * 1000 : ts
    const date = new Date(timestampMs)
    
    if (isNaN(date.getTime())) {
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

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'super_admin':
        return 'Super Admin'
      case 'admin':
        return 'Quản trị viên'
      case 'director':
        return 'Giám đốc'
      case 'manager':
        return 'Quản lý'
      case 'leader':
        return 'Tổ trưởng'
      case 'sales':
        return 'Nhân viên bán hàng'
      default:
        return role
    }
  }

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'super_admin':
        return 'bg-red-100 text-red-800'
      case 'admin':
        return 'bg-purple-100 text-purple-800'
      case 'director':
      case 'manager':
        return 'bg-indigo-100 text-indigo-800'
      case 'leader':
        return 'bg-cyan-100 text-cyan-800'
      case 'sales':
        return 'bg-blue-100 text-blue-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="flex justify-between items-center p-6 border-b bg-gray-50">
          <h2 className="text-xl font-bold text-gray-900">Thông tin nhân viên</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition p-1 rounded-full hover:bg-gray-200"
          >
            <XCircle className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6">
          {/* Avatar và Tên */}
          <div className="flex items-center gap-4 mb-6 pb-6 border-b">
            <div className="flex-shrink-0 h-20 w-20 bg-primary-100 rounded-full flex items-center justify-center">
              <span className="text-primary-600 font-bold text-2xl">
                {employee.full_name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1">
              <h3 className="text-2xl font-bold text-gray-900 mb-1">{employee.full_name}</h3>
              <p className="text-gray-600">@{employee.username}</p>
            </div>
          </div>

          {/* Thông tin chi tiết */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Tên đăng nhập */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <User className="w-5 h-5 text-gray-400" />
                  <label className="text-sm font-medium text-gray-500">Tên đăng nhập</label>
                </div>
                <p className="text-lg font-semibold text-gray-900">{employee.username}</p>
              </div>

              {/* Email */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Mail className="w-5 h-5 text-gray-400" />
                  <label className="text-sm font-medium text-gray-500">Email</label>
                </div>
                <p className="text-lg font-semibold text-gray-900">{employee.email}</p>
              </div>

              {/* Vai trò */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  {employee.role === 'admin' ? (
                    <Shield className="w-5 h-5 text-gray-400" />
                  ) : (
                    <UserCheck className="w-5 h-5 text-gray-400" />
                  )}
                  <label className="text-sm font-medium text-gray-500">Vai trò</label>
                </div>
                <span className={`px-3 py-1 inline-flex text-sm font-semibold rounded-full ${getRoleColor(employee.role)}`}>
                  {getRoleLabel(employee.role)}
                </span>
              </div>

              {/* Phòng/Tổ */}
              {(employee.department_name || employee.department_id) && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <User className="w-5 h-5 text-gray-400" />
                    <label className="text-sm font-medium text-gray-500">Phòng/Tổ</label>
                  </div>
                  <p className="text-lg font-semibold text-gray-900">
                    {employee.department_name || employee.department_id || '—'}
                  </p>
                </div>
              )}

              {/* Chức danh */}
              {employee.title && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <label className="text-sm font-medium text-gray-500 block mb-2">Chức danh</label>
                  <p className="text-lg font-semibold text-gray-900">{employee.title}</p>
                </div>
              )}

              {/* Cấp bậc */}
              {employee.rank && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <label className="text-sm font-medium text-gray-500 block mb-2">Cấp bậc</label>
                  <p className="text-lg font-semibold text-gray-900">{employee.rank}</p>
                </div>
              )}

              {/* Địa bàn */}
              {(employee.territory && String(employee.territory).trim()) ? (
                <div className="bg-gray-50 rounded-lg p-4 md:col-span-2">
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin className="w-5 h-5 text-gray-400" />
                    <label className="text-sm font-medium text-gray-500">Địa bàn</label>
                  </div>
                  <p className="text-lg font-semibold text-gray-900 whitespace-pre-wrap">{String(employee.territory).trim()}</p>
                </div>
              ) : null}

              {/* Trạng thái */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  {employee.is_active ? (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-500" />
                  )}
                  <label className="text-sm font-medium text-gray-500">Trạng thái</label>
                </div>
                <span className={`px-3 py-1 inline-flex text-sm font-semibold rounded-full ${
                  employee.is_active 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-red-100 text-red-800'
                }`}>
                  {employee.is_active ? 'Hoạt động' : 'Đã khóa'}
                </span>
              </div>

              {/* Ngày tạo */}
              <div className="bg-gray-50 rounded-lg p-4 md:col-span-2">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-5 h-5 text-gray-400" />
                  <label className="text-sm font-medium text-gray-500">Ngày tạo tài khoản</label>
                </div>
                <p className="text-lg font-semibold text-gray-900">{formatDate(employee.created_at)}</p>
              </div>
            </div>

            {/* Employee ID (cho admin) */}
            <div className="bg-gray-50 rounded-lg p-4 border-t">
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1 block">
                Employee ID
              </label>
              <p className="text-sm font-mono text-gray-600">{employee.employee_id}</p>
            </div>
          </div>
        </div>

        <div className="flex justify-end p-6 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-medium"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  )
}











