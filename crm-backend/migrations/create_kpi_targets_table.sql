-- ============================================
-- Bảng KPI Targets: chỉ tiêu doanh số theo tháng/năm và đơn vị
-- ============================================

CREATE TABLE IF NOT EXISTS public.kpi_targets (
  id VARCHAR(50) NOT NULL PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL,
  department_id VARCHAR(50) NULL,
  scope_path VARCHAR(255) NULL,
  month INT NOT NULL,
  year INT NOT NULL,
  target_value NUMERIC(18, 2) NOT NULL DEFAULT 0,
  created_at BIGINT NULL,
  updated_at BIGINT NULL,
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_kpi_targets_tenant_global ON public.kpi_targets (tenant_id, month, year) WHERE department_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_kpi_targets_tenant_dept ON public.kpi_targets (tenant_id, department_id, month, year) WHERE department_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kpi_targets_tenant ON public.kpi_targets (tenant_id);
CREATE INDEX IF NOT EXISTS idx_kpi_targets_period ON public.kpi_targets (tenant_id, year, month);

COMMENT ON TABLE public.kpi_targets IS 'Chỉ tiêu doanh số theo tháng/năm; department_id NULL = toàn tenant';
