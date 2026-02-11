'use client'

import { useState, useEffect } from 'react'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { Navbar } from '@/components/Navbar'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api'
import { CheckCircle, XCircle, Clock, Users, Loader2, AlertCircle, User, X } from 'lucide-react'
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

export default function TransferApprovalsPage() {
  const { user } = useAuth()
  const router = useRouter()
  const { showConfirm, AlertComponent } = useAlert()
  const [requests, setRequests] = useState<TransferRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [showApprovalModal, setShowApprovalModal] = useState(false)
  const [currentRequestId, setCurrentRequestId] = useState<string | null>(null)
  const [currentAction, setCurrentAction] = useState<'approve' | 'reject' | null>(null)
  const [approvalNote, setApprovalNote] = useState('')

  // Chỉ Manager và Admin mới được truy cập
  useEffect(() => {
    if (user && user.role !== 'manager' && user.role !== 'admin') {
      router.push('/dashboard')
    }
  }, [user, router])

  useEffect(() => {
    if (user && (user.role === 'manager' || user.role === 'admin')) {
      fetchPendingRequests()
    }
  }, [user])

  const fetchPendingRequests = async () => {
    try {
      setLoading(true)
      const response = await apiClient.get('/api/transfer/pending')
      if (response.data.success) {
        setRequests(response.data.data || [])
      }
    } catch (error: any) {
      toast.error('Không thể tải danh sách yêu cầu chuyển giao')
      console.error('Error fetching pending requests:', error)
    } finally {
      setLoading(false)
    }
  }

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
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || `Không thể ${currentAction === 'approve' ? 'phê duyệt' : 'từ chối'} yêu cầu`
      toast.error(errorMessage)
      console.error(`Error ${currentAction}ing request:`, error)
    } finally {
      setProcessingId(null)
    }
  }

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
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
                Phê duyệt chuyển giao
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-gray-600 mt-1">
              Xem xét và phê duyệt các yêu cầu chuyển giao khách hàng từ nhân viên
            </p>
          </div>

          {loading ? (
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
            <div className="space-y-4">
              {requests.map((request) => (
                <div
                  key={request.transfer_request_id}
                  className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden"
                >
                  <div className="p-4 sm:p-6">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-yellow-100 rounded-lg">
                          <Clock className="w-5 h-5 text-yellow-600" />
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-gray-900 mb-1">
                            Yêu cầu chuyển giao #{request.transfer_request_id.slice(0, 8)}
                          </h3>
                          <p className="text-xs text-gray-500">
                            Gửi lúc: {formatDate(request.created_at)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleRejectClick(request.transfer_request_id)}
                          disabled={processingId === request.transfer_request_id}
                          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {processingId === request.transfer_request_id ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Đang xử lý...</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="w-4 h-4" />
                              <span>Từ chối</span>
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => handleApproveClick(request.transfer_request_id)}
                          disabled={processingId === request.transfer_request_id}
                          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {processingId === request.transfer_request_id ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Đang xử lý...</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle className="w-4 h-4" />
                              <span>Phê duyệt</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Thông tin người gửi và người nhận */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                      <div className="bg-gray-50 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <User className="w-4 h-4 text-gray-500" />
                          <span className="text-xs font-medium text-gray-700">Người gửi</span>
                        </div>
                        <p className="text-sm font-semibold text-gray-900">{request.sender_name}</p>
                        <p className="text-xs text-gray-500">@{request.sender_username}</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Users className="w-4 h-4 text-gray-500" />
                          <span className="text-xs font-medium text-gray-700">Người nhận</span>
                        </div>
                        <p className="text-sm font-semibold text-gray-900">{request.receiver_name}</p>
                        <p className="text-xs text-gray-500">@{request.receiver_username}</p>
                      </div>
                    </div>

                    {/* Danh sách khách hàng */}
                    <div className="mb-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Users className="w-4 h-4 text-gray-500" />
                        <span className="text-xs font-medium text-gray-700">
                          Khách hàng cần chuyển giao ({request.customers.length})
                        </span>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 max-h-40 overflow-y-auto">
                        <div className="space-y-2">
                          {request.customers.map((customer) => (
                            <div
                              key={customer.customer_id}
                              className="flex items-center justify-between bg-white p-2 rounded border border-gray-200"
                            >
                              <div>
                                <p className="text-sm font-medium text-gray-900">
                                  {customer.full_name}
                                </p>
                                <p className="text-xs text-gray-500">{customer.phone}</p>
                              </div>
                              {customer.company_name && (
                                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                                  {customer.company_name}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Lý do chuyển giao */}
                    {request.note && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-xs font-medium text-blue-900 mb-1">Lý do chuyển giao:</p>
                            <p className="text-sm text-blue-800">{request.note}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

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
    </ProtectedRoute>
  )
}
