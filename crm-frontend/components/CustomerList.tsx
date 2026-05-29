'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api'
import { Users, Phone, Mail, MapPin, Building, AlertCircle, User, Search, Filter, X, FileSpreadsheet, ChevronLeft, ChevronRight, Pencil, Trash2, ArrowRightLeft, CheckSquare, Send, Clock, DollarSign, Plus } from 'lucide-react'
import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'
import { useDebounce } from '@/hooks/useDebounce'
import { useAuth } from '@/contexts/AuthContext'
import { EditCustomerForm } from './EditCustomerForm'
import { BulkTransferModal } from './BulkTransferModal'
import { TransferRequestModal } from './TransferRequestModal'
import { AlertModal } from './AlertModal'
import { DealModal } from './DealModal'
import toast from 'react-hot-toast'
import { inferKpiCustomerKind, labelKpiCustomerKind } from '@/lib/kpiCustomerKind'

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
  assigned_employee_id?: string
  assigned_employee_name?: string
  assigned_employee_username?: string
  assigned_employee_email?: string
  assigned_employee_role?: string
  created_at: number | string
}

interface PaginationInfo {
  totalItems: number
  totalPages: number
  currentPage: number
  pageSize: number
}

interface AssignableEmployee {
  employee_id: string
  full_name: string
  username: string
  email?: string
}

interface CustomerListProps {
  refreshKey?: number
  onBulkTransferClick?: () => void
  getSelectedCount?: () => number
}

interface TableColumnFilters {
  customer: string
  contact: string
  taxCode: string
  type: string
  caretaker: string
}

export function CustomerList({ refreshKey = 0, onBulkTransferClick, getSelectedCount }: CustomerListProps) {
  const { user } = useAuth()
  const router = useRouter()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [showTypeFilter, setShowTypeFilter] = useState(false)
  const [kpiKindFilter, setKpiKindFilter] = useState<'all' | 'new' | 'existing'>('all')
  const [assignableEmployees, setAssignableEmployees] = useState<AssignableEmployee[]>([])
  const [assignedToFilter, setAssignedToFilter] = useState('')
  const [assignSearch, setAssignSearch] = useState('')
  const [assignPickerOpen, setAssignPickerOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [pagination, setPagination] = useState<PaginationInfo>({
    totalItems: 0,
    totalPages: 0,
    currentPage: 1,
    pageSize: 10
  })
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<Set<string>>(new Set())
  const [showBulkTransferModal, setShowBulkTransferModal] = useState(false)
  const [showTransferRequestModal, setShowTransferRequestModal] = useState(false)
  const [showDealModal, setShowDealModal] = useState(false)
  const [selectedCustomerForDeal, setSelectedCustomerForDeal] = useState<string | null>(null)
  const [pendingTransferCustomers, setPendingTransferCustomers] = useState<Set<string>>(new Set())
  const [tableFilters, setTableFilters] = useState<TableColumnFilters>({
    customer: '',
    contact: '',
    taxCode: '',
    type: '',
    caretaker: '',
  })
  const typeFilterRef = useRef<HTMLDivElement>(null)
  const caretakerFilterRef = useRef<HTMLDivElement>(null)
  const hasAdminLikeAccess =
    user?.role === 'admin' ||
    user?.role === 'super_admin' ||
    user?.role === 'director' ||
    user?.role === 'manager'

  // Debounce searchQuery với delay 500ms để tránh gọi API quá nhiều lần
  // Khi người dùng gõ "Nguyễn Văn A", thay vì gọi API 12 lần (mỗi ký tự),
  // chỉ gọi 1 lần sau khi người dùng ngừng gõ 500ms
  const debouncedSearchQuery = useDebounce(searchQuery, 500)

  const filteredAssignableEmployees = useMemo(() => {
    const q = assignSearch.trim().toLowerCase()
    if (!q) return assignableEmployees
    return assignableEmployees.filter((e) => {
      const name = (e.full_name || '').toLowerCase()
      const un = (e.username || '').toLowerCase()
      const em = (e.email || '').toLowerCase()
      return name.includes(q) || un.includes(q) || em.includes(q)
    })
  }, [assignableEmployees, assignSearch])

  const selectedCaretakerEmployee = useMemo(
    () => assignableEmployees.find((e) => e.employee_id === assignedToFilter),
    [assignableEmployees, assignedToFilter]
  )

  const filteredTableCustomers = useMemo(() => {
    const normalize = (v: string | null | undefined) => String(v || '').toLowerCase().trim()
    const fCustomer = normalize(tableFilters.customer)
    const fContact = normalize(tableFilters.contact)
    const fTaxCode = normalize(tableFilters.taxCode)
    const fType = normalize(tableFilters.type)
    const fCaretaker = normalize(tableFilters.caretaker)

    return customers.filter((c) => {
      if (fCustomer) {
        const hay = normalize(`${c.full_name} ${c.company_name}`)
        if (!hay.includes(fCustomer)) return false
      }
      if (fContact) {
        const hay = normalize(`${c.phone} ${c.email} ${c.address}`)
        if (!hay.includes(fContact)) return false
      }
      if (fTaxCode) {
        const hay = normalize(c.tax_code)
        if (!hay.includes(fTaxCode)) return false
      }
      if (fType) {
        const hay = normalize(
          `${getCustomerTypeLabel(c.customer_type)} ${labelKpiCustomerKind(inferKpiCustomerKind(c))}`
        )
        if (!hay.includes(fType)) return false
      }
      if (fCaretaker) {
        const hay = normalize(
          `${c.assigned_employee_name} ${c.assigned_employee_username} ${c.assigned_employee_email}`
        )
        if (!hay.includes(fCaretaker)) return false
      }
      return true
    })
  }, [customers, tableFilters])

  // Danh sách tất cả các loại khách hàng
  const customerTypes = [
    { value: 'individual', label: 'Cá nhân' },
    { value: 'so_ban_nganh', label: 'Sở ban ngành' },
    { value: 'cong_an_tinh', label: 'Công an Tỉnh' },
    { value: 'cong_an_xa', label: 'Công an xã' },
    { value: 'xa_phuong', label: 'Xã phường' },
    { value: 'doanh_nghiep_lon', label: 'Doanh nghiệp lớn' },
    { value: 'ho_kinh_doanh', label: 'Hộ kinh doanh' },
    { value: 'hop_tac_xa', label: 'Hợp tác xã' },
    { value: 'company', label: 'Doanh nghiệp' }
  ]

  // Reset về trang 1 khi search hoặc filter thay đổi
  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearchQuery, selectedTypes, assignedToFilter, kpiKindFilter])

  useEffect(() => {
    const loadAssignable = async () => {
      if (!user) return
      try {
        const res = await apiClient.get('/api/employees/assignable')
        if (res.data.success) {
          setAssignableEmployees(res.data.data || [])
        }
      } catch {
        setAssignableEmployees([])
      }
    }
    loadAssignable()
  }, [user])

  // Chỉ gọi API khi debouncedSearchQuery, selectedTypes, assignedToFilter, kpiKindFilter, currentPage, pageSize hoặc refreshKey thay đổi
  useEffect(() => {
    fetchCustomers()
  }, [debouncedSearchQuery, selectedTypes, assignedToFilter, kpiKindFilter, currentPage, pageSize, refreshKey])

  // Kiểm tra trạng thái pending transfer cho các khách hàng (chỉ cho Sales)
  useEffect(() => {
    if (user?.role === 'sales' && customers.length > 0) {
      const checkPendingTransfers = async () => {
        const pendingSet = new Set<string>()
        for (const customer of customers) {
          try {
            const response = await apiClient.get(`/api/transfer/check-pending/${customer.customer_id}`)
            if (response.data.success && response.data.has_pending) {
              pendingSet.add(customer.customer_id)
            }
          } catch (error) {
            // Ignore errors for individual checks
            console.error(`Error checking pending transfer for customer ${customer.customer_id}:`, error)
          }
        }
        setPendingTransferCustomers(pendingSet)
      }
      checkPendingTransfers()
    }
  }, [customers, user?.role])

  // Đóng dropdown khi click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (typeFilterRef.current && !typeFilterRef.current.contains(event.target as Node)) {
        setShowTypeFilter(false)
      }
    }

    if (showTypeFilter) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showTypeFilter])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        caretakerFilterRef.current &&
        !caretakerFilterRef.current.contains(event.target as Node)
      ) {
        setAssignPickerOpen(false)
      }
    }
    if (assignPickerOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [assignPickerOpen])

  const fetchCustomers = async () => {
    try {
      setLoading(true)
      setError('')
      const params = new URLSearchParams()
      // Sử dụng debouncedSearchQuery thay vì searchQuery để tránh gọi API quá nhiều
      if (debouncedSearchQuery.trim()) {
        params.append('search', debouncedSearchQuery.trim())
      }
      // Thêm nhiều loại vào query params
      selectedTypes.forEach(type => {
        params.append('type', type)
      })
      if (assignedToFilter.trim()) {
        params.append('assigned_to', assignedToFilter.trim())
      }
      if (kpiKindFilter !== 'all') {
        params.append('kind', kpiKindFilter.toUpperCase())
      }
      // Thêm pagination parameters
      params.append('page', currentPage.toString())
      params.append('limit', pageSize.toString())
      
      const queryString = params.toString()
      const url = `/api/customers?${queryString}`
      
      const response = await apiClient.get(url)
      if (response.data.success) {
        setCustomers(response.data.data || [])
        if (response.data.pagination) {
          setPagination(response.data.pagination)
        }
      } else {
        setError('Không thể tải danh sách khách hàng')
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Lỗi khi tải danh sách khách hàng')
    } finally {
      setLoading(false)
    }
  }

  const handleTypeToggle = (type: string) => {
    setSelectedTypes(prev => {
      if (prev.includes(type)) {
        return prev.filter(t => t !== type)
      } else {
        return [...prev, type]
      }
    })
  }

  const handleClearAllTypes = () => {
    setSelectedTypes([])
  }

  const handleDeleteConfirm = async () => {
    if (!deletingCustomer) return

    try {
      setDeleting(true)
      const response = await apiClient.delete(`/api/customers/${deletingCustomer.customer_id}`)
      if (response.data.success) {
        toast.success('Xóa khách hàng thành công!')
        setDeletingCustomer(null)
        fetchCustomers() // Tự động refresh danh sách
      } else {
        const errorMsg = response.data.message || 'Xóa khách hàng thất bại'
        setError(errorMsg)
        toast.error(errorMsg)
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || 'Lỗi khi xóa khách hàng'
      setError(errorMsg)
      toast.error(errorMsg)
    } finally {
      setDeleting(false)
    }
  }

  const handleEditSuccess = () => {
    setEditingCustomer(null)
    fetchCustomers() // Tự động refresh danh sách
  }

  // Xử lý checkbox selection
  const handleToggleSelect = (customerId: string) => {
    setSelectedCustomerIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(customerId)) {
        newSet.delete(customerId)
      } else {
        newSet.add(customerId)
      }
      return newSet
    })
  }

  const handleSelectAll = () => {
    const visibleIds = filteredTableCustomers.map((c) => c.customer_id)
    const allVisibleSelected =
      visibleIds.length > 0 && visibleIds.every((id) => selectedCustomerIds.has(id))
    if (allVisibleSelected) {
      setSelectedCustomerIds((prev) => {
        const next = new Set(prev)
        visibleIds.forEach((id) => next.delete(id))
        return next
      })
    } else {
      setSelectedCustomerIds((prev) => {
        const next = new Set(prev)
        visibleIds.forEach((id) => next.add(id))
        return next
      })
    }
  }

  const handleBulkTransferSuccess = () => {
    setSelectedCustomerIds(new Set())
    fetchCustomers()
  }

  const handleTransferRequestSuccess = () => {
    setSelectedCustomerIds(new Set())
    fetchCustomers()
    // Refresh pending status
    if (user?.role === 'sales' && customers.length > 0) {
      const checkPendingTransfers = async () => {
        const pendingSet = new Set<string>()
        for (const customer of customers) {
          try {
            const response = await apiClient.get(`/api/transfer/check-pending/${customer.customer_id}`)
            if (response.data.success && response.data.has_pending) {
              pendingSet.add(customer.customer_id)
            }
          } catch (error) {
            console.error(`Error checking pending transfer for customer ${customer.customer_id}:`, error)
          }
        }
        setPendingTransferCustomers(pendingSet)
      }
      checkPendingTransfers()
    }
  }

  const selectedCustomers = customers.filter(c => selectedCustomerIds.has(c.customer_id))
  const visibleCustomerIds = filteredTableCustomers.map((c) => c.customer_id)
  const selectedVisibleCount = visibleCustomerIds.filter((id) => selectedCustomerIds.has(id)).length
  const isAllSelected =
    visibleCustomerIds.length > 0 && selectedVisibleCount === visibleCustomerIds.length
  const isIndeterminate =
    selectedVisibleCount > 0 && selectedVisibleCount < visibleCustomerIds.length

  // Expose method to parent component via window (simple approach)
  useEffect(() => {
    // Handle bulk transfer from external button
    const handleExternalBulkTransfer = () => {
      if (selectedCustomerIds.size === 0) {
        toast.error('Vui lòng chọn ít nhất một khách hàng để chuyển giao')
        return
      }
      setShowBulkTransferModal(true)
    }

    ;(window as any).__customerListBulkTransfer = handleExternalBulkTransfer
    ;(window as any).__customerListSelectedCount = () => selectedCustomerIds.size
    return () => {
      delete (window as any).__customerListBulkTransfer
      delete (window as any).__customerListSelectedCount
    }
  }, [selectedCustomerIds.size]) // setShowBulkTransferModal là setter function, không cần trong dependency array

  // Format ngày tháng cho Excel (chỉ ngày, không có giờ)
  const formatDateForExcel = (timestamp: number | string) => {
    const ts = typeof timestamp === 'string' ? parseInt(timestamp, 10) : timestamp
    
    if (isNaN(ts) || ts === null || ts === undefined) {
      return ''
    }
    
    const timestampMs = ts.toString().length === 10 ? ts * 1000 : ts
    const date = new Date(timestampMs)
    
    if (isNaN(date.getTime())) {
      return ''
    }
    
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()
    return `${day}/${month}/${year}`
  }

  const handleExport = () => {
    if (customers.length === 0) {
      toast.error('Không có dữ liệu để xuất Excel')
      return
    }

    // Chuẩn bị dữ liệu cho Excel với định dạng tiếng Việt
    const excelData = customers.map((customer) => ({
      'Họ và tên': customer.full_name,
      'Email': customer.email || '',
      'Số điện thoại': customer.phone,
      'Địa chỉ': customer.address || '',
      'Loại khách hàng': getCustomerTypeLabel(customer.customer_type),
      'Phân loại KPI': labelKpiCustomerKind(inferKpiCustomerKind(customer)),
      'Tên công ty/Đơn vị': customer.company_name || '',
      'Mã số thuế': customer.tax_code || '',
      'Nguồn': customer.source || '',
      'Nhân viên chăm sóc': customer.assigned_employee_name || 'Chưa gán',
      'Username NV': customer.assigned_employee_username || '',
      'Email NV': customer.assigned_employee_email || '',
      'Vai trò NV': customer.assigned_employee_role 
        ? (customer.assigned_employee_role === 'admin' ? 'Quản trị viên' 
          : customer.assigned_employee_role === 'manager' ? 'Quản lý' 
          : 'Nhân viên bán hàng')
        : '',
      'Ngày tạo': formatDateForExcel(customer.created_at),
      'ID Khách hàng': customer.customer_id
    }))

    // Tạo worksheet
    const worksheet = XLSX.utils.json_to_sheet(excelData)
    
    // Điều chỉnh độ rộng cột
    const columnWidths = [
      { wch: 25 }, // Họ tên
      { wch: 30 }, // Email
      { wch: 15 }, // Số điện thoại
      { wch: 40 }, // Địa chỉ
      { wch: 20 }, // Loại khách hàng
      { wch: 18 }, // Phân loại KPI
      { wch: 30 }, // Tên công ty
      { wch: 15 }, // Mã số thuế
      { wch: 15 }, // Nguồn
      { wch: 25 }, // Nhân viên chăm sóc
      { wch: 20 }, // Username NV
      { wch: 30 }, // Email NV
      { wch: 15 }, // Vai trò NV
      { wch: 20 }, // Ngày tạo
      { wch: 40 }  // ID Khách hàng
    ]
    worksheet['!cols'] = columnWidths

    // Tạo workbook
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Danh sách khách hàng')

    // Tạo tên file với định dạng YYYYMMDD
    const today = new Date()
    const year = today.getFullYear()
    const month = String(today.getMonth() + 1).padStart(2, '0')
    const day = String(today.getDate()).padStart(2, '0')
    const fileName = `Danh_sach_khach_hang_CRM_${year}${month}${day}.xlsx`

    // Xuất file
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    saveAs(blob, fileName)
    toast.success(`Đã xuất Excel thành công! (${customers.length} khách hàng)`)
  }

  const getCustomerTypeLabel = (type: string) => {
    const typeMap: { [key: string]: string } = {
      'individual': 'Cá nhân',
      'so_ban_nganh': 'Sở ban ngành',
      'cong_an_tinh': 'Công an Tỉnh',
      'cong_an_xa': 'Công an xã',
      'xa_phuong': 'Xã phường',
      'doanh_nghiep_lon': 'Doanh nghiệp lớn',
      'ho_kinh_doanh': 'Hộ kinh doanh',
      'hop_tac_xa': 'Hợp tác xã',
      'company': 'Doanh nghiệp'
    }
    return typeMap[type] || type
  }

  const formatDate = (timestamp: number | string) => {
    // Chuyển đổi sang number nếu là string
    const ts = typeof timestamp === 'string' ? parseInt(timestamp, 10) : timestamp
    
    // Kiểm tra nếu không phải là số hợp lệ
    if (isNaN(ts) || ts === null || ts === undefined) {
      return 'N/A'
    }
    
    // Kiểm tra nếu timestamp là seconds (10 chữ số) thì nhân 1000 để chuyển thành milliseconds
    const timestampMs = ts.toString().length === 10 ? ts * 1000 : ts
    const date = new Date(timestampMs)
    
    // Kiểm tra nếu date không hợp lệ
    if (isNaN(date.getTime())) {
      return 'N/A'
    }
    
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')
    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`
  }


  return (
    <div className="space-y-6">
      {/* Thanh tìm kiếm và lọc */}
      <div className="bg-white rounded-lg shadow p-2">
        <div className="flex flex-wrap gap-2 items-center">
          {/* Input tìm kiếm */}
          <div className="relative w-full lg:flex-1 lg:min-w-[22rem]">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo tên KH, tên công ty, số điện thoại, mã số thuế..."
              title="Tìm theo: Tên khách hàng, Tên công ty, Số điện thoại, Mã số thuế"
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
            />
          </div>

          {/* Multi-select loại khách hàng */}
          <div className="w-full sm:w-64 relative" ref={typeFilterRef}>
            <button
              type="button"
              onClick={() => setShowTypeFilter(!showTypeFilter)}
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition bg-white text-left flex items-center justify-between"
            >
              <div className="flex items-center gap-1.5">
                <Filter className="absolute left-2 text-gray-400 w-4 h-4" />
                <span className="text-gray-700 text-sm truncate">
                  {selectedTypes.length === 0 
                    ? 'Tất cả loại' 
                    : `${selectedTypes.length} loại`}
                </span>
              </div>
              {selectedTypes.length > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleClearAllTypes()
                  }}
                  className="text-gray-400 hover:text-gray-600 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </button>

            {showTypeFilter && (
              <div className="absolute z-50 mt-2 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-80 overflow-y-auto">
                <div className="p-3 border-b border-gray-200 flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700">Chọn loại khách hàng</span>
                  {selectedTypes.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearAllTypes}
                      className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                    >
                      Xóa tất cả
                    </button>
                  )}
                </div>
                <div className="p-2">
                  {customerTypes.map((type) => (
                    <label
                      key={type.value}
                      className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer transition"
                    >
                      <input
                        type="checkbox"
                        checked={selectedTypes.includes(type.value)}
                        onChange={() => handleTypeToggle(type.value)}
                        className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                      />
                      <span className="text-sm text-gray-700">{type.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Phân loại KPI: Khách mới / Khách hiện hữu */}
          <div className="inline-flex items-center bg-gray-100 rounded-lg p-0.5 text-xs font-medium whitespace-nowrap">
            <button
              type="button"
              onClick={() => setKpiKindFilter('all')}
              className={`px-2.5 py-1 rounded-md transition ${
                kpiKindFilter === 'all'
                  ? 'bg-white shadow text-primary-700'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              title="Hiện tất cả khách hàng"
            >
              Tất cả
            </button>
            <button
              type="button"
              onClick={() => setKpiKindFilter('new')}
              className={`px-2.5 py-1 rounded-md transition ${
                kpiKindFilter === 'new'
                  ? 'bg-white shadow text-blue-700'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              title="Chỉ khách phát triển mới (KPI)"
            >
              KH Mới
            </button>
            <button
              type="button"
              onClick={() => setKpiKindFilter('existing')}
              className={`px-2.5 py-1 rounded-md transition ${
                kpiKindFilter === 'existing'
                  ? 'bg-white shadow text-emerald-700'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              title="Chỉ khách hiện hữu (KPI) — đã có hoá đơn CBS duyệt hoặc Deal won"
            >
              KH Hiện hữu
            </button>
          </div>

          {assignableEmployees.length > 0 && (
            <div ref={caretakerFilterRef} className="w-full sm:min-w-[16rem] sm:max-w-sm flex flex-col gap-1">
              {assignedToFilter ? (
                <div className="flex items-center gap-2 flex-wrap text-xs text-gray-700">
                  <span className="text-gray-500 shrink-0">Đang lọc NV chăm sóc:</span>
                  <span className="font-medium truncate">
                    {selectedCaretakerEmployee
                      ? `${selectedCaretakerEmployee.full_name} (@${selectedCaretakerEmployee.username})`
                      : assignedToFilter}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setAssignedToFilter('')
                      setAssignSearch('')
                      setAssignPickerOpen(false)
                    }}
                    className="shrink-0 p-0.5 rounded text-gray-500 hover:text-red-600 hover:bg-red-50"
                    title="Bỏ lọc nhân viên"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : null}
              <div className="relative">
                <User className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none z-10" />
                <input
                  type="text"
                  value={assignSearch}
                  onChange={(e) => {
                    setAssignSearch(e.target.value)
                    setAssignPickerOpen(true)
                  }}
                  onFocus={() => setAssignPickerOpen(true)}
                  placeholder="Gõ tên, username hoặc email để tìm NV chăm sóc..."
                  className="w-full pl-8 pr-8 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition bg-white text-gray-800 placeholder:text-gray-400"
                  aria-label="Tìm và chọn nhân viên chăm sóc"
                  autoComplete="off"
                />
                {assignSearch ? (
                  <button
                    type="button"
                    onClick={() => {
                      setAssignSearch('')
                      setAssignPickerOpen(true)
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
                    title="Xóa ô tìm"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                ) : null}
                {assignPickerOpen ? (
                  <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setAssignedToFilter('')
                        setAssignSearch('')
                        setAssignPickerOpen(false)
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 text-primary-700 font-medium"
                    >
                      Tất cả nhân viên chăm sóc
                    </button>
                    {filteredAssignableEmployees.length === 0 ? (
                      <div className="px-3 py-3 text-sm text-gray-500">
                        {assignSearch.trim()
                          ? `Không có nhân viên khớp "${assignSearch.trim()}". Thử từ khóa khác.`
                          : 'Không có nhân viên trong danh sách.'}
                      </div>
                    ) : (
                      filteredAssignableEmployees.map((emp) => (
                        <button
                          key={emp.employee_id}
                          type="button"
                          onClick={() => {
                            setAssignedToFilter(emp.employee_id)
                            setAssignSearch('')
                            setAssignPickerOpen(false)
                          }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-primary-50 border-b border-gray-50 last:border-b-0 ${
                            assignedToFilter === emp.employee_id ? 'bg-primary-50/80' : ''
                          }`}
                        >
                          <span className="font-medium text-gray-900">{emp.full_name}</span>
                          <span className="text-gray-500"> · @{emp.username}</span>
                          {emp.email ? (
                            <span className="block text-xs text-gray-400 truncate">{emp.email}</span>
                          ) : null}
                        </button>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {/* Nút Tạo Deal mới */}
          <button
            type="button"
            onClick={() => {
              if (selectedCustomerIds.size === 1) {
                const customerId = Array.from(selectedCustomerIds)[0]
                setSelectedCustomerForDeal(customerId)
              }
              setShowDealModal(true)
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0074BD] text-white rounded-lg hover:bg-[#005a94] transition text-sm font-medium whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <DollarSign className="w-4 h-4" />
            <span className="hidden sm:inline">Tạo Deal mới</span>
            <span className="sm:hidden">Deal</span>
          </button>

          {/* Nút Xuất Excel */}
          <button
            type="button"
            onClick={handleExport}
            disabled={loading || customers.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span className="hidden sm:inline">Xuất Excel</span>
            <span className="sm:hidden">Excel</span>
          </button>
        </div>
        <p className="mt-2 text-[11px] text-gray-500 leading-4">
          Tìm theo: <strong>Tên khách hàng</strong>, <strong>Tên công ty</strong>,{' '}
          <strong>Số điện thoại</strong>, <strong>Mã số thuế</strong>.
        </p>
      </div>

      {/* Bảng khách hàng */}
      {loading ? (
        <div className="flex items-center justify-center py-8 bg-white rounded-lg shadow">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
          <div>
            <p className="text-xs font-semibold text-red-900">Lỗi</p>
            <p className="text-xs text-red-700">{error}</p>
          </div>
        </div>
      ) : customers.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <Users className="w-12 h-12 text-gray-400 mx-auto mb-2" />
          <h3 className="text-sm font-semibold text-gray-900 mb-1">
            {searchQuery || selectedTypes.length > 0 || assignedToFilter || kpiKindFilter !== 'all' ? 'Không tìm thấy khách hàng' : 'Chưa có khách hàng'}
          </h3>
          <p className="text-xs text-gray-600">
            {searchQuery || selectedTypes.length > 0 || assignedToFilter || kpiKindFilter !== 'all'
              ? 'Thử thay đổi từ khóa tìm kiếm hoặc bộ lọc' 
              : 'Bắt đầu bằng cách thêm khách hàng đầu tiên của bạn'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full table-fixed divide-y divide-gray-200 text-xs">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-10">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    ref={(input) => {
                      if (input) input.indeterminate = isIndeterminate
                    }}
                    onChange={handleSelectAll}
                    className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500 cursor-pointer"
                  />
                </div>
              </th>
              <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[30%]">
                Khách hàng
              </th>
              <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Liên hệ
              </th>
              <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[15ch] whitespace-nowrap">
                MST
              </th>
              <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[16%]">
                Loại
              </th>
              <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                NV chăm sóc
              </th>
              <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Ngày tạo
              </th>
              <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Thao tác
              </th>
            </tr>
            <tr className="bg-white border-t border-gray-100">
              <th className="px-2 py-1.5" />
              <th className="px-2 py-1.5">
                <input
                  type="text"
                  value={tableFilters.customer}
                  onChange={(e) => setTableFilters((p) => ({ ...p, customer: e.target.value }))}
                  placeholder="Tên KH / công ty"
                  className="w-full border border-gray-200 rounded px-2 py-1 text-xs"
                />
              </th>
              <th className="px-2 py-1.5">
                <input
                  type="text"
                  value={tableFilters.contact}
                  onChange={(e) => setTableFilters((p) => ({ ...p, contact: e.target.value }))}
                  placeholder="SĐT / email / địa chỉ"
                  className="w-full border border-gray-200 rounded px-2 py-1 text-xs"
                />
              </th>
              <th className="px-2 py-1.5">
                <input
                  type="text"
                  value={tableFilters.taxCode}
                  onChange={(e) => setTableFilters((p) => ({ ...p, taxCode: e.target.value }))}
                  placeholder="MST"
                  className="w-full border border-gray-200 rounded px-2 py-1 text-xs"
                />
              </th>
              <th className="px-2 py-1.5">
                <input
                  type="text"
                  value={tableFilters.type}
                  onChange={(e) => setTableFilters((p) => ({ ...p, type: e.target.value }))}
                  placeholder="Loại KH / KPI"
                  className="w-full border border-gray-200 rounded px-2 py-1 text-xs"
                />
              </th>
              <th className="px-2 py-1.5">
                <input
                  type="text"
                  value={tableFilters.caretaker}
                  onChange={(e) => setTableFilters((p) => ({ ...p, caretaker: e.target.value }))}
                  placeholder="NV chăm sóc"
                  className="w-full border border-gray-200 rounded px-2 py-1 text-xs"
                />
              </th>
              <th className="px-2 py-1.5" />
              <th className="px-2 py-1.5" />
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredTableCustomers.map((customer) => (
              <tr key={customer.customer_id} className="hover:bg-gray-50 transition">
                <td className="px-2 py-2">
                  <input
                    type="checkbox"
                    checked={selectedCustomerIds.has(customer.customer_id)}
                    onChange={() => handleToggleSelect(customer.customer_id)}
                    className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500 cursor-pointer"
                  />
                </td>
                <td className="px-2 py-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-shrink-0 h-7 w-7 bg-primary-100 rounded-full flex items-center justify-center">
                      <span className="text-primary-600 font-semibold text-xs">
                        {customer.full_name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => router.push(`/customers/${customer.customer_id}`)}
                          className="text-xs font-medium text-primary-600 hover:text-primary-700 text-left transition whitespace-normal break-words"
                        >
                          {customer.full_name}
                        </button>
                        {pendingTransferCustomers.has(customer.customer_id) && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded text-[10px] font-medium" title="Đang chờ phê duyệt chuyển giao">
                            <Clock className="w-3 h-3" />
                            <span>Đang chờ chuyển</span>
                          </span>
                        )}
                      </div>
                      {customer.company_name && (
                        <div className="text-xs text-gray-500 flex items-start gap-1" title={customer.company_name}>
                          <Building className="w-3 h-3 flex-shrink-0 mt-0.5" />
                          <span className="whitespace-normal break-words">{customer.company_name}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-2 py-2">
                  <div className="space-y-0.5">
                    <div className="text-xs text-gray-900 flex items-center gap-1">
                      <Phone className="w-3 h-3 text-gray-400 flex-shrink-0" />
                      <span className="truncate">{customer.phone}</span>
                    </div>
                    {customer.email && (
                      <div className="text-xs text-gray-500 truncate flex items-center gap-1" title={customer.email}>
                        <Mail className="w-3 h-3 text-gray-400 flex-shrink-0" />
                        <span className="truncate">{customer.email}</span>
                      </div>
                    )}
                    {customer.address && (
                      <div className="text-xs text-gray-500 truncate flex items-center gap-1" title={customer.address}>
                        <MapPin className="w-3 h-3 text-gray-400 flex-shrink-0" />
                        <span className="truncate max-w-[150px]">{customer.address}</span>
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-2 py-2 text-xs text-gray-700 w-[15ch] whitespace-nowrap">
                  <span className="font-mono inline-block w-[15ch] whitespace-nowrap">
                    {customer.tax_code || '—'}
                  </span>
                </td>
                <td className="px-2 py-2">
                  <div className="space-y-1">
                    <span className="px-1.5 py-0.5 inline-flex whitespace-nowrap text-xs leading-4 font-semibold rounded bg-blue-100 text-blue-800">
                      {getCustomerTypeLabel(customer.customer_type)}
                    </span>
                    <span className="ml-0 block sm:inline sm:ml-1 px-1.5 py-0.5 text-xs font-medium rounded bg-emerald-50 text-emerald-800 whitespace-nowrap">
                      {labelKpiCustomerKind(inferKpiCustomerKind(customer))}
                    </span>
                    <div className="text-xs text-gray-500">{customer.source}</div>
                  </div>
                </td>
                <td className="px-2 py-2">
                  {customer.assigned_employee_name ? (
                    <div className="flex items-center gap-1.5">
                      <div className="flex-shrink-0 h-6 w-6 bg-primary-100 rounded-full flex items-center justify-center">
                        <span className="text-primary-600 font-semibold text-[10px]">
                          {customer.assigned_employee_name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-gray-900 truncate">
                          {customer.assigned_employee_name}
                        </div>
                        <div className="text-[10px] text-gray-500 truncate">
                          @{customer.assigned_employee_username}
                          {customer.assigned_employee_role && (
                            <span className={`ml-1 px-1 py-0.5 rounded text-[10px] ${
                              customer.assigned_employee_role === 'admin'
                                ? 'bg-purple-100 text-purple-700'
                                : customer.assigned_employee_role === 'manager'
                                ? 'bg-indigo-100 text-indigo-700'
                                : 'bg-blue-100 text-blue-700'
                            }`}>
                              {customer.assigned_employee_role === 'admin' ? 'Admin' : 
                               customer.assigned_employee_role === 'manager' ? 'Mgr' : 'Sales'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400 italic">Chưa gán</span>
                  )}
                </td>
                <td className="px-2 py-2 text-xs text-gray-500 whitespace-nowrap">
                  {formatDate(customer.created_at)}
                </td>
                <td className="px-2 py-2">
                  <div className="flex items-center gap-1">
                    {/* Kiểm tra quyền: Admin/Manager có quyền sửa/xóa mọi khách hàng, Sales chỉ sửa/xóa khách hàng của mình */}
                    {(hasAdminLikeAccess || 
                      (user?.role === 'sales' && customer.assigned_to === user?.id)) ? (
                      <>
                        <button
                          onClick={() => setEditingCustomer(customer)}
                          className="inline-flex items-center gap-0.5 px-2 py-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition text-xs font-medium"
                          title="Sửa"
                        >
                          <Pencil className="w-3 h-3" />
                          <span className="hidden sm:inline">Sửa</span>
                        </button>
                        <button
                          onClick={() => setDeletingCustomer(customer)}
                          className="inline-flex items-center gap-0.5 px-2 py-1 text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition text-xs font-medium"
                          title="Xóa"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span className="hidden sm:inline">Xóa</span>
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-gray-400 italic">-</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filteredTableCustomers.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-xs text-gray-500">
                  Không có khách hàng nào khớp bộ lọc trong bảng.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Phân trang */}
      {pagination.totalPages > 0 && (
        <div className="bg-white px-2 py-1.5 border-t border-gray-200">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
            {/* Thông tin phân trang và dropdown limit */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-700">
                <span className="font-medium">{customers.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}</span>-{' '}
                <span className="font-medium">{Math.min(currentPage * pageSize, pagination.totalItems)}</span> /{' '}
                <span className="font-medium">{pagination.totalItems}</span>
              </span>
              <div className="flex items-center gap-1">
                <label htmlFor="pageSize" className="text-xs text-gray-700">
                  Hiển thị:
                </label>
                <select
                  id="pageSize"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value))
                    setCurrentPage(1) // Reset về trang 1 khi thay đổi pageSize
                  }}
                  className="border border-gray-300 rounded px-2 py-1 text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>

            {/* Nút điều hướng phân trang */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1 || loading}
                className="flex items-center gap-0.5 px-2 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                <ChevronLeft className="w-3 h-3" />
                <span className="hidden sm:inline">Trước</span>
              </button>

              <div className="px-2 py-1 text-xs font-medium text-gray-700 bg-gray-50 border border-gray-300 rounded">
                {pagination.currentPage} / {pagination.totalPages}
              </div>

              <button
                onClick={() => setCurrentPage(prev => Math.min(pagination.totalPages, prev + 1))}
                disabled={currentPage === pagination.totalPages || loading}
                className="flex items-center gap-0.5 px-2 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                <span className="hidden sm:inline">Sau</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      )}
        </div>
      )}

      {/* Modal Sửa khách hàng */}
      {editingCustomer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-xl font-bold text-gray-900">Sửa thông tin khách hàng</h2>
              <button
                onClick={() => setEditingCustomer(null)}
                className="text-gray-400 hover:text-gray-600 transition"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6">
              <EditCustomerForm
                customer={editingCustomer}
                onSuccess={handleEditSuccess}
                onCancel={() => setEditingCustomer(null)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Floating Action Bar */}
      {selectedCustomerIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-40">
          <div className="bg-white rounded-lg shadow-2xl border border-gray-200 px-4 py-3 flex items-center gap-4">
            <div className="flex items-center gap-2">
              <CheckSquare className="w-5 h-5 text-primary-600" />
              <span className="text-sm font-medium text-gray-900">
                Đã chọn: <span className="text-primary-600">{selectedCustomerIds.size}</span> khách hàng
              </span>
            </div>
            {/* Admin và Manager: Chuyển giao trực tiếp */}
            {hasAdminLikeAccess && (
              <>
                <div className="h-6 w-px bg-gray-300"></div>
                <button
                  onClick={() => setShowBulkTransferModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-medium text-sm"
                >
                  <ArrowRightLeft className="w-4 h-4" />
                  <span>Chuyển giao người phụ trách</span>
                </button>
              </>
            )}
            {/* Sales: Gửi yêu cầu chuyển giao */}
            {user?.role === 'sales' && (
              <>
                <div className="h-6 w-px bg-gray-300"></div>
                <button
                  onClick={() => setShowTransferRequestModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition font-medium text-sm"
                >
                  <Send className="w-4 h-4" />
                  <span>Gửi yêu cầu chuyển giao</span>
                </button>
              </>
            )}
            <button
              onClick={() => setSelectedCustomerIds(new Set())}
              className="px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition text-sm font-medium"
            >
              Bỏ chọn
            </button>
          </div>
        </div>
      )}

      {/* Modal Chuyển giao hàng loạt */}
      {showBulkTransferModal && (
        <BulkTransferModal
          selectedCustomers={selectedCustomers}
          onClose={() => {
            setShowBulkTransferModal(false)
            setSelectedCustomerIds(new Set())
          }}
          onSuccess={handleBulkTransferSuccess}
        />
      )}

      {/* Modal Gửi yêu cầu chuyển giao (Sales) */}
      {showTransferRequestModal && (
        <TransferRequestModal
          selectedCustomers={selectedCustomers}
          onClose={() => {
            setShowTransferRequestModal(false)
            setSelectedCustomerIds(new Set())
          }}
          onSuccess={handleTransferRequestSuccess}
        />
      )}

      {/* Modal Tạo Deal mới */}
      {showDealModal && (
        <DealModal
          deal={null}
          customerId={selectedCustomerForDeal || undefined}
          onClose={() => {
            setShowDealModal(false)
            setSelectedCustomerForDeal(null)
          }}
          onSuccess={() => {
            setShowDealModal(false)
            setSelectedCustomerForDeal(null)
            toast.success('Tạo deal thành công!')
          }}
        />
      )}

      {/* Modal Xác nhận xóa */}
      <AlertModal
        isOpen={!!deletingCustomer}
        type="confirm"
        title="Xác nhận xóa"
        message={`Bạn có chắc chắn muốn xóa khách hàng ${deletingCustomer?.full_name}?\n\nDữ liệu sẽ được lưu trữ trong kho lưu trữ tạm thời.`}
        confirmText={deleting ? 'Đang xóa...' : 'Xóa'}
        cancelText="Hủy"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeletingCustomer(null)}
        onClose={() => setDeletingCustomer(null)}
        showCancel={true}
        disabled={deleting}
      />
    </div>
  )
}


