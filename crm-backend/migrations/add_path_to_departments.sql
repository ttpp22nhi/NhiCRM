-- Thêm cột path (Materialized Path) cho departments
-- path: Lưu vết đệ quy, ví dụ 'ID1/ID2/ID3' - tối ưu truy vấn cây (10-20 level)
-- Đổi type sang TEXT linh hoạt: 'Công ty', 'Chi nhánh', 'Phòng', 'Tổ', 'Trạm'...

ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS path TEXT NULL;

-- Cập nhật path cho dữ liệu hiện có: root có path = id, con có path = parent_path/id
-- Chạy theo nhiều lần nếu có nhiều cấp (hoặc dùng script)
UPDATE public.departments SET path = id WHERE parent_id IS NULL;
UPDATE public.departments d SET path = p.path || '/' || d.id
FROM public.departments p WHERE d.parent_id = p.id AND p.path IS NOT NULL;
-- Recursive CTE cập nhật path cho tất cả cấp (Materialized Path)
UPDATE departments d SET path = t.path
FROM (
  WITH RECURSIVE tree AS (
    SELECT id, parent_id, id::text as path FROM departments WHERE parent_id IS NULL
    UNION ALL
    SELECT d2.id, d2.parent_id, t.path || '/' || d2.id
    FROM departments d2 JOIN tree t ON d2.parent_id = t.id
  )
  SELECT id, path FROM tree
) t WHERE d.id = t.id;

CREATE INDEX IF NOT EXISTS idx_departments_path ON public.departments (path);
