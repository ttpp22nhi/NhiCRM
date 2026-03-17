-- ============================================
-- Analytics Cache: metadata JSONB trên deals (VD: task_total, task_completed)
-- ============================================

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.deals.metadata IS 'Cache thống kê nhanh: task_total, task_completed, ... (cập nhật khi task liên quan thay đổi)';

CREATE INDEX IF NOT EXISTS idx_deals_metadata ON public.deals USING gin (metadata);
