-- Cột riêng cho KPI (NEW | EXISTING). customer_type giữ phân loại nghiệp vụ (cá nhân, DN, …).
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS kpi_customer_kind VARCHAR(20) NOT NULL DEFAULT 'NEW';

COMMENT ON COLUMN public.customers.kpi_customer_kind IS 'KPI: NEW = khách mới, EXISTING = hiện hữu — độc lập với customer_type (loại hình).';

-- Backfill từ giá trị KPI cũ lỡ ghi nhầm vào customer_type
UPDATE public.customers
SET kpi_customer_kind = 'EXISTING'
WHERE UPPER(TRIM(COALESCE(customer_type, ''))) = 'EXISTING';

UPDATE public.customers
SET kpi_customer_kind = 'NEW'
WHERE UPPER(TRIM(COALESCE(customer_type, ''))) = 'NEW';

-- Các dòng customer_type là individual, company, … giữ mặc định NEW (đã DEFAULT)

-- Giải phóng customer_type khỏi giá trị KPI cũ (NEW/EXISTING không phải loại hình khách)
UPDATE public.customers
SET customer_type = 'individual'
WHERE UPPER(TRIM(COALESCE(customer_type, ''))) IN ('NEW', 'EXISTING');
