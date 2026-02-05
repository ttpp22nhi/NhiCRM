'use client'

import { useState, useEffect, useRef } from 'react'
import { Bell, X, Check } from 'lucide-react'
import { apiClient } from '@/lib/api'
import toast from 'react-hot-toast'

interface Notification {
  notification_id: string
  type: string
  title: string
  message: string
  is_read: boolean
  created_at: number
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [showDropdown, setShowDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchNotifications()
    // Polling mỗi 30 giây để cập nhật thông báo
    const interval = setInterval(fetchNotifications, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    // Kiểm tra quyền Browser Notifications
    if ('Notification' in window && Notification.permission === 'granted') {
      // Kiểm tra thông báo mới và hiển thị
      notifications.forEach(notif => {
        if (!notif.is_read) {
          showBrowserNotification(notif)
        }
      })
    }
  }, [notifications])

  useEffect(() => {
    // Đóng dropdown khi click outside
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false)
      }
    }

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [showDropdown])

  const fetchNotifications = async () => {
    try {
      const response = await apiClient.get('/api/notifications', {
        params: { unread_only: 'false' }
      })

      if (response.data.success) {
        const notifs = response.data.data
        setNotifications(notifs)
        setUnreadCount(notifs.filter((n: Notification) => !n.is_read).length)
      }
    } catch (error) {
      console.error('Lỗi khi lấy thông báo:', error)
    }
  }

  const showBrowserNotification = (notification: Notification) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(notification.title, {
        body: notification.message,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: notification.notification_id
      })
    }
  }

  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission()
      if (permission === 'granted') {
        toast.success('Đã bật thông báo trình duyệt!')
      } else {
        toast.error('Bạn đã từ chối thông báo trình duyệt.')
      }
    } else {
      toast.error('Trình duyệt không hỗ trợ thông báo.')
    }
  }

  const markAsRead = async (notificationId: string) => {
    try {
      await apiClient.patch(`/api/notifications/${notificationId}/read`)
      setNotifications(prev =>
        prev.map(n =>
          n.notification_id === notificationId ? { ...n, is_read: true } : n
        )
      )
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch (error) {
      console.error('Lỗi khi đánh dấu đã đọc:', error)
    }
  }

  const markAllAsRead = async () => {
    try {
      await apiClient.patch('/api/notifications/read-all')
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
      setUnreadCount(0)
      toast.success('Đã đánh dấu tất cả thông báo đã đọc!')
    } catch (error) {
      console.error('Lỗi khi đánh dấu tất cả đã đọc:', error)
    }
  }

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return 'Vừa xong'
    if (minutes < 60) return `${minutes} phút trước`
    if (hours < 24) return `${hours} giờ trước`
    if (days < 7) return `${days} ngày trước`
    return date.toLocaleDateString('vi-VN')
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="relative p-2 text-gray-600 hover:text-primary-600 transition focus:outline-none focus:ring-2 focus:ring-primary-500 rounded-lg"
      >
        <Bell className="w-6 h-6" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {showDropdown && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50 max-h-96 overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Thông báo</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                >
                  Đánh dấu tất cả đã đọc
                </button>
              )}
              {'Notification' in window && Notification.permission !== 'granted' && (
                <button
                  onClick={requestNotificationPermission}
                  className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                >
                  Bật thông báo
                </button>
              )}
            </div>
          </div>

          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-500">
                <Bell className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p>Chưa có thông báo</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {notifications.map(notification => (
                  <div
                    key={notification.notification_id}
                    className={`px-4 py-3 hover:bg-gray-50 transition cursor-pointer ${
                      !notification.is_read ? 'bg-blue-50' : ''
                    }`}
                    onClick={() => !notification.is_read && markAsRead(notification.notification_id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className={`text-sm font-medium ${!notification.is_read ? 'text-gray-900' : 'text-gray-700'}`}>
                          {notification.title}
                        </p>
                        {notification.message && (
                          <p className="text-xs text-gray-600 mt-1">{notification.message}</p>
                        )}
                        <p className="text-xs text-gray-400 mt-1">{formatDate(notification.created_at)}</p>
                      </div>
                      {!notification.is_read && (
                        <div className="ml-2">
                          <div className="w-2 h-2 bg-primary-600 rounded-full"></div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

