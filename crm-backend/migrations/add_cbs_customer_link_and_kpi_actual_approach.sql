-- =============================================================================
-- Migration: Đồng bộ hoá các module (must-have)
-- 1) cbs_revenue_orders: thêm customer_id, deal_id, kpi_kind_at_approve
--    → link cứng đơn doanh thu CBS sang CRM (Customer/Deal), snapshot loại KPI
--    lúc duyệt để báo cáo cũ không bị đổi về sau khi khách chuyển NEW→EXISTING.
-- 2) kpis: thêm actual_approach_count — số lần tiếp cận thực tế trong kỳ
--    (đối chiếu với target approach_count).
-- 3) Backfill:
--    - Liên kết customer_id cho đơn CBS cũ theo tax_code/phone (best-effort).
--    - Snapshot kpi_kind_at_approve cho các đơn đã duyệt (nếu chưa có).
--    - Tính lại actual_approach_count cho toàn bộ kỳ đã có trong kpis.
-- Idempotent: ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) cbs_revenue_orders: liên kết CRM + snapshot phân loại KPI
-- ---------------------------------------------------------------------------
ALTER TABLE public.cbs_revenue_orders
  ADD COLUMN IF NOT EXISTS customer_id VARCHAR(50) NULL;
ALTER TABLE public.cbs_revenue_orders
  ADD COLUMN IF NOT EXISTS deal_id VARCHAR(50) NULL;
ALTER TABLE public.cbs_revenue_orders
  ADD COLUMN IF NOT EXISTS kpi_kind_at_approve VARCHAR(20) NULL;

CREATE INDEX IF NOT EXISTS idx_cbs_revenue_orders_customer
  ON public.cbs_revenue_orders (tenant_id, customer_id)
  WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cbs_revenue_orders_deal
  ON public.cbs_revenue_orders (tenant_id, deal_id)
  WHERE deal_id IS NOT NULL;

COMMENT ON COLUMN public.cbs_revenue_orders.customer_id IS
  'Liên kết sang customers.customer_id (có thể NULL nếu chưa khớp/tạo).';
COMMENT ON COLUMN public.cbs_revenue_orders.deal_id IS
  'Liên kết sang deals.deal_id — dùng để tránh double-count KPI với Deal thắng.';
COMMENT ON COLUMN public.cbs_revenue_orders.kpi_kind_at_approve IS
  'NEW | EXISTING — snapshot lúc duyệt để báo cáo cũ ổn định khi khách đổi trạng thái.';

-- ---------------------------------------------------------------------------
-- 2) kpis: actual_approach_count (số lần tiếp cận thực tế)
-- ---------------------------------------------------------------------------
ALTER TABLE public.kpis
  ADD COLUMN IF NOT EXISTS actual_approach_count INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.kpis.actual_approach_count IS
  'Số lần tiếp cận thực tế (suy ra từ interactions trong kỳ — đơn vị: lần).';

-- ---------------------------------------------------------------------------
-- 3a) Backfill customer_id cho đơn CBS hiện có, match theo tax_code/phone
--     - Ưu tiên tax_code (duy nhất nhất).
--     - Nếu không khớp, fallback 9 chữ số cuối của phone.
--     Chỉ backfill khi chưa có customer_id để tránh ghi đè thay đổi thủ công.
-- ---------------------------------------------------------------------------
UPDATE public.cbs_revenue_orders o
   SET customer_id = c.customer_id
  FROM public.customers c
 WHERE o.customer_id IS NULL
   AND c.deleted_at IS NULL
   AND c.tenant_id = o.tenant_id
   AND o.external_id1 IS NOT NULL
   AND TRIM(o.external_id1) <> ''
   AND c.tax_code IS NOT NULL
   AND LOWER(TRIM(c.tax_code)) = LOWER(TRIM(o.external_id1));

UPDATE public.cbs_revenue_orders o
   SET customer_id = c.customer_id
  FROM public.customers c
 WHERE o.customer_id IS NULL
   AND c.deleted_at IS NULL
   AND c.tenant_id = o.tenant_id
   AND o.external_id1 IS NOT NULL
   AND c.phone IS NOT NULL
   AND length(regexp_replace(c.phone, '[^0-9]+', '', 'g')) >= 9
   AND length(regexp_replace(o.external_id1, '[^0-9]+', '', 'g')) >= 9
   AND right(regexp_replace(c.phone, '[^0-9]+', '', 'g'), 9)
     = right(regexp_replace(o.external_id1, '[^0-9]+', '', 'g'), 9);

-- 3b) Snapshot kpi_kind_at_approve cho đơn đã duyệt mà chưa có snapshot.
--     - Có customer_id → lấy customers.kpi_customer_kind.
--     - Không có → mặc định 'NEW'.
UPDATE public.cbs_revenue_orders o
   SET kpi_kind_at_approve = UPPER(COALESCE(NULLIF(TRIM(c.kpi_customer_kind), ''), 'NEW'))
  FROM public.customers c
 WHERE o.kpi_kind_at_approve IS NULL
   AND o.claim_status = 'approved'
   AND o.customer_id = c.customer_id
   AND c.tenant_id   = o.tenant_id
   AND c.deleted_at IS NULL;

UPDATE public.cbs_revenue_orders
   SET kpi_kind_at_approve = 'NEW'
 WHERE kpi_kind_at_approve IS NULL
   AND claim_status = 'approved';

-- 3c) Backfill actual_approach_count từ interactions (tenant × user × YYYY-MM).
--     Đếm distinct customer_id có tương tác trong kỳ để không tính trùng các
--     interaction rời rạc trên cùng một khách hàng (tránh lạm phát KPI).
WITH approach AS (
  SELECT
    i.tenant_id,
    i.employee_id AS user_id,
    to_char(to_timestamp(i.interaction_date / 1000.0), 'YYYY-MM') AS period,
    COUNT(DISTINCT i.customer_id) AS cnt
    FROM public.interactions i
   WHERE i.interaction_date IS NOT NULL
     AND i.customer_id IS NOT NULL
     AND i.employee_id IS NOT NULL
   GROUP BY 1, 2, 3
)
UPDATE public.kpis k
   SET actual_approach_count = a.cnt,
       updated_at = EXTRACT(EPOCH FROM NOW()) * 1000
  FROM approach a
 WHERE k.tenant_id = a.tenant_id
   AND k.user_id   = a.user_id
   AND k.period    = a.period;

-- =============================================================================
-- Cách chạy:
--   node run-migration.js add_cbs_customer_link_and_kpi_actual_approach.sql
-- =============================================================================
