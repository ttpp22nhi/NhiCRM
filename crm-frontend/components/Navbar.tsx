'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Image from 'next/image'
import { LogOut, Users, LayoutDashboard, User, ChevronDown, UserCircle, Key, CheckSquare, Clock, FileText, Menu, X } from 'lucide-react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { NotificationBell } from './NotificationBell'

export function Navbar() {
  const { user, logout } = useAuth()
  const router = useRouter()
  const [showDropdown, setShowDropdown] = useState(false)
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const mobileMenuRef = useRef<HTMLDivElement>(null)

  const handleLogout = () => {
    logout()
    toast.success('Đã đăng xuất thành công!')
    router.push('/login')
  }

  // Đóng dropdown khi click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false)
      }
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node)) {
        setShowMobileMenu(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const getRoleLabel = (role?: string) => {
    switch (role) {
      case 'admin':
        return 'Admin'
      case 'manager':
        return 'Quản lý'
      case 'sales':
        return 'Sales'
      default:
        return 'User'
    }
  }

  const getRoleColor = (role?: string) => {
    switch (role) {
      case 'admin':
        return 'bg-purple-100 text-purple-700'
      case 'manager':
        return 'bg-indigo-100 text-indigo-700'
      case 'sales':
        return 'bg-blue-100 text-blue-700'
      default:
        return 'bg-gray-100 text-gray-700'
    }
  }

  return (
    <nav className="bg-white shadow-md border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link href="/dashboard" className="flex items-center space-x-3">
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
            <div className="hidden md:flex md:ml-10 md:space-x-4">
              <Link
                href="/dashboard"
                className="text-gray-700 hover:text-primary-600 px-3 py-2 rounded-md text-sm font-medium transition"
              >
                Dashboard
              </Link>
              <Link
                href="/customers"
                className="text-gray-700 hover:text-primary-600 px-3 py-2 rounded-md text-sm font-medium transition"
              >
                Khách hàng
              </Link>
              <Link
                href="/tasks"
                className="text-gray-700 hover:text-primary-600 px-3 py-2 rounded-md text-sm font-medium transition"
              >
                Công việc
              </Link>
              <Link
                href="/deals"
                className="text-gray-700 hover:text-primary-600 px-3 py-2 rounded-md text-sm font-medium transition"
              >
                Cơ hội
              </Link>
              {user?.role === 'admin' && (
                <Link
                  href="/employees"
                  className="text-gray-700 hover:text-primary-600 px-3 py-2 rounded-md text-sm font-medium transition"
                >
                  Nhân viên
                </Link>
              )}
              {(user?.role === 'manager' || user?.role === 'admin') && (
                <Link
                  href="/transfers"
                  className="text-gray-700 hover:text-primary-600 px-3 py-2 rounded-md text-sm font-medium transition"
                >
                  Quản lý chuyển giao
                </Link>
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

            {/* Notification Bell */}
            <NotificationBell />
            
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
              <Link
                href="/dashboard"
                onClick={() => setShowMobileMenu(false)}
                className="flex items-center space-x-2 text-gray-700 hover:text-primary-600 hover:bg-gray-100 px-3 py-2 rounded-md text-base font-medium transition"
              >
                <LayoutDashboard className="w-5 h-5" />
                <span>Dashboard</span>
              </Link>
              <Link
                href="/customers"
                onClick={() => setShowMobileMenu(false)}
                className="flex items-center space-x-2 text-gray-700 hover:text-primary-600 hover:bg-gray-100 px-3 py-2 rounded-md text-base font-medium transition"
              >
                <Users className="w-5 h-5" />
                <span>Khách hàng</span>
              </Link>
              <Link
                href="/tasks"
                onClick={() => setShowMobileMenu(false)}
                className="flex items-center space-x-2 text-gray-700 hover:text-primary-600 hover:bg-gray-100 px-3 py-2 rounded-md text-base font-medium transition"
              >
                <CheckSquare className="w-5 h-5" />
                <span>Công việc</span>
              </Link>
              {user?.role === 'admin' && (
                <Link
                  href="/employees"
                  onClick={() => setShowMobileMenu(false)}
                  className="flex items-center space-x-2 text-gray-700 hover:text-primary-600 hover:bg-gray-100 px-3 py-2 rounded-md text-base font-medium transition"
                >
                  <Users className="w-5 h-5" />
                  <span>Nhân viên</span>
                </Link>
              )}
              {(user?.role === 'manager' || user?.role === 'admin') && (
                <Link
                  href="/transfers"
                  onClick={() => setShowMobileMenu(false)}
                  className="flex items-center space-x-2 text-gray-700 hover:text-primary-600 hover:bg-gray-100 px-3 py-2 rounded-md text-base font-medium transition"
                >
                  <FileText className="w-5 h-5" />
                  <span>Quản lý chuyển giao</span>
                </Link>
              )}
              <div className="border-t border-gray-200 pt-2 mt-2">
                <Link
                  href="/profile"
                  onClick={() => setShowMobileMenu(false)}
                  className="flex items-center space-x-2 text-gray-700 hover:text-primary-600 hover:bg-gray-100 px-3 py-2 rounded-md text-base font-medium transition"
                >
                  <UserCircle className="w-5 h-5" />
                  <span>Trang cá nhân</span>
                </Link>
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
  )
}


