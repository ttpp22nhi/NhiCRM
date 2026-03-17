-- ============================================
-- Display Code: Mã hiển thị tự động cho Deals và Tasks
-- Định dạng: PREFIX-YYMM-NNN (VD: DEAL-2602-001, TSK-2602-001)
-- Unique trong cùng tenant_id.
-- ============================================

-- Deals: thêm cột display_code
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS display_code VARCHAR(50) NULL;

COMMENT ON COLUMN public.deals.display_code IS 'Mã hiển thị tự động: DEAL-YYMM-NNN, unique theo tenant';

-- Index để tra cứu nhanh và đảm bảo unique (tenant_id, display_code) khi không NULL
CREATE UNIQUE INDEX IF NOT EXISTS idx_deals_tenant_display_code
  ON public.deals (tenant_id, display_code)
  WHERE display_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_deals_display_code
  ON public.deals (display_code)
  WHERE display_code IS NOT NULL;

-- Tasks: thêm cột display_code
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS display_code VARCHAR(50) NULL;

COMMENT ON COLUMN public.tasks.display_code IS 'Mã hiển thị tự động: TSK-YYMM-NNN, unique theo tenant';

CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_tenant_display_code
  ON public.tasks (tenant_id, display_code)
  WHERE display_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_display_code
  ON public.tasks (display_code)
  WHERE display_code IS NOT NULL;
