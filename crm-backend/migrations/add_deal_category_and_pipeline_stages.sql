-- ============================================
-- 1. Thêm cột deal_category vào bảng deals
-- ============================================
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS deal_category VARCHAR(20) DEFAULT 'MASS';

COMMENT ON COLUMN public.deals.deal_category IS 'MASS = Sản phẩm đại trà, PROJECT = Dự án Customize';

-- Ràng buộc giá trị
ALTER TABLE public.deals DROP CONSTRAINT IF EXISTS chk_deal_category;
ALTER TABLE public.deals ADD CONSTRAINT chk_deal_category
  CHECK (deal_category IN ('MASS', 'PROJECT'));

CREATE INDEX IF NOT EXISTS idx_deals_deal_category ON public.deals (tenant_id, deal_category);

-- ============================================
-- 2. Bảng pipeline_stages: cấu hình giai đoạn theo từng loại deal
-- ============================================
CREATE TABLE IF NOT EXISTS public.pipeline_stages (
  id VARCHAR(50) NOT NULL PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL,
  deal_category VARCHAR(20) NOT NULL,
  stage_key VARCHAR(50) NOT NULL,
  label VARCHAR(100) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  color VARCHAR(50) NULL,
  task_assign_department_id VARCHAR(50) NULL,
  created_at BIGINT NULL,
  CONSTRAINT chk_pipeline_stages_category CHECK (deal_category IN ('MASS', 'PROJECT')),
  CONSTRAINT uq_pipeline_stages_tenant_category_key UNIQUE (tenant_id, deal_category, stage_key)
);

CREATE INDEX IF NOT EXISTS idx_pipeline_stages_tenant_category ON public.pipeline_stages (tenant_id, deal_category);

COMMENT ON TABLE public.pipeline_stages IS 'Cấu hình các bước pipeline theo deal_category (MASS / PROJECT)';
COMMENT ON COLUMN public.pipeline_stages.task_assign_department_id IS 'Khi chuyển deal sang stage này (PROJECT): gán task tự động cho nhân viên thuộc department này (vd: Kỹ thuật/Giải pháp)';

-- Seed mặc định MASS (giữ giống hiện tại)
-- Seed mặc định PROJECT (thêm Khảo sát; task_assign_department_id để admin cấu hình sau)
-- Sẽ seed qua API hoặc migration riêng nếu cần; ở đây chỉ tạo bảng.
