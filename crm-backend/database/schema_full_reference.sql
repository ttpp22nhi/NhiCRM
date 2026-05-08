-- ============================================
-- CRM MobiFone - Schema đầy đủ (một file duy nhất)
-- ============================================
-- Chỉ cần chạy file này MỘT LẦN trên database trống là đủ.
-- Không cần chạy từng migration trong thư mục migrations/.
-- Không dùng Foreign Key cứng theo yêu cầu dự án.
-- ============================================

-- ============================================
-- 1. TENANTS (create_tenants_table.sql + add_start_end_dates_to_tenants.sql)
-- ============================================
CREATE TABLE IF NOT EXISTS public.tenants (
  id VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  domain VARCHAR(255) NOT NULL,
  package_type VARCHAR(20) NOT NULL DEFAULT 'Starter',
  max_users INT NOT NULL DEFAULT 10,
  max_levels INT NOT NULL DEFAULT 5,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at INT8 NULL,
  updated_at INT8 NULL,
  start_date DATE NULL,
  end_date DATE NULL,
  CONSTRAINT tenants_pkey PRIMARY KEY (id),
  CONSTRAINT tenants_domain_unique UNIQUE (domain)
);
CREATE INDEX IF NOT EXISTS idx_tenants_domain ON public.tenants (domain);
CREATE INDEX IF NOT EXISTS idx_tenants_is_active ON public.tenants (is_active);
CREATE INDEX IF NOT EXISTS idx_tenants_start_date ON public.tenants (start_date);
CREATE INDEX IF NOT EXISTS idx_tenants_end_date ON public.tenants (end_date);

-- ============================================
-- 2. EMPLOYEES (schema gốc + add_tenant_id_multi_tenant + add_department_title_rank + alter_employees_username_email_unique_per_tenant)
-- ============================================
CREATE TABLE IF NOT EXISTS public.employees (
  employee_id VARCHAR(50) NOT NULL,
  username VARCHAR(50) NOT NULL,
  password_hash TEXT NOT NULL,
  full_name VARCHAR(100) NULL,
  email VARCHAR(100) NULL,
  phone VARCHAR(30) NULL,
  role VARCHAR(20) DEFAULT 'sales' NULL,
  is_active BOOLEAN DEFAULT true NULL,
  created_at INT8 NULL,
  tenant_id VARCHAR(50) NULL,
  department_id VARCHAR(50) NULL,
  title VARCHAR(100) NULL,
  rank VARCHAR(50) NULL,
  territory TEXT NULL,
  CONSTRAINT employees_pkey PRIMARY KEY (employee_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS employees_username_tenant_unique ON public.employees (username, tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS employees_email_tenant_unique ON public.employees (tenant_id, email) WHERE email IS NOT NULL AND email <> '';
CREATE INDEX IF NOT EXISTS idx_employees_tenant_id ON public.employees (tenant_id);
CREATE INDEX IF NOT EXISTS idx_employees_department_id ON public.employees (department_id);
CREATE INDEX IF NOT EXISTS idx_employees_phone ON public.employees (tenant_id, phone)
  WHERE phone IS NOT NULL AND TRIM(phone) <> '';

-- ============================================
-- 3. DEPARTMENTS (create_departments_table + add_tenant_id_multi_tenant + add_path_to_departments)
-- ============================================
CREATE TABLE IF NOT EXISTS public.departments (
  id VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  parent_id VARCHAR(50) NULL,
  type VARCHAR(20) NOT NULL DEFAULT 'department',
  created_at INT8 NULL,
  updated_at INT8 NULL,
  tenant_id VARCHAR(50) NULL,
  path TEXT NULL,
  CONSTRAINT departments_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_departments_parent_id ON public.departments (parent_id);
CREATE INDEX IF NOT EXISTS idx_departments_tenant_id ON public.departments (tenant_id);
CREATE INDEX IF NOT EXISTS idx_departments_path ON public.departments (path);

-- ============================================
-- 4. ORGANIZATION_LEVELS (create_organization_levels_table + add_tenant_id_to_organization_levels)
-- ============================================
CREATE TABLE IF NOT EXISTS public.organization_levels (
  id VARCHAR(50) NOT NULL,
  level_order INT NOT NULL,
  level_name VARCHAR(100) NOT NULL,
  created_at INT8 NULL,
  updated_at INT8 NULL,
  tenant_id VARCHAR(50) NULL,
  CONSTRAINT organization_levels_pkey PRIMARY KEY (id)
);
CREATE UNIQUE INDEX IF NOT EXISTS organization_levels_tenant_order_unique ON public.organization_levels (tenant_id, level_order);
CREATE INDEX IF NOT EXISTS idx_organization_levels_tenant_id ON public.organization_levels (tenant_id);

-- ============================================
-- 5. CUSTOMERS (schema gốc + add_deleted_at + add_tenant_id_to_business_tables)
-- ============================================
CREATE TABLE IF NOT EXISTS public.customers (
  customer_id VARCHAR(50) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(100) NULL,
  phone VARCHAR(20) NOT NULL,
  address TEXT NULL,
  customer_type VARCHAR(50) NULL,
  company_name VARCHAR(255) NULL,
  tax_code VARCHAR(50) NULL,
  source VARCHAR(100) NULL,
  created_at INT8 NULL,
  updated_at INT8 NULL,
  assigned_to VARCHAR(50) NULL,
  deleted_at INT8 NULL,
  tenant_id VARCHAR(50) NULL,
  CONSTRAINT customers_pkey PRIMARY KEY (customer_id)
);
CREATE INDEX IF NOT EXISTS idx_customers_deleted_at ON public.customers (deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_customers_tenant_id ON public.customers (tenant_id);

-- ============================================
-- 6. DEALS (schema gốc + add_status_and_assigned_to_to_deals + add_tenant_id_to_business_tables)
-- ============================================
CREATE TABLE IF NOT EXISTS public.deals (
  deal_id VARCHAR(50) NOT NULL,
  customer_id VARCHAR(50) NULL,
  title VARCHAR(255) NOT NULL,
  amount NUMERIC(15,2) DEFAULT 0 NULL,
  stage VARCHAR(50) NULL,
  expected_closing_date INT8 NULL,
  created_at INT8 NULL,
  status VARCHAR(50) DEFAULT 'active' NULL,
  assigned_to VARCHAR(50) NULL,
  updated_at INT8 NULL,
  tenant_id VARCHAR(50) NULL,
  primary_product_code VARCHAR(50) NULL,
  first_contact_date INT8 NULL,
  CONSTRAINT deals_pkey PRIMARY KEY (deal_id)
);
CREATE INDEX IF NOT EXISTS idx_deals_assigned_to ON public.deals (assigned_to);
CREATE INDEX IF NOT EXISTS idx_deals_status ON public.deals (status);
CREATE INDEX IF NOT EXISTS idx_deals_customer_id ON public.deals (customer_id);
CREATE INDEX IF NOT EXISTS idx_deals_stage ON public.deals (stage);
CREATE INDEX IF NOT EXISTS idx_deals_tenant_id ON public.deals (tenant_id);

-- ============================================
-- 7. TASKS (schema gốc + add_tenant_id_to_business_tables)
-- ============================================
CREATE TABLE IF NOT EXISTS public.tasks (
  task_id VARCHAR(50) NOT NULL,
  customer_id VARCHAR(50) NULL,
  title VARCHAR(255) NOT NULL,
  due_date INT8 NULL,
  priority VARCHAR(20) NULL,
  is_completed BOOLEAN DEFAULT false NULL,
  created_at INT8 NULL,
  assigned_to VARCHAR(50) NULL,
  tenant_id VARCHAR(50) NULL,
  CONSTRAINT tasks_pkey PRIMARY KEY (task_id)
);
CREATE INDEX IF NOT EXISTS idx_tasks_tenant_id ON public.tasks (tenant_id);

-- ============================================
-- 8. INTERACTIONS (schema gốc + add_tenant_id_to_business_tables)
-- ============================================
CREATE TABLE IF NOT EXISTS public.interactions (
  interaction_id VARCHAR(50) NOT NULL,
  customer_id VARCHAR(50) NULL,
  deal_id VARCHAR(50) NULL,
  interaction_type VARCHAR(50) NULL,
  content TEXT NULL,
  interaction_date INT8 NULL,
  employee_id VARCHAR(50) NULL,
  status VARCHAR(50) NULL,
  created_at INT8 NULL,
  tenant_id VARCHAR(50) NULL,
  CONSTRAINT interactions_pkey PRIMARY KEY (interaction_id)
);
CREATE INDEX IF NOT EXISTS idx_interactions_tenant_id ON public.interactions (tenant_id);

-- ============================================
-- 9. NOTIFICATIONS (schema gốc + add_tenant_id_to_business_tables)
-- ============================================
CREATE TABLE IF NOT EXISTS public.notifications (
  notification_id VARCHAR(50) NOT NULL,
  employee_id VARCHAR(50) NOT NULL,
  type VARCHAR(50) NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NULL,
  is_read BOOLEAN DEFAULT false NULL,
  created_at INT8 NULL,
  tenant_id VARCHAR(50) NULL,
  CONSTRAINT notifications_pkey PRIMARY KEY (notification_id)
);
CREATE INDEX IF NOT EXISTS idx_notifications_employee_id ON public.notifications (employee_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications (is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_id ON public.notifications (tenant_id);

-- ============================================
-- 10. ROLE_PERMISSIONS (create_role_permissions_table + add_tenant_id_multi_tenant + alter_role_permissions_unique_for_tenant)
-- ============================================
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id VARCHAR(50) NOT NULL,
  role_name VARCHAR(50) NOT NULL,
  resource VARCHAR(100) NOT NULL,
  action VARCHAR(50) NOT NULL,
  scope VARCHAR(20) NOT NULL DEFAULT 'personal',
  created_at INT8 NULL,
  updated_at INT8 NULL,
  tenant_id VARCHAR(50) NULL,
  CONSTRAINT role_permissions_pkey PRIMARY KEY (id),
  CONSTRAINT role_permissions_tenant_role_resource_action_unique UNIQUE (tenant_id, role_name, resource, action)
);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON public.role_permissions (role_name);
CREATE INDEX IF NOT EXISTS idx_role_permissions_resource ON public.role_permissions (resource);
CREATE INDEX IF NOT EXISTS idx_role_permissions_tenant_id ON public.role_permissions (tenant_id);

-- ============================================
-- 11. TRANSFER_REQUESTS (create_transfer_requests_table + add_approval_note + add_tenant_id_to_business_tables)
-- ============================================
CREATE TABLE IF NOT EXISTS public.transfer_requests (
  transfer_request_id VARCHAR(50) NOT NULL,
  customer_ids TEXT[] NOT NULL,
  sender_id VARCHAR(50) NOT NULL,
  receiver_id VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  note TEXT NULL,
  created_at INT8 NOT NULL,
  updated_at INT8 NULL,
  approved_by VARCHAR(50) NULL,
  approved_at INT8 NULL,
  approval_note TEXT NULL,
  tenant_id VARCHAR(50) NULL,
  CONSTRAINT transfer_requests_pkey PRIMARY KEY (transfer_request_id)
);
CREATE INDEX IF NOT EXISTS idx_transfer_requests_sender_id ON public.transfer_requests (sender_id);
CREATE INDEX IF NOT EXISTS idx_transfer_requests_receiver_id ON public.transfer_requests (receiver_id);
CREATE INDEX IF NOT EXISTS idx_transfer_requests_status ON public.transfer_requests (status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_transfer_requests_tenant_id ON public.transfer_requests (tenant_id);

-- ============================================
-- 12. TRANSFER_APPROVAL_LOGS (create_transfer_approval_logs_table)
-- ============================================
CREATE TABLE IF NOT EXISTS public.transfer_approval_logs (
  log_id VARCHAR(50) NOT NULL,
  transfer_request_id VARCHAR(50) NOT NULL,
  approver_id VARCHAR(50) NOT NULL,
  action VARCHAR(20) NOT NULL,
  approval_note TEXT NULL,
  sender_id VARCHAR(50) NULL,
  receiver_id VARCHAR(50) NULL,
  customer_count INT4 DEFAULT 0 NULL,
  created_at INT8 NOT NULL,
  CONSTRAINT transfer_approval_logs_pkey PRIMARY KEY (log_id)
);
CREATE INDEX IF NOT EXISTS idx_transfer_approval_logs_transfer_request_id ON public.transfer_approval_logs (transfer_request_id);
CREATE INDEX IF NOT EXISTS idx_transfer_approval_logs_approver_id ON public.transfer_approval_logs (approver_id);
CREATE INDEX IF NOT EXISTS idx_transfer_approval_logs_created_at ON public.transfer_approval_logs (created_at DESC);

-- ============================================
-- 13. CBS_CONFIG (add_cbs_revenue_schema.sql)
-- ============================================
CREATE TABLE IF NOT EXISTS public.cbs_config (
  tenant_id VARCHAR(50) NOT NULL,
  base_url VARCHAR(255) NOT NULL DEFAULT 'https://cbs.mobifone.vn',
  username VARCHAR(100) NOT NULL,
  password TEXT NOT NULL,
  unit INTEGER NOT NULL DEFAULT 880,
  report_config_code VARCHAR(100) NOT NULL DEFAULT 'REPORT_INVOICING_PREPAID',
  auto_sync BOOLEAN NOT NULL DEFAULT TRUE,
  last_synced_at BIGINT NULL,
  last_sync_status VARCHAR(20) NULL,
  last_sync_message TEXT NULL,
  updated_at BIGINT NULL,
  updated_by VARCHAR(50) NULL,
  CONSTRAINT cbs_config_pkey PRIMARY KEY (tenant_id)
);

-- ============================================
-- 14. CBS_REVENUE_ORDERS (add_cbs_revenue_schema.sql)
-- ============================================
CREATE TABLE IF NOT EXISTS public.cbs_revenue_orders (
  id VARCHAR(50) NOT NULL,
  tenant_id VARCHAR(50) NOT NULL,
  fingerprint VARCHAR(255) NOT NULL,
  period_ym VARCHAR(7) NULL,
  contract_no VARCHAR(255) NULL,
  contract_type VARCHAR(50) NULL,
  product_name VARCHAR(255) NULL,
  product_code VARCHAR(100) NULL,
  primary_product_code VARCHAR(100) NULL,
  masp VARCHAR(50) NULL,
  external_id1 VARCHAR(100) NULL,
  serial VARCHAR(100) NULL,
  customer_name VARCHAR(500) NULL,
  customer_type VARCHAR(100) NULL,
  partner VARCHAR(500) NULL,
  cen_code_dev VARCHAR(255) NULL,
  cbs_staff VARCHAR(500) NULL,
  payment_type VARCHAR(50) NULL,
  price_not_vat NUMERIC(18, 2) NOT NULL DEFAULT 0,
  price_not_vat_round NUMERIC(18, 2) NOT NULL DEFAULT 0,
  price_vat NUMERIC(18, 2) NOT NULL DEFAULT 0,
  vat NUMERIC(18, 2) NOT NULL DEFAULT 0,
  sub_start_date BIGINT NULL,
  first_date_revenue BIGINT NULL,
  active_date BIGINT NULL,
  payment_date BIGINT NULL,
  raw JSONB NULL,
  claimed_by VARCHAR(50) NULL,
  claimed_at BIGINT NULL,
  claim_status VARCHAR(20) NULL,
  approved_by VARCHAR(50) NULL,
  approved_at BIGINT NULL,
  customer_id VARCHAR(50) NULL,
  deal_id VARCHAR(50) NULL,
  kpi_kind_at_approve VARCHAR(20) NULL,
  synced_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NULL,
  CONSTRAINT cbs_revenue_orders_pkey PRIMARY KEY (id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cbs_revenue_orders_tenant_fp ON public.cbs_revenue_orders (tenant_id, fingerprint);
CREATE INDEX IF NOT EXISTS idx_cbs_revenue_orders_tenant_period ON public.cbs_revenue_orders (tenant_id, period_ym);
CREATE INDEX IF NOT EXISTS idx_cbs_revenue_orders_claimed_by ON public.cbs_revenue_orders (tenant_id, claimed_by) WHERE claimed_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cbs_revenue_orders_claim_status ON public.cbs_revenue_orders (tenant_id, claim_status) WHERE claim_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cbs_revenue_orders_payment_date ON public.cbs_revenue_orders (tenant_id, payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_cbs_revenue_orders_customer ON public.cbs_revenue_orders (tenant_id, customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cbs_revenue_orders_deal ON public.cbs_revenue_orders (tenant_id, deal_id) WHERE deal_id IS NOT NULL;

-- (Các bảng: tenants, employees, departments, organization_levels, customers, deals,
--  tasks, interactions, notifications, role_permissions, transfer_requests, transfer_approval_logs,
--  cbs_config, cbs_revenue_orders)
