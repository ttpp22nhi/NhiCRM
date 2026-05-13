'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { apiClient, setApiUser } from '@/lib/api'

type RoleType = 'super_admin' | 'admin' | 'director' | 'manager' | 'leader' | 'sales'

interface User {
  id: string
  username: string
  full_name: string
  email?: string
  role: RoleType
  tenant_id?: string | null
}

interface RegisterOptions {
  role?: string
  department_id?: string
  title?: string
  rank?: string
  territory?: string
  phone?: string
}

interface AuthContextType {
  user: User | null
  token: string | null
  loading: boolean
  login: (username: string, password: string, domain?: string) => Promise<User>
  register: (username: string, password: string, full_name: string, email: string, options?: RegisterOptions) => Promise<void>
  logout: () => void
  switchTenant: (tenantId: string | null) => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const SESSION_USER_KEY = '_crm_u'

function cacheUser(u: User | null) {
  try {
    if (u) sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(u))
    else sessionStorage.removeItem(SESSION_USER_KEY)
  } catch {}
}

function getCachedUser(): User | null {
  try {
    const raw = sessionStorage.getItem(SESSION_USER_KEY)
    return raw ? (JSON.parse(raw) as User) : null
  } catch { return null }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const applyUser = useCallback((u: User | null) => {
    setUser(u)
    setApiUser(u ? { role: u.role, tenant_id: u.tenant_id } : null)
    setToken(u ? 'httpOnly' : null)
    cacheUser(u)
  }, [])

  useEffect(() => {
    localStorage.removeItem('user')

    const cached = getCachedUser()
    if (cached) {
      applyUser(cached)
      setLoading(false)
      return
    }

    apiClient.get('/api/auth/me')
      .then((res) => {
        if (res.data.success && res.data.user) applyUser(res.data.user as User)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [applyUser])

  const login = async (username: string, password: string, domain?: string) => {
    try {
      const usernameTrim = String(username ?? '').trim()
      const response = await apiClient.post('/api/auth/login', {
        username: usernameTrim,
        password,
        ...(domain && domain.trim() ? { domain: domain.trim() } : {}),
      })

      if (response.data.success) {
        const { employee } = response.data
        const userData: User = {
          id: employee.id,
          username: employee.username,
          full_name: employee.full_name,
          email: employee.email,
          role: employee.role,
          tenant_id: employee.tenant_id ?? null,
        }
        applyUser(userData)
        return userData
      } else {
        throw new Error(response.data.message || 'Đăng nhập thất bại')
      }
    } catch (error: any) {
      let message = 'Đăng nhập thất bại'

      if (error.response) {
        if (error.response.status === 401) {
          message = error.response.data?.message || 'Tên đăng nhập hoặc mật khẩu không đúng'
        } else if (error.response.status === 403) {
          message = error.response.data?.message || 'Tài khoản không có quyền truy cập'
        } else {
          message = error.response.data?.message || 'Đăng nhập thất bại'
        }
      } else if (error.request) {
        message = 'Không thể kết nối đến server. Vui lòng kiểm tra lại kết nối mạng hoặc đảm bảo backend đang chạy.'
      } else {
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
    options?: RegisterOptions
  ) => {
    try {
      const response = await apiClient.post('/api/auth/register', {
        username: String(username ?? '').trim(),
        password,
        full_name,
        email,
        role: options?.role || 'sales',
        department_id: options?.department_id || undefined,
        title: options?.title || undefined,
        rank: options?.rank || undefined,
        territory: options?.territory || undefined,
        phone: options?.phone || undefined
      })

      if (!response.data.success) {
        throw new Error(response.data.message || 'Đăng ký thất bại')
      }
    } catch (error: any) {
      const message = error.response?.data?.message || error.message || 'Đăng ký thất bại'
      throw new Error(message)
    }
  }

  const logout = async () => {
    try {
      await apiClient.post('/api/auth/logout')
    } catch (_) {}
    applyUser(null)
  }

  const switchTenant = (tenantId: string | null) => {
    if (!user || user.role !== 'super_admin') return
    const next: User = { ...user, tenant_id: tenantId ?? undefined }
    applyUser(next)
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, switchTenant }}>
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
