'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Image from 'next/image'
import { LogOut, Users, LayoutDashboard, User, ChevronDown, UserCircle, Key, CheckSquare, FileText, Menu, X, Building2, Shield, ArrowRightLeft, GitBranch, Settings } from 'lucide-react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { NotificationBell } from './NotificationBell'
import { SubscriptionBanner } from './SubscriptionBanner'
import { isTenantAdmin, isExecutive, isTransferApprover, canOpenAdminSection } from '@/lib/rbac'

export function Navbar() {
  const { user, logout } = useAuth()
  const router = useRouter()
  const [showDropdown, setShowDropdown] = useState(false)
  const [showAdminMenu, setShowAdminMenu] = useState(false)
  const [showBizMenu, setShowBizMenu] = useState(false)
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const adminMenuRef = useRef<HTMLDivElement>(null)
  const bizMenuRef = useRef<HTMLDivElement>(null)
  const mobileMenuRef = useRef<HTMLDivElement>(null)

  const handleLogout = () => {
    logout()
    toast.success('Đã đăng xuất thành công!')
    router.push('/login')
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (dropdownRef.current && !dropdownRef.current.contains(target)) setShowDropdown(false)
      if (adminMenuRef.current && !adminMenuRef.current.contains(target)) setShowAdminMenu(false)
      if (bizMenuRef.current && !bizMenuRef.current.contains(target)) setShowBizMenu(false)
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(target)) setShowMobileMenu(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const getRoleLabel = (role?: string) => {
    switch (role) {
      case 'super_admin':
        return 'Super Admin'
      case 'admin':
        return 'Admin'
      case 'director':
        return 'Giám đốc'
      case 'manager':
        return 'Quản lý'
      case 'leader':
        return 'Tổ trưởng'
      case 'sales':
        return 'Sales'
      default:
        return 'User'
    }
  }

  /** Super Admin chưa chọn công ty: chỉ dùng được Hệ thống → Tenants; vào công ty xong mới thấy đủ menu. */
  const isSuperAdminNoTenant = user?.role === 'super_admin' && (user?.tenant_id == null || user?.tenant_id === '')
  const canOpenAdminMenu =
    !!user?.role && canOpenAdminSection(user.role) && !isSuperAdminNoTenant

  const getRoleColor = (role?: string) => {
    switch (role) {
      case 'super_admin':
        return 'bg-red-100 text-red-700'
      case 'admin':
        return 'bg-purple-100 text-purple-700'
      case 'director':
        return 'bg-indigo-100 text-indigo-700'
      case 'manager':
        return 'bg-indigo-100 text-indigo-700'
      case 'leader':
        return 'bg-cyan-100 text-cyan-700'
      case 'sales':
        return 'bg-blue-100 text-blue-700'
      default:
        return 'bg-gray-100 text-gray-700'
    }
  }

  return (
    <>
      <SubscriptionBanner />
      <nav className="bg-white shadow-md border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link href={isSuperAdminNoTenant ? '/system/tenants' : '/dashboard'} className="flex items-center space-x-3">
              <Image
                src="/logo-mobifone.png"
                alt="MobiFone Logo"
                width={150}
                height={60}
                className="object-contain"
                priority
              />
              {/* <span className="text-xl font-bold text-gray-900 hidden sm:block">CRM MobiFone</span> */}
            </Link>
            {/* Desktop Menu */}
            <div className="hidden md:flex md:ml-10 md:items-center md:space-x-1">
              {!isSuperAdminNoTenant && (
                <>
              <Link
                href="/dashboard"
                className="text-gray-700 hover:text-primary-600 hover:bg-gray-50 px-3 py-2 rounded-md text-sm font-medium transition"
              >
                Dashboard
              </Link>

              {/* Nghiệp vụ - sub-menu */}
              <div className="relative" ref={bizMenuRef}>
                <button
                  onClick={() => { setShowBizMenu(!showBizMenu); setShowAdminMenu(false) }}
                  className="flex items-center gap-1 text-gray-700 hover:text-primary-600 hover:bg-gray-50 px-3 py-2 rounded-md text-sm font-medium transition"
                >
                  Nghiệp vụ
                  <ChevronDown className={`w-4 h-4 transition-transform ${showBizMenu ? 'rotate-180' : ''}`} />
                </button>
                {showBizMenu && (
                  <div className="absolute left-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                    <Link href="/customers" onClick={() => setShowBizMenu(false)} className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                      <Users className="w-4 h-4" />
                      Khách hàng
                    </Link>
                    <Link href="/deals" onClick={() => setShowBizMenu(false)} className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                      <FileText className="w-4 h-4" />
                      Cơ hội
                    </Link>
                    <Link href="/tasks" onClick={() => setShowBizMenu(false)} className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                      <CheckSquare className="w-4 h-4" />
                      Công việc
                    </Link>
                  </div>
                )}
              </div>
                </>
              )}

              {/* Hệ thống - chỉ Super Admin (quản lý tenants) */}
              {user?.role === 'super_admin' && (
                <Link
                  href="/system/tenants"
                  className="flex items-center gap-1 text-gray-700 hover:text-primary-600 hover:bg-gray-50 px-3 py-2 rounded-md text-sm font-medium transition"
                >
                  <Settings className="w-4 h-4" />
                  Hệ thống
                </Link>
              )}

              {/* Quản trị - sub-menu (admin/super_admin) - ẩn khi super_admin chưa chọn tenant */}
              {canOpenAdminMenu && (
                <div className="relative" ref={adminMenuRef}>
                  <button
                    onClick={() => { setShowAdminMenu(!showAdminMenu); setShowBizMenu(false) }}
                    className="flex items-center gap-1 text-gray-700 hover:text-primary-600 hover:bg-gray-50 px-3 py-2 rounded-md text-sm font-medium transition"
                  >
                    Quản trị
                    <ChevronDown className={`w-4 h-4 transition-transform ${showAdminMenu ? 'rotate-180' : ''}`} />
                  </button>
                  {showAdminMenu && (
                    <div className="absolute left-0 mt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                      {isTenantAdmin(user?.role) && (
                        <>
                          <Link href="/organization-structure" onClick={() => setShowAdminMenu(false)} className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                            <GitBranch className="w-4 h-4" />
                            Cây cấu trúc công ty
                          </Link>
                          <Link href="/organization" onClick={() => setShowAdminMenu(false)} className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                            <Building2 className="w-4 h-4" />
                            Quản lý tổ chức
                          </Link>
                          <Link href="/permissions" onClick={() => setShowAdminMenu(false)} className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                            <Shield className="w-4 h-4" />
                            Phân quyền
                          </Link>
                        </>
                      )}
                      {isExecutive(user?.role) && (
                        <Link href="/employees" onClick={() => setShowAdminMenu(false)} className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                          <Users className="w-4 h-4" />
                          Nhân viên
                        </Link>
                      )}
                      {isTransferApprover(user?.role) && (
                        <Link href="/transfers" onClick={() => setShowAdminMenu(false)} className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                          <ArrowRightLeft className="w-4 h-4" />
                          Quản lý chuyển giao
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-4">
            {/* Mobile menu button */}
            <button
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              className="md:hidden p-2 rounded-md text-gray-700 hover:text-primary-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
              aria-label="Toggle menu"
            >
              {showMobileMenu ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>

            {/* Notification Bell - ẩn khi super_admin chưa chọn tenant (API cần tenant) */}
            {!isSuperAdminNoTenant && <NotificationBell />}
            
            {/* User Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowDropdown(!showDropdown)}
                className="flex items-center space-x-2 text-sm text-gray-700 hover:text-primary-600 px-3 py-2 rounded-md transition focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <div className="flex items-center space-x-2">
                  <div className="flex-shrink-0 h-8 w-8 bg-primary-100 rounded-full flex items-center justify-center">
                    <span className="text-primary-600 font-semibold text-sm">
                      {user?.full_name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="hidden md:block text-left">
                    <div className="font-medium">{user?.full_name}</div>
                    <div className="text-xs text-gray-500">{getRoleLabel(user?.role)}</div>
                  </div>
                </div>
                <ChevronDown className={`w-4 h-4 transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown Menu */}
              {showDropdown && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                  <div className="px-4 py-3 border-b border-gray-200">
                    <p className="text-sm font-medium text-gray-900">{user?.full_name}</p>
                    <p className="text-xs text-gray-500 truncate">@{user?.username}</p>
                    <span className={`mt-1 inline-block px-2 py-0.5 text-xs font-semibold rounded ${getRoleColor(user?.role)}`}>
                      {getRoleLabel(user?.role)}
                    </span>
                  </div>
                  
                  {!isSuperAdminNoTenant && (
                    <>
                  <Link
                    href="/profile"
                    onClick={() => setShowDropdown(false)}
                    className="flex items-center space-x-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition"
                  >
                    <UserCircle className="w-4 h-4" />
                    <span>Trang cá nhân</span>
                  </Link>
                  
                  <Link
                    href="/profile"
                    onClick={() => {
                      setShowDropdown(false)
                      // Scroll to change password section
                      setTimeout(() => {
                        const changePasswordBtn = document.querySelector('[data-change-password]')
                        if (changePasswordBtn) {
                          (changePasswordBtn as HTMLElement).click()
                        }
                      }, 100)
                    }}
                    className="flex items-center space-x-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition"
                  >
                    <Key className="w-4 h-4" />
                    <span>Đổi mật khẩu</span>
                  </Link>
                  
                  <div className="border-t border-gray-200 my-1"></div>
                    </>
                  )}
                  
                  <button
                    onClick={() => {
                      setShowDropdown(false)
                      handleLogout()
                    }}
                    className="flex items-center space-x-2 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Đăng xuất</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {showMobileMenu && (
          <div ref={mobileMenuRef} className="md:hidden border-t border-gray-200">
            <div className="px-2 pt-2 pb-3 space-y-1">
              {!isSuperAdminNoTenant && (
                <>
              <Link
                href="/dashboard"
                onClick={() => setShowMobileMenu(false)}
                className="flex items-center space-x-2 text-gray-700 hover:text-primary-600 hover:bg-gray-100 px-3 py-2 rounded-md text-base font-medium transition"
              >
                <LayoutDashboard className="w-5 h-5" />
                <span>Dashboard</span>
              </Link>
              <div className="border-t border-gray-100 pt-2">
                <p className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">Nghiệp vụ</p>
                <Link href="/customers" onClick={() => setShowMobileMenu(false)} className="flex items-center space-x-2 text-gray-700 hover:bg-gray-100 px-3 py-2 rounded-md ml-2">
                  <Users className="w-5 h-5" />
                  <span>Khách hàng</span>
                </Link>
                <Link href="/deals" onClick={() => setShowMobileMenu(false)} className="flex items-center space-x-2 text-gray-700 hover:bg-gray-100 px-3 py-2 rounded-md ml-2">
                  <FileText className="w-5 h-5" />
                  <span>Cơ hội</span>
                </Link>
                <Link href="/tasks" onClick={() => setShowMobileMenu(false)} className="flex items-center space-x-2 text-gray-700 hover:bg-gray-100 px-3 py-2 rounded-md ml-2">
                  <CheckSquare className="w-5 h-5" />
                  <span>Công việc</span>
                </Link>
              </div>
                </>
              )}
              {user?.role === 'super_admin' && (
                <div className="border-t border-gray-100 pt-2">
                  <p className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">Hệ thống</p>
                  <Link href="/system/tenants" onClick={() => setShowMobileMenu(false)} className="flex items-center space-x-2 text-gray-700 hover:bg-gray-100 px-3 py-2 rounded-md ml-2">
                    <Settings className="w-5 h-5" />
                    <span>Quản lý công ty (Tenants)</span>
                  </Link>
                </div>
              )}
              {canOpenAdminMenu && (
                <div className="border-t border-gray-100 pt-2">
                  <p className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">Quản trị</p>
                  {isTenantAdmin(user?.role) && (
                    <>
                      <Link href="/organization-structure" onClick={() => setShowMobileMenu(false)} className="flex items-center space-x-2 text-gray-700 hover:bg-gray-100 px-3 py-2 rounded-md ml-2">
                        <GitBranch className="w-5 h-5" />
                        <span>Cây cấu trúc công ty</span>
                      </Link>
                      <Link href="/organization" onClick={() => setShowMobileMenu(false)} className="flex items-center space-x-2 text-gray-700 hover:bg-gray-100 px-3 py-2 rounded-md ml-2">
                        <Building2 className="w-5 h-5" />
                        <span>Quản lý tổ chức</span>
                      </Link>
                      <Link href="/permissions" onClick={() => setShowMobileMenu(false)} className="flex items-center space-x-2 text-gray-700 hover:bg-gray-100 px-3 py-2 rounded-md ml-2">
                        <Shield className="w-5 h-5" />
                        <span>Phân quyền</span>
                      </Link>
                    </>
                  )}
                  {isExecutive(user?.role) && (
                    <Link href="/employees" onClick={() => setShowMobileMenu(false)} className="flex items-center space-x-2 text-gray-700 hover:bg-gray-100 px-3 py-2 rounded-md ml-2">
                      <Users className="w-5 h-5" />
                      <span>Nhân viên</span>
                    </Link>
                  )}
                  {isTransferApprover(user?.role) && (
                    <Link href="/transfers" onClick={() => setShowMobileMenu(false)} className="flex items-center space-x-2 text-gray-700 hover:bg-gray-100 px-3 py-2 rounded-md ml-2">
                      <ArrowRightLeft className="w-5 h-5" />
                      <span>Quản lý chuyển giao</span>
                    </Link>
                  )}
                </div>
              )}
              <div className="border-t border-gray-200 pt-2 mt-2">
                {!isSuperAdminNoTenant && (
                  <Link
                    href="/profile"
                    onClick={() => setShowMobileMenu(false)}
                    className="flex items-center space-x-2 text-gray-700 hover:text-primary-600 hover:bg-gray-100 px-3 py-2 rounded-md text-base font-medium transition"
                  >
                    <UserCircle className="w-5 h-5" />
                    <span>Trang cá nhân</span>
                  </Link>
                )}
                <button
                  onClick={() => {
                    setShowMobileMenu(false)
                    handleLogout()
                  }}
                  className="flex items-center space-x-2 w-full text-left text-red-600 hover:bg-red-50 px-3 py-2 rounded-md text-base font-medium transition"
                >
                  <LogOut className="w-5 h-5" />
                  <span>Đăng xuất</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
    </>
  )
}


