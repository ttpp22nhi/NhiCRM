-- ============================================
-- Giai đoạn 1 - Multi-tenant: Thêm tenant_id vào departments, employees, role_permissions
-- ============================================
-- Không dùng Foreign Key cứng (không tham chiếu tới tenants.id).
-- Cấu trúc sẵn sàng cho việc lọc dữ liệu theo từng công ty (tenant).

-- 1. Departments: thêm tenant_id (bảng đã có sẵn parent_id, path, type từ migration trước)
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(50) NULL;
CREATE INDEX IF NOT EXISTS idx_departments_tenant_id ON public.departments (tenant_id);

-- 2. Employees (users): thêm tenant_id
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(50) NULL;
CREATE INDEX IF NOT EXISTS idx_employees_tenant_id ON public.employees (tenant_id);

-- 3. Role_permissions: thêm tenant_id (nullable = template toàn hệ thống; có giá trị = cấu hình theo tenant)
ALTER TABLE public.role_permissions ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(50) NULL;
CREATE INDEX IF NOT EXISTS idx_role_permissions_tenant_id ON public.role_permissions (tenant_id);
