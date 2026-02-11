'use client'

import { useState, useEffect, useRef } from 'react'
import { apiClient } from '@/lib/api'
import { X, Users, Search, Loader2, AlertCircle, Send } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAlert } from './AlertModal'

interface Customer {
  customer_id: string
  full_name: string
  phone: string
  assigned_employee_name?: string
}

interface Employee {
  employee_id: string
  full_name: string
  username: string
  email: string
  role: string
  is_active: boolean
}

interface TransferRequestModalProps {
  selectedCustomers: Customer[]
  onClose: () => void
  onSuccess: () => void
}

export function TransferRequestModal({
  selectedCustomers,
  onClose,
  onSuccess
}: TransferRequestModalProps) {
  const { showConfirm, AlertComponent } = useAlert()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loadingEmployees, setLoadingEmployees] = useState(true)
  const [sending, setSending] = useState(false)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('')
  const [note, setNote] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Load danh sách nhân viên Sales (chỉ Sales)
  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        setLoadingEmployees(true)
        // Sử dụng API riêng cho Sales để lấy danh sách Sales khác
        const response = await apiClient.get('/api/employees/sales')
        console.log('Fetch employees response:', response.data)
        if (response.data.success) {
          setEmployees(response.data.data || [])
        } else {
          toast.error(response.data.message || 'Không thể tải danh sách nhân viên')
        }
      } catch (error: any) {
        console.error('Error fetching employees:', error)
        const errorMessage = error.response?.data?.message || 'Không thể tải danh sách nhân viên'
        toast.error(errorMessage)
        console.error('Error details:', {
          status: error.response?.status,
          data: error.response?.data,
          message: error.message
        })
      } finally {
        setLoadingEmployees(false)
      }
    }

    fetchEmployees()
  }, [])

  // Đóng dropdown khi click bên ngoài
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowEmployeeDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // Lọc nhân viên theo search query
  const filteredEmployees = employees.filter(emp =>
    emp.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.email.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const selectedEmployee = employees.find(emp => emp.employee_id === selectedEmployeeId)

  const handleSendRequest = async () => {
    if (!selectedEmployeeId) {
      toast.error('Vui lòng chọn nhân viên tiếp nhận')
      return
    }

    const confirmed = await showConfirm({
      title: 'Xác nhận gửi yêu cầu',
      message: `Bạn có chắc chắn muốn gửi yêu cầu chuyển giao ${selectedCustomers.length} khách hàng cho ${selectedEmployee?.full_name}? Yêu cầu sẽ cần được quản lý phê duyệt.`,
      confirmText: 'Gửi yêu cầu',
      cancelText: 'Hủy'
    })

    if (!confirmed) {
      return
    }

    try {
      setSending(true)
      const response = await apiClient.post('/api/transfer/request', {
        customer_ids: selectedCustomers.map(c => c.customer_id),
        receiver_id: selectedEmployeeId,
        note: note.trim() || undefined
      })

      if (response.data.success) {
        toast.success(response.data.message || 'Đã gửi yêu cầu chuyển giao thành công!')
        onSuccess()
        onClose()
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'Không thể gửi yêu cầu chuyển giao'
      toast.error(errorMessage)
      console.error('Error sending transfer request:', error)
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary-100 rounded-lg">
                <Send className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Gửi yêu cầu chuyển giao</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Yêu cầu sẽ cần được quản lý phê duyệt trước khi chuyển giao
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition"
              disabled={sending}
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Danh sách khách hàng được chọn */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Khách hàng được chọn ({selectedCustomers.length})
              </label>
              <div className="bg-gray-50 rounded-lg p-4 max-h-40 overflow-y-auto">
                <div className="space-y-2">
                  {selectedCustomers.map((customer) => (
                    <div
                      key={customer.customer_id}
                      className="flex items-center justify-between bg-white p-2 rounded border border-gray-200"
                    >
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-gray-400" />
                        <span className="text-sm font-medium text-gray-900">
                          {customer.full_name}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500">{customer.phone}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Chọn nhân viên tiếp nhận */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nhân viên tiếp nhận <span className="text-red-500">*</span>
              </label>
              <div className="relative" ref={dropdownRef}>
                <div
                  onClick={() => setShowEmployeeDropdown(!showEmployeeDropdown)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg cursor-pointer bg-white hover:border-primary-500 transition flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    {selectedEmployee ? (
                      <>
                        <Users className="w-4 h-4 text-primary-600" />
                        <span className="text-gray-900">{selectedEmployee.full_name}</span>
                        <span className="text-sm text-gray-500">({selectedEmployee.username})</span>
                      </>
                    ) : (
                      <span className="text-gray-500">Chọn nhân viên tiếp nhận...</span>
                    )}
                  </div>
                  <Search className="w-4 h-4 text-gray-400" />
                </div>

                {showEmployeeDropdown && (
                  <div className="absolute z-10 w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-hidden">
                    <div className="p-2 border-b border-gray-200">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Tìm kiếm nhân viên..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                    </div>
                    <div className="overflow-y-auto max-h-48">
                      {loadingEmployees ? (
                        <div className="p-4 text-center text-gray-500">
                          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                          <p className="text-sm">Đang tải...</p>
                        </div>
                      ) : filteredEmployees.length === 0 ? (
                        <div className="p-4 text-center text-gray-500">
                          <AlertCircle className="w-5 h-5 mx-auto mb-2" />
                          <p className="text-sm">Không tìm thấy nhân viên</p>
                        </div>
                      ) : (
                        filteredEmployees.map((employee) => (
                          <div
                            key={employee.employee_id}
                            onClick={() => {
                              setSelectedEmployeeId(employee.employee_id)
                              setShowEmployeeDropdown(false)
                              setSearchQuery('')
                            }}
                            className="p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium text-gray-900">{employee.full_name}</p>
                                <p className="text-sm text-gray-500">{employee.username}</p>
                              </div>
                              {selectedEmployeeId === employee.employee_id && (
                                <div className="w-2 h-2 bg-primary-600 rounded-full"></div>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Lý do chuyển giao */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Lý do chuyển giao (tùy chọn)
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Nhập lý do chuyển giao khách hàng..."
                rows={4}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
              />
            </div>

            {/* Thông báo */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-1">Lưu ý:</p>
                  <ul className="list-disc list-inside space-y-1 text-blue-700">
                    <li>Yêu cầu chuyển giao sẽ được gửi đến quản lý để phê duyệt</li>
                    <li>Khách hàng sẽ được đánh dấu "Đang chờ chuyển" cho đến khi được phê duyệt</li>
                    <li>Bạn sẽ nhận thông báo khi yêu cầu được phê duyệt hoặc từ chối</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
            <button
              onClick={onClose}
              disabled={sending}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition font-medium disabled:opacity-50"
            >
              Hủy
            </button>
            <button
              onClick={handleSendRequest}
              disabled={sending || !selectedEmployeeId}
              className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {sending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Đang gửi...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Gửi yêu cầu</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
      {AlertComponent}
    </>
  )
}
