'use client'

import { useState, useEffect, useRef } from 'react'
import { apiClient } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { AlertCircle, Search, ChevronDown, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useDebounce } from '@/hooks/useDebounce'

interface Employee {
  employee_id: string
  full_name: string
  username: string
  email?: string
  role: string
}

interface CustomerFormProps {
  onSuccess: () => void
  onCancel: () => void
}

export function CustomerForm({ onSuccess, onCancel }: CustomerFormProps) {
  const { user } = useAuth()
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    address: '',
    customer_type: 'individual',
    company_name: '',
    tax_code: '',
    source: 'Direct',
    assigned_to: '', // Chỉ dùng cho admin/manager
  })
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loadingEmployees, setLoadingEmployees] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false)
  const employeeDropdownRef = useRef<HTMLDivElement>(null)
  
  // State cho duplicate check
  const [duplicateInfo, setDuplicateInfo] = useState<{
    isDuplicate: boolean
    customerName?: string
    employeeName?: string
    isOwnCustomer?: boolean
    field?: 'phone' | 'tax_code'
  } | null>(null)
  const [checkingDuplicate, setCheckingDuplicate] = useState(false)
  
  // Debounce phone và tax_code để tránh gọi API quá nhiều
  const debouncedPhone = useDebounce(formData.phone, 500)
  const debouncedTaxCode = useDebounce(formData.tax_code, 500)

  // Load danh sách nhân viên được phép gán theo phân cấp (director/manager/leader = dropdown; sales = chỉ mình)
  useEffect(() => {
    if (user) fetchEmployees()
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

  // Hàm kiểm tra trùng lặp
  const checkDuplicate = async (phone?: string, taxCode?: string) => {
    // Chỉ kiểm tra nếu có ít nhất một trong hai trường
    if (!phone && !taxCode) {
      setDuplicateInfo(null)
      return
    }

    // Bỏ qua nếu phone hoặc taxCode rỗng
    if (phone && phone.trim() === '') phone = undefined
    if (taxCode && taxCode.trim() === '') taxCode = undefined
    
    if (!phone && !taxCode) {
      setDuplicateInfo(null)
      return
    }

    try {
      setCheckingDuplicate(true)
      const response = await apiClient.post('/api/customers/check-duplicate', {
        phone: phone?.trim(),
        tax_code: taxCode?.trim()
      })

      if (response.data.success && response.data.is_duplicate) {
        const customer = response.data.customer
        setDuplicateInfo({
          isDuplicate: true,
          customerName: customer.full_name,
          employeeName: customer.assigned_employee_name,
          isOwnCustomer: customer.is_own_customer,
          field: phone ? 'phone' : 'tax_code'
        })
      } else {
        setDuplicateInfo(null)
      }
    } catch (err: any) {
      console.error('Lỗi khi kiểm tra trùng lặp:', err)
      // Không hiển thị lỗi cho user, chỉ log
      setDuplicateInfo(null)
    } finally {
      setCheckingDuplicate(false)
    }
  }

  // Kiểm tra trùng lặp khi debounced phone hoặc tax_code thay đổi
  useEffect(() => {
    if (debouncedPhone || debouncedTaxCode) {
      checkDuplicate(debouncedPhone, debouncedTaxCode)
    } else {
      setDuplicateInfo(null)
    }
  }, [debouncedPhone, debouncedTaxCode])

  const fetchEmployees = async () => {
    if (!user) return
    try {
      setLoadingEmployees(true)
      const response = await apiClient.get('/api/employees/assignable')
      if (response.data.success) {
        const list = response.data.data || []
        setEmployees(list)
        if (!formData.assigned_to && user) {
          setFormData(prev => ({ ...prev, assigned_to: user.id }))
        }
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

  // Handler cho onBlur của phone và tax_code
  const handlePhoneBlur = () => {
    if (formData.phone && formData.phone.trim()) {
      checkDuplicate(formData.phone.trim(), formData.tax_code?.trim())
    }
  }

  const handleTaxCodeBlur = () => {
    if (formData.tax_code && formData.tax_code.trim()) {
      checkDuplicate(formData.phone?.trim(), formData.tax_code.trim())
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Kiểm tra lại duplicate trước khi submit
    if (duplicateInfo?.isDuplicate) {
      toast.error('Không thể tạo khách hàng trùng lặp. Vui lòng kiểm tra lại thông tin.')
      return
    }

    // Kiểm tra duplicate một lần nữa trước khi submit (bảo mật)
    try {
      const checkResponse = await apiClient.post('/api/customers/check-duplicate', {
        phone: formData.phone?.trim(),
        tax_code: formData.tax_code?.trim()
      })

      if (checkResponse.data.success && checkResponse.data.is_duplicate) {
        const customer = checkResponse.data.customer
        if (customer.is_own_customer) {
          toast.error('Bạn đã quản lý khách hàng này rồi, vui lòng kiểm tra lại danh sách.')
        } else {
          toast.error(`Số điện thoại/Mã số thuế này đã được đăng ký cho khách hàng "${customer.full_name}" bởi nhân viên "${customer.assigned_employee_name}".`)
        }
        return
      }
    } catch (checkErr) {
      console.error('Lỗi khi kiểm tra duplicate trước khi submit:', checkErr)
      // Tiếp tục submit nếu có lỗi khi check (không chặn user)
    }

    setLoading(true)

    try {
      const response = await apiClient.post('/api/customers', formData)
      if (response.data.success) {
        toast.success('Tạo khách hàng thành công!')
        onSuccess()
      } else {
        const errorMsg = response.data.message || 'Tạo khách hàng thất bại'
        setError(errorMsg)
        toast.error(errorMsg)
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || 'Lỗi khi tạo khách hàng'
      setError(errorMsg)
      toast.error(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="md:col-span-2">
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
          <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
            Số điện thoại <span className="text-red-500">*</span>
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            value={formData.phone}
            onChange={handleChange}
            onBlur={handlePhoneBlur}
            required
            className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition ${
              duplicateInfo?.isDuplicate && duplicateInfo.field === 'phone'
                ? 'border-red-500 focus:ring-red-500'
                : 'border-gray-300'
            }`}
            placeholder="Nhập số điện thoại"
          />
          {checkingDuplicate && (
            <p className="text-xs text-gray-500 mt-1">Đang kiểm tra...</p>
          )}
          {duplicateInfo?.isDuplicate && duplicateInfo.field === 'phone' && (
            <p className="text-sm text-red-600 mt-1 flex items-center gap-1">
              <AlertCircle className="w-4 h-4" />
              {duplicateInfo.isOwnCustomer ? (
                <span>Bạn đã quản lý khách hàng này rồi, vui lòng kiểm tra lại danh sách.</span>
              ) : (
                <span>
                  Số điện thoại này đã được đăng ký cho khách hàng <strong>{duplicateInfo.customerName}</strong> bởi nhân viên <strong>{duplicateInfo.employeeName}</strong>.
                </span>
              )}
            </p>
          )}
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

        <div className="md:col-span-2">
          <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-2">
            Địa chỉ
          </label>
          <textarea
            id="address"
            name="address"
            value={formData.address}
            onChange={handleChange}
            rows={2}
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

        {(formData.customer_type === 'company' || 
           formData.customer_type === 'doanh_nghiep_lon' || 
           formData.customer_type === 'ho_kinh_doanh' || 
           formData.customer_type === 'hop_tac_xa' ||
           formData.customer_type === 'so_ban_nganh' ||
           formData.customer_type === 'cong_an_tinh' ||
           formData.customer_type === 'cong_an_xa' ||
           formData.customer_type === 'xa_phuong') && (
           <>
             <div>
               <label htmlFor="company_name" className="block text-sm font-medium text-gray-700 mb-2">
                 {formData.customer_type === 'so_ban_nganh' || 
                  formData.customer_type === 'cong_an_tinh' || 
                  formData.customer_type === 'cong_an_xa' || 
                  formData.customer_type === 'xa_phuong' 
                  ? 'Tên đơn vị/tổ chức' 
                  : 'Tên công ty/tổ chức'}
               </label>
               <input
                 id="company_name"
                 name="company_name"
                 type="text"
                 value={formData.company_name}
                 onChange={handleChange}
                 className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
                 placeholder={
                   formData.customer_type === 'so_ban_nganh' || 
                   formData.customer_type === 'cong_an_tinh' || 
                   formData.customer_type === 'cong_an_xa' || 
                   formData.customer_type === 'xa_phuong'
                   ? 'Nhập tên đơn vị/tổ chức'
                   : 'Nhập tên công ty/tổ chức'
                 }
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
                onBlur={handleTaxCodeBlur}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition ${
                  duplicateInfo?.isDuplicate && duplicateInfo.field === 'tax_code'
                    ? 'border-red-500 focus:ring-red-500'
                    : 'border-gray-300'
                }`}
                placeholder="Nhập mã số thuế"
              />
          {checkingDuplicate && duplicateInfo?.field === 'tax_code' && (
            <p className="text-xs text-gray-500 mt-1">Đang kiểm tra...</p>
          )}
          {duplicateInfo?.isDuplicate && duplicateInfo.field === 'tax_code' && (
            <p className="text-sm text-red-600 mt-1 flex items-center gap-1">
              <AlertCircle className="w-4 h-4" />
              {duplicateInfo.isOwnCustomer ? (
                <span>Bạn đã quản lý khách hàng này rồi, vui lòng kiểm tra lại danh sách.</span>
              ) : (
                <span>
                  Mã số thuế này đã được đăng ký cho khách hàng <strong>{duplicateInfo.customerName}</strong> bởi nhân viên <strong>{duplicateInfo.employeeName}</strong>.
                </span>
              )}
            </p>
          )}
            </div>
          </>
        )}

        {/* Dropdown Assigned To: director/admin = toàn bộ; manager/leader = theo cấp; sales = chỉ mình (ẩn dropdown, gán tự động) */}
        {user?.role !== 'sales' && (
          <div className="md:col-span-2" ref={employeeDropdownRef}>
            <label htmlFor="assigned_to" className="block text-sm font-medium text-gray-700 mb-2">
              Nhân viên chăm sóc
            </label>
            {loadingEmployees ? (
              <div className="px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500">
                Đang tải danh sách nhân viên...
              </div>
            ) : (
              <div className="relative">
                <div
                  onClick={() => setShowEmployeeDropdown(!showEmployeeDropdown)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white cursor-pointer flex items-center justify-between hover:border-primary-500 transition"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {selectedEmployee ? (
                      <span className="text-gray-900 truncate">
                        {selectedEmployee.full_name} (@{selectedEmployee.username})
                        <span className="text-gray-500 ml-1">
                          {selectedEmployee.role === 'admin' ? '- Admin' : selectedEmployee.role === 'manager' ? '- Manager' : '- Sales'}
                        </span>
                      </span>
                    ) : (
                      <span className="text-gray-400">Chọn nhân viên...</span>
                    )}
                  </div>
                  <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${showEmployeeDropdown ? 'transform rotate-180' : ''}`} />
                </div>

                {showEmployeeDropdown && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-hidden">
                    {/* Search input */}
                    <div className="p-2 border-b border-gray-200">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-full pl-10 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-sm"
                          placeholder="Tìm kiếm theo tên, username..."
                          autoFocus
                        />
                        {searchQuery && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setSearchQuery('')
                            }}
                            className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Employee list */}
                    <div className="max-h-48 overflow-y-auto">
                      {filteredEmployees.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-gray-500 text-center">
                          Không tìm thấy nhân viên
                        </div>
                      ) : (
                        filteredEmployees.map((emp) => (
                          <div
                            key={emp.employee_id}
                            onClick={() => handleSelectEmployee(emp.employee_id)}
                            className={`px-4 py-2 cursor-pointer hover:bg-primary-50 transition ${
                              formData.assigned_to === emp.employee_id ? 'bg-primary-100' : ''
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-gray-900 truncate">
                                  {emp.full_name}
                                </div>
                                <div className="text-xs text-gray-500 truncate">
                                  @{emp.username}
                                </div>
                              </div>
                              <span className={`ml-2 px-2 py-0.5 rounded text-xs font-medium ${
                                emp.role === 'admin'
                                  ? 'bg-purple-100 text-purple-700'
                                  : emp.role === 'manager'
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-gray-100 text-gray-700'
                              }`}>
                                {emp.role === 'admin' ? 'Admin' : emp.role === 'manager' ? 'Manager' : 'Sales'}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            <p className="text-xs text-gray-500 mt-1">
              Tìm kiếm và chọn nhân viên sẽ chăm sóc khách hàng này. Nếu không chọn, sẽ gán cho bạn.
            </p>
          </div>
        )}
      </div>

      <div className="flex justify-end space-x-4 pt-4 border-t">
        <button
          type="button"
          onClick={onCancel}
          className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition font-medium"
        >
          Hủy
        </button>
        <button
          type="submit"
          disabled={loading || (duplicateInfo?.isDuplicate === true)}
          className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Đang tạo...' : 'Tạo khách hàng'}
        </button>
      </div>
    </form>
  )
}




