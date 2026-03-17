-- Phân loại chất lượng cơ hội (Confidence Level) - Traffic Light cho Deal
-- high = Chắc chắn (Xanh), medium = 50/50 (Vàng), low = Rủi ro cao (Đỏ)

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS confidence_level VARCHAR(20) DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS confidence_note TEXT NULL;

ALTER TABLE public.deals DROP CONSTRAINT IF EXISTS chk_confidence_level;
ALTER TABLE public.deals ADD CONSTRAINT chk_confidence_level
  CHECK (confidence_level IN ('high', 'medium', 'low'));

COMMENT ON COLUMN public.deals.confidence_level IS 'Mức độ tự tin: high (Xanh), medium (Vàng), low (Đỏ). Bắt buộc nhập confidence_note khi low.';
COMMENT ON COLUMN public.deals.confidence_note IS 'Ghi chú lý do đánh giá (bắt buộc khi confidence_level = low).';

CREATE INDEX IF NOT EXISTS idx_deals_confidence_level ON public.deals (tenant_id, confidence_level)
  WHERE COALESCE(is_deleted, false) = false;
