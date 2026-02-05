'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api'
import { X, Users, Briefcase, CheckSquare, AlertCircle, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAlert } from './AlertModal'

interface Employee {
  employee_id: string
  full_name: string
  username: string
  email: string
  role: string
  is_active: boolean
}

interface TransferStats {
  employee: {
    employee_id: string
    full_name: string
  }
  customers_count: number
  deals_count: number
  tasks_count: number
}

interface TransferCustomersModalProps {
  fromEmployee: Employee
  onClose: () => void
  onSuccess: () => void
}

export function TransferCustomersModal({
  fromEmployee,
  onClose,
  onSuccess
}: TransferCustomersModalProps) {
  const { showConfirm, AlertComponent } = useAlert()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('')
  const [loadingEmployees, setLoadingEmployees] = useState(true)
  const [loadingStats, setLoadingStats] = useState(false)
  const [transferring, setTransferring] = useState(false)
  const [stats, setStats] = useState<TransferStats | null>(null)

  // Load danh sách nhân viên (loại trừ nhân viên nguồn)
  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        setLoadingEmployees(true)
        const response = await apiClient.get('/api/employees')
        if (response.data.success) {
          // Lọc bỏ nhân viên nguồn và chỉ lấy nhân viên đang hoạt động
          const filtered = response.data.data.filter(
            (emp: Employee) =>
              emp.employee_id !== fromEmployee.employee_id && emp.is_active
          )
          setEmployees(filtered)
        }
      } catch (error: any) {
        toast.error('Không thể tải danh sách nhân viên')
        console.error('Error fetching employees:', error)
      } finally {
        setLoadingEmployees(false)
      }
    }

    fetchEmployees()
  }, [fromEmployee.employee_id])

  // Load thống kê khi chọn nhân viên
  useEffect(() => {
    if (selectedEmployeeId) {
      loadStats()
    } else {
      setStats(null)
    }
  }, [selectedEmployeeId])

  const loadStats = async () => {
    try {
      setLoadingStats(true)
      const response = await apiClient.get('/api/employees/transfer-stats', {
        params: { from_employee_id: fromEmployee.employee_id }
      })
      if (response.data.success) {
        setStats(response.data.data)
      }
    } catch (error: any) {
      toast.error('Không thể tải thống kê')
      console.error('Error loading stats:', error)
    } finally {
      setLoadingStats(false)
    }
  }

  const handleTransfer = async () => {
    if (!selectedEmployeeId) {
      toast.error('Vui lòng chọn nhân viên tiếp nhận')
      return
    }

    const confirmed = await showConfirm({
      title: 'Xác nhận chuyển giao',
      message: 'Bạn có chắc chắn muốn chuyển giao khách hàng? Hành động này không thể hoàn tác.',
      confirmText: 'Xác nhận',
      cancelText: 'Hủy'
    })

    if (!confirmed) {
      return
    }

    try {
      setTransferring(true)
      const response = await apiClient.post('/api/employees/transfer-customers', {
        from_employee_id: fromEmployee.employee_id,
        to_employee_id: selectedEmployeeId
      })

      if (response.data.success) {
        toast.success('Chuyển giao khách hàng thành công!')
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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Chuyển giao khách hàng</h2>
            <p className="text-sm text-gray-600 mt-1">
              Từ: <span className="font-semibold">{fromEmployee.full_name}</span>
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
          {/* Chọn nhân viên tiếp nhận */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nhân viên tiếp nhận <span className="text-red-500">*</span>
            </label>
            {loadingEmployees ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-primary-600" />
              </div>
            ) : (
              <select
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                disabled={transferring}
              >
                <option value="">-- Chọn nhân viên --</option>
                {employees.map((emp) => (
                  <option key={emp.employee_id} value={emp.employee_id}>
                    {emp.full_name} (@{emp.username}) - {emp.role}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Thống kê */}
          {selectedEmployeeId && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-3 mb-4">
                <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-blue-900 mb-1">Thông tin chuyển giao</h3>
                  <p className="text-sm text-blue-700">
                    Số liệu sẽ được chuyển từ <strong>{fromEmployee.full_name}</strong> sang{' '}
                    <strong>{selectedEmployee?.full_name}</strong>
                  </p>
                </div>
              </div>

              {loadingStats ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-primary-600" />
                </div>
              ) : stats ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-white rounded-lg p-4 border border-blue-200">
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="w-5 h-5 text-primary-600" />
                      <span className="text-sm font-medium text-gray-700">Khách hàng</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{stats.customers_count}</p>
                  </div>

                  <div className="bg-white rounded-lg p-4 border border-blue-200">
                    <div className="flex items-center gap-2 mb-2">
                      <Briefcase className="w-5 h-5 text-primary-600" />
                      <span className="text-sm font-medium text-gray-700">Deal đang mở</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{stats.deals_count}</p>
                  </div>

                  <div className="bg-white rounded-lg p-4 border border-blue-200">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckSquare className="w-5 h-5 text-primary-600" />
                      <span className="text-sm font-medium text-gray-700">Task chưa hoàn thành</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{stats.tasks_count}</p>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-600 text-center py-4">
                  Không có dữ liệu để hiển thị
                </div>
              )}
            </div>
          )}

          {/* Cảnh báo */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-800">
                <p className="font-semibold mb-1">Lưu ý quan trọng:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Tất cả khách hàng, deals đang mở và tasks chưa hoàn thành sẽ được chuyển giao</li>
                  <li>Hệ thống sẽ tự động ghi nhật ký audit cho mỗi khách hàng</li>
                  <li>Nhân viên tiếp nhận sẽ nhận được thông báo về việc bàn giao</li>
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
            disabled={!selectedEmployeeId || transferring || loadingStats}
            className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {transferring ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Đang chuyển giao...</span>
              </>
            ) : (
              'Xác nhận chuyển giao'
            )}
          </button>
        </div>
      </div>
      {AlertComponent}
    </div>
  )
}
