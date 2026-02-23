import axios from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request: Super Admin đã chọn tenant thì gửi X-Tenant-Id để backend dùng
apiClient.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('user')
      if (stored) {
        const u = JSON.parse(stored)
        if (u?.role === 'super_admin' && u?.tenant_id) {
          config.headers['X-Tenant-Id'] = u.tenant_id
        }
      }
    } catch (_) {}
  }
  return config
})

// Interceptor để xử lý lỗi 401/403
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      if (typeof window !== 'undefined') {
        const isLoginPage = window.location.pathname === '/login'
        const message = error.response?.data?.message || ''
        const isRequireTenant = /Yêu cầu đăng nhập trong phạm vi một công ty|tenant/i.test(message)
        const storedUser = localStorage.getItem('user')
        let userRole: string | null = null
        try {
          if (storedUser) userRole = JSON.parse(storedUser)?.role ?? null
        } catch (_) {}
        const isSuperAdminNoTenant = userRole === 'super_admin' && isRequireTenant
        const isAlreadyOnTenantsPage = typeof window !== 'undefined' && window.location.pathname.startsWith('/system/tenants')

        if (!isLoginPage) {
          if (isSuperAdminNoTenant && !isAlreadyOnTenantsPage) {
            // Super Admin không có tenant: chuyển sang trang Hệ thống, không xóa token
            // Tránh redirect nếu đang ở /system/tenants để không gây vòng lặp reload (vd. NotificationBell gọi API cần tenant)
            window.location.href = '/system/tenants'
          } else if (!isSuperAdminNoTenant) {
            localStorage.removeItem('token')
            localStorage.removeItem('user')
            window.location.href = '/login'
          }
        }
      }
    }
    return Promise.reject(error)
  }
)

















