'use client'

import { AlertCircle, CheckCircle, Info, X, AlertTriangle } from 'lucide-react'

export type AlertType = 'success' | 'error' | 'warning' | 'info' | 'confirm'

interface AlertModalProps {
  isOpen: boolean
  type: AlertType
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  onConfirm?: () => void
  onCancel?: () => void
  onClose?: () => void
  showCancel?: boolean
  disabled?: boolean
}

export function AlertModal({
  isOpen,
  type,
  title,
  message,
  confirmText = 'Xác nhận',
  cancelText = 'Hủy',
  onConfirm,
  onCancel,
  onClose,
  showCancel = true,
  disabled = false
}: AlertModalProps) {
  if (!isOpen) return null

  const handleClose = () => {
    onClose?.()
    onCancel?.()
  }

  const handleConfirm = () => {
    onConfirm?.()
    onClose?.()
  }

  // Icon và màu sắc theo type
  const getIconAndColors = () => {
    switch (type) {
      case 'success':
        return {
          icon: CheckCircle,
          iconBg: 'bg-green-100',
          iconColor: 'text-green-600',
          buttonBg: 'bg-green-600 hover:bg-green-700',
          borderColor: 'border-green-200'
        }
      case 'error':
        return {
          icon: AlertCircle,
          iconBg: 'bg-red-100',
          iconColor: 'text-red-600',
          buttonBg: 'bg-red-600 hover:bg-red-700',
          borderColor: 'border-red-200'
        }
      case 'warning':
        return {
          icon: AlertTriangle,
          iconBg: 'bg-yellow-100',
          iconColor: 'text-yellow-600',
          buttonBg: 'bg-yellow-600 hover:bg-yellow-700',
          borderColor: 'border-yellow-200'
        }
      case 'info':
        return {
          icon: Info,
          iconBg: 'bg-blue-100',
          iconColor: 'text-blue-600',
          buttonBg: 'bg-blue-600 hover:bg-blue-700',
          borderColor: 'border-blue-200'
        }
      case 'confirm':
        return {
          icon: AlertCircle,
          iconBg: 'bg-primary-100',
          iconColor: 'text-primary-600',
          buttonBg: 'bg-primary-600 hover:bg-primary-700',
          borderColor: 'border-primary-200'
        }
      default:
        return {
          icon: Info,
          iconBg: 'bg-gray-100',
          iconColor: 'text-gray-600',
          buttonBg: 'bg-gray-600 hover:bg-gray-700',
          borderColor: 'border-gray-200'
        }
    }
  }

  const { icon: Icon, iconBg, iconColor, buttonBg, borderColor } = getIconAndColors()

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 animate-in fade-in">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full transform transition-all animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className={`flex items-center gap-4 p-6 border-b ${borderColor}`}>
          <div className={`flex-shrink-0 h-12 w-12 ${iconBg} rounded-full flex items-center justify-center`}>
            <Icon className={`w-6 h-6 ${iconColor}`} />
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-bold text-gray-900">{title}</h3>
          </div>
          {onClose && (
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 transition p-1 rounded-lg hover:bg-gray-100"
              aria-label="Đóng"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-6">
          <p className="text-gray-700 leading-relaxed whitespace-pre-line">{message}</p>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t bg-gray-50 rounded-b-xl">
          {showCancel && (
            <button
              onClick={handleClose}
              disabled={disabled}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {cancelText}
            </button>
          )}
          <button
            onClick={handleConfirm}
            disabled={disabled}
            className={`px-6 py-2 text-white rounded-lg transition font-medium disabled:opacity-50 disabled:cursor-not-allowed ${buttonBg}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

// Hook để sử dụng AlertModal dễ dàng hơn
import { useState, useCallback } from 'react'

interface UseAlertReturn {
  showAlert: (config: Omit<AlertModalProps, 'isOpen'>) => void
  showConfirm: (config: Omit<AlertModalProps, 'isOpen' | 'type'>) => Promise<boolean>
  AlertComponent: React.ReactNode
}

export function useAlert(): UseAlertReturn {
  const [alertState, setAlertState] = useState<Omit<AlertModalProps, 'isOpen'> & { isOpen: boolean }>({
    isOpen: false,
    type: 'info',
    title: '',
    message: '',
    confirmText: 'Xác nhận',
    cancelText: 'Hủy',
    showCancel: true
  })

  const showAlert = useCallback((config: Omit<AlertModalProps, 'isOpen'>) => {
    setAlertState({
      ...config,
      isOpen: true,
      showCancel: config.showCancel !== undefined ? config.showCancel : true
    })
  }, [])

  const showConfirm = useCallback((config: Omit<AlertModalProps, 'isOpen' | 'type'>): Promise<boolean> => {
    return new Promise((resolve) => {
      setAlertState({
        ...config,
        type: 'confirm',
        isOpen: true,
        showCancel: config.showCancel !== undefined ? config.showCancel : true,
        onConfirm: () => {
          config.onConfirm?.()
          resolve(true)
        },
        onCancel: () => {
          config.onCancel?.()
          resolve(false)
        },
        onClose: () => {
          setAlertState(prev => ({ ...prev, isOpen: false }))
        }
      })
    })
  }, [])

  const handleClose = useCallback(() => {
    setAlertState(prev => ({ ...prev, isOpen: false }))
  }, [])

  const AlertComponent = (
    <AlertModal
      {...alertState}
      onClose={handleClose}
    />
  )

  return { showAlert, showConfirm, AlertComponent }
}
