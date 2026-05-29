-- Cấu hình ẩn/hiện cột trang KPI theo tenant (admin thiết lập, mọi user trong tenant dùng chung).

CREATE TABLE IF NOT EXISTS public.tenant_kpi_column_settings (
  tenant_id VARCHAR(50) NOT NULL,
  column_visibility JSONB NOT NULL DEFAULT '{
    "territory": true,
    "revenueNew": true,
    "revenueExisting": true,
    "revenueTotal": true,
    "contracts": true,
    "approach": true
  }'::jsonb,
  updated_at INT8 NULL,
  updated_by VARCHAR(50) NULL,
  CONSTRAINT tenant_kpi_column_settings_pkey PRIMARY KEY (tenant_id)
);

COMMENT ON TABLE public.tenant_kpi_column_settings IS 'Cấu hình hiển thị cột trang KPI — áp dụng cho toàn bộ user trong tenant.';
COMMENT ON COLUMN public.tenant_kpi_column_settings.column_visibility IS 'JSON: territory, revenueNew, revenueExisting, revenueTotal, approach (boolean).';
