-- Seed phân quyền mặc định: super_admin/admin = global, còn lại = personal
INSERT INTO public.role_permissions (id, role_name, resource, action, scope, created_at, updated_at)
VALUES
  (gen_random_uuid()::text, 'super_admin', 'customers', 'create', 'global', extract(epoch from now())::bigint*1000, extract(epoch from now())::bigint*1000),
  (gen_random_uuid()::text, 'super_admin', 'customers', 'read', 'global', extract(epoch from now())::bigint*1000, extract(epoch from now())::bigint*1000),
  (gen_random_uuid()::text, 'super_admin', 'customers', 'update', 'global', extract(epoch from now())::bigint*1000, extract(epoch from now())::bigint*1000),
  (gen_random_uuid()::text, 'super_admin', 'customers', 'delete', 'global', extract(epoch from now())::bigint*1000, extract(epoch from now())::bigint*1000),
  (gen_random_uuid()::text, 'super_admin', 'deals', 'create', 'global', extract(epoch from now())::bigint*1000, extract(epoch from now())::bigint*1000),
  (gen_random_uuid()::text, 'super_admin', 'deals', 'read', 'global', extract(epoch from now())::bigint*1000, extract(epoch from now())::bigint*1000),
  (gen_random_uuid()::text, 'super_admin', 'deals', 'update', 'global', extract(epoch from now())::bigint*1000, extract(epoch from now())::bigint*1000),
  (gen_random_uuid()::text, 'super_admin', 'deals', 'delete', 'global', extract(epoch from now())::bigint*1000, extract(epoch from now())::bigint*1000),
  (gen_random_uuid()::text, 'admin', 'customers', 'create', 'global', extract(epoch from now())::bigint*1000, extract(epoch from now())::bigint*1000),
  (gen_random_uuid()::text, 'admin', 'customers', 'read', 'global', extract(epoch from now())::bigint*1000, extract(epoch from now())::bigint*1000),
  (gen_random_uuid()::text, 'admin', 'customers', 'update', 'global', extract(epoch from now())::bigint*1000, extract(epoch from now())::bigint*1000),
  (gen_random_uuid()::text, 'admin', 'customers', 'delete', 'global', extract(epoch from now())::bigint*1000, extract(epoch from now())::bigint*1000),
  (gen_random_uuid()::text, 'admin', 'deals', 'create', 'global', extract(epoch from now())::bigint*1000, extract(epoch from now())::bigint*1000),
  (gen_random_uuid()::text, 'admin', 'deals', 'read', 'global', extract(epoch from now())::bigint*1000, extract(epoch from now())::bigint*1000),
  (gen_random_uuid()::text, 'admin', 'deals', 'update', 'global', extract(epoch from now())::bigint*1000, extract(epoch from now())::bigint*1000),
  (gen_random_uuid()::text, 'admin', 'deals', 'delete', 'global', extract(epoch from now())::bigint*1000, extract(epoch from now())::bigint*1000)
ON CONFLICT (role_name, resource, action) DO UPDATE SET scope = EXCLUDED.scope, updated_at = EXCLUDED.updated_at;
