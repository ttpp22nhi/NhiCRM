-- Thời gian bắt đầu / kết thúc (hợp đồng, gói dịch vụ) cho tenant - dùng cho kinh doanh sản phẩm
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS start_date DATE NULL,
  ADD COLUMN IF NOT EXISTS end_date DATE NULL;

COMMENT ON COLUMN public.tenants.start_date IS 'Thời gian bắt đầu (ngày bắt đầu hợp đồng/gói)';
COMMENT ON COLUMN public.tenants.end_date IS 'Thời gian kết thúc (ngày hết hạn hợp đồng/gói)';

CREATE INDEX IF NOT EXISTS idx_tenants_start_date ON public.tenants (start_date);
CREATE INDEX IF NOT EXISTS idx_tenants_end_date ON public.tenants (end_date);
