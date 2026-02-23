-- Cho phép mỗi tenant có bộ role_permissions riêng: UNIQUE (tenant_id, role_name, resource, action)
-- Gán tenant mặc định cho bản ghi cũ (tenant_id NULL), sau đó đổi constraint.

UPDATE public.role_permissions
SET tenant_id = 'tenant-mobifone-tayninh'
WHERE tenant_id IS NULL;

ALTER TABLE public.role_permissions
  DROP CONSTRAINT IF EXISTS role_permissions_unique;

ALTER TABLE public.role_permissions
  ADD CONSTRAINT role_permissions_tenant_role_resource_action_unique
  UNIQUE (tenant_id, role_name, resource, action);
