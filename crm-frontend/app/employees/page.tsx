'use client'

import { useState, useRef } from 'react'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { Navbar } from '@/components/Navbar'
import { EmployeeList, type EmployeeListHandle } from '@/components/EmployeeList'
import { EmployeeForm } from '@/components/EmployeeForm'
import { EmployeeImportModal } from '@/components/EmployeeImportModal'
import { useAuth } from '@/contexts/AuthContext'
import { useSubscription } from '@/contexts/SubscriptionContext'
import { useRouter } from 'next/navigation'
import { Plus, X, Shield, FileSpreadsheet, Download } from 'lucide-react'
import { isExecutive, canCreateEmployees } from '@/lib/rbac'

export default function EmployeesPage() {
  const { user } = useAuth()
  const { expired } = useSubscription()
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const listRef = useRef<EmployeeListHandle>(null)
  const canManageEmployees = canCreateEmployees(user?.role)
  const canViewEmployees = isExecutive(user?.role)

  if (user && !canViewEmployees) {
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
              <p className="text-xs sm:text-sm text-gray-600 mt-1">
                {canManageEmployees
                  ? 'Thêm nhân viên (Lãnh đạo/Quản lý: Tổ trưởng hoặc Sales); chỉnh sửa chi tiết: Admin'
                  : 'Xem danh sách nhân viên (theo phạm vi tenant)'}
              </p>
            </div>
            {canViewEmployees && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => listRef.current?.exportExcel()}
                  title="Xuất danh sách đang hiển thị (theo bộ lọc) ra file Excel"
                  className="flex items-center space-x-1 sm:space-x-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg transition font-medium text-sm sm:text-base border border-gray-300 text-gray-700 bg-white hover:bg-gray-50"
                >
                  <Download className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span className="hidden sm:inline">Xuất Excel</span>
                  <span className="sm:hidden">Xuất</span>
                </button>
                {canManageEmployees && (
                  <>
                    <button
                      type="button"
                      onClick={() => !expired && setShowImport(true)}
                      disabled={expired}
                      title={
                        expired
                          ? 'Gói dịch vụ đã hết hạn. Vui lòng gia hạn để import nhân viên.'
                          : 'Import danh sách từ file Excel mẫu'
                      }
                      className={`flex items-center space-x-1 sm:space-x-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg transition font-medium text-sm sm:text-base border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 ${
                        expired ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      <FileSpreadsheet className="w-4 h-4 sm:w-5 sm:h-5" />
                      <span className="hidden sm:inline">Import Excel</span>
                      <span className="sm:hidden">Import</span>
                    </button>
                    <button
                      type="button"
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
                  </>
                )}
              </div>
            )}
          </div>

          <EmployeeList ref={listRef} key={refreshKey} />

          {showImport && canManageEmployees && (
            <EmployeeImportModal
              onClose={() => setShowImport(false)}
              onSuccess={() => setRefreshKey((k) => k + 1)}
            />
          )}

          {showForm && canManageEmployees && (
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

















