-- Thêm tenant_id vào các bảng nghiệp vụ để CRUD theo đơn vị (tenant)
-- Chạy sau: backfill tenant_id từ employee tương ứng (assigned_to / employee_id)

-- 1. Customers
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(50) NULL;
CREATE INDEX IF NOT EXISTS idx_customers_tenant_id ON public.customers (tenant_id);
-- Backfill: gán tenant_id từ nhân viên được gán (assigned_to)
UPDATE public.customers c
SET tenant_id = (SELECT e.tenant_id FROM employees e WHERE e.employee_id = c.assigned_to LIMIT 1)
WHERE c.tenant_id IS NULL AND c.assigned_to IS NOT NULL;

-- 2. Deals
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(50) NULL;
CREATE INDEX IF NOT EXISTS idx_deals_tenant_id ON public.deals (tenant_id);
UPDATE public.deals d
SET tenant_id = (SELECT e.tenant_id FROM employees e WHERE e.employee_id = d.assigned_to LIMIT 1)
WHERE d.tenant_id IS NULL AND d.assigned_to IS NOT NULL;

-- 3. Tasks
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(50) NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_tenant_id ON public.tasks (tenant_id);
UPDATE public.tasks t
SET tenant_id = (SELECT e.tenant_id FROM employees e WHERE e.employee_id = t.assigned_to LIMIT 1)
WHERE t.tenant_id IS NULL AND t.assigned_to IS NOT NULL;

-- 4. Interactions (liên kết qua customer -> assigned_to hoặc employee_id)
ALTER TABLE public.interactions ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(50) NULL;
CREATE INDEX IF NOT EXISTS idx_interactions_tenant_id ON public.interactions (tenant_id);
UPDATE public.interactions i
SET tenant_id = (
  SELECT e.tenant_id FROM employees e
  WHERE e.employee_id = i.employee_id
  LIMIT 1
)
WHERE i.tenant_id IS NULL AND i.employee_id IS NOT NULL;
UPDATE public.interactions i
SET tenant_id = (
  SELECT c.tenant_id FROM customers c WHERE c.customer_id = i.customer_id LIMIT 1
)
WHERE i.tenant_id IS NULL AND i.customer_id IS NOT NULL;

-- 5. Notifications (theo employee_id)
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(50) NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_id ON public.notifications (tenant_id);
UPDATE public.notifications n
SET tenant_id = (SELECT e.tenant_id FROM employees e WHERE e.employee_id = n.employee_id LIMIT 1)
WHERE n.tenant_id IS NULL;

COMMENT ON COLUMN public.customers.tenant_id IS 'Multi-tenant: đơn vị (công ty) sở hữu khách hàng';
COMMENT ON COLUMN public.deals.tenant_id IS 'Multi-tenant: đơn vị sở hữu deal';
COMMENT ON COLUMN public.tasks.tenant_id IS 'Multi-tenant: đơn vị sở hữu task';
COMMENT ON COLUMN public.interactions.tenant_id IS 'Multi-tenant: đơn vị sở hữu tương tác';
COMMENT ON COLUMN public.notifications.tenant_id IS 'Multi-tenant: đơn vị (employee)';

-- 6. Transfer requests (chuyển giao trong nội bộ đơn vị)
ALTER TABLE public.transfer_requests ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(50) NULL;
CREATE INDEX IF NOT EXISTS idx_transfer_requests_tenant_id ON public.transfer_requests (tenant_id);
UPDATE public.transfer_requests tr
SET tenant_id = (SELECT e.tenant_id FROM employees e WHERE e.employee_id = tr.sender_id LIMIT 1)
WHERE tr.tenant_id IS NULL;
