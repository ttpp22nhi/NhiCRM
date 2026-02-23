-- Gán tenant mặc định cho nhân viên chưa có tenant_id (để JWT có tenant_id sau khi đăng nhập)
UPDATE public.employees
SET tenant_id = 'tenant-mobifone-tayninh'
WHERE tenant_id IS NULL;
