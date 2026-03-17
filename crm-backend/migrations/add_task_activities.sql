-- ============================================
-- Bảng hoạt động / ghi chú theo Task (timeline task)
-- ============================================

CREATE TABLE IF NOT EXISTS public.task_activities (
  id VARCHAR(50) NOT NULL,
  task_id VARCHAR(50) NOT NULL,
  content TEXT NULL,
  type VARCHAR(20) NOT NULL DEFAULT 'note',
  created_by VARCHAR(50) NULL,
  tenant_id VARCHAR(50) NOT NULL,
  created_at BIGINT NOT NULL,
  CONSTRAINT task_activities_pkey PRIMARY KEY (id),
  CONSTRAINT task_activities_type_check CHECK (type IN ('note', 'system'))
);

CREATE INDEX IF NOT EXISTS idx_task_activities_task_id ON public.task_activities (task_id);
CREATE INDEX IF NOT EXISTS idx_task_activities_tenant_id ON public.task_activities (tenant_id);
CREATE INDEX IF NOT EXISTS idx_task_activities_created_at ON public.task_activities (created_at DESC);

COMMENT ON TABLE public.task_activities IS 'Timeline: ghi chú và sự kiện hệ thống theo task';
COMMENT ON COLUMN public.task_activities.type IS 'note: ghi chú của user; system: sự kiện hệ thống';
