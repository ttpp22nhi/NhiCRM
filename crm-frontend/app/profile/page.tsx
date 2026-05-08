'use client'

import { useEffect, useState } from 'react'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { Navbar } from '@/components/Navbar'
import { useAuth } from '@/contexts/AuthContext'
import { ChangePasswordForm } from '@/components/ChangePasswordForm'
import { apiClient } from '@/lib/api'
import { User, Mail, Shield, UserCheck, Calendar, Key, X, Phone } from 'lucide-react'

export default function ProfilePage() {
  const { user } = useAuth()
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [departmentName, setDepartmentName] = useState<string>('')
  const [phoneDisplay, setPhoneDisplay] = useState<string>('')

  useEffect(() => {
    if (!user?.id) {
      setDepartmentName('')
      setPhoneDisplay('')
      return
    }
    let cancelled = false
    const loadDepartment = async () => {
      try {
        const res = await apiClient.get(`/api/employees/${user.id}`)
        if (!cancelled && res.data?.success) {
          setDepartmentName(res.data?.data?.department_name || '')
          const p = res.data?.data?.phone
          setPhoneDisplay(p != null && String(p).trim() ? String(p).trim() : '')
        }
      } catch (_) {
        if (!cancelled) setDepartmentName('')
      }
    }
    loadDepartment()
    return () => { cancelled = true }
  }, [user?.id])

  if (!user) {
    return null
  }

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'super_admin':
        return 'Super Admin'
      case 'admin':
        return 'Quản trị viên'
      case 'director':
        return 'Lãnh đạo'
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

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin':
        return <Shield className="w-5 h-5" />
      default:
        return <UserCheck className="w-5 h-5" />
    }
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Trang cá nhân</h1>
            <p className="text-gray-600 mt-2">Thông tin tài khoản của bạn</p>
          </div>

          <div className="bg-white rounded-lg shadow overflow-hidden">
            {/* Avatar và Tên */}
            <div className="bg-gradient-to-r from-primary-500 to-primary-600 px-6 py-8">
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0 h-20 w-20 bg-white rounded-full flex items-center justify-center shadow-lg">
                  <span className="text-primary-600 font-bold text-3xl">
                    {user.full_name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 text-white">
                  <h2 className="text-2xl font-bold mb-1">{user.full_name}</h2>
                  <p className="text-primary-100">@{user.username}</p>
                </div>
              </div>
            </div>

            {/* Thông tin chi tiết */}
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Tên đăng nhập */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <User className="w-5 h-5 text-gray-400" />
                    <label className="text-sm font-medium text-gray-500">Tên đăng nhập</label>
                  </div>
                  <p className="text-lg font-semibold text-gray-900">{user.username}</p>
                </div>

                {/* Email */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Mail className="w-5 h-5 text-gray-400" />
                    <label className="text-sm font-medium text-gray-500">Email</label>
                  </div>
                  <p className="text-lg font-semibold text-gray-900">
                    {user.email || 'Chưa cập nhật'}
                  </p>
                </div>

                {/* Số điện thoại */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Phone className="w-5 h-5 text-gray-400" />
                    <label className="text-sm font-medium text-gray-500">Số điện thoại</label>
                  </div>
                  <p className="text-lg font-semibold text-gray-900">
                    {phoneDisplay || 'Chưa cập nhật'}
                  </p>
                </div>

                {/* Vai trò */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    {getRoleIcon(user.role)}
                    <label className="text-sm font-medium text-gray-500">Vai trò</label>
                  </div>
                  <span className={`px-3 py-1 inline-flex text-sm font-semibold rounded-full ${getRoleColor(user.role)}`}>
                    {getRoleLabel(user.role)}
                  </span>
                </div>

                {/* User ID */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="w-5 h-5 text-gray-400" />
                    <label className="text-sm font-medium text-gray-500">User ID</label>
                  </div>
                  <p className="text-sm font-mono text-gray-600">{user.id}</p>
                </div>

                {/* Đơn vị */}
                <div className="bg-gray-50 rounded-lg p-4 md:col-span-2">
                  <div className="flex items-center gap-2 mb-2">
                    <UserCheck className="w-5 h-5 text-gray-400" />
                    <label className="text-sm font-medium text-gray-500">Đơn vị</label>
                  </div>
                  <p className="text-lg font-semibold text-gray-900">
                    {departmentName || 'Chưa gán đơn vị'}
                  </p>
                </div>
              </div>

              {/* Button Đổi mật khẩu */}
              <div className="mt-6 pt-6 border-t">
                <button
                  data-change-password
                  onClick={() => setShowChangePassword(true)}
                  className="flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-medium"
                >
                  <Key className="w-5 h-5" />
                  <span>Đổi mật khẩu</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Modal đổi mật khẩu */}
        {showChangePassword && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-md w-full shadow-xl">
              <div className="flex justify-between items-center p-6 border-b">
                <h2 className="text-xl font-bold text-gray-900">Đổi mật khẩu</h2>
                <button
                  onClick={() => setShowChangePassword(false)}
                  className="text-gray-400 hover:text-gray-600 transition"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="p-6">
                <ChangePasswordForm
                  onSuccess={() => setShowChangePassword(false)}
                  onCancel={() => setShowChangePassword(false)}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  )
}

