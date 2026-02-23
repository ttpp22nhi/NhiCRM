'use client'

import { useState } from 'react'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { Navbar } from '@/components/Navbar'
import { EmployeeList } from '@/components/EmployeeList'
import { EmployeeForm } from '@/components/EmployeeForm'
import { useAuth } from '@/contexts/AuthContext'
import { useSubscription } from '@/contexts/SubscriptionContext'
import { useRouter } from 'next/navigation'
import { Plus, X, Shield } from 'lucide-react'

export default function EmployeesPage() {
  const { user } = useAuth()
  const { expired } = useSubscription()
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  if (user && user.role !== 'admin' && user.role !== 'super_admin') {
    router.push('/dashboard')
    return null
  }

  const handleEmployeeCreated = () => {
    setShowForm(false)
    setRefreshKey((prev) => prev + 1)
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 sm:mb-6">
            <div>
              <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
                <Shield className="w-6 h-6 sm:w-8 sm:h-8 text-primary-600" />
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900">Quản lý nhân viên</h1>
              </div>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">Tạo và quản lý tài khoản nhân viên (Chỉ dành cho Admin)</p>
            </div>
            <button
              onClick={() => !expired && setShowForm(true)}
              disabled={expired}
              title={expired ? 'Gói dịch vụ đã hết hạn. Vui lòng gia hạn để thêm nhân viên.' : undefined}
              className={`flex items-center space-x-1 sm:space-x-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg transition font-medium text-sm sm:text-base ${
                expired
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-primary-600 text-white hover:bg-primary-700'
              }`}
            >
              <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="hidden sm:inline">Thêm nhân viên</span>
              <span className="sm:hidden">Thêm</span>
            </button>
          </div>

          <EmployeeList key={refreshKey} />

          {showForm && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center p-6 border-b">
                  <h2 className="text-xl font-bold text-gray-900">Thêm nhân viên mới</h2>
                  <button
                    onClick={() => setShowForm(false)}
                    className="text-gray-400 hover:text-gray-600 transition"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
                <div className="p-6">
                  <EmployeeForm onSuccess={handleEmployeeCreated} onCancel={() => setShowForm(false)} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  )
}

















