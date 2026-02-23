'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api'
import { AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'

interface Department {
  id: string
  name: string
  parent_id: string | null
  type: string
}

interface Employee {
  employee_id: string
  username: string
  full_name: string
  email: string
  role: string
  is_active: boolean
  department_id?: string
  title?: string
  rank?: string
}

interface EditEmployeeFormProps {
  employee: Employee
  onSuccess: () => void
  onCancel: () => void
}

/** Vai trò trong công ty. Không có Super Admin (cấp hệ thống). */
const ROLE_OPTIONS = [
  { value: 'sales', label: 'Nhân viên bán hàng' },
  { value: 'leader', label: 'Tổ trưởng' },
  { value: 'manager', label: 'Quản lý' },
  { value: 'director', label: 'Giám đốc' },
  { value: 'admin', label: 'Quản trị viên' }
]

export function EditEmployeeForm({ employee, onSuccess, onCancel }: EditEmployeeFormProps) {
  const [departments, setDepartments] = useState<Department[]>([])
  const [formData, setFormData] = useState({
    full_name: employee.full_name,
    email: employee.email,
    role: employee.role,
    is_active: employee.is_active,
    department_id: (employee.department_id || '') as string,
    title: employee.title || '',
    rank: employee.rank || ''
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await apiClient.get('/api/departments/flat')
        if (res.data.success) setDepartments(res.data.data || [])
      } catch {
        // ignore
      }
    }
    fetch()
  }, [])

  useEffect(() => {
    setFormData({
      full_name: employee.full_name,
      email: employee.email,
      role: employee.role,
      is_active: employee.is_active,
      department_id: employee.department_id || '',
      title: employee.title || '',
      rank: employee.rank || ''
    })
  }, [employee])

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const value = e.target.type === 'checkbox' 
      ? (e.target as HTMLInputElement).checked 
      : e.target.value
    
    setFormData({
      ...formData,
      [e.target.name]: value,
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const payload = {
        full_name: formData.full_name,
        email: formData.email,
        role: formData.role,
        is_active: formData.is_active,
        department_id: formData.department_id || undefined,
        title: formData.title || undefined,
        rank: formData.rank || undefined
      }
      const response = await apiClient.put(`/api/employees/${employee.employee_id}`, payload)
      
      if (response.data.success) {
        toast.success('Cập nhật thông tin nhân viên thành công!')
        onSuccess()
      } else {
        const errorMsg = response.data.message || 'Cập nhật thất bại'
        setError(errorMsg)
        toast.error(errorMsg)
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || 'Lỗi khi cập nhật thông tin nhân viên'
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
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tên đăng nhập
          </label>
          <input
            type="text"
            value={employee.username}
            disabled
            className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
          />
          <p className="text-xs text-gray-500 mt-1">Tên đăng nhập không thể thay đổi</p>
        </div>

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

        <div className="md:col-span-2">
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
            Email <span className="text-red-500">*</span>
          </label>
          <input
            id="email"
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
            required
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
            placeholder="Nhập email"
          />
        </div>

        <div>
          <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-2">
            Vai trò
          </label>
          <select
            id="role"
            name="role"
            value={formData.role}
            onChange={handleChange}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="department_id" className="block text-sm font-medium text-gray-700 mb-2">
            Phòng/Tổ
          </label>
          <select
            id="department_id"
            name="department_id"
            value={formData.department_id}
            onChange={handleChange}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
          >
            <option value="">-- Chọn Phòng/Tổ --</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.type === 'team' ? '  └ ' : ''}{d.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
            Chức danh
          </label>
          <input
            id="title"
            name="title"
            type="text"
            value={formData.title}
            onChange={handleChange}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
            placeholder="VD: Chuyên viên"
          />
        </div>

        <div>
          <label htmlFor="rank" className="block text-sm font-medium text-gray-700 mb-2">
            Cấp bậc
          </label>
          <input
            id="rank"
            name="rank"
            type="text"
            value={formData.rank}
            onChange={handleChange}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
            placeholder="VD: 1, 2, 3"
          />
        </div>

        <div>
          <label htmlFor="is_active" className="block text-sm font-medium text-gray-700 mb-2">
            Trạng thái
          </label>
          <div className="flex items-center space-x-3">
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                name="is_active"
                checked={formData.is_active}
                onChange={handleChange}
                className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
              />
              <span className="ml-2 text-sm text-gray-700">
                {formData.is_active ? 'Hoạt động' : 'Đã khóa'}
              </span>
            </label>
          </div>
        </div>
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
          disabled={loading}
          className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Đang cập nhật...' : 'Cập nhật'}
        </button>
      </div>
    </form>
  )
}





