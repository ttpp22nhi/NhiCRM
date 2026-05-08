-- Nội dung / ghi chú chi tiết công việc (khác với "kết quả" khi hoàn thành task).
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS description TEXT NULL;

COMMENT ON COLUMN public.tasks.description IS
  'Nội dung chi tiết hoặc ghi chú công việc (tùy chọn). Kết quả khi đánh dấu hoàn thành vẫn lưu qua completion_content / interaction.';
