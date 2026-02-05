'use client'

import { useState, useEffect, useRef } from 'react'
import { apiClient } from '@/lib/api'
import { X, Users, Search, Loader2, AlertCircle } from 'lucide-react'
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

interface BulkTransferModalProps {
  selectedCustomers: Customer[]
  onClose: () => void
  onSuccess: () => void
}

export function BulkTransferModal({
  selectedCustomers,
  onClose,
  onSuccess
}: BulkTransferModalProps) {
  const { showConfirm, AlertComponent } = useAlert()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loadingEmployees, setLoadingEmployees] = useState(true)
  const [transferring, setTransferring] = useState(false)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('')
  const [transferReason, setTransferReason] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false)
  const [includeCompletedTasks, setIncludeCompletedTasks] = useState<boolean>(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Load danh sách nhân viên
  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        setLoadingEmployees(true)
        const response = await apiClient.get('/api/employees')
        if (response.data.success) {
          // Chỉ lấy nhân viên đang hoạt động
          const activeEmployees = response.data.data.filter(
            (emp: Employee) => emp.is_active
          )
          setEmployees(activeEmployees)
        }
      } catch (error: any) {
        toast.error('Không thể tải danh sách nhân viên')
        console.error('Error fetching employees:', error)
      } finally {
        setLoadingEmployees(false)
      }
    }

    fetchEmployees()
  }, [])

  // Lọc nhân viên theo search query
  const filteredEmployees = employees.filter(emp =>
    emp.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.email.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleTransfer = async () => {
    if (!selectedEmployeeId) {
      toast.error('Vui lòng chọn nhân viên tiếp nhận')
      return
    }

    const confirmed = await showConfirm({
      title: 'Xác nhận chuyển giao',
      message: `Bạn có chắc chắn muốn chuyển giao ${selectedCustomers.length} khách hàng?`,
      confirmText: 'Xác nhận',
      cancelText: 'Hủy'
    })

    if (!confirmed) {
      return
    }

    try {
      setTransferring(true)
      const response = await apiClient.patch('/api/customers/bulk-transfer', {
        customer_ids: selectedCustomers.map(c => c.customer_id),
        new_assigned_to_id: selectedEmployeeId,
        transfer_reason: transferReason.trim() || undefined,
        include_completed_tasks: includeCompletedTasks
      })

      if (response.data.success) {
        toast.success(response.data.message || 'Chuyển giao thành công!')
        onSuccess()
        onClose()
      } else {
        toast.error(response.data.message || 'Chuyển giao thất bại')
      }
    } catch (error: any) {
      const errorMsg = error.response?.data?.message || 'Lỗi khi chuyển giao khách hàng'
      toast.error(errorMsg)
      console.error('Error transferring customers:', error)
    } finally {
      setTransferring(false)
    }
  }

  const selectedEmployee = employees.find(emp => emp.employee_id === selectedEmployeeId)

  // Đóng dropdown khi click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowEmployeeDropdown(false)
      }
    }

    if (showEmployeeDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showEmployeeDropdown])

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Chuyển giao khách hàng hàng loạt</h2>
            <p className="text-sm text-gray-600 mt-1">
              Đã chọn: <span className="font-semibold">{selectedCustomers.length} khách hàng</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition"
            disabled={transferring}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Danh sách khách hàng đã chọn */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Danh sách khách hàng sẽ được chuyển giao:
            </label>
            <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-3 bg-gray-50">
              <div className="space-y-2">
                {selectedCustomers.map((customer) => (
                  <div
                    key={customer.customer_id}
                    className="flex items-center justify-between p-2 bg-white rounded border border-gray-200"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {customer.full_name}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {customer.phone}
                        {customer.assigned_employee_name && (
                          <span className="ml-2">
                            • Hiện tại: {customer.assigned_employee_name}
                          </span>
                        )}
                      </p>
                    </div>
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
              {loadingEmployees ? (
                <div className="flex items-center justify-center py-4 border border-gray-300 rounded-lg">
                  <Loader2 className="w-5 h-5 animate-spin text-primary-600" />
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value)
                        setShowEmployeeDropdown(true)
                      }}
                      onFocus={() => setShowEmployeeDropdown(true)}
                      placeholder="Tìm kiếm nhân viên..."
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition"
                    />
                    {selectedEmployee && (
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                          Đã chọn: {selectedEmployee.full_name}
                        </span>
                      </div>
                    )}
                  </div>

                  {showEmployeeDropdown && (
                    <div className="absolute z-50 mt-2 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {filteredEmployees.length === 0 ? (
                        <div className="p-4 text-center text-sm text-gray-500">
                          Không tìm thấy nhân viên
                        </div>
                      ) : (
                        <div className="py-1">
                          {filteredEmployees.map((emp) => (
                            <button
                              key={emp.employee_id}
                              onClick={() => {
                                setSelectedEmployeeId(emp.employee_id)
                                setSearchQuery(emp.full_name)
                                setShowEmployeeDropdown(false)
                              }}
                              className={`w-full text-left px-4 py-2 hover:bg-gray-100 transition ${
                                selectedEmployeeId === emp.employee_id ? 'bg-primary-50' : ''
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-sm font-medium text-gray-900">
                                    {emp.full_name}
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    @{emp.username} • {emp.email}
                                  </p>
                                </div>
                                <span className={`text-xs px-2 py-1 rounded ${
                                  emp.role === 'admin'
                                    ? 'bg-purple-100 text-purple-700'
                                    : emp.role === 'manager'
                                    ? 'bg-indigo-100 text-indigo-700'
                                    : 'bg-blue-100 text-blue-700'
                                }`}>
                                  {emp.role === 'admin' ? 'Admin' : emp.role === 'manager' ? 'Mgr' : 'Sales'}
                                </span>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Lý do chuyển giao */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Lý do chuyển giao <span className="text-gray-500 text-xs">(Tùy chọn)</span>
            </label>
            <textarea
              value={transferReason}
              onChange={(e) => setTransferReason(e.target.value)}
              placeholder="Nhập lý do chuyển giao (sẽ được lưu vào lịch sử tương tác)..."
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition resize-none"
              disabled={transferring}
            />
          </div>

          {/* Checkbox chuyển cả công việc đã hoàn thành */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={includeCompletedTasks}
                onChange={(e) => setIncludeCompletedTasks(e.target.checked)}
                className="mt-1 w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500 cursor-pointer"
                disabled={transferring}
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">
                  Chuyển cả các công việc đã hoàn thành?
                </p>
                <p className="text-xs text-gray-600 mt-1">
                  Nếu tích vào, tất cả các công việc (bao gồm cả đã hoàn thành) sẽ được chuyển giao cho nhân viên mới. 
                  Mặc định chỉ chuyển các công việc chưa hoàn thành.
                </p>
              </div>
            </label>
          </div>

          {/* Cảnh báo */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-800">
                <p className="font-semibold mb-1">Lưu ý:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Tất cả deals đang mở của các khách hàng này sẽ được chuyển giao</li>
                  <li>
                    {includeCompletedTasks 
                      ? 'Tất cả tasks (bao gồm cả đã hoàn thành) sẽ được chuyển giao'
                      : 'Chỉ các tasks chưa hoàn thành sẽ được chuyển giao'}
                  </li>
                  <li>Hệ thống sẽ tự động ghi nhật ký audit cho mỗi khách hàng</li>
                  <li>Hành động này không thể hoàn tác</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition font-medium"
            disabled={transferring}
          >
            Hủy
          </button>
          <button
            onClick={handleTransfer}
            disabled={!selectedEmployeeId || transferring}
            className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {transferring ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Đang chuyển giao...</span>
              </>
            ) : (
              <>
                <Users className="w-4 h-4" />
                <span>Xác nhận chuyển giao</span>
              </>
            )}
          </button>
        </div>
      </div>
      {AlertComponent}
    </div>
  )
}
