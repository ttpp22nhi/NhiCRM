/**
 * Ví dụ sử dụng AlertModal component
 * 
 * Component này thay thế window.alert() và window.confirm() với UI đẹp hơn
 */

'use client'

import { useState } from 'react'
import { AlertModal, useAlert } from './AlertModal'

// ============================================
// CÁCH 1: Sử dụng trực tiếp AlertModal component
// ============================================
export function ExampleDirectUsage() {
  const [showSuccess, setShowSuccess] = useState(false)
  const [showError, setShowError] = useState(false)
  const [showWarning, setShowWarning] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  return (
    <div className="space-y-4 p-4">
      <h2 className="text-xl font-bold">Ví dụ sử dụng AlertModal</h2>
      
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setShowSuccess(true)}
          className="px-4 py-2 bg-green-600 text-white rounded-lg"
        >
          Hiển thị Success
        </button>
        <button
          onClick={() => setShowError(true)}
          className="px-4 py-2 bg-red-600 text-white rounded-lg"
        >
          Hiển thị Error
        </button>
        <button
          onClick={() => setShowWarning(true)}
          className="px-4 py-2 bg-yellow-600 text-white rounded-lg"
        >
          Hiển thị Warning
        </button>
        <button
          onClick={() => setShowInfo(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg"
        >
          Hiển thị Info
        </button>
        <button
          onClick={() => setShowConfirm(true)}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg"
        >
          Hiển thị Confirm
        </button>
      </div>

      {/* Success Alert */}
      <AlertModal
        isOpen={showSuccess}
        type="success"
        title="Thành công!"
        message="Thao tác đã được thực hiện thành công."
        confirmText="Đóng"
        showCancel={false}
        onClose={() => setShowSuccess(false)}
        onConfirm={() => setShowSuccess(false)}
      />

      {/* Error Alert */}
      <AlertModal
        isOpen={showError}
        type="error"
        title="Lỗi!"
        message="Đã xảy ra lỗi khi thực hiện thao tác. Vui lòng thử lại."
        confirmText="Đóng"
        showCancel={false}
        onClose={() => setShowError(false)}
        onConfirm={() => setShowError(false)}
      />

      {/* Warning Alert */}
      <AlertModal
        isOpen={showWarning}
        type="warning"
        title="Cảnh báo!"
        message="Bạn có chắc chắn muốn tiếp tục? Hành động này có thể không thể hoàn tác."
        confirmText="Tiếp tục"
        cancelText="Hủy"
        onClose={() => setShowWarning(false)}
        onConfirm={() => {
          console.log('User confirmed warning')
          setShowWarning(false)
        }}
        onCancel={() => setShowWarning(false)}
      />

      {/* Info Alert */}
      <AlertModal
        isOpen={showInfo}
        type="info"
        title="Thông tin"
        message="Đây là một thông báo thông tin quan trọng."
        confirmText="Đã hiểu"
        showCancel={false}
        onClose={() => setShowInfo(false)}
        onConfirm={() => setShowInfo(false)}
      />

      {/* Confirm Alert */}
      <AlertModal
        isOpen={showConfirm}
        type="confirm"
        title="Xác nhận"
        message="Bạn có chắc chắn muốn thực hiện hành động này?"
        confirmText="Xác nhận"
        cancelText="Hủy"
        onClose={() => setShowConfirm(false)}
        onConfirm={() => {
          console.log('User confirmed')
          setShowConfirm(false)
        }}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  )
}

// ============================================
// CÁCH 2: Sử dụng hook useAlert (Khuyến nghị)
// ============================================
export function ExampleWithHook() {
  const { showAlert, showConfirm, AlertComponent } = useAlert()

  const handleSuccess = () => {
    showAlert({
      type: 'success',
      title: 'Thành công!',
      message: 'Dữ liệu đã được lưu thành công.',
      confirmText: 'Đóng',
      showCancel: false,
      onConfirm: () => console.log('Success closed')
    })
  }

  const handleError = () => {
    showAlert({
      type: 'error',
      title: 'Lỗi!',
      message: 'Không thể kết nối đến server. Vui lòng kiểm tra lại kết nối mạng.',
      confirmText: 'Đóng',
      showCancel: false,
      onConfirm: () => console.log('Error closed')
    })
  }

  const handleDelete = async () => {
    const confirmed = await showConfirm({
      title: 'Xác nhận xóa',
      message: 'Bạn có chắc chắn muốn xóa mục này? Hành động này không thể hoàn tác.',
      confirmText: 'Xóa',
      cancelText: 'Hủy'
    })

    if (confirmed) {
      console.log('User confirmed deletion')
      // Thực hiện xóa
      showAlert({
        type: 'success',
        title: 'Đã xóa',
        message: 'Mục đã được xóa thành công.',
        confirmText: 'Đóng',
        showCancel: false
      })
    } else {
      console.log('User cancelled deletion')
    }
  }

  return (
    <div className="space-y-4 p-4">
      <h2 className="text-xl font-bold">Ví dụ sử dụng useAlert hook</h2>
      
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={handleSuccess}
          className="px-4 py-2 bg-green-600 text-white rounded-lg"
        >
          Success Alert
        </button>
        <button
          onClick={handleError}
          className="px-4 py-2 bg-red-600 text-white rounded-lg"
        >
          Error Alert
        </button>
        <button
          onClick={handleDelete}
          className="px-4 py-2 bg-red-600 text-white rounded-lg"
        >
          Confirm Delete
        </button>
      </div>

      {/* Render AlertComponent để hiển thị alerts */}
      {AlertComponent}
    </div>
  )
}

// ============================================
// CÁCH 3: Thay thế window.confirm()
// ============================================
export function ExampleReplaceWindowConfirm() {
  const { showConfirm, AlertComponent } = useAlert()

  const handleDelete = async () => {
    // Thay vì: if (window.confirm('Bạn có chắc chắn?')) { ... }
    // Sử dụng:
    const confirmed = await showConfirm({
      title: 'Xác nhận xóa',
      message: 'Bạn có chắc chắn muốn xóa mục này?',
      confirmText: 'Xóa',
      cancelText: 'Hủy'
    })

    if (confirmed) {
      console.log('User confirmed')
      // Thực hiện xóa
    }
  }

  return (
    <div className="p-4">
      <button
        onClick={handleDelete}
        className="px-4 py-2 bg-red-600 text-white rounded-lg"
      >
        Xóa (với Confirm)
      </button>
      {AlertComponent}
    </div>
  )
}

// ============================================
// CÁCH 4: Thay thế window.alert()
// ============================================
export function ExampleReplaceWindowAlert() {
  const { showAlert, AlertComponent } = useAlert()

  const handleSave = () => {
    // Thay vì: window.alert('Lưu thành công!')
    // Sử dụng:
    showAlert({
      type: 'success',
      title: 'Thành công',
      message: 'Dữ liệu đã được lưu thành công!',
      confirmText: 'Đóng',
      showCancel: false
    })
  }

  return (
    <div className="p-4">
      <button
        onClick={handleSave}
        className="px-4 py-2 bg-green-600 text-white rounded-lg"
      >
        Lưu (với Alert)
      </button>
      {AlertComponent}
    </div>
  )
}
