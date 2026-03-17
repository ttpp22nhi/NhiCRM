-- ============================================
-- Hủy bỏ & Xóa mềm cho Deals
-- - status: active | cancelled | lost | won
-- - loss_reason: lý do khi cancelled/lost
-- - is_deleted, deleted_at: soft delete
-- ============================================

-- Chuẩn hóa status (giữ active, cancelled; thêm lost, won; closed -> won nếu cần)
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS loss_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at BIGINT NULL;

COMMENT ON COLUMN public.deals.loss_reason IS 'Lý do hủy/thất bại khi status = cancelled hoặc lost';
COMMENT ON COLUMN public.deals.is_deleted IS 'Xóa mềm: true = đã xóa';
COMMENT ON COLUMN public.deals.deleted_at IS 'Thời điểm xóa mềm (epoch ms)';

-- Cập nhật giá trị status cũ 'closed' -> 'won' (tùy chọn, không bắt buộc)
-- UPDATE public.deals SET status = 'won' WHERE status = 'closed';

CREATE INDEX IF NOT EXISTS idx_deals_is_deleted ON public.deals (is_deleted) WHERE is_deleted = false;
