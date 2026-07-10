-- Index hỗ trợ upsert theo khóa nghiệp vụ CBS:
-- HĐ + mã SP + ngày kích hoạt (+ serial) — không gồm giá.
-- Idempotent.

CREATE INDEX IF NOT EXISTS idx_cbs_revenue_orders_biz_key
  ON public.cbs_revenue_orders (
    tenant_id,
    period_ym,
    contract_no,
    product_code,
    serial
  );

COMMENT ON COLUMN public.cbs_revenue_orders.fingerprint IS
  'Hash phụ (có thể gồm giá) — unique index legacy. Upsert chính theo HĐ + mã SP + ngày kích hoạt (+ serial).';
