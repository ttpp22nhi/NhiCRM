import axios from 'axios'

let _currentUser: { role?: string; tenant_id?: string | null } | null = null

export function setApiUser(u: { role?: string; tenant_id?: string | null } | null) {
  _currentUser = u
}

export const apiClient = axios.create({
  baseURL: '',
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
})

apiClient.interceptors.request.use((config) => {
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    const h = config.headers
    if (h && typeof (h as { delete?: (key: string) => void }).delete === 'function') {
      ;(h as { delete: (key: string) => void }).delete('Content-Type')
    } else if (h && typeof h === 'object') {
      delete (h as Record<string, unknown>)['Content-Type']
      delete (h as Record<string, unknown>)['content-type']
    }
  }
  if (_currentUser?.role === 'super_admin' && _currentUser?.tenant_id) {
    config.headers['X-Tenant-Id'] = _currentUser.tenant_id
  }
  return config
})

const JWT_INVALID_MESSAGE = 'Mã xác thực không hợp lệ hoặc đã hết hạn.'

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status
    const reqUrl = String(error.config?.url || '')
    const isAuthApiCall = reqUrl.includes('/api/auth/login') || reqUrl.includes('/api/auth/me')

    if (isAuthApiCall) {
      return Promise.reject(error)
    }

    if (status === 401 || status === 403) {
      if (typeof window !== 'undefined') {
        const isLoginPage = window.location.pathname === '/login'
        const message = error.response?.data?.message || ''
        const isJwtExpiredOrInvalid =
          status === 403 && (message === JWT_INVALID_MESSAGE || message.includes('Mã xác thực không hợp lệ'))

        const isRequireTenant = /Yêu cầu đăng nhập trong phạm vi một công ty|tenant/i.test(message)
        const isSuperAdminNoTenant = _currentUser?.role === 'super_admin' && isRequireTenant
        const isAlreadyOnTenantsPage = window.location.pathname.startsWith('/system/tenants')

        if (!isLoginPage) {
          if (isJwtExpiredOrInvalid || status === 401) {
            _currentUser = null
            try { sessionStorage.removeItem('_crm_u') } catch {}
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
