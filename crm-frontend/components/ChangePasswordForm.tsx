'use client'

import { useState } from 'react'
import { apiClient } from '@/lib/api'
import { AlertCircle, Eye, EyeOff, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'

interface ChangePasswordFormProps {
  onSuccess: () => void
  onCancel: () => void
}

export function ChangePasswordForm({ onSuccess, onCancel }: ChangePasswordFormProps) {
  const [formData, setFormData] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [showPasswords, setShowPasswords] = useState({
    oldPassword: false,
    newPassword: false,
    confirmPassword: false,
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
    // Clear error when user types
    if (error) setError('')
  }

  const validateForm = () => {
    // Kiểm tra mật khẩu cũ
    if (!formData.oldPassword) {
      setError('Vui lòng nhập mật khẩu cũ')
      return false
    }

    // Kiểm tra mật khẩu mới
    if (!formData.newPassword) {
      setError('Vui lòng nhập mật khẩu mới')
      return false
    }

    if (formData.newPassword.length < 6) {
      setError('Mật khẩu mới phải có ít nhất 6 ký tự')
      return false
    }

    // Kiểm tra mật khẩu mới không trùng mật khẩu cũ
    if (formData.oldPassword === formData.newPassword) {
      setError('Mật khẩu mới không được trùng với mật khẩu cũ')
      return false
    }

    // Kiểm tra xác nhận mật khẩu
    if (!formData.confirmPassword) {
      setError('Vui lòng xác nhận lại mật khẩu mới')
      return false
    }

    if (formData.newPassword !== formData.confirmPassword) {
      setError('Mật khẩu xác nhận không khớp')
      return false
    }

    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess(false)

    if (!validateForm()) {
      return
    }

    setLoading(true)

    try {
      const response = await apiClient.post('/api/auth/change-password', {
        oldPassword: formData.oldPassword,
        newPassword: formData.newPassword,
      })

      if (response.data.success) {
        setSuccess(true)
        toast.success('Đổi mật khẩu thành công!')
        // Reset form
        setFormData({
          oldPassword: '',
          newPassword: '',
          confirmPassword: '',
        })
        // Auto close after 2 seconds
        setTimeout(() => {
          onSuccess()
        }, 2000)
      } else {
        const errorMsg = response.data.message || 'Đổi mật khẩu thất bại'
        setError(errorMsg)
        toast.error(errorMsg)
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || 'Lỗi khi đổi mật khẩu'
      setError(errorMsg)
      toast.error(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  const togglePasswordVisibility = (field: keyof typeof showPasswords) => {
    setShowPasswords({
      ...showPasswords,
      [field]: !showPasswords[field],
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
          <CheckCircle className="w-5 h-5 flex-shrink-0" />
          <span>Đổi mật khẩu thành công! Đang đóng...</span>
        </div>
      )}

      <div className="space-y-4">
        {/* Mật khẩu cũ */}
        <div>
          <label htmlFor="oldPassword" className="block text-sm font-medium text-gray-700 mb-2">
            Mật khẩu cũ <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              id="oldPassword"
              name="oldPassword"
              type={showPasswords.oldPassword ? 'text' : 'password'}
              value={formData.oldPassword}
              onChange={handleChange}
              required
              className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
              placeholder="Nhập mật khẩu cũ"
            />
            <button
              type="button"
              onClick={() => togglePasswordVisibility('oldPassword')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPasswords.oldPassword ? (
                <EyeOff className="w-5 h-5" />
              ) : (
                <Eye className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>

        {/* Mật khẩu mới */}
        <div>
          <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-2">
            Mật khẩu mới <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              id="newPassword"
              name="newPassword"
              type={showPasswords.newPassword ? 'text' : 'password'}
              value={formData.newPassword}
              onChange={handleChange}
              required
              minLength={6}
              className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
              placeholder="Nhập mật khẩu mới (tối thiểu 6 ký tự)"
            />
            <button
              type="button"
              onClick={() => togglePasswordVisibility('newPassword')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPasswords.newPassword ? (
                <EyeOff className="w-5 h-5" />
              ) : (
                <Eye className="w-5 h-5" />
              )}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">Mật khẩu mới phải có ít nhất 6 ký tự và không được trùng với mật khẩu cũ</p>
        </div>

        {/* Xác nhận mật khẩu mới */}
        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
            Xác nhận mật khẩu mới <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              id="confirmPassword"
              name="confirmPassword"
              type={showPasswords.confirmPassword ? 'text' : 'password'}
              value={formData.confirmPassword}
              onChange={handleChange}
              required
              minLength={6}
              className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
              placeholder="Nhập lại mật khẩu mới"
            />
            <button
              type="button"
              onClick={() => togglePasswordVisibility('confirmPassword')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPasswords.confirmPassword ? (
                <EyeOff className="w-5 h-5" />
              ) : (
                <Eye className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="flex justify-end space-x-4 pt-4 border-t">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading || success}
          className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Hủy
        </button>
        <button
          type="submit"
          disabled={loading || success}
          className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Đang xử lý...' : success ? 'Thành công!' : 'Đổi mật khẩu'}
        </button>
      </div>
    </form>
  )
}






