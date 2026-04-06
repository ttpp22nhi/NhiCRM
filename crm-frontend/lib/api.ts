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

// Interceptor xử lý auth:
// - 401: token hết hạn/không hợp lệ -> đăng xuất về login
// - 403: không đủ quyền -> không tự logout (tránh đá văng sai ngữ cảnh)
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      if (typeof window !== 'undefined') {
        const isLoginPage = window.location.pathname === '/login'
        const message = error.response?.data?.message || ''
        const isRequireTenant = /Yêu cầu đăng nhập trong phạm vi một công ty|tenant/i.test(message)
        const status = error.response?.status
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
          } else if (!isSuperAdminNoTenant && status === 401) {
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

















