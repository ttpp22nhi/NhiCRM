'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { apiClient } from '@/lib/api'
import { AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'

interface Department {
  id: string
  name: string
  parent_id: string | null
  type: string
}

interface EmployeeFormProps {
  onSuccess: () => void
  onCancel: () => void
}

/** Vai trò khi thêm nhân viên vào công ty. Không có Super Admin — Super Admin là cấp hệ thống, không tạo qua form này. */
const ROLE_OPTIONS = [
  { value: 'sales', label: 'Nhân viên bán hàng' },
  { value: 'leader', label: 'Tổ trưởng' },
  { value: 'manager', label: 'Quản lý' },
  { value: 'director', label: 'Giám đốc' },
  { value: 'admin', label: 'Quản trị viên' }
]

export function EmployeeForm({ onSuccess, onCancel }: EmployeeFormProps) {
  const { register } = useAuth()
  const [departments, setDepartments] = useState<Department[]>([])
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    full_name: '',
    email: '',
    role: 'sales',
    department_id: '' as string,
    title: '',
    rank: ''
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

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await register(
        formData.username,
        formData.password,
        formData.full_name,
        formData.email,
        {
          role: formData.role,
          department_id: formData.department_id || undefined,
          title: formData.title || undefined,
          rank: formData.rank || undefined
        }
      )
      toast.success('Tạo tài khoản nhân viên thành công!')
      onSuccess()
    } catch (err: any) {
      const errorMsg = err.message || 'Tạo tài khoản thất bại'
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
          <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
            Tên đăng nhập <span className="text-red-500">*</span>
          </label>
          <input
            id="username"
            name="username"
            type="text"
            value={formData.username}
            onChange={handleChange}
            required
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
            placeholder="Nhập tên đăng nhập"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
            Mật khẩu <span className="text-red-500">*</span>
          </label>
          <input
            id="password"
            name="password"
            type="password"
            value={formData.password}
            onChange={handleChange}
            required
            minLength={6}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
            placeholder="Nhập mật khẩu (tối thiểu 6 ký tự)"
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
          {loading ? 'Đang tạo...' : 'Tạo tài khoản'}
        </button>
      </div>
    </form>
  )
}











