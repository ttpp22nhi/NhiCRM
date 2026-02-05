import { useState, useEffect } from 'react'

/**
 * Custom hook để debounce giá trị
 * Chỉ trả về giá trị mới sau khi người dùng ngừng thay đổi trong khoảng thời gian delay
 * 
 * @param value - Giá trị cần debounce
 * @param delay - Thời gian delay tính bằng milliseconds (mặc định 500ms)
 * @returns Giá trị đã được debounce
 * 
 * @example
 * const [searchQuery, setSearchQuery] = useState('')
 * const debouncedSearchQuery = useDebounce(searchQuery, 500)
 * 
 * useEffect(() => {
 *   // Chỉ gọi API khi debouncedSearchQuery thay đổi (sau 500ms người dùng ngừng gõ)
 *   fetchData(debouncedSearchQuery)
 * }, [debouncedSearchQuery])
 */
export function useDebounce<T>(value: T, delay: number = 500): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    // Tạo timer để cập nhật giá trị sau delay
    const timer = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    // Cleanup: Hủy timer nếu value thay đổi trước khi delay kết thúc
    return () => {
      clearTimeout(timer)
    }
  }, [value, delay])

  return debouncedValue
}






