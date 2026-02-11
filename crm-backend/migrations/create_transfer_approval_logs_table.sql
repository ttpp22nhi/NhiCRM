-- ============================================
-- Tạo bảng transfer_approval_logs
-- Bảng này lưu trữ lịch sử phê duyệt/từ chối các yêu cầu chuyển giao
-- ============================================

CREATE TABLE IF NOT EXISTS public.transfer_approval_logs (
    log_id varchar(50) NOT NULL,
    transfer_request_id varchar(50) NOT NULL, -- ID yêu cầu chuyển giao
    approver_id varchar(50) NOT NULL, -- Người phê duyệt/từ chối (Manager/Admin)
    action varchar(20) NOT NULL, -- 'approve' hoặc 'reject'
    approval_note text NULL, -- Nội dung phê duyệt/từ chối
    sender_id varchar(50) NULL, -- Người gửi yêu cầu (để dễ tra cứu)
    receiver_id varchar(50) NULL, -- Người nhận (để dễ tra cứu)
    customer_count int4 DEFAULT 0 NULL, -- Số lượng khách hàng được chuyển giao
    created_at int8 NOT NULL,
    CONSTRAINT transfer_approval_logs_pkey PRIMARY KEY (log_id)
);

-- Index để tối ưu truy vấn
CREATE INDEX IF NOT EXISTS idx_transfer_approval_logs_transfer_request_id 
ON public.transfer_approval_logs USING btree (transfer_request_id);

CREATE INDEX IF NOT EXISTS idx_transfer_approval_logs_approver_id 
ON public.transfer_approval_logs USING btree (approver_id);

CREATE INDEX IF NOT EXISTS idx_transfer_approval_logs_created_at 
ON public.transfer_approval_logs USING btree (created_at DESC);

-- Ghi chú:
-- - log_id: ID duy nhất của log
-- - transfer_request_id: Liên kết với transfer_requests.transfer_request_id (không có FK constraint)
-- - approver_id: Liên kết với employees.employee_id (không có FK constraint)
-- - action: approve (phê duyệt) hoặc reject (từ chối)
-- - approval_note: Nội dung phê duyệt/từ chối
-- - sender_id, receiver_id, customer_count: Lưu để dễ tra cứu mà không cần join
