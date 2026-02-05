'use client'

import { Toaster } from 'react-hot-toast'

export function ToastProvider() {
  return (
    <Toaster
      position="top-right"
      containerStyle={{
        zIndex: 9999,
        top: 20,
      }}
      toastOptions={{
        duration: 4000, // Default duration cho các toast thông thường
        style: {
          background: '#fff',
          color: '#333',
          padding: '16px',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          zIndex: 9999,
        },
        success: {
          iconTheme: {
            primary: '#10b981',
            secondary: '#fff',
          },
          duration: 3000,
        },
        error: {
          iconTheme: {
            primary: '#ef4444',
            secondary: '#fff',
          },
          duration: 5000, // Error toast mặc định 5 giây
        },
      }}
    />
  )
}






