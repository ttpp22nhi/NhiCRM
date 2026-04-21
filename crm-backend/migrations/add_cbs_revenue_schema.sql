-- ==========================================================================
-- CBS (Mobifone) revenue integration:
-- 1) cbs_config: thông tin đăng nhập hệ thống CBS cho từng tenant (admin sửa)
-- 2) cbs_revenue_orders: các đơn hàng doanh thu đồng bộ định kỳ từ CBS,
--    nhân viên có thể tích "của tôi" để claim đơn thuộc về mình.
-- Idempotent: dùng IF NOT EXISTS.
-- ==========================================================================

CREATE TABLE IF NOT EXISTS public.cbs_config (
  tenant_id VARCHAR(50) NOT NULL,
  base_url VARCHAR(255) NOT NULL DEFAULT 'https://cbs.mobifone.vn',
  username VARCHAR(100) NOT NULL,
  password TEXT NOT NULL,
  unit INTEGER NOT NULL DEFAULT 880,
  report_config_code VARCHAR(100) NOT NULL DEFAULT 'REPORT_INVOICING_PREPAID',
  auto_sync BOOLEAN NOT NULL DEFAULT TRUE,
  last_synced_at BIGINT NULL,
  last_sync_status VARCHAR(20) NULL,
  last_sync_message TEXT NULL,
  updated_at BIGINT NULL,
  updated_by VARCHAR(50) NULL,
  CONSTRAINT cbs_config_pkey PRIMARY KEY (tenant_id)
);

COMMENT ON TABLE  public.cbs_config IS 'Cấu hình tích hợp hệ thống CBS (Mobifone) cho mỗi tenant.';
COMMENT ON COLUMN public.cbs_config.unit IS 'Tham số "unit" khi gọi export-report-online của CBS.';
COMMENT ON COLUMN public.cbs_config.password IS 'Mật khẩu tài khoản CBS — lưu plaintext do CBS yêu cầu gửi nguyên; cần bảo mật quyền truy cập bảng này.';
COMMENT ON COLUMN public.cbs_config.last_sync_status IS 'success | error | running';

-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cbs_revenue_orders (
  id VARCHAR(50) NOT NULL,
  tenant_id VARCHAR(50) NOT NULL,
  fingerprint VARCHAR(255) NOT NULL,
  period_ym VARCHAR(7) NULL,

  contract_no VARCHAR(255) NULL,
  contract_type VARCHAR(50) NULL,
  product_name VARCHAR(255) NULL,
  product_code VARCHAR(100) NULL,
  primary_product_code VARCHAR(100) NULL,
  masp VARCHAR(50) NULL,
  external_id1 VARCHAR(100) NULL,
  serial VARCHAR(100) NULL,

  customer_name VARCHAR(500) NULL,
  customer_type VARCHAR(100) NULL,
  partner VARCHAR(500) NULL,
  cen_code_dev VARCHAR(255) NULL,

  cbs_staff VARCHAR(500) NULL,
  payment_type VARCHAR(50) NULL,

  price_not_vat NUMERIC(18, 2) NOT NULL DEFAULT 0,
  price_not_vat_round NUMERIC(18, 2) NOT NULL DEFAULT 0,
  price_vat NUMERIC(18, 2) NOT NULL DEFAULT 0,
  vat NUMERIC(18, 2) NOT NULL DEFAULT 0,

  sub_start_date BIGINT NULL,
  first_date_revenue BIGINT NULL,
  active_date BIGINT NULL,
  payment_date BIGINT NULL,

  raw JSONB NULL,

  claimed_by VARCHAR(50) NULL,
  claimed_at BIGINT NULL,

  synced_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NULL,

  CONSTRAINT cbs_revenue_orders_pkey PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cbs_revenue_orders_tenant_fp
  ON public.cbs_revenue_orders (tenant_id, fingerprint);
CREATE INDEX IF NOT EXISTS idx_cbs_revenue_orders_tenant_period
  ON public.cbs_revenue_orders (tenant_id, period_ym);
CREATE INDEX IF NOT EXISTS idx_cbs_revenue_orders_claimed_by
  ON public.cbs_revenue_orders (tenant_id, claimed_by)
  WHERE claimed_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cbs_revenue_orders_payment_date
  ON public.cbs_revenue_orders (tenant_id, payment_date DESC);

COMMENT ON TABLE  public.cbs_revenue_orders IS 'Các đơn hàng doanh thu đồng bộ từ hệ thống CBS (Mobifone). Nhân viên có thể claim đơn của mình.';
COMMENT ON COLUMN public.cbs_revenue_orders.fingerprint IS 'Dấu vân duy nhất theo đơn hàng, dùng để upsert (contract + product + external + payment_date).';
COMMENT ON COLUMN public.cbs_revenue_orders.claimed_by IS 'employee_id trong CRM đã "tích" đơn này là của mình.';
COMMENT ON COLUMN public.cbs_revenue_orders.period_ym IS 'YYYY-MM suy từ paymentDate (hoặc activeDate) — phục vụ lọc theo tháng KPI.';
