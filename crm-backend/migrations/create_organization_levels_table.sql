-- Bảng organization_levels: Định nghĩa tên cho từng cấp trong cây cấu trúc công ty
-- Đảm bảo đồng nhất: Level 1 = Công ty, Level 2 = Chi nhánh, Level 3 = Phòng, Level 4 = Tổ...

CREATE TABLE IF NOT EXISTS public.organization_levels (
  id VARCHAR(50) NOT NULL,
  level_order INT NOT NULL,
  level_name VARCHAR(100) NOT NULL,
  created_at INT8 NULL,
  updated_at INT8 NULL,
  CONSTRAINT organization_levels_pkey PRIMARY KEY (id),
  CONSTRAINT organization_levels_order_unique UNIQUE (level_order)
);

-- Seed mặc định
INSERT INTO public.organization_levels (id, level_order, level_name, created_at, updated_at)
VALUES 
  (gen_random_uuid()::text, 1, 'Công ty', extract(epoch from now())::bigint*1000, extract(epoch from now())::bigint*1000),
  (gen_random_uuid()::text, 2, 'Chi nhánh', extract(epoch from now())::bigint*1000, extract(epoch from now())::bigint*1000),
  (gen_random_uuid()::text, 3, 'Phòng', extract(epoch from now())::bigint*1000, extract(epoch from now())::bigint*1000),
  (gen_random_uuid()::text, 4, 'Tổ', extract(epoch from now())::bigint*1000, extract(epoch from now())::bigint*1000),
  (gen_random_uuid()::text, 5, 'Trạm', extract(epoch from now())::bigint*1000, extract(epoch from now())::bigint*1000)
ON CONFLICT (level_order) DO NOTHING;
