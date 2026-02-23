-- Cho phép mỗi tenant có bản ghi role_permissions riêng (tenant_id, role_name, resource, action) là unique
ALTER TABLE public.role_permissions DROP CONSTRAINT IF EXISTS role_permissions_unique;
ALTER TABLE public.role_permissions ADD CONSTRAINT role_permissions_tenant_role_resource_action_unique
  UNIQUE (tenant_id, role_name, resource, action);
