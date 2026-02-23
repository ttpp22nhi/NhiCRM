'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Link from 'next/link'
import Image from 'next/image'
import { LogIn, User, Lock, AlertCircle, Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'

const REMEMBER_KEY = 'login_remember_me'
const REMEMBER_USERNAME_KEY = 'login_remember_username'
const REMEMBER_DOMAIN_KEY = 'login_remember_domain'
const REMEMBER_PASSWORD_KEY = 'login_remember_password'

function getStored(key: string): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(key) || ''
}

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [domain, setDomain] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)

  // Khôi phục thông tin đã lưu (localStorage) hoặc session (sessionStorage) khi load trang
  useEffect(() => {
    const savedRemember = getStored(REMEMBER_KEY) === '1'
    setRememberMe(savedRemember)
    if (savedRemember) {
      const savedUsername = getStored(REMEMBER_USERNAME_KEY)
      const savedDomain = getStored(REMEMBER_DOMAIN_KEY)
      const savedPassword = getStored(REMEMBER_PASSWORD_KEY)
      if (savedUsername) setUsername(savedUsername)
      if (savedDomain) setDomain(savedDomain)
      if (savedPassword) setPassword(savedPassword)
    } else {
      const sessionUser = typeof window !== 'undefined' ? sessionStorage.getItem('login_username') : null
      if (sessionUser) setUsername(sessionUser)
    }
  }, [])

  // Đồng bộ username vào sessionStorage khi đang không dùng "ghi nhớ" (để tránh mất dữ liệu khi refresh)
  useEffect(() => {
    if (typeof window === 'undefined' || rememberMe) return
    if (username) sessionStorage.setItem('login_username', username)
  }, [username, rememberMe])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation() // Ngăn chặn event bubbling
    
    // Lưu giá trị hiện tại vào biến để đảm bảo không bị mất
    const currentUsername = username
    const currentPassword = password
    const currentDomain = domain.trim() || undefined
    
    setError('')
    setLoading(true)

    try {
      await login(currentUsername, currentPassword, currentDomain)
      sessionStorage.removeItem('login_username')
      if (rememberMe) {
        localStorage.setItem(REMEMBER_KEY, '1')
        localStorage.setItem(REMEMBER_USERNAME_KEY, currentUsername)
        localStorage.setItem(REMEMBER_DOMAIN_KEY, domain.trim())
        localStorage.setItem(REMEMBER_PASSWORD_KEY, currentPassword)
      } else {
        localStorage.setItem(REMEMBER_KEY, '0')
        localStorage.removeItem(REMEMBER_USERNAME_KEY)
        localStorage.removeItem(REMEMBER_DOMAIN_KEY)
        localStorage.removeItem(REMEMBER_PASSWORD_KEY)
      }
      toast.success('Đăng nhập thành công!')
      // Super Admin không có tenant_id → vào trang Hệ thống (quản lý tenants)
      const storedUser = localStorage.getItem('user')
      const parsed = storedUser ? JSON.parse(storedUser) : null
      if (parsed?.role === 'super_admin' && (parsed?.tenant_id == null || parsed?.tenant_id === '')) {
        router.push('/system/tenants')
      } else {
        router.push('/dashboard')
      }
    } catch (err: any) {
      const errorMessage = err.message || 'Đăng nhập thất bại'
      setUsername(currentUsername)
      setPassword(currentPassword)
      setError(errorMessage)
      
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
            <label htmlFor="domain" className="block text-sm font-medium text-gray-700 mb-2">
              Domain công ty <span className="text-gray-400 font-normal">(tùy chọn)</span>
            </label>
            <div className="relative">
              <input
                id="domain"
                type="text"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                className="w-full pl-4 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
                placeholder="VD: cong-ty-abc (dành cho Admin công ty con)"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">Nếu bạn là Admin công ty con, nhập domain công ty (xem tại Hệ thống → Quản lý công ty).</p>
          </div>

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

          <div className="flex items-center">
            <input
              id="remember"
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <label htmlFor="remember" className="ml-2 text-sm text-gray-700">
              Ghi nhớ thông tin đăng nhập (domain, tên đăng nhập, mật khẩu) — lưu trên thiết bị này
            </label>
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


