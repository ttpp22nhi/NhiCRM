-- ==========================================================================
-- CBS revenue orders: thêm quy trình "chờ duyệt" cho Sales tự tích đơn.
--   claim_status:
--     NULL          = chưa có người bán
--     'pending'     = Sales tự tích, chờ duyệt
--     'approved'    = đã xác nhận (manager/admin gán hoặc duyệt)
-- ==========================================================================

ALTER TABLE public.cbs_revenue_orders
  ADD COLUMN IF NOT EXISTS claim_status VARCHAR(20) NULL;

ALTER TABLE public.cbs_revenue_orders
  ADD COLUMN IF NOT EXISTS approved_by VARCHAR(50) NULL;

ALTER TABLE public.cbs_revenue_orders
  ADD COLUMN IF NOT EXISTS approved_at BIGINT NULL;

-- Dữ liệu cũ: đơn đã có claimed_by → coi như đã duyệt (self-approved) để không chặn UI
UPDATE public.cbs_revenue_orders
   SET claim_status = 'approved',
       approved_by = claimed_by,
       approved_at = claimed_at
 WHERE claimed_by IS NOT NULL
   AND claim_status IS NULL;

CREATE INDEX IF NOT EXISTS idx_cbs_revenue_orders_claim_status
  ON public.cbs_revenue_orders (tenant_id, claim_status)
  WHERE claim_status IS NOT NULL;

COMMENT ON COLUMN public.cbs_revenue_orders.claim_status  IS 'NULL | pending | approved — trạng thái xác nhận người bán cho đơn CBS.';
COMMENT ON COLUMN public.cbs_revenue_orders.approved_by   IS 'employee_id của người đã duyệt (manager/admin/...).';
COMMENT ON COLUMN public.cbs_revenue_orders.approved_at   IS 'Thời điểm duyệt (epoch ms).';
