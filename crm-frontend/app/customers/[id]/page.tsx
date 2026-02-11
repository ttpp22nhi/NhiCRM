'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { Navbar } from '@/components/Navbar'
import { InteractionTimeline } from '@/components/InteractionTimeline'
import { AddInteractionModal } from '@/components/AddInteractionModal'
import { DealModal } from '@/components/DealModal'
import { apiClient } from '@/lib/api'
import { 
  ArrowLeft, 
  ArrowRight,
  Phone, 
  Mail, 
  MapPin, 
  Building, 
  User, 
  Calendar,
  Loader2,
  AlertCircle,
  FileText,
  Plus,
  History,
  Clock,
  ArrowRightLeft,
  Info,
  DollarSign
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

const STAGES = [
  { id: 'tiep_can', label: 'Tiếp cận' },
  { id: 'tu_van', label: 'Tư vấn' },
  { id: 'bao_gia', label: 'Báo giá' },
  { id: 'thuong_thao', label: 'Thương thảo' },
  { id: 'thanh_cong', label: 'Thành công' }
]

export default function CustomerDetailPage() {
  const params = useParams()
  const router = useRouter()
  const customerId = params.id as string

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [timelineRefreshKey, setTimelineRefreshKey] = useState(0)
  const [ownershipHistory, setOwnershipHistory] = useState<any[]>([])
  const [latestTransferNote, setLatestTransferNote] = useState<any>(null)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [activeTab, setActiveTab] = useState<'interactions' | 'deals'>('interactions')
  const [deals, setDeals] = useState<any[]>([])
  const [loadingDeals, setLoadingDeals] = useState(false)
  const [showDealModal, setShowDealModal] = useState(false)

  useEffect(() => {
    if (customerId) {
      fetchCustomer()
      fetchOwnershipHistory()
      fetchDeals()
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

  const fetchOwnershipHistory = async () => {
    try {
      setLoadingHistory(true)
      const response = await apiClient.get(`/api/customers/${customerId}/ownership-history`)
      if (response.data.success) {
        setOwnershipHistory(response.data.data.ownership_history || [])
        setLatestTransferNote(response.data.data.latest_transfer_note)
      }
    } catch (err: any) {
      console.error('Error fetching ownership history:', err)
      // Không hiển thị error toast vì đây là tính năng bổ sung
    } finally {
      setLoadingHistory(false)
    }
  }

  const fetchDeals = async () => {
    try {
      setLoadingDeals(true)
      const response = await apiClient.get(`/api/deals?customer_id=${customerId}`)
      if (response.data.success) {
        setDeals(response.data.data || [])
      }
    } catch (err: any) {
      console.error('Error fetching deals:', err)
    } finally {
      setLoadingDeals(false)
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

  const formatDateTime = (timestamp: number | string) => {
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
    return `${day}/${month}/${year} ${hours}:${minutes}`
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

          {/* Highlight Ghi chú bàn giao */}
          {latestTransferNote && (
            <div className="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-blue-500 rounded-lg shadow-md p-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <Info className="w-6 h-6 text-blue-600" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-lg font-bold text-blue-900">Ghi chú bàn giao</h3>
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                      {formatDateTime(latestTransferNote.created_at)}
                    </span>
                  </div>
                  <p className="text-gray-800 mb-2 whitespace-pre-wrap">{latestTransferNote.approval_note}</p>
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <span>
                      <span className="font-medium">Người phê duyệt:</span> {latestTransferNote.approver_name}
                    </span>
                    {latestTransferNote.sender_name && (
                      <span>
                        <span className="font-medium">Từ:</span> {latestTransferNote.sender_name}
                      </span>
                    )}
                    {latestTransferNote.receiver_name && (
                      <span>
                        <span className="font-medium">Đến:</span> {latestTransferNote.receiver_name}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

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

              {/* Tabs: Lịch sử tương tác và Cơ hội */}
              <div className="bg-white rounded-lg shadow">
                {/* Tab Navigation */}
                <div className="border-b border-gray-200">
                  <nav className="flex -mb-px">
                    <button
                      onClick={() => setActiveTab('interactions')}
                      className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition ${
                        activeTab === 'interactions'
                          ? 'border-primary-600 text-primary-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <FileText className="w-4 h-4" />
                      <span>Lịch sử tương tác</span>
                    </button>
                    <button
                      onClick={() => setActiveTab('deals')}
                      className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition ${
                        activeTab === 'deals'
                          ? 'border-primary-600 text-primary-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <DollarSign className="w-4 h-4" />
                      <span>Cơ hội</span>
                      {deals.length > 0 && (
                        <span className="ml-1 px-2 py-0.5 text-xs font-semibold rounded-full bg-primary-100 text-primary-700">
                          {deals.length}
                        </span>
                      )}
                    </button>
                  </nav>
                </div>

                {/* Tab Content */}
                <div className="p-6">
                  {activeTab === 'interactions' ? (
                    <div>
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
                  ) : (
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-gray-900">Cơ hội bán hàng</h3>
                        <button
                          onClick={() => setShowDealModal(true)}
                          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition text-sm font-medium"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Tạo Deal mới</span>
                        </button>
                      </div>
                      {loadingDeals ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
                        </div>
                      ) : deals.length === 0 ? (
                        <p className="text-center text-gray-500 py-8">Chưa có deal nào cho khách hàng này</p>
                      ) : (
                        <div className="space-y-4">
                          {deals.map((deal) => (
                            <div
                              key={deal.deal_id}
                              className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition"
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <h4 className="font-semibold text-gray-900 mb-2">{deal.title}</h4>
                                  <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                      <span className="text-gray-500">Giá trị:</span>
                                      <span className="ml-2 font-semibold text-gray-900">
                                        {new Intl.NumberFormat('vi-VN', {
                                          style: 'currency',
                                          currency: 'VND'
                                        }).format(deal.amount)}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-gray-500">Giai đoạn:</span>
                                      <span className="ml-2 font-semibold text-gray-900">
                                        {STAGES.find(s => s.id === deal.stage)?.label || deal.stage}
                                      </span>
                                    </div>
                                    {deal.expected_closing_date && (
                                      <div>
                                        <span className="text-gray-500">Ngày dự kiến:</span>
                                        <span className="ml-2 text-gray-900">
                                          {formatDate(deal.expected_closing_date)}
                                        </span>
                                      </div>
                                    )}
                                    <div>
                                      <span className="text-gray-500">Trạng thái:</span>
                                      <span className={`ml-2 px-2 py-0.5 rounded text-xs font-medium ${
                                        deal.status === 'active' ? 'bg-green-100 text-green-700' :
                                        deal.status === 'closed' ? 'bg-gray-100 text-gray-700' :
                                        'bg-red-100 text-red-700'
                                      }`}>
                                        {deal.status === 'active' ? 'Đang hoạt động' :
                                         deal.status === 'closed' ? 'Đã đóng' : 'Đã hủy'}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
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

              {/* Lịch sử sở hữu */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <History className="w-5 h-5 text-primary-600" />
                  Lịch sử sở hữu
                </h2>
                {loadingHistory ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-primary-600" />
                  </div>
                ) : ownershipHistory.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">Chưa có lịch sử chuyển giao</p>
                ) : (
                  <div className="space-y-4">
                    {ownershipHistory.map((item, index) => (
                      <div
                        key={item.interaction_id}
                        className={`border-l-4 pl-4 pb-4 ${
                          item.is_current
                            ? 'border-primary-500 bg-primary-50'
                            : 'border-gray-300'
                        } ${index < ownershipHistory.length - 1 ? 'border-b border-gray-200' : ''}`}
                      >
                        <div className="flex items-start gap-2 mb-2">
                          <ArrowRightLeft className={`w-4 h-4 mt-0.5 ${item.is_current ? 'text-primary-600' : 'text-gray-400'}`} />
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-sm font-semibold ${item.is_current ? 'text-primary-900' : 'text-gray-700'}`}>
                                {item.from_employee_name}
                              </span>
                              <ArrowRight className="w-3 h-3 text-gray-400" />
                              <span className={`text-sm font-semibold ${item.is_current ? 'text-primary-900' : 'text-gray-700'}`}>
                                {item.to_employee_name}
                              </span>
                              {item.is_current && (
                                <span className="px-2 py-0.5 bg-primary-100 text-primary-700 rounded text-xs font-medium">
                                  Hiện tại
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-gray-600 mb-1">
                              <div className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                <span>{formatDateTime(item.created_at)}</span>
                              </div>
                              {item.duration_days !== null && (
                                <span className="text-gray-500">
                                  ({item.duration_days} ngày)
                                </span>
                              )}
                            </div>
                            {item.transfer_reason && (
                              <p className="text-xs text-gray-600 mt-1 italic">
                                Lý do: {item.transfer_reason}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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

        {/* Deal Modal - Reuse from deals page */}
        {showDealModal && (
          <DealModal
            deal={null}
            customerId={customerId}
            onClose={() => setShowDealModal(false)}
            onSuccess={() => {
              fetchDeals()
              setShowDealModal(false)
            }}
          />
        )}
      </div>
    </ProtectedRoute>
  )
}

