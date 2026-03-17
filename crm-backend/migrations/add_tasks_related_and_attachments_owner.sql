-- ============================================
-- Liên kết độc lập: Tasks (related_type/related_id) & Deal attachments (owner_type/owner_id/context_deal_id)
-- ============================================

-- ---------------------------------------------------------------------------
-- 1. TASKS: Thêm cột liên kết tới bất kỳ thực thể nào (Deal, Customer, ...)
-- ---------------------------------------------------------------------------
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS related_type VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS related_id   VARCHAR(50) NULL;

COMMENT ON COLUMN public.tasks.related_type IS 'Loại thực thể liên kết: DEAL, CUSTOMER, ...';
COMMENT ON COLUMN public.tasks.related_id   IS 'ID của thực thể (deal_id, customer_id, ...)';

CREATE INDEX IF NOT EXISTS idx_tasks_related_type ON public.tasks (related_type);
CREATE INDEX IF NOT EXISTS idx_tasks_related_id   ON public.tasks (related_id);
CREATE INDEX IF NOT EXISTS idx_tasks_related_type_id ON public.tasks (related_type, related_id);

-- ---------------------------------------------------------------------------
-- 2. DEAL_ATTACHMENTS: Thêm owner + context deal (hỗ trợ file đính kèm từ Task nhưng vẫn gắn Deal)
-- ---------------------------------------------------------------------------
ALTER TABLE public.deal_attachments
  ADD COLUMN IF NOT EXISTS owner_type     VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS owner_id       VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS context_deal_id VARCHAR(50) NULL;

COMMENT ON COLUMN public.deal_attachments.owner_type     IS 'DEAL = file thuộc deal; TASK = file upload từ task (owner_id = task_id)';
COMMENT ON COLUMN public.deal_attachments.owner_id       IS 'ID trực tiếp: deal_id khi owner_type=DEAL, task_id khi owner_type=TASK';
COMMENT ON COLUMN public.deal_attachments.context_deal_id IS 'Deal gốc: luôn set khi file gắn với deal (kể cả upload từ Task)';

-- Ràng buộc giá trị owner_type
ALTER TABLE public.deal_attachments
  DROP CONSTRAINT IF EXISTS deal_attachments_owner_type_check;
ALTER TABLE public.deal_attachments
  ADD CONSTRAINT deal_attachments_owner_type_check CHECK (owner_type IN ('DEAL', 'TASK'));

-- Backfill: bản ghi hiện có coi như thuộc deal (deal_id đã có)
UPDATE public.deal_attachments
SET owner_type     = 'DEAL',
    owner_id       = deal_id,
    context_deal_id = deal_id
WHERE owner_type IS NULL;

CREATE INDEX IF NOT EXISTS idx_deal_attachments_owner_type ON public.deal_attachments (owner_type);
CREATE INDEX IF NOT EXISTS idx_deal_attachments_owner_id   ON public.deal_attachments (owner_id);
CREATE INDEX IF NOT EXISTS idx_deal_attachments_context_deal_id ON public.deal_attachments (context_deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_attachments_owner_type_id ON public.deal_attachments (owner_type, owner_id);
