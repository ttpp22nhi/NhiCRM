-- ==========================================================================
-- CBS: Admin tenant chọn tự duyệt khi Sales tự tích đơn hay cần kiểm duyệt.
--   FALSE (mặc định) = Sales claim → claim_status 'pending'
--   TRUE            = Sales claim → claim_status 'approved' ngay
-- ==========================================================================

ALTER TABLE public.cbs_config
  ADD COLUMN IF NOT EXISTS sales_claim_auto_approve BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.cbs_config.sales_claim_auto_approve IS
  'TRUE: Sales tự tích đơn được duyệt ngay; FALSE: chờ admin/quản lý duyệt.';
