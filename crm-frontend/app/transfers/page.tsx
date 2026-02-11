'use client'

import { useState, useEffect } from 'react'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { Navbar } from '@/components/Navbar'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api'
import { CheckCircle, XCircle, Clock, Users, Loader2, AlertCircle, User, FileText, Search, Filter, ChevronLeft, ChevronRight, X, Calendar } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAlert } from '@/components/AlertModal'

interface TransferRequest {
  transfer_request_id: string
  customer_ids: string[]
  sender_id: string
  receiver_id: string
  status: string
  note: string | null
  approval_note: string | null
  created_at: number
  updated_at: number | null
  approved_by: string | null
  approved_at: number | null
  sender_name: string
  sender_username: string
  receiver_name: string
  receiver_username: string
  approver_name: string | null
  customers: Array<{
    customer_id: string
    full_name: string
    phone: string
    company_name: string | null
  }>
}

interface ApprovalLog {
  log_id: string
  transfer_request_id: string
  approver_id: string
  action: 'approve' | 'reject'
  approval_note: string | null
  sender_id: string
  receiver_id: string
  customer_count: number
  created_at: number
  request_created_at: number | null
  approver_name: string
  approver_username: string
  sender_name: string
  sender_username: string
  receiver_name: string
  receiver_username: string
}

type TabType = 'approvals' | 'logs'

export default function TransfersPage() {
  const { user } = useAuth()
  const router = useRouter()
  const { showConfirm, AlertComponent } = useAlert()
  const [activeTab, setActiveTab] = useState<TabType>('approvals')

  // States for Approvals tab
  const [requests, setRequests] = useState<TransferRequest[]>([])
  const [loadingRequests, setLoadingRequests] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [showApprovalModal, setShowApprovalModal] = useState(false)
  const [currentRequestId, setCurrentRequestId] = useState<string | null>(null)
  const [currentAction, setCurrentAction] = useState<'approve' | 'reject' | null>(null)
  const [approvalNote, setApprovalNote] = useState('')

  // States for Logs tab
  const [logs, setLogs] = useState<ApprovalLog[]>([])
  const [loadingLogs, setLoadingLogs] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(20)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [searchRequestId, setSearchRequestId] = useState('')
  const [searchApproverId, setSearchApproverId] = useState('')

  // Chỉ Manager và Admin mới được truy cập
  useEffect(() => {
    if (user && user.role !== 'manager' && user.role !== 'admin') {
      router.push('/dashboard')
    }
  }, [user, router])

  useEffect(() => {
    if (user && (user.role === 'manager' || user.role === 'admin')) {
      if (activeTab === 'approvals') {
        fetchPendingRequests()
      } else {
        fetchLogs()
      }
    }
  }, [user, activeTab, currentPage, searchRequestId, searchApproverId])

  // Fetch pending requests
  const fetchPendingRequests = async () => {
    try {
      setLoadingRequests(true)
      const response = await apiClient.get('/api/transfer/pending')
      if (response.data.success) {
        setRequests(response.data.data || [])
      }
    } catch (error: any) {
      toast.error('Không thể tải danh sách yêu cầu chuyển giao')
      console.error('Error fetching pending requests:', error)
    } finally {
      setLoadingRequests(false)
    }
  }

  // Fetch approval logs
  const fetchLogs = async () => {
    try {
      setLoadingLogs(true)
      const params = new URLSearchParams()
      params.append('page', currentPage.toString())
      params.append('limit', pageSize.toString())
      if (searchRequestId.trim()) {
        params.append('transfer_request_id', searchRequestId.trim())
      }
      if (searchApproverId.trim()) {
        params.append('approver_id', searchApproverId.trim())
      }

      const response = await apiClient.get(`/api/transfer/approval-logs?${params.toString()}`)
      if (response.data.success) {
        setLogs(response.data.data || [])
        if (response.data.pagination) {
          setTotalPages(response.data.pagination.totalPages)
          setTotal(response.data.pagination.total)
        }
      }
    } catch (error: any) {
      toast.error('Không thể tải lịch sử phê duyệt')
      console.error('Error fetching approval logs:', error)
    } finally {
      setLoadingLogs(false)
    }
  }

  // Handle approve/reject
  const handleApproveClick = (requestId: string) => {
    setCurrentRequestId(requestId)
    setCurrentAction('approve')
    setApprovalNote('')
    setShowApprovalModal(true)
  }

  const handleRejectClick = (requestId: string) => {
    setCurrentRequestId(requestId)
    setCurrentAction('reject')
    setApprovalNote('')
    setShowApprovalModal(true)
  }

  const handleSubmitApproval = async () => {
    if (!approvalNote.trim()) {
      toast.error('Vui lòng nhập nội dung phê duyệt/từ chối')
      return
    }

    if (!currentRequestId || !currentAction) {
      return
    }

    try {
      setProcessingId(currentRequestId)
      const response = await apiClient.patch(`/api/transfer/approve/${currentRequestId}`, {
        action: currentAction,
        approval_note: approvalNote.trim()
      })

      if (response.data.success) {
        toast.success(response.data.message || (currentAction === 'approve' ? 'Đã phê duyệt yêu cầu chuyển giao thành công!' : 'Đã từ chối yêu cầu chuyển giao'))
        setShowApprovalModal(false)
        setApprovalNote('')
        setCurrentRequestId(null)
        setCurrentAction(null)
        fetchPendingRequests()
        // Refresh logs tab if active
        if (activeTab === 'logs') {
          fetchLogs()
        }
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || `Không thể ${currentAction === 'approve' ? 'phê duyệt' : 'từ chối'} yêu cầu`
      toast.error(errorMessage)
      console.error(`Error ${currentAction}ing request:`, error)
    } finally {
      setProcessingId(null)
    }
  }

  const formatDate = (timestamp: number | string | null) => {
    if (!timestamp) return 'N/A'
    // Convert string to number if needed
    const numTimestamp = typeof timestamp === 'string' ? Number(timestamp) : timestamp
    if (isNaN(numTimestamp)) return 'Invalid Date'
    const date = new Date(numTimestamp)
    if (isNaN(date.getTime())) return 'Invalid Date'
    return date.toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: activeTab === 'logs' ? '2-digit' : undefined
    })
  }

  const handleClearFilters = () => {
    setSearchRequestId('')
    setSearchApproverId('')
    setCurrentPage(1)
  }

  if (user && user.role !== 'manager' && user.role !== 'admin') {
    return null
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6">
          <div className="mb-4 sm:mb-6">
            <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
              <Clock className="w-6 h-6 sm:w-8 sm:h-8 text-primary-600" />
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900">
                Quản lý chuyển giao khách hàng
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-gray-600 mt-1">
              Phê duyệt yêu cầu chuyển giao và xem lịch sử phê duyệt
            </p>
          </div>

          {/* Tabs */}
          <div className="bg-white rounded-lg shadow border border-gray-200 mb-4">
            <div className="border-b border-gray-200">
              <nav className="flex -mb-px">
                <button
                  onClick={() => setActiveTab('approvals')}
                  className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition ${
                    activeTab === 'approvals'
                      ? 'border-primary-600 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Clock className="w-4 h-4" />
                  <span>Phê duyệt chuyển giao</span>
                  {requests.length > 0 && (
                    <span className="ml-1 px-2 py-0.5 text-xs font-semibold rounded-full bg-primary-100 text-primary-700">
                      {requests.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('logs')}
                  className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition ${
                    activeTab === 'logs'
                      ? 'border-primary-600 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  <span>Lịch sử phê duyệt</span>
                </button>
              </nav>
            </div>
          </div>

          {/* Approvals Tab Content */}
          {activeTab === 'approvals' && (
            <>
              {loadingRequests ? (
                <div className="bg-white rounded-lg shadow p-8 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
                </div>
              ) : requests.length === 0 ? (
                <div className="bg-white rounded-lg shadow p-8 text-center">
                  <CheckCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Không có yêu cầu chuyển giao nào
                  </h3>
                  <p className="text-sm text-gray-600">
                    Tất cả yêu cầu chuyển giao đã được xử lý
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {requests.map((request) => (
                    <div
                      key={request.transfer_request_id}
                      className={`bg-white rounded-lg shadow-md border overflow-hidden relative transition hover:shadow-lg ${
                        request.customers.length >= 10 
                          ? 'border-2 border-red-400' 
                          : request.customers.length >= 5
                          ? 'border-2 border-orange-400'
                          : 'border-2 border-yellow-400'
                      }`}
                    >
                      {/* Compact warning banner */}
                      {request.customers.length >= 10 && (
                        <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white px-3 py-1.5 flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 animate-pulse flex-shrink-0" />
                          <span className="font-bold text-xs truncate">CẢNH BÁO: {request.customers.length} khách hàng</span>
                        </div>
                      )}

                      <div className="p-3">
                        {/* Compact Header */}
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className="flex items-start gap-2 flex-1 min-w-0">
                            <div className="p-1.5 bg-yellow-100 rounded border border-yellow-400 flex-shrink-0">
                              <Clock className="w-4 h-4 text-yellow-700" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <h3 className="text-sm font-bold text-gray-900 truncate">
                                  #{request.transfer_request_id.slice(0, 8)}
                                </h3>
                                <span className={`px-2 py-0.5 rounded-full text-xs font-bold flex-shrink-0 ${
                                  request.customers.length >= 10 
                                    ? 'bg-red-100 text-red-700 border border-red-400' 
                                    : request.customers.length >= 5
                                    ? 'bg-orange-100 text-orange-700 border border-orange-400'
                                    : 'bg-blue-100 text-blue-700 border border-blue-400'
                                }`}>
                                  {request.customers.length} KH
                                </span>
                              </div>
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-1.5">
                                  <Calendar className="w-3 h-3 text-gray-400 flex-shrink-0" />
                                  <span className="text-xs text-gray-600 font-medium">Ngày tạo:</span>
                                  <span className="text-xs text-gray-700">
                                    {formatDate(request.created_at)}
                                  </span>
                                </div>
                                {request.approved_at && (
                                  <div className="flex items-center gap-1.5">
                                    <Calendar className="w-3 h-3 text-green-500 flex-shrink-0" />
                                    <span className="text-xs text-gray-600 font-medium">Ngày xử lý:</span>
                                    <span className="text-xs text-green-700 font-semibold">
                                      {formatDate(request.approved_at)}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <button
                              onClick={() => handleRejectClick(request.transfer_request_id)}
                              disabled={processingId === request.transfer_request_id}
                              className="flex items-center gap-1 px-2.5 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 transition text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {processingId === request.transfer_request_id ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  <span>Đang xử lý...</span>
                                </>
                              ) : (
                                <>
                                  <XCircle className="w-3.5 h-3.5" />
                                  <span>Từ chối</span>
                                </>
                              )}
                            </button>
                            <button
                              onClick={() => handleApproveClick(request.transfer_request_id)}
                              disabled={processingId === request.transfer_request_id}
                              className="flex items-center gap-1 px-2.5 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 transition text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {processingId === request.transfer_request_id ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  <span>Đang xử lý...</span>
                                </>
                              ) : (
                                <>
                                  <CheckCircle className="w-3.5 h-3.5" />
                                  <span>Phê duyệt</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Compact Sender/Receiver Info */}
                        <div className="grid grid-cols-2 gap-2 mb-3">
                          <div className="bg-red-50 rounded p-2 border border-red-300">
                            <div className="flex items-center gap-1.5 mb-1">
                              <User className="w-3.5 h-3.5 text-red-600 flex-shrink-0" />
                              <span className="text-xs font-bold text-red-700">Gửi</span>
                            </div>
                            <p className="text-sm font-bold text-red-900 truncate" title={request.sender_name}>
                              {request.sender_name}
                            </p>
                            <p className="text-xs text-red-600 truncate">@{request.sender_username}</p>
                          </div>
                          <div className="bg-green-50 rounded p-2 border border-green-300">
                            <div className="flex items-center gap-1.5 mb-1">
                              <Users className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                              <span className="text-xs font-bold text-green-700">Nhận</span>
                            </div>
                            <p className="text-sm font-bold text-green-900 truncate" title={request.receiver_name}>
                              {request.receiver_name}
                            </p>
                            <p className="text-xs text-green-600 truncate">@{request.receiver_username}</p>
                          </div>
                        </div>

                        {/* Compact Customer List */}
                        <div className="mb-3">
                          <div className="flex items-center justify-between mb-1.5 bg-primary-50 px-2 py-1 rounded border border-primary-300">
                            <div className="flex items-center gap-1.5">
                              <Users className="w-3.5 h-3.5 text-primary-600 flex-shrink-0" />
                              <span className="text-xs font-bold text-primary-900">
                                Danh sách ({request.customers.length})
                              </span>
                            </div>
                          </div>
                          <div className="bg-gray-50 rounded p-2 max-h-32 overflow-y-auto border border-gray-300">
                            <div className="space-y-1">
                              {request.customers.slice(0, 5).map((customer, index) => (
                                <div
                                  key={customer.customer_id}
                                  className="flex items-center justify-between bg-white p-1.5 rounded border border-gray-200 hover:border-primary-400 transition text-xs"
                                >
                                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                    <span className="flex-shrink-0 w-4 h-4 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-[10px] font-bold">
                                      {index + 1}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <p className="text-xs font-semibold text-gray-900 truncate" title={customer.full_name}>
                                        {customer.full_name}
                                      </p>
                                      <p className="text-[10px] text-gray-600 truncate">{customer.phone}</p>
                                    </div>
                                  </div>
                                  {customer.company_name && (
                                    <span className="text-[10px] text-gray-700 bg-gray-200 px-1.5 py-0.5 rounded border border-gray-300 truncate max-w-[80px]" title={customer.company_name}>
                                      {customer.company_name}
                                    </span>
                                  )}
                                </div>
                              ))}
                              {request.customers.length > 5 && (
                                <div className="text-center text-xs text-gray-500 font-medium py-1">
                                  + {request.customers.length - 5} khách hàng khác...
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Compact Note */}
                        {request.note ? (
                          <div className="bg-blue-50 border border-blue-300 rounded p-2">
                            <div className="flex items-start gap-1.5">
                              <AlertCircle className="w-3.5 h-3.5 text-blue-600 mt-0.5 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-blue-900 mb-1">Lý do:</p>
                                <p className="text-xs text-blue-800 line-clamp-2" title={request.note}>
                                  {request.note}
                                </p>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="bg-yellow-50 border border-yellow-300 rounded p-1.5">
                            <div className="flex items-center gap-1.5">
                              <AlertCircle className="w-3.5 h-3.5 text-yellow-600 flex-shrink-0" />
                              <p className="text-xs font-medium text-yellow-800">Không có lý do</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Logs Tab Content */}
          {activeTab === 'logs' && (
            <>
              {/* Bộ lọc */}
              <div className="bg-white rounded-lg shadow border border-gray-200 p-4 mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <Filter className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700">Bộ lọc</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      ID Yêu cầu chuyển giao
                    </label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        value={searchRequestId}
                        onChange={(e) => setSearchRequestId(e.target.value)}
                        placeholder="Nhập ID yêu cầu..."
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      ID Người phê duyệt
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        value={searchApproverId}
                        onChange={(e) => setSearchApproverId(e.target.value)}
                        placeholder="Nhập ID người phê duyệt..."
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                      />
                    </div>
                  </div>
                </div>
                {(searchRequestId || searchApproverId) && (
                  <div className="mt-3 flex justify-end">
                    <button
                      onClick={handleClearFilters}
                      className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                    >
                      Xóa bộ lọc
                    </button>
                  </div>
                )}
              </div>

              {/* Bảng lịch sử */}
              {loadingLogs ? (
                <div className="bg-white rounded-lg shadow p-8 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
                </div>
              ) : logs.length === 0 ? (
                <div className="bg-white rounded-lg shadow p-8 text-center">
                  <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Không có lịch sử phê duyệt
                  </h3>
                  <p className="text-sm text-gray-600">
                    {searchRequestId || searchApproverId
                      ? 'Không tìm thấy kết quả với bộ lọc hiện tại'
                      : 'Chưa có hành động phê duyệt nào được ghi nhận'}
                  </p>
                </div>
              ) : (
                <>
                  <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Thời gian chuyển giao
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Thời gian tạo yêu cầu
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Hành động
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Người phê duyệt
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Người gửi → Người nhận
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Số lượng KH
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Nội dung
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              ID Yêu cầu
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {logs.map((log) => (
                            <tr key={log.log_id} className="hover:bg-gray-50 transition">
                              <td className="px-4 py-3 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <Calendar className="w-4 h-4 text-gray-400" />
                                  <span className="text-xs text-gray-900">{formatDate(log.created_at)}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <Clock className="w-4 h-4 text-blue-400" />
                                  <span className="text-xs text-gray-900">
                                    {log.request_created_at ? formatDate(log.request_created_at) : 'N/A'}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                {log.action === 'approve' ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                    <CheckCircle className="w-3 h-3" />
                                    Phê duyệt
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                    <XCircle className="w-3 h-3" />
                                    Từ chối
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="flex-shrink-0 h-6 w-6 bg-primary-100 rounded-full flex items-center justify-center">
                                    <span className="text-primary-600 font-semibold text-[10px]">
                                      {log.approver_name.charAt(0).toUpperCase()}
                                    </span>
                                  </div>
                                  <div>
                                    <div className="text-xs font-medium text-gray-900">{log.approver_name}</div>
                                    <div className="text-[10px] text-gray-500">@{log.approver_username}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="text-xs">
                                  <div className="flex items-center gap-1 text-gray-900">
                                    <User className="w-3 h-3 text-gray-400" />
                                    <span className="font-medium">{log.sender_name}</span>
                                  </div>
                                  <div className="text-gray-400 mx-3">→</div>
                                  <div className="flex items-center gap-1 text-gray-900">
                                    <Users className="w-3 h-3 text-gray-400" />
                                    <span className="font-medium">{log.receiver_name}</span>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <span className="text-xs font-medium text-gray-900">{log.customer_count}</span>
                              </td>
                              <td className="px-4 py-3">
                                <div className="text-xs text-gray-700 max-w-xs truncate" title={log.approval_note || ''}>
                                  {log.approval_note || <span className="text-gray-400 italic">Không có</span>}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <span className="text-xs font-mono text-gray-600">
                                  {log.transfer_request_id.slice(0, 8)}...
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="mt-4 flex items-center justify-between bg-white rounded-lg shadow border border-gray-200 px-4 py-3">
                      <div className="text-sm text-gray-700">
                        Hiển thị <span className="font-medium">{(currentPage - 1) * pageSize + 1}</span> đến{' '}
                        <span className="font-medium">
                          {Math.min(currentPage * pageSize, total)}
                        </span>{' '}
                        trong tổng số <span className="font-medium">{total}</span> bản ghi
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                          disabled={currentPage === 1}
                          className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-sm text-gray-700">
                          Trang <span className="font-medium">{currentPage}</span> /{' '}
                          <span className="font-medium">{totalPages}</span>
                        </span>
                        <button
                          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                          disabled={currentPage === totalPages}
                          className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* Modal nhập nội dung phê duyệt/từ chối */}
          {showApprovalModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                <div className="flex items-center justify-between p-6 border-b border-gray-200">
                  <div className="flex items-center gap-3">
                    {currentAction === 'approve' ? (
                      <CheckCircle className="w-6 h-6 text-green-600" />
                    ) : (
                      <XCircle className="w-6 h-6 text-red-600" />
                    )}
                    <h2 className="text-xl font-semibold text-gray-900">
                      {currentAction === 'approve' ? 'Phê duyệt yêu cầu' : 'Từ chối yêu cầu'}
                    </h2>
                  </div>
                  <button
                    onClick={() => {
                      setShowApprovalModal(false)
                      setApprovalNote('')
                      setCurrentRequestId(null)
                      setCurrentAction(null)
                    }}
                    className="p-2 hover:bg-gray-100 rounded-lg transition"
                    disabled={!!processingId}
                  >
                    <X className="w-5 h-5 text-gray-500" />
                  </button>
                </div>

                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Nội dung {currentAction === 'approve' ? 'phê duyệt' : 'từ chối'} <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={approvalNote}
                      onChange={(e) => setApprovalNote(e.target.value)}
                      placeholder={`Nhập nội dung ${currentAction === 'approve' ? 'phê duyệt' : 'từ chối'}...`}
                      rows={4}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                      disabled={!!processingId}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Vui lòng nhập lý do {currentAction === 'approve' ? 'phê duyệt' : 'từ chối'} yêu cầu này
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
                  <button
                    onClick={() => {
                      setShowApprovalModal(false)
                      setApprovalNote('')
                      setCurrentRequestId(null)
                      setCurrentAction(null)
                    }}
                    disabled={!!processingId}
                    className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition font-medium disabled:opacity-50"
                  >
                    Hủy
                  </button>
                  <button
                    onClick={handleSubmitApproval}
                    disabled={!!processingId || !approvalNote.trim()}
                    className={`px-6 py-2 text-white rounded-lg transition font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${
                      currentAction === 'approve'
                        ? 'bg-green-600 hover:bg-green-700'
                        : 'bg-red-600 hover:bg-red-700'
                    }`}
                  >
                    {processingId ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Đang xử lý...</span>
                      </>
                    ) : (
                      <>
                        {currentAction === 'approve' ? (
                          <>
                            <CheckCircle className="w-4 h-4" />
                            <span>Phê duyệt</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-4 h-4" />
                            <span>Từ chối</span>
                          </>
                        )}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {AlertComponent}
        </div>
      </div>
    </ProtectedRoute>
  )
}
