-- ============================================
-- Tạo bảng transfer_requests
-- Bảng này lưu trữ các yêu cầu chuyển giao khách hàng
-- ============================================

CREATE TABLE IF NOT EXISTS public.transfer_requests (
    transfer_request_id varchar(50) NOT NULL,
    customer_ids text[] NOT NULL, -- Mảng các customer_id
    sender_id varchar(50) NOT NULL, -- Người gửi yêu cầu (Sales)
    receiver_id varchar(50) NOT NULL, -- Người nhận (Sales khác)
    status varchar(20) DEFAULT 'pending'::character varying NOT NULL, -- pending, approved, rejected
    note text NULL, -- Lý do chuyển giao
    created_at int8 NOT NULL,
    updated_at int8 NULL,
    approved_by varchar(50) NULL, -- Manager phê duyệt
    approved_at int8 NULL,
    CONSTRAINT transfer_requests_pkey PRIMARY KEY (transfer_request_id)
);

-- Index để tối ưu truy vấn
CREATE INDEX IF NOT EXISTS idx_transfer_requests_sender_id 
ON public.transfer_requests USING btree (sender_id);

CREATE INDEX IF NOT EXISTS idx_transfer_requests_receiver_id 
ON public.transfer_requests USING btree (receiver_id);

CREATE INDEX IF NOT EXISTS idx_transfer_requests_status 
ON public.transfer_requests USING btree (status) 
WHERE (status = 'pending');

-- Ghi chú:
-- - customer_ids: Mảng các ID khách hàng cần chuyển giao
-- - status: pending (chờ phê duyệt), approved (đã phê duyệt), rejected (từ chối)
-- - sender_id: Liên kết với employees.employee_id (không có FK constraint)
-- - receiver_id: Liên kết với employees.employee_id (không có FK constraint)
-- - approved_by: Liên kết với employees.employee_id (không có FK constraint)
