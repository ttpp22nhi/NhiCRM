-- Địa bàn phụ trách (text tự do) — hiển thị "Địa bàn" trên UI
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS territory TEXT NULL;

COMMENT ON COLUMN public.employees.territory IS 'Địa bàn / khu vực phụ trách (mô tả tự do).';
