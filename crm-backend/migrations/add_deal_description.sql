-- Nội dung / mô tả cơ hội (nhu cầu, diễn biến — khác với notes trong "chi tiết khi thành công").
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS description TEXT NULL;

COMMENT ON COLUMN public.deals.description IS
  'Nội dung cơ hội: mô tả nhu cầu, ghi chú trao đổi. Ghi chú khi chốt deal vẫn dùng cột notes.';
