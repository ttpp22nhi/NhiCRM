-- Bảng role_permissions: Ma trận phân quyền động
-- scope: personal (cá nhân), current_node (đơn vị hiện tại), sub_tree (nhánh con), global (toàn công ty)

DO $$ BEGIN
  CREATE TYPE permission_scope AS ENUM ('personal', 'current_node', 'sub_tree', 'global');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.role_permissions (
  id VARCHAR(50) NOT NULL,
  role_name VARCHAR(50) NOT NULL,
  resource VARCHAR(100) NOT NULL,
  action VARCHAR(50) NOT NULL,
  scope VARCHAR(20) NOT NULL DEFAULT 'personal',
  created_at INT8 NULL,
  updated_at INT8 NULL,
  CONSTRAINT role_permissions_pkey PRIMARY KEY (id),
  CONSTRAINT role_permissions_unique UNIQUE (role_name, resource, action)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON public.role_permissions (role_name);
CREATE INDEX IF NOT EXISTS idx_role_permissions_resource ON public.role_permissions (resource);
