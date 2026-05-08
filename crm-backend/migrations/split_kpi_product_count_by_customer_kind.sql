-- =============================================================================
-- Migration: Tách KPI "Số sản phẩm đã bán" theo loại khách hàng (NEW/EXISTING).
--
-- Lý do:
--   Business cần đối chiếu mức đóng góp sản phẩm theo từng tập khách (giống
--   như doanh thu đã tách new/existing). Thay `target_product_count` /
--   `actual_product_count` thành 4 cột:
--     - target_product_count_new         / target_product_count_existing
--     - actual_product_count_new         / actual_product_count_existing
--
-- Quy tắc tính (actual):
--   (1) Deal thắng trong kỳ:
--         SUM(COALESCE(d.quantity, 1)) nhóm theo kpi_customer_kind
--         của customer tại thời điểm tính (NEW = mặc định nếu null).
--   (2) CBS order đã duyệt NHƯNG KHÔNG có deal_id (tránh double-count):
--         mỗi order = 1 sản phẩm; nhóm theo kpi_kind_at_approve (snapshot);
--         fallback customers.kpi_customer_kind; fallback cuối 'NEW'.
--
-- Quy tắc migrate target:
--   - Toàn bộ giá trị cũ (nếu có) dồn về target_product_count_new; trước đó
--     UI chưa tách new/existing nên coi đó là chỉ tiêu chung → ưu tiên NEW.
--
-- Idempotent: ADD/DROP COLUMN IF NOT EXISTS.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Thêm 4 cột mới (nếu chưa có) — NOT NULL DEFAULT 0 để tương thích ngược.
-- ---------------------------------------------------------------------------
ALTER TABLE public.kpis
  ADD COLUMN IF NOT EXISTS target_product_count_new      INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS target_product_count_existing INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_product_count_new      INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_product_count_existing INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.kpis.target_product_count_new IS
  'Chỉ tiêu số sản phẩm bán cho KH mới (NEW) — số nguyên không âm.';
COMMENT ON COLUMN public.kpis.target_product_count_existing IS
  'Chỉ tiêu số sản phẩm bán cho KH hiện hữu (EXISTING) — số nguyên không âm.';
COMMENT ON COLUMN public.kpis.actual_product_count_new IS
  'Thực tế số sản phẩm đã bán cho KH mới (deal thắng + CBS không có deal_id).';
COMMENT ON COLUMN public.kpis.actual_product_count_existing IS
  'Thực tế số sản phẩm đã bán cho KH hiện hữu (deal thắng + CBS không có deal_id).';

-- ---------------------------------------------------------------------------
-- 2) Migrate target cũ → gán toàn bộ vào target_product_count_new.
--    Chỉ áp dụng khi cột cũ còn tồn tại (tránh lỗi khi rerun migration).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'kpis'
       AND column_name = 'target_product_count'
  ) THEN
    EXECUTE 'UPDATE public.kpis
                SET target_product_count_new = GREATEST(COALESCE(target_product_count_new, 0), COALESCE(target_product_count, 0))
              WHERE COALESCE(target_product_count, 0) > 0';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 3) Backfill actual_product_count_new / actual_product_count_existing:
--    tính lại từ deals + CBS, nhóm theo loại KH. Chỉ áp dụng khi 2 cột mới
--    đang ở 0 (để không ghi đè số liệu đã có khi rerun).
-- ---------------------------------------------------------------------------
WITH from_deals AS (
  SELECT
    d.tenant_id,
    d.assigned_to AS user_id,
    to_char(to_timestamp(COALESCE(d.expected_closing_date, d.updated_at) / 1000.0), 'YYYY-MM') AS period,
    SUM(CASE WHEN UPPER(TRIM(COALESCE(c.kpi_customer_kind, 'NEW'))) = 'EXISTING'
             THEN COALESCE(d.quantity, 1) ELSE 0 END)::int AS cnt_existing,
    SUM(CASE WHEN UPPER(TRIM(COALESCE(c.kpi_customer_kind, 'NEW'))) = 'EXISTING'
             THEN 0 ELSE COALESCE(d.quantity, 1) END)::int AS cnt_new
  FROM public.deals d
  LEFT JOIN public.customers c
    ON c.customer_id = d.customer_id AND c.tenant_id = d.tenant_id AND c.deleted_at IS NULL
  WHERE COALESCE(d.is_deleted, false) = false
    AND (d.status = 'won' OR LOWER(TRIM(COALESCE(d.stage, ''))) = 'thanh_cong')
    AND d.assigned_to IS NOT NULL
    AND COALESCE(d.expected_closing_date, d.updated_at) IS NOT NULL
  GROUP BY 1, 2, 3
),
from_cbs AS (
  SELECT
    o.tenant_id,
    o.claimed_by AS user_id,
    o.period_ym AS period,
    SUM(CASE WHEN UPPER(COALESCE(
             NULLIF(TRIM(o.kpi_kind_at_approve), ''),
             NULLIF(TRIM(c.kpi_customer_kind), ''),
             'NEW'
           )) = 'EXISTING' THEN 1 ELSE 0 END)::int AS cnt_existing,
    SUM(CASE WHEN UPPER(COALESCE(
             NULLIF(TRIM(o.kpi_kind_at_approve), ''),
             NULLIF(TRIM(c.kpi_customer_kind), ''),
             'NEW'
           )) = 'EXISTING' THEN 0 ELSE 1 END)::int AS cnt_new
  FROM public.cbs_revenue_orders o
  LEFT JOIN public.customers c
    ON c.customer_id = o.customer_id AND c.tenant_id = o.tenant_id AND c.deleted_at IS NULL
  WHERE o.claim_status = 'approved'
    AND o.deal_id IS NULL
    AND o.claimed_by IS NOT NULL
    AND o.period_ym IS NOT NULL
  GROUP BY 1, 2, 3
),
merged AS (
  SELECT tenant_id, user_id, period,
         SUM(cnt_new)::int      AS cnt_new,
         SUM(cnt_existing)::int AS cnt_existing
  FROM (
    SELECT * FROM from_deals
    UNION ALL
    SELECT * FROM from_cbs
  ) x
  GROUP BY 1, 2, 3
)
UPDATE public.kpis k
   SET actual_product_count_new      = m.cnt_new,
       actual_product_count_existing = m.cnt_existing,
       updated_at = EXTRACT(EPOCH FROM NOW()) * 1000
  FROM merged m
 WHERE k.tenant_id = m.tenant_id
   AND k.user_id   = m.user_id
   AND k.period    = m.period
   AND COALESCE(k.actual_product_count_new, 0) = 0
   AND COALESCE(k.actual_product_count_existing, 0) = 0;

-- ---------------------------------------------------------------------------
-- 4) Xoá cột cũ sau khi đã migrate (IF EXISTS để rerun an toàn).
-- ---------------------------------------------------------------------------
ALTER TABLE public.kpis DROP COLUMN IF EXISTS target_product_count;
ALTER TABLE public.kpis DROP COLUMN IF EXISTS actual_product_count;

-- =============================================================================
-- Cách chạy (từ thư mục crm-backend):
--   node run-migration.js split_kpi_product_count_by_customer_kind.sql
-- =============================================================================
