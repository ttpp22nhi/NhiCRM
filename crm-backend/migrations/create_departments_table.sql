-- Bảng departments: Phòng ban & Tổ đội (cấu trúc Cha-Con)
-- Không dùng Foreign Key cứng theo yêu cầu

CREATE TABLE IF NOT EXISTS public.departments (
  id VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  parent_id VARCHAR(50) NULL,
  type VARCHAR(20) NOT NULL DEFAULT 'department',
  created_at INT8 NULL,
  updated_at INT8 NULL,
  CONSTRAINT departments_pkey PRIMARY KEY (id)
);

-- parent_id: NULL = Phòng (cấp cao), có giá trị = Tổ (con của Phòng)
-- type: 'department' = Phòng, 'team' = Tổ
CREATE INDEX IF NOT EXISTS idx_departments_parent_id ON public.departments (parent_id);
CREATE INDEX IF NOT EXISTS idx_departments_type ON public.departments (type);
