-- =============================================================================
-- Migration: Nền tảng KPI (bảng kpis) và Nhật ký tiếp cận / check-in (activities)
-- Idempotent: dùng IF NOT EXISTS / DO $$ ... $$ khi cần
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Bảng customers: customer_type (DEFAULT 'NEW'), tax_id, phone_number
-- -----------------------------------------------------------------------------

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS customer_type VARCHAR(50) NULL;
ALTER TABLE public.customers
  ALTER COLUMN customer_type SET DEFAULT 'NEW';

-- Giá trị NULL cũ → coi là khách mới theo mô hình NEW/EXISTING
UPDATE public.customers
SET customer_type = 'NEW'
WHERE customer_type IS NULL;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS tax_id VARCHAR(50) NULL;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS phone_number VARCHAR(30) NULL;

-- Đồng bộ phone_number từ cột phone (đã có trong schema) nếu chưa nhập
UPDATE public.customers
SET phone_number = phone
WHERE phone_number IS NULL
  AND phone IS NOT NULL;

COMMENT ON COLUMN public.customers.customer_type IS 'Phân loại KPI: NEW | EXISTING (và có thể mở rộng). Mặc định NEW.';
COMMENT ON COLUMN public.customers.tax_id IS 'Mã số thuế / định danh thuế (bổ sung bên cạnh tax_code nếu có).';
COMMENT ON COLUMN public.customers.phone_number IS 'Số điện thoại (đồng bộ từ phone); dùng cho biểu mẫu KPI/CRM mới.';

-- -----------------------------------------------------------------------------
-- 2) Bảng kpis: chỉ tiêu & thực tế doanh thu (New/Existing), số lần tiếp cận
--    Ràng buộc duy nhất (user_id, period) theo yêu cầu; thêm tenant_id để an toàn đa tenant
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.kpis (
  id VARCHAR(50) NOT NULL,
  tenant_id VARCHAR(50) NOT NULL,
  user_id VARCHAR(50) NOT NULL,
  period VARCHAR(32) NOT NULL,
  target_revenue_new NUMERIC(18, 2) NOT NULL DEFAULT 0,
  target_revenue_existing NUMERIC(18, 2) NOT NULL DEFAULT 0,
  actual_revenue_new NUMERIC(18, 2) NOT NULL DEFAULT 0,
  actual_revenue_existing NUMERIC(18, 2) NOT NULL DEFAULT 0,
  approach_count INT NOT NULL DEFAULT 0,
  created_at BIGINT NULL,
  updated_at BIGINT NULL,
  CONSTRAINT kpis_pkey PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_kpis_tenant_user_period
  ON public.kpis (tenant_id, user_id, period);

COMMENT ON TABLE public.kpis IS 'Chỉ tiêu và thực tế doanh thu (New/Existing) + số lần tiếp cận; user_id = employee_id trong hệ thống.';
COMMENT ON COLUMN public.kpis.period IS 'Kỳ KPI, ví dụ YYYY-MM';
COMMENT ON COLUMN public.kpis.target_revenue_new IS 'Chỉ tiêu doanh thu tập khách mới — VNĐ (đồng).';
COMMENT ON COLUMN public.kpis.target_revenue_existing IS 'Chỉ tiêu doanh thu tập hiện hữu — VNĐ (đồng).';
COMMENT ON COLUMN public.kpis.actual_revenue_new IS 'Thực tế doanh thu tập mới — VNĐ (đồng).';
COMMENT ON COLUMN public.kpis.actual_revenue_existing IS 'Thực tế doanh thu tập hiện hữu — VNĐ (đồng).';
COMMENT ON COLUMN public.kpis.approach_count IS 'Số lần tiếp cận khách hàng trong kỳ — đơn vị: lần (số nguyên)';

-- Yêu cầu UNIQUE(user_id, period): trong hệ đa tenant dùng (tenant_id, user_id, period) — một nhân viên một kỳ một dòng / tenant

-- -----------------------------------------------------------------------------
-- 3) Bảng activities: nhật ký check-in (nội dung, địa điểm, GPS, ảnh)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.activities (
  id VARCHAR(50) NOT NULL,
  tenant_id VARCHAR(50) NOT NULL,
  employee_id VARCHAR(50) NOT NULL,
  customer_id VARCHAR(50) NULL,
  content TEXT NULL,
  location_label VARCHAR(500) NULL,
  latitude NUMERIC(10, 7) NULL,
  longitude NUMERIC(10, 7) NULL,
  photo_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NULL,
  CONSTRAINT activities_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_activities_tenant ON public.activities (tenant_id);
CREATE INDEX IF NOT EXISTS idx_activities_employee ON public.activities (tenant_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_activities_customer ON public.activities (tenant_id, customer_id)
  WHERE customer_id IS NOT NULL;

COMMENT ON TABLE public.activities IS 'Nhật ký tiếp cận / check-in: nội dung, địa điểm, GPS, danh sách URL ảnh (JSONB array).';

-- -----------------------------------------------------------------------------
-- 4) Đồng bộ dữ liệu cũ: EXISTING nếu từng có deal thắng (WON / closed_won / thanh_cong / …)
-- -----------------------------------------------------------------------------

UPDATE public.customers c
SET customer_type = 'EXISTING'
WHERE (c.deleted_at IS NULL)
  AND EXISTS (
    SELECT 1
    FROM public.deals d
    WHERE d.customer_id = c.customer_id
      AND (d.tenant_id IS NULL OR d.tenant_id = c.tenant_id)
      AND COALESCE(d.is_deleted, false) = false
      AND (
        UPPER(TRIM(COALESCE(d.stage, ''))) = 'WON'
        OR LOWER(TRIM(COALESCE(d.stage, ''))) IN (
          'closed_won',
          'thanh_cong',
          'thành công',
          'đã đóng',
          'hoàn thành'
        )
      )
  );

-- -----------------------------------------------------------------------------
-- Cách chạy (từ thư mục crm-backend, đã cấu hình .env / DATABASE_URL):
--   node run-migration.js init_kpi_and_activity_schema.sql
-- Schema khác public (tuỳ chọn):
--   set DB_SCHEMA=ten_cua_ban   (Windows CMD: set DB_SCHEMA=...)
--   node run-migration.js init_kpi_and_activity_schema.sql
-- Chi tiết: crm-backend/database/README.md
-- -----------------------------------------------------------------------------
