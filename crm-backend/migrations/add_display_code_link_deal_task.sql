-- ============================================
-- Liên kết Display Code giữa Deal và Task
-- - tasks.parent_display_code: mã Deal khi task thuộc deal
-- - deal_activities.task_id: task liên quan (để mở task từ timeline)
--
-- LƯU Ý: Chạy migration add_display_code_to_deals_tasks.sql TRƯỚC (để có cột display_code trên deals và tasks).
-- ============================================

-- Tasks: thêm cột parent_display_code (mã Deal gốc khi task được tạo từ deal)
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS parent_display_code VARCHAR(50) NULL;

COMMENT ON COLUMN public.tasks.parent_display_code IS 'Mã hiển thị của Deal gốc (DEAL-YYMM-NNN) khi task thuộc deal, dùng để truy vết';

CREATE INDEX IF NOT EXISTS idx_tasks_parent_display_code
  ON public.tasks (parent_display_code)
  WHERE parent_display_code IS NOT NULL;

-- deal_activities: thêm task_id để liên kết hoạt động với task (click mở task)
ALTER TABLE public.deal_activities
  ADD COLUMN IF NOT EXISTS task_id VARCHAR(50) NULL;

COMMENT ON COLUMN public.deal_activities.task_id IS 'Task liên quan (VD: khi hệ thống tạo task tự động), dùng để mở chi tiết task từ timeline';

CREATE INDEX IF NOT EXISTS idx_deal_activities_task_id
  ON public.deal_activities (task_id)
  WHERE task_id IS NOT NULL;
