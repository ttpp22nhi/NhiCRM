-- ============================================
-- Thêm cột approval_note vào bảng transfer_requests
-- Cột này lưu trữ nội dung phê duyệt/từ chối của Manager/Admin
-- ============================================

ALTER TABLE public.transfer_requests 
ADD COLUMN IF NOT EXISTS approval_note text NULL;

-- Ghi chú:
-- - approval_note: Nội dung phê duyệt hoặc từ chối từ Manager/Admin (bắt buộc khi phê duyệt/từ chối)
