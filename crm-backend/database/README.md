# Database Schema Documentation

## Tổng quan

File này chứa cấu trúc database của hệ thống CRM MobiFone, bao gồm 5 bảng chính:

1. **employees** - Quản lý thông tin nhân viên
2. **customers** - Quản lý thông tin khách hàng
3. **deals** - Quản lý cơ hội bán hàng
4. **interactions** - Nhật ký tương tác với khách hàng
5. **tasks** - Quản lý nhiệm vụ

## Cấu trúc Database

### 1. Bảng Employees

Quản lý thông tin nhân viên trong hệ thống.

**Các trường:**
- `employee_id` (VARCHAR(50), PK): ID nhân viên (UUID)
- `username` (VARCHAR(50), UNIQUE): Tên đăng nhập
- `password_hash` (TEXT): Mật khẩu đã hash
- `full_name` (VARCHAR(100)): Họ và tên
- `email` (VARCHAR(100), UNIQUE): Email
- `role` (VARCHAR(20), DEFAULT 'sales'): Vai trò (admin, manager, sales)
- `is_active` (BOOLEAN, DEFAULT true): Trạng thái hoạt động
- `created_at` (BIGINT): Thời gian tạo (Unix timestamp)

### 2. Bảng Customers

Quản lý thông tin khách hàng.

**Các trường:**
- `customer_id` (VARCHAR(50), PK): ID khách hàng (UUID)
- `full_name` (VARCHAR(255), NOT NULL): Họ và tên
- `email` (VARCHAR(100)): Email
- `phone` (VARCHAR(20), NOT NULL): Số điện thoại
- `address` (TEXT): Địa chỉ
- `customer_type` (VARCHAR(50)): Loại khách hàng
- `company_name` (VARCHAR(255)): Tên công ty
- `tax_code` (VARCHAR(50)): Mã số thuế
- `source` (VARCHAR(100)): Nguồn khách hàng
- `created_at` (BIGINT): Thời gian tạo
- `updated_at` (BIGINT): Thời gian cập nhật
- `assigned_to` (VARCHAR(50)): ID nhân viên được gán (liên kết với employees.employee_id)
- `deleted_at` (BIGINT): Thời gian xóa (Soft delete, NULL = chưa xóa)

**Index:**
- `idx_customers_deleted_at`: Index cho deleted_at để tối ưu truy vấn

### 3. Bảng Deals

Quản lý cơ hội bán hàng.

**Các trường:**
- `deal_id` (VARCHAR(50), PK): ID deal (UUID)
- `customer_id` (VARCHAR(50)): ID khách hàng (liên kết với customers.customer_id)
- `title` (VARCHAR(255), NOT NULL): Tiêu đề deal
- `amount` (NUMERIC(15,2), DEFAULT 0): Giá trị deal
- `stage` (VARCHAR(50)): Giai đoạn deal
- `expected_closing_date` (BIGINT): Ngày dự kiến đóng deal
- `created_at` (BIGINT): Thời gian tạo

### 4. Bảng Interactions

Nhật ký tương tác với khách hàng.

**Các trường:**
- `interaction_id` (VARCHAR(50), PK): ID tương tác (UUID)
- `customer_id` (VARCHAR(50)): ID khách hàng (liên kết với customers.customer_id)
- `deal_id` (VARCHAR(50)): ID deal (liên kết với deals.deal_id, optional)
- `interaction_type` (VARCHAR(50)): Loại tương tác (call, email, meeting, note)
- `content` (TEXT): Nội dung tương tác
- `interaction_date` (BIGINT): Thời gian tương tác
- `employee_id` (VARCHAR(50)): ID nhân viên thực hiện (liên kết với employees.employee_id)
- `status` (VARCHAR(50)): Trạng thái
- `created_at` (BIGINT): Thời gian tạo

### 5. Bảng Tasks

Quản lý nhiệm vụ.

**Các trường:**
- `task_id` (VARCHAR(50), PK): ID task (UUID)
- `customer_id` (VARCHAR(50)): ID khách hàng (liên kết với customers.customer_id)
- `title` (VARCHAR(255), NOT NULL): Tiêu đề task
- `due_date` (BIGINT): Ngày hết hạn
- `priority` (VARCHAR(20)): Mức độ ưu tiên (low, medium, high, urgent)
- `is_completed` (BOOLEAN, DEFAULT false): Trạng thái hoàn thành
- `created_at` (BIGINT): Thời gian tạo

## Lưu ý quan trọng

1. **Không sử dụng Foreign Key Constraints**: Theo yêu cầu, các bảng không có ràng buộc khóa ngoại. Việc liên kết được thực hiện ở tầng ứng dụng.

2. **Soft Delete**: Bảng `customers` sử dụng cơ chế soft delete thông qua trường `deleted_at`. Khi xóa, chỉ cập nhật `deleted_at` thành timestamp hiện tại, không xóa vĩnh viễn.

3. **Timestamp**: Tất cả các trường thời gian sử dụng BIGINT để lưu Unix timestamp (milliseconds).

4. **UUID**: Tất cả các ID sử dụng VARCHAR(50) để lưu UUID v4.

## Cách sử dụng

Để tạo lại database từ file schema:

```bash
# Kết nối PostgreSQL
psql -U your_username -d your_database

# Chạy file schema
\i database/schema.sql
```

Hoặc sử dụng pgAdmin hoặc DBeaver để import file SQL.

## Cập nhật

Khi có thay đổi về cấu trúc database, vui lòng cập nhật file `schema.sql` và file `README.md` này.




