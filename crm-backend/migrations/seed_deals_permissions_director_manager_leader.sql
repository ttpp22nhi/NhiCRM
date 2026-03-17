-- Giám đốc / Quản lý / Tổ trưởng: được xem/sửa deals của nhân viên trong phạm vi đơn vị (sub_tree)
-- Chạy migration này để role director, manager, leader có quyền deals read/create/update/delete với scope sub_tree

INSERT INTO public.role_permissions (id, role_name, resource, action, scope, tenant_id, created_at, updated_at)
SELECT gen_random_uuid()::text, v.role_name, v.resource, v.action, 'sub_tree', t.tenant_id, extract(epoch from now())::bigint*1000, extract(epoch from now())::bigint*1000
FROM (
  SELECT DISTINCT tenant_id FROM public.role_permissions WHERE tenant_id IS NOT NULL
  UNION
  SELECT DISTINCT tenant_id FROM public.employees WHERE tenant_id IS NOT NULL
) t
CROSS JOIN (VALUES
  ('director', 'deals', 'read'),
  ('director', 'deals', 'create'),
  ('director', 'deals', 'update'),
  ('director', 'deals', 'delete'),
  ('manager', 'deals', 'read'),
  ('manager', 'deals', 'create'),
  ('manager', 'deals', 'update'),
  ('manager', 'deals', 'delete'),
  ('leader', 'deals', 'read'),
  ('leader', 'deals', 'create'),
  ('leader', 'deals', 'update'),
  ('leader', 'deals', 'delete')
) AS v(role_name, resource, action)
ON CONFLICT (tenant_id, role_name, resource, action) DO UPDATE SET scope = EXCLUDED.scope, updated_at = EXCLUDED.updated_at;
