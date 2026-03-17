-- ============================================
-- Timeline & Tài liệu đính kèm cho Deals
-- ============================================

-- Bảng hoạt động / ghi chú theo deal (Timeline)
CREATE TABLE IF NOT EXISTS public.deal_activities (
  id VARCHAR(50) NOT NULL,
  deal_id VARCHAR(50) NOT NULL,
  stage VARCHAR(50) NULL,
  content TEXT NULL,
  type VARCHAR(20) NOT NULL DEFAULT 'note',
  created_by VARCHAR(50) NULL,
  tenant_id VARCHAR(50) NOT NULL,
  created_at BIGINT NOT NULL,
  CONSTRAINT deal_activities_pkey PRIMARY KEY (id),
  CONSTRAINT deal_activities_type_check CHECK (type IN ('note', 'system'))
);

CREATE INDEX IF NOT EXISTS idx_deal_activities_deal_id ON public.deal_activities (deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_activities_tenant_id ON public.deal_activities (tenant_id);
CREATE INDEX IF NOT EXISTS idx_deal_activities_created_at ON public.deal_activities (created_at DESC);

COMMENT ON TABLE public.deal_activities IS 'Timeline: ghi chú (note) và sự kiện hệ thống (system) theo deal';
COMMENT ON COLUMN public.deal_activities.type IS 'note: ghi chú của user; system: tự động khi đổi giai đoạn';

-- Bảng file đính kèm theo deal
CREATE TABLE IF NOT EXISTS public.deal_attachments (
  id VARCHAR(50) NOT NULL,
  deal_id VARCHAR(50) NOT NULL,
  stage VARCHAR(50) NULL,
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(512) NOT NULL,
  file_size BIGINT NULL,
  uploaded_by VARCHAR(50) NULL,
  tenant_id VARCHAR(50) NOT NULL,
  created_at BIGINT NOT NULL,
  CONSTRAINT deal_attachments_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_deal_attachments_deal_id ON public.deal_attachments (deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_attachments_tenant_id ON public.deal_attachments (tenant_id);

COMMENT ON TABLE public.deal_attachments IS 'Tài liệu đính kèm theo deal, lưu file_path tương đối (storage/tenant_id/deals/deal_id/...)';
