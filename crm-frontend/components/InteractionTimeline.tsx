'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api'
import { Phone, Mail, Users, MessageSquare, Loader2, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'

interface Interaction {
  interaction_id: string
  customer_id: string
  deal_id?: string
  interaction_type: string
  content: string
  interaction_date: number
  employee_id: string
  status?: string
  created_at: number
  employee_full_name?: string
  employee_username?: string
  employee_email?: string
  employee_role?: string
}

interface InteractionTimelineProps {
  customerId: string
  refreshKey?: number
}

export function InteractionTimeline({ customerId, refreshKey = 0 }: InteractionTimelineProps) {
  const [interactions, setInteractions] = useState<Interaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchInteractions()
  }, [customerId, refreshKey])

  const fetchInteractions = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await apiClient.get(`/api/interactions/customer/${customerId}`)
      
      if (response.data.success) {
        setInteractions(response.data.data || [])
      } else {
        setError(response.data.message || 'Không thể tải lịch sử tương tác')
        toast.error(response.data.message || 'Không thể tải lịch sử tương tác')
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || 'Lỗi khi tải lịch sử tương tác'
      setError(errorMsg)
      toast.error(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  const formatDateTime = (timestamp: number | string) => {
    const ts = typeof timestamp === 'string' ? parseInt(timestamp, 10) : timestamp
    
    if (isNaN(ts) || ts === null || ts === undefined || ts === 0) {
      return 'N/A'
    }
    
    const timestampMs = ts.toString().length === 10 ? ts * 1000 : ts
    const date = new Date(timestampMs)
    
    if (isNaN(date.getTime())) {
      return 'N/A'
    }
    
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${day}/${month}/${year} ${hours}:${minutes}`
  }

  const getInteractionIcon = (type: string) => {
    const normalizedType = type?.toLowerCase() || ''
    
    if (normalizedType.includes('call') || normalizedType === 'phone') {
      return <Phone className="w-5 h-5" />
    } else if (normalizedType.includes('email') || normalizedType === 'mail') {
      return <Mail className="w-5 h-5" />
    } else if (normalizedType.includes('meeting') || normalizedType.includes('gặp') || normalizedType.includes('hop')) {
      return <Users className="w-5 h-5" />
    } else if (normalizedType.includes('zalo') || normalizedType.includes('social') || normalizedType.includes('message')) {
      return <MessageSquare className="w-5 h-5" />
    } else {
      return <MessageSquare className="w-5 h-5" />
    }
  }

  const getInteractionTypeLabel = (type: string) => {
    const normalizedType = type?.toLowerCase() || ''
    
    if (normalizedType.includes('call') || normalizedType === 'phone') {
      return 'Cuộc gọi'
    } else if (normalizedType.includes('email') || normalizedType === 'mail') {
      return 'Email'
    } else if (normalizedType.includes('meeting') || normalizedType.includes('gặp') || normalizedType.includes('hop')) {
      return 'Cuộc họp'
    } else if (normalizedType.includes('zalo')) {
      return 'Zalo'
    } else if (normalizedType.includes('social')) {
      return 'Mạng xã hội'
    } else if (normalizedType.includes('message')) {
      return 'Tin nhắn'
    } else if (normalizedType.includes('note')) {
      return 'Ghi chú'
    } else {
      return type || 'Tương tác'
    }
  }

  const getStatusBadge = (status?: string) => {
    if (!status) return null

    const normalizedStatus = status.toLowerCase()
    
    // Thành công
    if (normalizedStatus.includes('thành công') || 
        normalizedStatus.includes('success') || 
        normalizedStatus.includes('completed') ||
        normalizedStatus.includes('hoàn thành')) {
      return (
        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
          Thành công
        </span>
      )
    }
    
    // Hẹn gọi lại
    if (normalizedStatus.includes('hẹn') || 
        normalizedStatus.includes('gọi lại') || 
        normalizedStatus.includes('callback') ||
        normalizedStatus.includes('pending') ||
        normalizedStatus.includes('chờ')) {
      return (
        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
          Hẹn gọi lại
        </span>
      )
    }
    
    // Thất bại/Khách bận
    if (normalizedStatus.includes('thất bại') || 
        normalizedStatus.includes('bận') || 
        normalizedStatus.includes('failed') ||
        normalizedStatus.includes('busy') ||
        normalizedStatus.includes('từ chối')) {
      return (
        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
          {status}
        </span>
      )
    }
    
    // Mặc định
    return (
      <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">
        {status}
      </span>
    )
  }

  const getIconColor = (type: string) => {
    const normalizedType = type?.toLowerCase() || ''
    
    if (normalizedType.includes('call') || normalizedType === 'phone') {
      return 'text-blue-600 bg-blue-100'
    } else if (normalizedType.includes('email') || normalizedType === 'mail') {
      return 'text-purple-600 bg-purple-100'
    } else if (normalizedType.includes('meeting')) {
      return 'text-indigo-600 bg-indigo-100'
    } else {
      return 'text-green-600 bg-green-100'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        <span className="ml-3 text-gray-600">Đang tải lịch sử tương tác...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <AlertCircle className="w-8 h-8 text-red-500" />
        <span className="ml-3 text-red-600">{error}</span>
      </div>
    )
  }

  if (interactions.length === 0) {
    return (
      <div className="text-center py-12">
        <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600">Chưa có lịch sử tương tác nào</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end mb-4">
        <button
          onClick={fetchInteractions}
          className="text-sm text-primary-600 hover:text-primary-700 font-medium"
        >
          Làm mới
        </button>
      </div>

      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200"></div>

        <div className="space-y-6">
          {interactions.map((interaction, index) => (
            <div key={interaction.interaction_id} className="relative flex items-start gap-4">
              {/* Icon */}
              <div className={`relative z-10 flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${getIconColor(interaction.interaction_type)}`}>
                {getInteractionIcon(interaction.interaction_type)}
              </div>

              {/* Content */}
              <div className="flex-1 bg-white rounded-lg border border-gray-200 p-4 shadow-sm hover:shadow-md transition">
                {/* Header */}
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-gray-900">
                      {getInteractionTypeLabel(interaction.interaction_type)}
                    </h4>
                    {getStatusBadge(interaction.status)}
                  </div>
                </div>

                {/* Content */}
                <p className="text-gray-700 mb-3 whitespace-pre-wrap">
                  {interaction.content}
                </p>

                {/* Footer */}
                <div className="flex items-center text-sm text-gray-500 pt-3 border-t border-gray-100">
                  <span>
                    Thực hiện bởi <span className="font-semibold text-gray-700">
                      {interaction.employee_full_name || interaction.employee_username || 'Không xác định'}
                    </span>
                    {' '}vào lúc <span className="font-semibold text-gray-700">
                      {formatDateTime(interaction.interaction_date || interaction.created_at)}
                    </span>
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

