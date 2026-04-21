import axios from 'axios'

// Trên trình duyệt: dùng cùng host với trang (port 3000) — dù domain hay IP đều gọi đúng backend.
// Set NEXT_PUBLIC_API_URL trong .env.local nếu muốn cố định URL API (vd. production).
function getApiBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL
  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location
    return `${protocol}//${hostname}:3000`
  }
  return 'http://localhost:3000'
}

const API_URL = getApiBaseUrl()

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request: luôn gắn token từ localStorage (tránh race khi reload: request gửi trước khi AuthContext restore xong)
// và Super Admin đã chọn tenant thì gửi X-Tenant-Id
apiClient.interceptors.request.use((config) => {
  // FormData: bắt buộc bỏ Content-Type mặc định (application/json) để axios/gửi đúng multipart + boundary — nếu không multer không thấy file.
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    const h = config.headers
    if (h && typeof (h as { delete?: (key: string) => void }).delete === 'function') {
      ;(h as { delete: (key: string) => void }).delete('Content-Type')
    } else if (h && typeof h === 'object') {
      delete (h as Record<string, unknown>)['Content-Type']
      delete (h as Record<string, unknown>)['content-type']
    }
  }
  if (typeof window !== 'undefined') {
    try {
      const storedToken = localStorage.getItem('token')
      if (storedToken) {
        config.headers.Authorization = `Bearer ${storedToken}`
      }
      const storedUser = localStorage.getItem('user')
      if (storedUser) {
        const u = JSON.parse(storedUser)
        if (u?.role === 'super_admin' && u?.tenant_id) {
          config.headers['X-Tenant-Id'] = u.tenant_id
        }
      }
    } catch (_) {}
  }
  return config
})

/** Khớp middleware verifyToken khi jwt.verify thất bại (hết hạn / sai ký). */
const JWT_INVALID_MESSAGE = 'Mã xác thực không hợp lệ hoặc đã hết hạn.'

// Interceptor xử lý auth:
// - 401: thiếu token / từ chối -> về login (trừ POST /api/auth/login)
// - 403: backend dùng cho JWT hết hạn trong verifyToken — cũng về login; 403 khác (quyền, tenant…) không logout
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status
    const reqUrl = String(error.config?.url || '')
    const isLoginApiCall = reqUrl.includes('/api/auth/login')

    if (isLoginApiCall) {
      return Promise.reject(error)
    }

    if (status === 401 || status === 403) {
      if (typeof window !== 'undefined') {
        const isLoginPage = window.location.pathname === '/login'
        const message = error.response?.data?.message || ''
        const isJwtExpiredOrInvalid =
          status === 403 && (message === JWT_INVALID_MESSAGE || message.includes('Mã xác thực không hợp lệ'))

        const isRequireTenant = /Yêu cầu đăng nhập trong phạm vi một công ty|tenant/i.test(message)
        const storedUser = localStorage.getItem('user')
        let userRole: string | null = null
        try {
          if (storedUser) userRole = JSON.parse(storedUser)?.role ?? null
        } catch (_) {}
        const isSuperAdminNoTenant = userRole === 'super_admin' && isRequireTenant
        const isAlreadyOnTenantsPage = window.location.pathname.startsWith('/system/tenants')

        if (!isLoginPage) {
          if (isJwtExpiredOrInvalid || status === 401) {
            localStorage.removeItem('token')
            localStorage.removeItem('user')
            delete apiClient.defaults.headers.common['Authorization']
            window.location.href = '/login'
            return Promise.reject(error)
          }

          if (isSuperAdminNoTenant && !isAlreadyOnTenantsPage) {
            window.location.href = '/system/tenants'
          }
        }
      }
    }
    return Promise.reject(error)
  }
)

















