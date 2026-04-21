-- ============================================
-- Thêm field phục vụ nghiệp vụ CBS ↔ Deal ↔ KPI
--
-- 1) primary_product_code:
--    mã dịch vụ chính của deal (vd TMQT123, INTERNET_DN...). Dùng để giúp
--    matcher CBS ↔ Deal ghép chính xác hơn trong tương lai (cùng masp/PPC).
-- 2) first_contact_date:
--    ngày tiếp cận đầu tiên của sale với khách/ cơ hội. Mặc định NULL; khi
--    NULL thì hiểu là bằng d.created_at. Hữu ích khi backlog nhập sau.
-- ============================================

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS primary_product_code VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS first_contact_date BIGINT NULL;

COMMENT ON COLUMN public.deals.primary_product_code IS
  'Mã dịch vụ / sản phẩm chính (sẽ dùng khớp CBS.masp khi tự động link đơn).';
COMMENT ON COLUMN public.deals.first_contact_date IS
  'Ngày sale tiếp cận lần đầu (epoch ms). Nếu NULL, hệ thống hiểu bằng created_at.';

CREATE INDEX IF NOT EXISTS idx_deals_primary_product_code
  ON public.deals (tenant_id, primary_product_code)
  WHERE primary_product_code IS NOT NULL;
