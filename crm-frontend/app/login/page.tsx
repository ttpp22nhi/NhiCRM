'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Link from 'next/link'
import Image from 'next/image'
import { LogIn, User, Lock, AlertCircle, Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  
  // Khôi phục giá trị từ sessionStorage nếu có (để tránh mất dữ liệu khi refresh)
  useEffect(() => {
    const savedUsername = sessionStorage.getItem('login_username')
    if (savedUsername) {
      setUsername(savedUsername)
    }
  }, [])
  
  // Lưu username vào sessionStorage khi thay đổi
  useEffect(() => {
    if (username) {
      sessionStorage.setItem('login_username', username)
    }
  }, [username])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation() // Ngăn chặn event bubbling
    
    // Lưu giá trị hiện tại vào biến để đảm bảo không bị mất
    const currentUsername = username
    const currentPassword = password
    
    setError('')
    setLoading(true)

    try {
      await login(currentUsername, currentPassword)
      // Xóa sessionStorage khi đăng nhập thành công
      sessionStorage.removeItem('login_username')
      toast.success('Đăng nhập thành công!')
      router.push('/dashboard')
    } catch (err: any) {
      const errorMessage = err.message || 'Đăng nhập thất bại'
      
      // Đảm bảo giữ nguyên giá trị form
      setUsername(currentUsername)
      setPassword(currentPassword)
      
      // Set error state
      setError(errorMessage)
      
      // Dismiss toast cũ nếu có (tránh duplicate)
      toast.dismiss('login-error')
      
      // Hiển thị toast ngay lập tức - không cần delay
      // Toast với duration rất dài (20000ms = 20 giây) để đảm bảo user có đủ thời gian đọc
      // Hiển thị ở top-center với style nổi bật
      toast.error(
        `⚠️ Đăng nhập thất bại\n${errorMessage}`,
        {
          id: 'login-error', // ID cố định để tránh duplicate
          duration: 5000, // 20 giây - rất dài để user có đủ thời gian đọc
          position: 'top-center',
          style: {
            background: '#fee2e2',
            color: '#991b1b',
            border: '3px solid #dc2626',
            padding: '20px 24px',
            fontSize: '18px',
            fontWeight: '700',
            borderRadius: '12px',
            boxShadow: '0 10px 40px rgba(220, 38, 38, 0.5)',
            minWidth: '450px',
            maxWidth: '600px',
            zIndex: 99999,
            whiteSpace: 'pre-line', // Cho phép xuống dòng
            lineHeight: '1.6',
          },
          icon: '⚠️',
          ariaProps: {
            role: 'alert',
            'aria-live': 'assertive',
          },
        }
      )
      
      // KHÔNG reset form - giữ nguyên TẤT CẢ thông tin (username và password)
      // Chỉ focus vào password field để user có thể sửa lại nếu cần
      setTimeout(() => {
        const passwordInput = document.getElementById('password') as HTMLInputElement
        if (passwordInput) {
          passwordInput.focus()
          // Select text để user dễ xóa và nhập lại nếu muốn
          passwordInput.select()
        }
      }, 300)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-6">
            <Image
              src="/logo-mobifone.png"
              alt="MobiFone Logo"
              width={240}
              height={240}
              className="object-contain"
              priority
            />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Đăng nhập</h1>
          <p className="text-gray-600 mt-2">Hệ thống CRM MobiFone</p>
        </div>


        <form ref={formRef} onSubmit={handleSubmit} className="space-y-6" noValidate>
          {error && (
            <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4 flex items-start gap-3 text-red-700 animate-in fade-in slide-in-from-top-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-600" />
              <div className="flex-1">
                <p className="text-sm font-semibold mb-1 text-red-900">Đăng nhập thất bại</p>
                <p className="text-sm">{error}</p>
              </div>
            </div>
          )}

          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
              Tên đăng nhập
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
                placeholder="Nhập tên đăng nhập"
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              Mật khẩu
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
                placeholder="Nhập mật khẩu"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition focus:outline-none"
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              >
                {showPassword ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary-600 text-white py-3 rounded-lg font-semibold hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-gray-600 text-sm">
            Liên hệ quản trị viên để được cấp tài khoản
          </p>
        </div>
      </div>
    </div>
  )
}


