-- Multi-tenant: username và email unique theo từng tenant (mỗi công ty có thể có username "admin" riêng)
-- Trước: UNIQUE(username), UNIQUE(email) toàn bảng → lỗi khi tạo admin cho tenant thứ 2.

ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_username_key;
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_email_key;

-- Cùng username được phép ở các tenant khác nhau; trong một tenant thì username không trùng
CREATE UNIQUE INDEX IF NOT EXISTS employees_username_tenant_unique
  ON public.employees (username, tenant_id);

-- Email không trùng trong cùng một tenant (cho phép trùng giữa các tenant)
CREATE UNIQUE INDEX IF NOT EXISTS employees_email_tenant_unique
  ON public.employees (tenant_id, email)
  WHERE email IS NOT NULL AND email <> '';
