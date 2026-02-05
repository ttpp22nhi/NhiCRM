-- ============================================
-- CRM MobiFone Database Schema
-- ============================================
-- File này chứa cấu trúc database của hệ thống CRM MobiFone
-- Tạo bởi: CRM MobiFone Team
-- Ngày cập nhật: 2024
-- ============================================

-- ============================================
-- 1. Bảng Employees (Nhân viên)
-- ============================================
CREATE TABLE IF NOT EXISTS public.employees (
	employee_id varchar(50) NOT NULL,
	username varchar(50) NOT NULL,
	password_hash text NOT NULL,
	full_name varchar(100) NULL,
	email varchar(100) NULL,
	"role" varchar(20) DEFAULT 'sales'::character varying NULL,
	is_active bool DEFAULT true NULL,
	created_at int8 NULL,
	CONSTRAINT employees_pkey PRIMARY KEY (employee_id),
	CONSTRAINT employees_email_key UNIQUE (email),
	CONSTRAINT employees_username_key UNIQUE (username)
);

-- ============================================
-- 2. Bảng Customers (Khách hàng)
-- ============================================
CREATE TABLE IF NOT EXISTS public.customers (
	customer_id varchar(50) NOT NULL,
	full_name varchar(255) NOT NULL,
	email varchar(100) NULL,
	phone varchar(20) NOT NULL,
	address text NULL,
	customer_type varchar(50) NULL,
	company_name varchar(255) NULL,
	tax_code varchar(50) NULL,
	"source" varchar(100) NULL,
	created_at int8 NULL,
	updated_at int8 NULL,
	assigned_to varchar(50) NULL,
	deleted_at int8 NULL,
	CONSTRAINT customers_pkey PRIMARY KEY (customer_id)
);

-- Index cho deleted_at để tối ưu truy vấn (chỉ lấy records chưa bị xóa)
CREATE INDEX IF NOT EXISTS idx_customers_deleted_at 
ON public.customers USING btree (deleted_at) 
WHERE (deleted_at IS NULL);

-- ============================================
-- 3. Bảng Deals (Cơ hội bán hàng)
-- ============================================
CREATE TABLE IF NOT EXISTS public.deals (
	deal_id varchar(50) NOT NULL,
	customer_id varchar(50) NULL,
	title varchar(255) NOT NULL,
	amount numeric(15, 2) DEFAULT 0 NULL,
	stage varchar(50) NULL,
	expected_closing_date int8 NULL,
	created_at int8 NULL,
	CONSTRAINT deals_pkey PRIMARY KEY (deal_id)
);

-- ============================================
-- 4. Bảng Interactions (Nhật ký tương tác)
-- ============================================
CREATE TABLE IF NOT EXISTS public.interactions (
	interaction_id varchar(50) NOT NULL,
	customer_id varchar(50) NULL,
	deal_id varchar(50) NULL,
	interaction_type varchar(50) NULL,
	"content" text NULL,
	interaction_date int8 NULL,
	employee_id varchar(50) NULL,
	status varchar(50) NULL,
	created_at int8 NULL,
	CONSTRAINT interactions_pkey PRIMARY KEY (interaction_id)
);

-- ============================================
-- 5. Bảng Tasks (Nhiệm vụ)
-- ============================================
CREATE TABLE IF NOT EXISTS public.tasks (
	task_id varchar(50) NOT NULL,
	customer_id varchar(50) NULL,
	title varchar(255) NOT NULL,
	due_date int8 NULL,
	priority varchar(20) NULL,
	is_completed bool DEFAULT false NULL,
	created_at int8 NULL,
	assigned_to varchar(50) NULL,
	CONSTRAINT tasks_pkey PRIMARY KEY (task_id)
);

-- ============================================
-- 6. Bảng Notifications (Thông báo)
-- ============================================
CREATE TABLE IF NOT EXISTS public.notifications (
	notification_id varchar(50) NOT NULL,
	employee_id varchar(50) NOT NULL,
	type varchar(50) NULL,
	title varchar(255) NOT NULL,
	message text NULL,
	is_read bool DEFAULT false NULL,
	created_at int8 NULL,
	CONSTRAINT notifications_pkey PRIMARY KEY (notification_id)
);

-- Index cho notifications để tối ưu truy vấn
CREATE INDEX IF NOT EXISTS idx_notifications_employee_id 
ON public.notifications USING btree (employee_id);

CREATE INDEX IF NOT EXISTS idx_notifications_is_read 
ON public.notifications USING btree (is_read) 
WHERE (is_read = false);

-- ============================================
-- Ghi chú về cấu trúc:
-- ============================================
-- 1. Tất cả các bảng sử dụng:
--    - ID dạng VARCHAR(50) (UUID v4)
--    - Timestamp dạng BIGINT (Unix timestamp - milliseconds)
--    - Không sử dụng Foreign Key constraints (theo yêu cầu)
--
-- 2. Bảng customers:
--    - Soft delete: sử dụng deleted_at thay vì xóa vĩnh viễn
--    - assigned_to: liên kết với employees.employee_id (không có FK constraint)
--
-- 3. Bảng interactions:
--    - employee_id: liên kết với employees.employee_id (không có FK constraint)
--    - customer_id: liên kết với customers.customer_id (không có FK constraint)
--    - deal_id: liên kết với deals.deal_id (không có FK constraint)
--
-- 4. Bảng deals:
--    - customer_id: liên kết với customers.customer_id (không có FK constraint)
--
-- 5. Bảng tasks:
--    - customer_id: liên kết với customers.customer_id (không có FK constraint)
--    - assigned_to: liên kết với employees.employee_id (không có FK constraint)
--
-- 6. Bảng notifications:
--    - employee_id: liên kết với employees.employee_id (không có FK constraint)
--
-- ============================================
-- Các loại khách hàng (customer_type):
-- ============================================
-- - individual: Cá nhân
-- - company: Công ty
-- - so_ban_nganh: Sở ban ngành
-- - cong_an_tinh: Công an Tỉnh
-- - cong_an_xa: Công an xã
-- - xa_phuong: Xã phường
-- - doanh_nghiep_lon: Doanh nghiệp lớn
-- - ho_kinh_doanh: Hộ kinh doanh
-- - hop_tac_xa: Hợp tác xã
--
-- ============================================
-- Các vai trò nhân viên (employees.role):
-- ============================================
-- - admin: Quản trị viên
-- - manager: Quản lý
-- - sales: Nhân viên bán hàng
--
-- ============================================
-- Các loại tương tác (interactions.interaction_type):
-- ============================================
-- - call: Cuộc gọi
-- - email: Email
-- - meeting: Cuộc họp
-- - note: Ghi chú
-- - other: Khác
--
-- ============================================
-- Các giai đoạn deal (deals.stage):
-- ============================================
-- - prospecting: Tiềm năng
-- - qualification: Đánh giá
-- - proposal: Đề xuất
-- - negotiation: Đàm phán
-- - closed_won: Đã đóng (thành công)
-- - closed_lost: Đã đóng (thất bại)
--
-- ============================================
-- Mức độ ưu tiên task (tasks.priority):
-- ============================================
-- - low: Thấp
-- - medium: Trung bình
-- - high: Cao
-- - urgent: Khẩn cấp
--
-- ============================================




