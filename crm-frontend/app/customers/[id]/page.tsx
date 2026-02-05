'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { Navbar } from '@/components/Navbar'
import { InteractionTimeline } from '@/components/InteractionTimeline'
import { AddInteractionModal } from '@/components/AddInteractionModal'
import { apiClient } from '@/lib/api'
import { 
  ArrowLeft, 
  Phone, 
  Mail, 
  MapPin, 
  Building, 
  User, 
  Calendar,
  Loader2,
  AlertCircle,
  FileText,
  Plus
} from 'lucide-react'
import toast from 'react-hot-toast'

interface Customer {
  customer_id: string
  full_name: string
  email: string
  phone: string
  address: string
  customer_type: string
  company_name: string
  tax_code: string
  source: string
  assigned_to?: string
  assigned_employee_id?: string
  assigned_employee_name?: string
  assigned_employee_username?: string
  assigned_employee_email?: string
  assigned_employee_role?: string
  created_at: number | string
  updated_at?: number | string
}

export default function CustomerDetailPage() {
  const params = useParams()
  const router = useRouter()
  const customerId = params.id as string

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [timelineRefreshKey, setTimelineRefreshKey] = useState(0)

  useEffect(() => {
    if (customerId) {
      fetchCustomer()
    }
  }, [customerId])

  const fetchCustomer = async () => {
    try {
      setLoading(true)
      setError('')
      
      // Lấy danh sách khách hàng và tìm customer theo ID
      const response = await apiClient.get('/api/customers')
      
      if (response.data.success) {
        const customers = response.data.data || []
        const foundCustomer = customers.find((c: Customer) => c.customer_id === customerId)
        
        if (foundCustomer) {
          setCustomer(foundCustomer)
        } else {
          setError('Không tìm thấy khách hàng')
          toast.error('Không tìm thấy khách hàng')
        }
      } else {
        setError(response.data.message || 'Không thể tải thông tin khách hàng')
        toast.error(response.data.message || 'Không thể tải thông tin khách hàng')
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || 'Lỗi khi tải thông tin khách hàng'
      setError(errorMsg)
      toast.error(errorMsg)
    } finally {
      setLoading(false)
    }
  }

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
    return `${day}/${month}/${year}`
  }

  const getCustomerTypeLabel = (type: string) => {
    const types: { [key: string]: string } = {
      individual: 'Cá nhân',
      company: 'Doanh nghiệp',
      so_ban_nganh: 'Sở ban ngành',
      cong_an_tinh: 'Công an Tỉnh',
      cong_an_xa: 'Công an xã',
      xa_phuong: 'Xã phường',
      doanh_nghiep_lon: 'Doanh nghiệp lớn',
      ho_kinh_doanh: 'Hộ kinh doanh',
      hop_tac_xa: 'Hợp tác xã'
    }
    return types[type] || type
  }

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50">
          <Navbar />
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
              <span className="ml-3 text-gray-600">Đang tải thông tin khách hàng...</span>
            </div>
          </div>
        </div>
      </ProtectedRoute>
    )
  }

  if (error || !customer) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50">
          <Navbar />
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex items-center justify-center py-12">
              <AlertCircle className="w-8 h-8 text-red-500" />
              <span className="ml-3 text-red-600">{error || 'Không tìm thấy khách hàng'}</span>
            </div>
            <div className="flex justify-center mt-4">
              <button
                onClick={() => router.push('/customers')}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
              >
                Quay lại danh sách
              </button>
            </div>
          </div>
        </div>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="mb-6">
            <button
              onClick={() => router.push('/customers')}
              className="flex items-center text-gray-600 hover:text-gray-900 mb-4 transition"
            >
              <ArrowLeft className="w-5 h-5 mr-2" />
              <span>Quay lại danh sách</span>
            </button>
            <h1 className="text-3xl font-bold text-gray-900">{customer.full_name}</h1>
            <p className="text-gray-600 mt-2">Thông tin chi tiết khách hàng</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Thông tin chính */}
            <div className="lg:col-span-2 space-y-6">
              {/* Thông tin cơ bản */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <User className="w-5 h-5 text-primary-600" />
                  Thông tin cơ bản
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Họ và tên</label>
                    <p className="text-gray-900 font-semibold mt-1">{customer.full_name}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Loại khách hàng</label>
                    <p className="text-gray-900 font-semibold mt-1">{getCustomerTypeLabel(customer.customer_type)}</p>
                  </div>
                  {customer.email && (
                    <div className="flex items-start gap-2">
                      <Mail className="w-5 h-5 text-gray-400 mt-1" />
                      <div>
                        <label className="text-sm font-medium text-gray-500">Email</label>
                        <p className="text-gray-900 font-semibold mt-1">{customer.email}</p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-start gap-2">
                    <Phone className="w-5 h-5 text-gray-400 mt-1" />
                    <div>
                      <label className="text-sm font-medium text-gray-500">Số điện thoại</label>
                      <p className="text-gray-900 font-semibold mt-1">{customer.phone}</p>
                    </div>
                  </div>
                  {customer.address && (
                    <div className="flex items-start gap-2 md:col-span-2">
                      <MapPin className="w-5 h-5 text-gray-400 mt-1" />
                      <div className="flex-1">
                        <label className="text-sm font-medium text-gray-500">Địa chỉ</label>
                        <p className="text-gray-900 font-semibold mt-1">{customer.address}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Thông tin công ty (nếu có) */}
              {(customer.company_name || customer.tax_code) && (
                <div className="bg-white rounded-lg shadow p-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Building className="w-5 h-5 text-primary-600" />
                    Thông tin công ty
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {customer.company_name && (
                      <div>
                        <label className="text-sm font-medium text-gray-500">Tên công ty</label>
                        <p className="text-gray-900 font-semibold mt-1">{customer.company_name}</p>
                      </div>
                    )}
                    {customer.tax_code && (
                      <div>
                        <label className="text-sm font-medium text-gray-500">Mã số thuế</label>
                        <p className="text-gray-900 font-semibold mt-1">{customer.tax_code}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Lịch sử tương tác */}
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Lịch sử tương tác</h3>
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition text-sm font-medium"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Thêm tương tác</span>
                  </button>
                </div>
                <InteractionTimeline customerId={customerId} refreshKey={timelineRefreshKey} />
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Thông tin bổ sung */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary-600" />
                  Thông tin bổ sung
                </h2>
                <div className="space-y-4">
                  {customer.source && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Nguồn khách hàng</label>
                      <p className="text-gray-900 font-semibold mt-1">{customer.source}</p>
                    </div>
                  )}
                  {customer.assigned_employee_name && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Nhân viên chăm sóc</label>
                      <p className="text-gray-900 font-semibold mt-1">{customer.assigned_employee_name}</p>
                      {customer.assigned_employee_username && (
                        <p className="text-sm text-gray-600 mt-1">@{customer.assigned_employee_username}</p>
                      )}
                    </div>
                  )}
                  <div className="flex items-start gap-2">
                    <Calendar className="w-5 h-5 text-gray-400 mt-1" />
                    <div>
                      <label className="text-sm font-medium text-gray-500">Ngày tạo</label>
                      <p className="text-gray-900 font-semibold mt-1">{formatDate(customer.created_at)}</p>
                    </div>
                  </div>
                  {customer.updated_at && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Ngày cập nhật</label>
                      <p className="text-gray-900 font-semibold mt-1">{formatDate(customer.updated_at)}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Add Interaction Modal */}
        <AddInteractionModal
          customerId={customerId}
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setTimelineRefreshKey(prev => prev + 1)
          }}
        />
      </div>
    </ProtectedRoute>
  )
}

