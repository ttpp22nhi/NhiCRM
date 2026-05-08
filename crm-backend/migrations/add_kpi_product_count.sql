-- =============================================================================
-- Migration: Thêm chỉ tiêu & thực hiện "Số lượng sản phẩm đã bán" cho KPI tháng.
--
-- Bối cảnh nghiệp vụ:
--   Yêu cầu của business: mỗi lần bán cho 1 khách hàng được tính là 1 "sản phẩm
--   đã bán" (kể cả cùng 1 mã sản phẩm bán cho 5 khách → vẫn là 5). Vì vậy:
--     - target_product_count : Chỉ tiêu số sản phẩm bán trong kỳ (INT >= 0).
--     - actual_product_count : Thực hiện trong kỳ, tổng hợp từ 2 nguồn:
--         (1) Deal thắng (status = 'won' hoặc stage = 'thanh_cong')
--             → SUM(COALESCE(deals.quantity, 1))  (mỗi deal tối thiểu = 1)
--         (2) CBS Order đã duyệt NHƯNG KHÔNG có deal_id (tránh double-count)
--             → COUNT(*)  (mỗi order CBS = 1 sản phẩm)
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + backfill chỉ khi giá trị hiện tại = 0.
-- =============================================================================

ALTER TABLE public.kpis
  ADD COLUMN IF NOT EXISTS target_product_count INT NOT NULL DEFAULT 0;
ALTER TABLE public.kpis
  ADD COLUMN IF NOT EXISTS actual_product_count INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.kpis.target_product_count IS
  'Chỉ tiêu số sản phẩm đã bán trong kỳ — đơn vị: sản phẩm (số nguyên).';
COMMENT ON COLUMN public.kpis.actual_product_count IS
  'Thực tế số sản phẩm đã bán (deals thắng + CBS order đã duyệt không có deal_id). Mỗi khách hàng = 1 sản phẩm kể cả cùng mã.';

-- ---------------------------------------------------------------------------
-- Backfill actual_product_count cho các (tenant, user, period) đã có sẵn.
-- Dùng CTE hợp nhất 2 nguồn (deals thắng + CBS không có deal_id).
-- ---------------------------------------------------------------------------
WITH from_deals AS (
  SELECT
    d.tenant_id,
    d.assigned_to AS user_id,
    to_char(to_timestamp(COALESCE(d.expected_closing_date, d.updated_at) / 1000.0), 'YYYY-MM') AS period,
    SUM(COALESCE(d.quantity, 1))::int AS cnt
  FROM public.deals d
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
    COUNT(*)::int AS cnt
  FROM public.cbs_revenue_orders o
  WHERE o.claim_status = 'approved'
    AND o.deal_id IS NULL
    AND o.claimed_by IS NOT NULL
    AND o.period_ym IS NOT NULL
  GROUP BY 1, 2, 3
),
merged AS (
  SELECT tenant_id, user_id, period, SUM(cnt)::int AS cnt
  FROM (
    SELECT * FROM from_deals
    UNION ALL
    SELECT * FROM from_cbs
  ) x
  GROUP BY 1, 2, 3
)
UPDATE public.kpis k
   SET actual_product_count = m.cnt,
       updated_at = EXTRACT(EPOCH FROM NOW()) * 1000
  FROM merged m
 WHERE k.tenant_id = m.tenant_id
   AND k.user_id   = m.user_id
   AND k.period    = m.period
   AND COALESCE(k.actual_product_count, 0) = 0;

-- =============================================================================
-- Cách chạy (từ thư mục crm-backend):
--   node run-migration.js add_kpi_product_count.sql
-- =============================================================================
