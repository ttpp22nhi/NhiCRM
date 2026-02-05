-- Migration: Thêm cột deleted_at vào bảng customers để hỗ trợ Soft Delete
-- Chạy script này trong PostgreSQL để thêm cột deleted_at

ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS deleted_at BIGINT DEFAULT NULL;

-- Tạo index để tối ưu query lọc deleted_at IS NULL
CREATE INDEX IF NOT EXISTS idx_customers_deleted_at ON customers(deleted_at) WHERE deleted_at IS NULL;

-- Comment
COMMENT ON COLUMN customers.deleted_at IS 'Timestamp khi khách hàng bị xóa (Soft Delete). NULL = chưa bị xóa';

