-- =============================================================================
-- CẢNH BÁO: Script phá dữ liệu — chỉ chạy khi đã BACKUP database (pg_dump).
--
-- Xóa gần như toàn bộ dữ liệu. GIỮ LẠI DUY NHẤT:
--   - Nhân viên: role = super_admin VÀ tenant_id IS NULL (super admin hệ thống).
--
-- Template role_permissions (tenant_id IS NULL) được giữ.
--
-- Thứ tự xóa: bảng con / nhật ký tham chiếu deal-customer TRƯỚC deals/customers
-- (tránh FK và lỗi "transaction is aborted" / 25P02 trên các lệnh sau).
--
-- Nếu vẫn lỗi: trong DBeaver xem dòng lỗi ĐẦU TIÊN (25P02 chỉ là hậu quả).
-- Chạy: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/wipe_for_production_keep_mbf_tayninh.sql
-- =============================================================================

BEGIN;

SET LOCAL statement_timeout = '30min';

UPDATE public.employees SET department_id = NULL WHERE department_id IS NOT NULL;

-- Bảng có thể chưa có nếu thiếu migration (bỏ qua nếu không tồn tại)
DO $$ BEGIN DELETE FROM public.deal_activities; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN DELETE FROM public.task_activities; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN DELETE FROM public.deal_attachments; EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- Tham chiếu deal_id / customer_id: xóa trước deals & customers
DELETE FROM public.interactions;
DELETE FROM public.notifications;

DELETE FROM public.transfer_approval_logs;
DELETE FROM public.transfer_requests;

DELETE FROM public.tasks;

DO $$ BEGIN DELETE FROM public.cbs_revenue_orders; EXCEPTION WHEN undefined_table THEN NULL; END $$;

DELETE FROM public.deals;

DO $$ BEGIN DELETE FROM public.kpis; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN DELETE FROM public.activities; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN DELETE FROM public.kpi_targets; EXCEPTION WHEN undefined_table THEN NULL; END $$;

DELETE FROM public.customers;

DO $$ BEGIN DELETE FROM public.cbs_config; EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN DELETE FROM public.pipeline_stages; EXCEPTION WHEN undefined_table THEN NULL; END $$;

DELETE FROM public.organization_levels;
DELETE FROM public.departments;

DELETE FROM public.role_permissions WHERE tenant_id IS NOT NULL;

DELETE FROM public.employees
WHERE NOT (
  LOWER(TRIM(COALESCE(role, ''))) = 'super_admin'
  AND tenant_id IS NULL
);

DELETE FROM public.tenants;

UPDATE public.employees SET department_id = NULL WHERE department_id IS NOT NULL;

COMMIT;
