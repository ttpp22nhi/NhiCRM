'use client'

import { useState, useEffect, useRef } from 'react'
import { apiClient } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { AlertCircle, Search, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { inferKpiCustomerKind, type KpiCustomerKind } from '@/lib/kpiCustomerKind'

interface Employee {
  employee_id: string
  full_name: string
  username: string
  email?: string
  role: string
}

interface Customer {
  customer_id: string
  full_name: string
  email: string
  phone: string
  address: string
  customer_type: string
  kpi_customer_kind?: string | null
  company_name: string
  tax_code: string
  source: string
  assigned_to?: string
}

interface EditCustomerFormProps {
  customer: Customer
  onSuccess: () => void
  onCancel: () => void
}

export function EditCustomerForm({ customer, onSuccess, onCancel }: EditCustomerFormProps) {
  const { user } = useAuth()
  const [formData, setFormData] = useState({
    full_name: customer.full_name || '',
    email: customer.email || '',
    phone: customer.phone || '',
    address: customer.address || '',
    customer_type: customer.customer_type || 'individual',
    kpi_customer_kind: inferKpiCustomerKind(customer) as KpiCustomerKind,
    company_name: customer.company_name || '',
    tax_code: customer.tax_code || '',
    source: customer.source || 'Direct',
    assigned_to: customer.assigned_to || '', // Chỉ dùng cho admin/manager
  })
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loadingEmployees, setLoadingEmployees] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false)
  const employeeDropdownRef = useRef<HTMLDivElement>(null)

  // Load danh sách nhân viên được phép gán theo phân cấp
  useEffect(() => {
    if (user && user.role !== 'sales') fetchEmployees()
  }, [user])

  // Đóng dropdown khi click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (employeeDropdownRef.current && !employeeDropdownRef.current.contains(event.target as Node)) {
        setShowEmployeeDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const fetchEmployees = async () => {
    try {
      setLoadingEmployees(true)
      const response = await apiClient.get('/api/employees/assignable')
      if (response.data.success) {
        setEmployees(response.data.data || [])
      }
    } catch (err) {
      console.error('Lỗi khi tải danh sách nhân viên:', err)
    } finally {
      setLoadingEmployees(false)
    }
  }

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  // Filter employees theo search query
  const filteredEmployees = employees.filter(emp => {
    const searchLower = searchQuery.toLowerCase()
    return (
      emp.full_name.toLowerCase().includes(searchLower) ||
      emp.username.toLowerCase().includes(searchLower) ||
      emp.email?.toLowerCase().includes(searchLower)
    )
  })

  // Lấy thông tin nhân viên được chọn
  const selectedEmployee = employees.find(emp => emp.employee_id === formData.assigned_to)

  const handleSelectEmployee = (employeeId: string) => {
    setFormData(prev => ({ ...prev, assigned_to: employeeId }))
    setShowEmployeeDropdown(false)
    setSearchQuery('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await apiClient.put(`/api/customers/${customer.customer_id}`, formData)
      if (response.data.success) {
        toast.success('Cập nhật khách hàng thành công!')
        onSuccess()
      } else {
        const errorMsg = response.data.message || 'Cập nhật khách hàng thất bại'
        setError(errorMsg)
        toast.error(errorMsg)
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || 'Lỗi khi cập nhật khách hàng'
      setError(errorMsg)
      toast.error(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  // Kiểm tra có cần hiển thị trường công ty/tổ chức không
  const showCompanyFields = formData.customer_type !== 'individual'

  // Lấy label cho company name dựa trên customer_type
  const getCompanyNameLabel = () => {
    const typeLabels: { [key: string]: string } = {
      'so_ban_nganh': 'Tên đơn vị/tổ chức',
      'cong_an_tinh': 'Tên đơn vị/tổ chức',
      'cong_an_xa': 'Tên đơn vị/tổ chức',
      'xa_phuong': 'Tên đơn vị/tổ chức',
      'doanh_nghiep_lon': 'Tên công ty/tổ chức',
      'ho_kinh_doanh': 'Tên công ty/tổ chức',
      'hop_tac_xa': 'Tên công ty/tổ chức',
      'company': 'Tên công ty/tổ chức'
    }
    return typeLabels[formData.customer_type] || 'Tên công ty/tổ chức'
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      <div>
        <label htmlFor="full_name" className="block text-sm font-medium text-gray-700 mb-2">
          Họ và tên <span className="text-red-500">*</span>
        </label>
        <input
          id="full_name"
          name="full_name"
          type="text"
          value={formData.full_name}
          onChange={handleChange}
          required
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
          placeholder="Nhập họ và tên"
        />
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          value={formData.email}
          onChange={handleChange}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
          placeholder="Nhập email"
        />
      </div>

      <div>
        <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
          Số điện thoại <span className="text-red-500">*</span>
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          value={formData.phone}
          onChange={handleChange}
          required
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
          placeholder="Nhập số điện thoại"
        />
      </div>

      <div>
        <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-2">
          Địa chỉ
        </label>
        <textarea
          id="address"
          name="address"
          value={formData.address}
          onChange={handleChange}
          rows={3}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
          placeholder="Nhập địa chỉ"
        />
      </div>

      <div>
        <label htmlFor="customer_type" className="block text-sm font-medium text-gray-700 mb-2">
          Loại khách hàng
        </label>
        <select
          id="customer_type"
          name="customer_type"
          value={formData.customer_type}
          onChange={handleChange}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
        >
          <option value="individual">Cá nhân</option>
          <option value="so_ban_nganh">Sở ban ngành</option>
          <option value="cong_an_tinh">Công an Tỉnh</option>
          <option value="cong_an_xa">Công an xã</option>
          <option value="xa_phuong">Xã phường</option>
          <option value="doanh_nghiep_lon">Doanh nghiệp lớn</option>
          <option value="ho_kinh_doanh">Hộ kinh doanh</option>
          <option value="hop_tac_xa">Hợp tác xã</option>
          <option value="company">Doanh nghiệp</option>
        </select>
      </div>

      <div>
        <label htmlFor="kpi_customer_kind" className="block text-sm font-medium text-gray-700 mb-2">
          Phân loại KPI (doanh thu mới / hiện hữu)
        </label>
        <select
          id="kpi_customer_kind"
          name="kpi_customer_kind"
          value={formData.kpi_customer_kind}
          onChange={handleChange}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
        >
          <option value="NEW">Khách mới</option>
          <option value="EXISTING">Khách hiện hữu</option>
        </select>
        <p className="text-xs text-gray-500 mt-1">Khác với &quot;Loại khách hàng&quot; phía trên. Tự chuyển hiện hữu từ tháng kế sau tháng có deal thắng hoặc đơn CBS đã duyệt (theo kỳ đóng / duyệt), không đổi ngay trong tháng chốt.</p>
      </div>

      {showCompanyFields && (
        <>
          <div>
            <label htmlFor="company_name" className="block text-sm font-medium text-gray-700 mb-2">
              {getCompanyNameLabel()}
            </label>
            <input
              id="company_name"
              name="company_name"
              type="text"
              value={formData.company_name}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
              placeholder={`Nhập ${getCompanyNameLabel().toLowerCase()}`}
            />
          </div>

          <div>
            <label htmlFor="tax_code" className="block text-sm font-medium text-gray-700 mb-2">
              Mã số thuế
            </label>
            <input
              id="tax_code"
              name="tax_code"
              type="text"
              value={formData.tax_code}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
              placeholder="Nhập mã số thuế"
            />
          </div>
        </>
      )}

      <div>
        <label htmlFor="source" className="block text-sm font-medium text-gray-700 mb-2">
          Nguồn
        </label>
        <select
          id="source"
          name="source"
          value={formData.source}
          onChange={handleChange}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
        >
          <option value="Direct">Trực tiếp</option>
          <option value="Website">Website</option>
          <option value="Referral">Giới thiệu</option>
          <option value="Social Media">Mạng xã hội</option>
          <option value="Other">Khác</option>
        </select>
      </div>

      {/* Dropdown Assigned To: director/manager/leader (sales không đổi được) */}
      {user && user.role !== 'sales' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Nhân viên chăm sóc
          </label>
          <div className="relative" ref={employeeDropdownRef}>
            <button
              type="button"
              onClick={() => setShowEmployeeDropdown(!showEmployeeDropdown)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition bg-white text-left flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-gray-400" />
                <span className="text-gray-700">
                  {selectedEmployee
                    ? `${selectedEmployee.full_name} (@${selectedEmployee.username})`
                    : 'Chọn nhân viên chăm sóc'}
                </span>
              </div>
              <X
                className={`w-4 h-4 text-gray-400 transition ${showEmployeeDropdown ? 'rotate-90' : ''}`}
              />
            </button>

            {showEmployeeDropdown && (
              <div className="absolute z-50 mt-2 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                <div className="p-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Tìm kiếm nhân viên..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none mb-2"
                    onClick={(e) => e.stopPropagation()}
                  />
                  {filteredEmployees.length > 0 ? (
                    filteredEmployees.map((emp) => (
                      <button
                        key={emp.employee_id}
                        type="button"
                        onClick={() => handleSelectEmployee(emp.employee_id)}
                        className={`w-full text-left px-3 py-2 hover:bg-gray-50 rounded transition ${
                          formData.assigned_to === emp.employee_id ? 'bg-primary-50 text-primary-700' : ''
                        }`}
                      >
                        <div className="font-medium">{emp.full_name}</div>
                        <div className="text-sm text-gray-500">@{emp.username}</div>
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-sm text-gray-500">Không tìm thấy nhân viên</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-3 pt-4 border-t">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition font-medium"
        >
          Hủy
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Đang cập nhật...' : 'Cập nhật'}
        </button>
      </div>
    </form>
  )
}

