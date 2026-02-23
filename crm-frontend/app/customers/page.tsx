'use client'

import { useState, useEffect } from 'react'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { Navbar } from '@/components/Navbar'
import { CustomerList } from '@/components/CustomerList'
import { CustomerForm } from '@/components/CustomerForm'
import { useAuth } from '@/contexts/AuthContext'
import { useSubscription } from '@/contexts/SubscriptionContext'
import { Plus, X, ArrowRightLeft } from 'lucide-react'

export default function CustomersPage() {
  const { user } = useAuth()
  const { expired } = useSubscription()
  const [showForm, setShowForm] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  
  // Chỉ Admin và Manager mới có quyền chuyển giao
  const canTransfer = user?.role === 'admin' || user?.role === 'manager'

  const handleCustomerCreated = () => {
    setShowForm(false)
    setRefreshKey((prev) => prev + 1)
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Quản lý khách hàng</h1>
              <p className="text-gray-600 mt-2">Danh sách và thông tin khách hàng</p>
            </div>
            <div className="flex items-center gap-3">
              {canTransfer && (
                <button
                  onClick={() => {
                    if (expired) return
                    const handleBulkTransfer = (window as any).__customerListBulkTransfer
                    if (handleBulkTransfer) handleBulkTransfer()
                    else console.error('CustomerList component not ready')
                  }}
                  disabled={expired}
                  title={expired ? 'Gói dịch vụ đã hết hạn. Vui lòng gia hạn.' : undefined}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition font-medium ${
                    expired ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-purple-600 text-white hover:bg-purple-700'
                  }`}
                >
                  <ArrowRightLeft className="w-5 h-5" />
                  <span>Chuyển giao người phụ trách</span>
                </button>
              )}
              <button
                onClick={() => !expired && setShowForm(true)}
                disabled={expired}
                title={expired ? 'Gói dịch vụ đã hết hạn. Vui lòng gia hạn để thêm khách hàng.' : undefined}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition font-medium ${
                  expired ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-primary-600 text-white hover:bg-primary-700'
                }`}
              >
                <Plus className="w-5 h-5" />
                <span>Thêm khách hàng</span>
              </button>
            </div>
          </div>

          <CustomerList key={refreshKey} />

          {showForm && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center p-6 border-b">
                  <h2 className="text-xl font-bold text-gray-900">Thêm khách hàng mới</h2>
                  <button
                    onClick={() => setShowForm(false)}
                    className="text-gray-400 hover:text-gray-600 transition"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
                <div className="p-6">
                  <CustomerForm onSuccess={handleCustomerCreated} onCancel={() => setShowForm(false)} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  )
}

















