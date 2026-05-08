-- Số điện thoại liên hệ của nhân viên (tùy chọn).
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS phone VARCHAR(30) NULL;

COMMENT ON COLUMN public.employees.phone IS 'Số điện thoại nhân viên (liên hệ nội bộ).';

CREATE INDEX IF NOT EXISTS idx_employees_phone ON public.employees (tenant_id, phone)
  WHERE phone IS NOT NULL AND TRIM(phone) <> '';
