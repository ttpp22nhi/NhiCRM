-- Thêm các trường chi tiết khi deal thành công: tên sản phẩm, số lượng, thông tin hóa đơn, ghi chú
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS product_name VARCHAR(255) NULL;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS quantity NUMERIC(15,2) NULL;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS invoice_info TEXT NULL;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS notes TEXT NULL;

COMMENT ON COLUMN public.deals.product_name IS 'Tên sản phẩm (khi deal thành công)';
COMMENT ON COLUMN public.deals.quantity IS 'Số lượng';
COMMENT ON COLUMN public.deals.invoice_info IS 'Thông tin hóa đơn';
COMMENT ON COLUMN public.deals.notes IS 'Ghi chú thêm';
