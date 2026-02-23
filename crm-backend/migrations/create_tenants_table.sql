-- ============================================
-- Giai đoạn 1 - Multi-tenant SaaS: Bảng tenants
-- ============================================
-- id (PK), name, domain (unique), package_type, max_users, max_levels, is_active, created_at
-- Không dùng Foreign Key cứng từ các bảng khác tham chiếu tới tenants.

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
  CONSTRAINT tenants_pkey PRIMARY KEY (id),
  CONSTRAINT tenants_domain_unique UNIQUE (domain)
);

COMMENT ON TABLE public.tenants IS 'Multi-tenant: mỗi tenant = một công ty/khách hàng SaaS';
COMMENT ON COLUMN public.tenants.package_type IS 'Starter, Growth, Ultimate';
COMMENT ON COLUMN public.tenants.max_levels IS 'Số cấp tối đa trong cây tổ chức (departments)';

CREATE INDEX IF NOT EXISTS idx_tenants_domain ON public.tenants (domain);
CREATE INDEX IF NOT EXISTS idx_tenants_is_active ON public.tenants (is_active);
