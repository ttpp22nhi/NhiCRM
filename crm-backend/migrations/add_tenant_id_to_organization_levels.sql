-- organization_levels theo từng tenant: Công ty A có Level 1 = "Phòng", Công ty B có Level 1 = "Trung tâm"

-- 1. Thêm cột tenant_id
ALTER TABLE public.organization_levels ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(50) NULL;

-- 2. Bỏ unique toàn cục (level_order) vì mỗi tenant có thứ tự riêng
ALTER TABLE public.organization_levels DROP CONSTRAINT IF EXISTS organization_levels_order_unique;

-- 3. Gán dữ liệu cũ (tenant_id IS NULL) vào tenant đầu tiên để giữ tên cấp bậc đã tùy chỉnh
UPDATE public.organization_levels ol
SET tenant_id = (SELECT id FROM tenants ORDER BY name ASC LIMIT 1)
WHERE ol.tenant_id IS NULL;

-- 4. Với mỗi tenant chưa có cấp bậc nào, chèn bộ mặc định (Công ty, Chi nhánh, Phòng, Tổ, Trạm)
INSERT INTO public.organization_levels (id, level_order, level_name, tenant_id, created_at, updated_at)
SELECT
  gen_random_uuid()::text,
  def.ord,
  def.name,
  t.id,
  extract(epoch from now())::bigint * 1000,
  extract(epoch from now())::bigint * 1000
FROM tenants t
CROSS JOIN (VALUES (1, 'Công ty'), (2, 'Chi nhánh'), (3, 'Phòng'), (4, 'Tổ'), (5, 'Trạm')) AS def(ord, name)
WHERE NOT EXISTS (SELECT 1 FROM organization_levels ol WHERE ol.tenant_id = t.id);

-- 5. Xóa hàng không thuộc tenant nào (trường hợp không có bảng tenants hoặc rỗng)
DELETE FROM public.organization_levels WHERE tenant_id IS NULL;

-- 6. Trong một tenant, level_order không trùng
CREATE UNIQUE INDEX IF NOT EXISTS organization_levels_tenant_order_unique
  ON public.organization_levels (tenant_id, level_order);

CREATE INDEX IF NOT EXISTS idx_organization_levels_tenant_id
  ON public.organization_levels (tenant_id);

COMMENT ON COLUMN public.organization_levels.tenant_id IS 'Multi-tenant: mỗi đơn vị tự định nghĩa tên cấp bậc (VD Công ty A: Level 1 = Phòng, Công ty B: Level 1 = Trung tâm).';
