-- Thêm cột department_id, title, rank vào bảng employees
-- Cập nhật role: super_admin, admin, director, manager, leader, sales

ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS department_id VARCHAR(50) NULL;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS title VARCHAR(100) NULL;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS rank VARCHAR(50) NULL;

-- Không tạo Foreign Key. department_id lưu ID đơn thuần.

CREATE INDEX IF NOT EXISTS idx_employees_department_id ON public.employees (department_id);
