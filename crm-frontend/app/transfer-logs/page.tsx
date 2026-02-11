'use client'

import { useState, useEffect } from 'react'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { Navbar } from '@/components/Navbar'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api'
import { FileText, CheckCircle, XCircle, User, Users, Calendar, Search, Filter, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

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
  approver_name: string
  approver_username: string
  sender_name: string
  sender_username: string
  receiver_name: string
  receiver_username: string
}

export default function TransferLogsPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [logs, setLogs] = useState<ApprovalLog[]>([])
  const [loading, setLoading] = useState(true)
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
      fetchLogs()
    }
  }, [user, currentPage, searchRequestId, searchApproverId])

  const fetchLogs = async () => {
    try {
      setLoading(true)
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
      setLoading(false)
    }
  }

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
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
              <FileText className="w-6 h-6 sm:w-8 sm:h-8 text-primary-600" />
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900">
                Lịch sử phê duyệt chuyển giao
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-gray-600 mt-1">
              Xem lịch sử tất cả các hành động phê duyệt và từ chối yêu cầu chuyển giao khách hàng
            </p>
          </div>

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
          {loading ? (
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
                          Thời gian
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
        </div>
      </div>
    </ProtectedRoute>
  )
}
