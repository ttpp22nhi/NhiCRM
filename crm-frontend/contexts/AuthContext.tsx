'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { apiClient } from '@/lib/api'

interface User {
  id: string
  username: string
  full_name: string
  email?: string
  role: 'admin' | 'sales' | 'manager'
}

interface AuthContextType {
  user: User | null
  token: string | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  register: (username: string, password: string, full_name: string, email: string, role?: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Kiểm tra token trong localStorage khi app khởi động
    const storedToken = localStorage.getItem('token')
    const storedUser = localStorage.getItem('user')
    
    if (storedToken && storedUser) {
      setToken(storedToken)
      setUser(JSON.parse(storedUser))
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`
    }
    setLoading(false)
  }, [])

  const login = async (username: string, password: string) => {
    try {
      const response = await apiClient.post('/api/auth/login', {
        username,
        password,
      })

      if (response.data.success) {
        const { token: newToken, employee } = response.data
        const userData: User = {
          id: employee.id,
          username: employee.username,
          full_name: employee.full_name,
          email: employee.email,
          role: employee.role,
        }

        setToken(newToken)
        setUser(userData)
        localStorage.setItem('token', newToken)
        localStorage.setItem('user', JSON.stringify(userData))
        apiClient.defaults.headers.common['Authorization'] = `Bearer ${newToken}`
      } else {
        throw new Error(response.data.message || 'Đăng nhập thất bại')
      }
    } catch (error: any) {
      // Xử lý các loại lỗi khác nhau
      let message = 'Đăng nhập thất bại'
      
      if (error.response) {
        // Lỗi từ server (có response)
        message = error.response.data?.message || 'Đăng nhập thất bại'
      } else if (error.request) {
        // Request đã được gửi nhưng không nhận được response (backend không chạy hoặc network error)
        message = 'Không thể kết nối đến server. Vui lòng kiểm tra lại kết nối mạng hoặc đảm bảo backend đang chạy.'
      } else {
        // Lỗi khác
        message = error.message || 'Đăng nhập thất bại'
      }
      
      throw new Error(message)
    }
  }

  const register = async (
    username: string,
    password: string,
    full_name: string,
    email: string,
    role: string = 'sales'
  ) => {
    try {
      const response = await apiClient.post('/api/auth/register', {
        username,
        password,
        full_name,
        email,
        role,
      })

      if (!response.data.success) {
        throw new Error(response.data.message || 'Đăng ký thất bại')
      }
    } catch (error: any) {
      const message = error.response?.data?.message || error.message || 'Đăng ký thất bại'
      throw new Error(message)
    }
  }

  const logout = () => {
    setToken(null)
    setUser(null)
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    delete apiClient.defaults.headers.common['Authorization']
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}




