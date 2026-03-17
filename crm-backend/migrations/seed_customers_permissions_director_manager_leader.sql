-- Director / Manager / Leader: được xem/sửa customers của nhân viên trong phạm vi đơn vị (sub_tree)
-- Chạy migration này để role director, manager, leader có quyền customers read/create/update/delete với scope sub_tree theo tenant.

INSERT INTO public.role_permissions (id, role_name, resource, action, scope, tenant_id, created_at, updated_at)
SELECT
  gen_random_uuid()::text,
  v.role_name,
  v.resource,
  v.action,
  'sub_tree',
  t.tenant_id,
  extract(epoch from now())::bigint*1000,
  extract(epoch from now())::bigint*1000
FROM (
  SELECT DISTINCT tenant_id FROM public.role_permissions WHERE tenant_id IS NOT NULL
  UNION
  SELECT DISTINCT tenant_id FROM public.employees WHERE tenant_id IS NOT NULL
) t
CROSS JOIN (VALUES
  ('director', 'customers', 'read'),
  ('director', 'customers', 'create'),
  ('director', 'customers', 'update'),
  ('director', 'customers', 'delete'),
  ('manager', 'customers', 'read'),
  ('manager', 'customers', 'create'),
  ('manager', 'customers', 'update'),
  ('manager', 'customers', 'delete'),
  ('leader', 'customers', 'read'),
  ('leader', 'customers', 'create'),
  ('leader', 'customers', 'update'),
  ('leader', 'customers', 'delete')
) AS v(role_name, resource, action)
ON CONFLICT (tenant_id, role_name, resource, action)
DO UPDATE SET scope = EXCLUDED.scope, updated_at = EXCLUDED.updated_at;

