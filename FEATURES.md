# CRM MobiFone - Danh sách Chức năng

Tài liệu này liệt kê tất cả các chức năng đã được triển khai trong hệ thống CRM MobiFone.

---

## 📋 Mục lục

- [Backend API](#backend-api)
- [Frontend Features](#frontend-features)
- [Authentication & Authorization](#authentication--authorization)
- [Database Schema](#database-schema)

---

## 🔧 Backend API

### Base URL
- Development: `http://localhost:3000`
- API Documentation (Swagger): `http://localhost:3000/api-docs`

### 1. Authentication APIs

#### `POST /api/auth/login`
- **Mô tả**: Đăng nhập nhân viên
- **Public**: ✅ Có
- **Request Body**:
  ```json
  {
    "username": "string",
    "password": "string"
  }
  ```
- **Response**: 
  - Token JWT (expiresIn: 24h)
  - Thông tin nhân viên (id, username, full_name, role)
- **Status Codes**: 200, 401

#### `POST /api/auth/register`
- **Mô tả**: Đăng ký nhân viên mới
- **Public**: ❌ Yêu cầu Token + Admin role
- **Request Body**:
  ```json
  {
    "username": "string",
    "password": "string",
    "full_name": "string",
    "email": "string",
    "role": "admin|sales|manager"
  }
  ```
- **Response**: Thông tin nhân viên vừa tạo
- **Status Codes**: 201, 400, 401, 403

### 2. Employees APIs (Chỉ Admin)

#### `GET /api/employees`
- **Mô tả**: Lấy danh sách tất cả nhân viên
- **Yêu cầu**: Token + Admin role
- **Response**: 
  - Danh sách nhân viên (không bao gồm password_hash)
  - Thông tin: employee_id, username, full_name, email, role, is_active, created_at
- **Status Codes**: 200, 401, 403

#### `GET /api/employees/:id`
- **Mô tả**: Lấy thông tin chi tiết một nhân viên
- **Yêu cầu**: Token (tất cả user đã đăng nhập)
- **Response**: 
  - Thông tin nhân viên (không bao gồm password_hash)
  - Thông tin: employee_id, username, full_name, email, role, is_active, created_at
- **Status Codes**: 200, 401, 404

#### `PUT /api/employees/:id`
- **Mô tả**: Cập nhật thông tin nhân viên
- **Yêu cầu**: Token + Admin role
- **Request Body**:
  ```json
  {
    "full_name": "string",
    "email": "string",
    "role": "admin|sales|manager",
    "is_active": boolean
  }
  ```
- **Response**: Thông tin nhân viên đã cập nhật
- **Status Codes**: 200, 400, 401, 403, 404

#### `POST /api/employees/:id/reset-password`
- **Mô tả**: Reset password nhân viên
- **Yêu cầu**: Token + Admin role
- **Response**: 
  - Password mới được tạo tự động (8-12 ký tự, bao gồm chữ hoa, chữ thường, số, ký tự đặc biệt)
  - Password chỉ hiển thị một lần để admin gửi cho user
- **Status Codes**: 200, 401, 403, 404

### 3. Customers APIs

#### `POST /api/customers`
- **Mô tả**: Tạo khách hàng mới
- **Yêu cầu**: Token
- **Logic gán nhân viên chăm sóc**:
  - **Sales**: Tự động gán cho chính mình
  - **Admin/Manager**: Có thể chọn nhân viên (assigned_to), nếu không chọn thì gán cho chính mình
- **Request Body**:
  ```json
  {
    "full_name": "string (required)",
    "phone": "string (required)",
    "email": "string",
    "address": "string",
    "customer_type": "individual|company|so_ban_nganh|cong_an_tinh|cong_an_xa|xa_phuong|doanh_nghiep_lon|ho_kinh_doanh|hop_tac_xa",
    "company_name": "string",
    "tax_code": "string",
    "source": "Direct|Website|Referral|Social Media|Other",
    "assigned_to": "string (chỉ admin/manager)"
  }
  ```
- **Response**: Thông tin khách hàng vừa tạo
- **Status Codes**: 201, 400, 401

#### `GET /api/customers`
- **Mô tả**: Lấy danh sách khách hàng
- **Yêu cầu**: Token
- **Phân quyền**:
  - **Admin**: Xem tất cả khách hàng
  - **Sales**: Chỉ xem khách hàng được gán cho mình (assigned_to)
- **Response**: 
  - Danh sách khách hàng kèm thông tin nhân viên chăm sóc (JOIN với employees)
  - Thông tin nhân viên: assigned_employee_id, assigned_employee_name, assigned_employee_username, assigned_employee_email, assigned_employee_role
- **Status Codes**: 200, 401

### 4. System APIs

#### `GET /health`
- **Mô tả**: Health check endpoint
- **Public**: ✅ Có
- **Response**: 
  ```json
  {
    "status": "UP",
    "timestamp": 1234567890
  }
  ```
- **Status Codes**: 200

#### `GET /api-docs`
- **Mô tả**: Swagger API Documentation UI
- **Public**: ✅ Có
- **URL**: `http://localhost:3000/api-docs`

---

## 🎨 Frontend Features

### 1. Authentication Pages

#### `/login`
- **Mô tả**: Trang đăng nhập
- **Tính năng**:
  - Form đăng nhập với username và password
  - Validation và error handling
  - Tự động redirect đến dashboard sau khi đăng nhập thành công
  - Lưu token và user info vào localStorage

#### `/` (Home)
- **Mô tả**: Trang chủ, tự động redirect
- **Logic**:
  - Nếu đã đăng nhập → redirect đến `/dashboard`
  - Nếu chưa đăng nhập → redirect đến `/login`

### 2. Dashboard

#### `/dashboard`
- **Mô tả**: Trang tổng quan hệ thống
- **Tính năng**:
  - Hiển thị thống kê tổng quan (cards)
  - Links nhanh đến các trang khác
  - Protected route (yêu cầu đăng nhập)

### 3. Customers Management

#### `/customers`
- **Mô tả**: Quản lý khách hàng
- **Tính năng**:
  - **Danh sách khách hàng**:
    - Hiển thị bảng với thông tin đầy đủ
    - Cột: Khách hàng, Liên hệ, Loại, Nguồn, **Nhân viên chăm sóc**, Ngày tạo
    - Format ngày: `dd/mm/yyyy hh:mm:ss`
    - Hiển thị avatar, tên, email, phone, address
    - Badge loại khách hàng
    - Thông tin nhân viên chăm sóc (avatar, tên, username, role badge)
  
  - **Tạo khách hàng mới**:
    - Modal form với các trường:
      - Họ và tên* (required)
      - Số điện thoại* (required)
      - Email
      - Địa chỉ
      - Loại khách hàng (9 loại)
      - Nguồn
      - Tên công ty/tổ chức (hiển thị khi không phải cá nhân)
      - Mã số thuế (hiển thị khi không phải cá nhân)
      - **Nhân viên chăm sóc** (chỉ admin/manager):
        - Searchable dropdown
        - Tìm kiếm theo tên, username, email
        - Hiển thị avatar, tên, username, role badge
        - Mặc định chọn chính mình

### 4. Employees Management (Chỉ Admin)

#### `/employees`
- **Mô tả**: Quản lý nhân viên
- **Yêu cầu**: Admin role
- **Tính năng**:
  - **Danh sách nhân viên**:
    - Hiển thị bảng với thông tin đầy đủ
    - Cột: Nhân viên, Thông tin, Vai trò, Trạng thái, Ngày tạo, **Thao tác**
    - Format ngày: `dd/mm/yyyy hh:mm:ss`
    - Avatar, tên, username, email
    - Role badge (Admin/Manager/Sales)
    - Status badge (Hoạt động/Đã khóa)
  
  - **Xem thông tin nhân viên**:
    - Button "Xem" cho tất cả user (không chỉ Admin)
    - Modal hiển thị thông tin chi tiết:
      - Avatar và tên đầy đủ
      - Tên đăng nhập
      - Email
      - Vai trò (với badge màu)
      - Trạng thái (Hoạt động/Đã khóa)
      - Ngày tạo tài khoản (format: dd/mm/yyyy hh:mm:ss)
      - Employee ID
  
  - **Tạo nhân viên mới**:
    - Modal form với các trường:
      - Tên đăng nhập* (required)
      - Mật khẩu* (required, min 6 ký tự)
      - Họ và tên* (required)
      - Email* (required)
      - Vai trò (sales/admin)
  
  - **Sửa thông tin nhân viên** (Chỉ Admin):
    - Button "Sửa" chỉ hiển thị cho Admin
    - Modal form với các trường:
      - Tên đăng nhập (disabled, không thể thay đổi)
      - Họ và tên* (required)
      - Email* (required)
      - Vai trò (sales/manager/admin)
      - Trạng thái (checkbox: Hoạt động/Đã khóa)
    - Tự động refresh danh sách sau khi cập nhật thành công
  
  - **Reset password** (Chỉ Admin):
    - Button "Reset password" chỉ hiển thị cho Admin
    - Xác nhận trước khi reset
    - Modal hiển thị password mới
    - Button copy password
    - Cảnh báo password chỉ hiển thị một lần

### 5. Components

#### `Navbar`
- **Tính năng**:
  - Logo và tên hệ thống
  - Navigation links (Dashboard, Khách hàng, Nhân viên - chỉ admin)
  - Hiển thị thông tin user (tên, role badge)
  - Button đăng xuất

#### `ProtectedRoute`
- **Mô tả**: Component bảo vệ routes
- **Tính năng**:
  - Kiểm tra authentication
  - Redirect đến `/login` nếu chưa đăng nhập
  - Loading state khi kiểm tra

#### `AuthContext`
- **Mô tả**: Context quản lý authentication
- **Tính năng**:
  - Lưu trữ user info và token
  - Functions: login, register, logout
  - Tự động load token từ localStorage khi app khởi động
  - Tự động set Authorization header cho API calls

#### `CustomerForm`
- **Tính năng**:
  - Form tạo khách hàng với validation
  - Searchable employee dropdown (admin/manager)
  - Conditional fields (company_name, tax_code)
  - Error handling

#### `CustomerList`
- **Tính năng**:
  - Hiển thị danh sách khách hàng
  - Format ngày tháng
  - Hiển thị nhân viên chăm sóc
  - Loading và error states
  - Empty state

#### `EmployeeForm`
- **Tính năng**:
  - Form tạo nhân viên mới
  - Validation
  - Error handling

#### `EditEmployeeForm`
- **Tính năng**:
  - Form sửa thông tin nhân viên
  - Pre-fill data từ employee
  - Validation
  - Error handling

#### `EmployeeList`
- **Tính năng**:
  - Hiển thị danh sách nhân viên
  - Button "Xem" cho tất cả user (mở modal chi tiết)
  - Button "Reset password" và "Sửa" chỉ cho Admin
  - Modal reset password với copy function
  - Format ngày tháng
  - Loading và error states
  - Empty state

#### `EmployeeDetailView`
- **Tính năng**:
  - Modal hiển thị thông tin chi tiết nhân viên
  - Avatar và tên đầy đủ
  - Hiển thị đầy đủ thông tin: username, email, role, status, created_at, employee_id
  - Role badge với màu sắc phù hợp
  - Format ngày tháng nhất quán
  - Responsive design

---

## 🔒 Authentication & Authorization

### JWT Token
- **Thời hạn**: 24 giờ (1 ngày)
- **Format**: Bearer Token
- **Lưu trữ**: localStorage (frontend)
- **Payload**: 
  ```json
  {
    "id": "employee_id",
    "username": "string",
    "role": "admin|sales|manager"
  }
  ```

### Middleware

#### `verifyToken`
- **Mô tả**: Kiểm tra JWT token
- **Sử dụng**: Tất cả protected routes
- **Response**: 
  - 401: Không có token
  - 403: Token không hợp lệ hoặc hết hạn

#### `verifyAdmin`
- **Mô tả**: Kiểm tra quyền Admin
- **Sử dụng**: Routes chỉ dành cho Admin
- **Response**: 
  - 401: Chưa đăng nhập
  - 403: Không có quyền Admin

### Phân quyền

#### Admin
- ✅ Xem tất cả khách hàng
- ✅ Quản lý nhân viên (tạo, sửa, reset password, xem danh sách, xem chi tiết)
- ✅ Tạo khách hàng và gán cho bất kỳ nhân viên nào
- ✅ Xem thông tin chi tiết nhân viên

#### Manager
- ✅ Xem tất cả khách hàng (giống Admin)
- ✅ Tạo khách hàng và gán cho bất kỳ nhân viên nào
- ✅ Xem thông tin chi tiết nhân viên
- ❌ Quản lý nhân viên (tạo, sửa, reset password)

#### Sales
- ✅ Xem chỉ khách hàng được gán cho mình
- ✅ Tạo khách hàng (tự động gán cho chính mình)
- ✅ Xem thông tin chi tiết nhân viên (nếu có quyền truy cập trang /employees)
- ❌ Quản lý nhân viên (tạo, sửa, reset password)
- ❌ Gán khách hàng cho nhân viên khác

---

## 💾 Database Schema

### Bảng `employees`
```sql
- employee_id VARCHAR(50) PRIMARY KEY (UUID)
- username VARCHAR(50) UNIQUE NOT NULL
- password_hash TEXT NOT NULL
- full_name VARCHAR(100)
- email VARCHAR(100) UNIQUE
- role VARCHAR(20) DEFAULT 'sales' (admin, manager, sales)
- is_active BOOLEAN DEFAULT TRUE
- created_at BIGINT (Unix Timestamp)
```

### Bảng `customers`
```sql
- customer_id VARCHAR(50) PRIMARY KEY (UUID)
- full_name VARCHAR(255) NOT NULL
- email VARCHAR(100)
- phone VARCHAR(20) NOT NULL
- address TEXT
- customer_type VARCHAR(50) (individual, company, so_ban_nganh, cong_an_tinh, cong_an_xa, xa_phuong, doanh_nghiep_lon, ho_kinh_doanh, hop_tac_xa)
- company_name VARCHAR(255)
- tax_code VARCHAR(50)
- source VARCHAR(100)
- assigned_to VARCHAR(50) (employee_id - không dùng foreign key)
- created_at BIGINT (Unix Timestamp)
- updated_at BIGINT (Unix Timestamp)
```

### Các bảng khác (chưa triển khai)
- `deals` - Cơ hội kinh doanh
- `interactions` - Nhật ký tương tác
- `tasks` - Công việc/Nhắc lịch

---

## 🎯 Loại Khách hàng

Hệ thống hỗ trợ 9 loại khách hàng:

1. **Cá nhân** (`individual`)
2. **Sở ban ngành** (`so_ban_nganh`)
3. **Công an Tỉnh** (`cong_an_tinh`)
4. **Công an xã** (`cong_an_xa`)
5. **Xã phường** (`xa_phuong`)
6. **Doanh nghiệp lớn** (`doanh_nghiep_lon`)
7. **Hộ kinh doanh** (`ho_kinh_doanh`)
8. **Hợp tác xã** (`hop_tac_xa`)
9. **Doanh nghiệp** (`company`)

---

## 🛠️ Công nghệ sử dụng

### Backend
- **Framework**: Express.js 5.2.1
- **Database**: PostgreSQL với pg (node-postgres)
- **Authentication**: JWT (jsonwebtoken)
- **Password Hashing**: bcrypt
- **UUID**: uuid
- **API Documentation**: Swagger (swagger-jsdoc, swagger-ui-express)
- **CORS**: cors

### Frontend
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **HTTP Client**: Axios
- **State Management**: React Context API

---

## 📝 Ghi chú

- Tất cả timestamps sử dụng **BIGINT** (Unix Timestamp - milliseconds)
- Format hiển thị ngày: `dd/mm/yyyy hh:mm:ss`
- Không sử dụng Foreign Key constraints trong database
- ID sử dụng UUID (string)
- Password reset tạo password ngẫu nhiên 8-12 ký tự
- Token JWT có thời hạn 24 giờ

---

**Cập nhật lần cuối**: 2025-01-12

### Cập nhật mới nhất
- ✅ Thêm API `GET /api/employees/:id` để lấy thông tin chi tiết nhân viên
- ✅ Thêm chức năng "Xem thông tin nhân viên" với component `EmployeeDetailView`
- ✅ Button "Xem" hiển thị cho tất cả user (không chỉ Admin)
- ✅ Cập nhật phân quyền: Admin có thể sửa nhân viên, tất cả user có thể xem thông tin

