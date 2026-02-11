-- ============================================
-- Thêm cột status và assigned_to vào bảng deals
-- ============================================

ALTER TABLE public.deals 
ADD COLUMN IF NOT EXISTS status varchar(50) DEFAULT 'active' NULL;

ALTER TABLE public.deals 
ADD COLUMN IF NOT EXISTS assigned_to varchar(50) NULL;

ALTER TABLE public.deals 
ADD COLUMN IF NOT EXISTS updated_at int8 NULL;

-- Index để tối ưu truy vấn
CREATE INDEX IF NOT EXISTS idx_deals_assigned_to 
ON public.deals USING btree (assigned_to);

CREATE INDEX IF NOT EXISTS idx_deals_status 
ON public.deals USING btree (status);

CREATE INDEX IF NOT EXISTS idx_deals_customer_id 
ON public.deals USING btree (customer_id);

CREATE INDEX IF NOT EXISTS idx_deals_stage 
ON public.deals USING btree (stage);

-- Ghi chú:
-- - status: active (đang hoạt động), closed (đã đóng), cancelled (đã hủy)
-- - assigned_to: Liên kết với employees.employee_id (không có FK constraint)
-- - updated_at: Thời gian cập nhật lần cuối
