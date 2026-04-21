# Đặc tả tính năng hiện tại — NhiCRM / CRM MobiFone

**English:** This document describes **behaviour implemented in the codebase today** (backend + Next.js frontend). It replaces aspirational “100% manifest” items with what is actually wired.

**Tiếng Việt:** Tài liệu mô tả **hành vi đã triển khai trong code** (backend + frontend Next.js), ưu tiên đúng với thực tế thay vì kế hoạch tương lai.

---

## 1. Tổng quan kiến trúc | Architecture overview

| Khía cạnh | Mô tả |
|-----------|--------|
| **Đa tenant** | Dữ liệu nghiệp vụ gắn `tenant_id`. API nội bộ dùng JWT + (tuỳ chọn) header `X-Tenant-Id`. |
| **Backend** | Node.js + Express (`crm-backend/server.js`), PostgreSQL, JWT. |
| **Frontend** | Next.js App Router (`crm-frontend/app/`), React contexts (`AuthContext`, `SubscriptionContext`). |
| **Tài liệu API** | Swagger tại `/api-docs`, OpenAPI JSON tại `/swagger.json`. |

---

## 2. Xác thực & phạm vi tenant | Authentication & tenancy

**Đăng nhập (`POST /api/auth/login`)**

- Body: `username`, `password`, tuỳ chọn `domain` (domain công ty / tenant).
- **Host / subdomain:** Nếu không gửi `domain`, backend có thể suy ra từ phần đầu của `Host` (ví dụ `tenant1.example.com` → `tenant1`).
- **Super Admin (`super_admin`, thường `tenant_id` NULL):**
  - Có thể đăng nhập **không** domain khi username chỉ khớp **một** tài khoản super admin.
  - Khi subdomain từ Host **không** khớp tenant, hoặc có tenant nhưng không có nhân viên trong tenant đó, hệ thống có thể **fallback** sang Super Admin hệ thống (`tenant_id IS NULL`) nếu đúng **một** bản ghi — xem `authController.js`.
- **Các role khác:** Cần xác định tenant (domain hoặc subdomain hợp lệ).

**JWT & middleware**

- `verifyToken` → `extractTenant` → (thường) `requireTenant` → `checkTenantSubscription`.
- **Super Admin không có tenant trong JWT:** `req.tenantId = null`; gửi **`X-Tenant-Id`** để “vào” một công ty khi gọi API tenant.
- **`requireTenant`:** API yêu cầu phải có tenant; Super Admin chưa chọn công ty sẽ nhận **403** (UI hướng dùng menu **Hệ thống**).

**Đăng ký nhân viên (`POST /api/auth/register`)**

- Chỉ trong phạm vi tenant, cần quyền tenant admin (`verifyTenantAdmin`).

**Đổi mật khẩu** | **Health:** `GET /health`.

---

## 3. Vai trò & RBAC | Roles & RBAC

Định nghĩa tập trung: `crm-backend/config/rbac.js` (và `crm-frontend/lib/rbac.ts` cho menu/UI).

| Nhóm | Roles (chuỗi, không phân biệt hoa thường khi so khớp) | Ghi chú |
|------|------------------------------------------------------|--------|
| **Tenant admin** | `admin`, `super_admin` | Cấu hình tổ chức, phòng ban, ma trận quyền, thùng rác deal, v.v. |
| **Executive** | `admin`, `super_admin`, `director`, `manager` | Phạm vi rộng (ví dụ danh sách nhân viên đầy đủ, chuyển giao hàng loạt — tuỳ API). |
| **Transfer approver** | `manager`, `director`, `admin`, `super_admin` | Duyệt yêu cầu chuyển giao khách hàng. |

**Role chức năng UI (tham khảo):** `super_admin`, `admin`, `director`, `manager`, `leader`, `sales`.

**Super Admin — hệ thống**

- API: `GET/POST/PUT /api/system/tenants` (chỉ `verifySuperAdmin`, **không** qua `requireTenant` của tenant).
- Frontend: `/system/tenants` — khi chưa gắn công ty, menu nghiệp vụ bị giới hạn (xem `Navbar.tsx`).

**Ma trận phân quyền (tuỳ chọn nâng cao)**

- API: `GET /api/permissions`, `GET /api/permissions/matrix`, `POST /api/permissions` — dùng cho cấu hình quyền theo role (tenant admin).

---

## 4. Gói dịch vụ tenant | Subscription

Middleware `checkTenantSubscription`:

- Tenant **không active** → 403.
- **Hết hạn** (`end_date`): **GET** vẫn xem dữ liệu; **POST/PUT/PATCH/DELETE** bị chặn với thông báo gia hạn.
- Frontend: `SubscriptionBanner`, `SubscriptionContext`.

**API:** `GET /api/tenant/subscription`.

---

## 5. Tổ chức nội bộ | Organization

- **Phòng ban:** CRUD `/api/departments`, `/api/departments/flat`, `/api/departments/:id` (chủ yếu tenant admin cho CRUD; flat list dùng rộng hơn).
- **Cấp tổ chức / cây:** `/api/organization-levels` (CRUD, di chuyển node).
- Trang UI: **Cơ cấu tổ chức** (`/organization-structure`, `/organization`).

**Phân quyền gán việc (`getAssignableEmployeesList`)**

- `director`: toàn tenant.
- `manager`: bản thân + cấp dưới trong cây đơn vị.
- `leader`: bản thân + sales cùng đơn vị.
- `sales`: chỉ bản thân.

Dữ liệu khách hàng/deal còn được lọc theo **permission matrix / access scope** trong controller (ví dụ `getCustomers` dùng `getAccessScope` + `buildCustomerFilter`).

---

## 6. Nhân viên | Employees

- Danh sách, chi tiết, cập nhật; **reset mật khẩu** (strict admin).
- **Import Excel:** tải mẫu `GET /api/employees/import/template`, upload `POST /api/employees/import`.
- **Chuyển khách giữa nhân viên** (`transfer-customers`, `transfer-stats`) — giới hạn role (executive/admin tuỳ endpoint).
- **Sales list** cho luồng chuyển giao: `/api/employees/sales`.

---

## 7. Khách hàng & tương tác | Customers & interactions

- CRUD khách hàng, tìm kiếm/lọc, **kiểm tra trùng** (`check-duplicate`).
- **Bulk transfer** khách hàng: `PATCH /api/customers/bulk-transfer`.
- **Lịch sử sở hữu:** `GET /api/customers/:customerId/ownership-history`.
- **Import Excel:** template + import tương tự nhân viên.
- **Tương tác (interaction):** tạo và xem theo khách hàng (`/api/interactions`, `/api/interactions/customer/:customerId`).
- UI: danh sách, chi tiết khách hàng, timeline tương tác.

---

## 8. Deal & pipeline | Deals & pipeline

**Loại deal:** ít nhất `MASS` và `PROJECT` (ảnh hưởng stage Kanban và listener).

**Pipeline stages**

- Cấu hình **theo tenant** và `deal_category`: `GET /api/pipeline-stages?deal_category=MASS|PROJECT`.
- UI: Kanban (`KanbanBoard`), trang `/deals` với lọc trạng thái (kể cả xem tổng hợp).

**CRUD deal**

- Danh sách, tạo, cập nhật (`PATCH`), xóa (soft), **phê duyệt** deal (`POST /api/deals/:id/approve` nếu được bật trong luồng).
- **Thùng rác & khôi phục:** `/api/deals/trash`, `POST .../restore` (tenant admin).

**Mã hiển thị | Display code**

- Định dạng: `DEAL-YYMM-NNN` và `TSK-YYMM-NNN`, unique trong tenant, sinh tại `displayCodeService.js`.

**Confidence (độ tin cậy)**

- Giá trị: `high` / `medium` / `low` (mặc định thường là `medium`).
- **Nếu `low`:** bắt buộc có `confidence_note` khi tạo/cập nhật (validate trong `dealsController`).

**Đóng deal thất bại / hủy**

- Khi chuyển sang trạng thái **lost/cancelled** (theo logic trong controller), **bắt buộc** `loss_reason` (và ghi chú đổi stage nếu có quy tắc).

**Đính kèm deal**

- Upload, tải xuống, preview, thay thế, xóa file — các route `/api/deals/.../attachments`, `upload`, `download`, `preview`.

**Hoạt động deal (timeline)**

- Ghi chú, hoạt động hệ thống: `GET/POST /api/deals/:id/activities`.

**Sự kiện tự động (listener)**

- `dealStageChangedListener`: khi đổi stage, có thể tạo **task** tự động (ví dụ MASS → “Gọi điện xác nhận báo giá”; PROJECT → stage `khao_sat` → task khảo sát, có thể gán theo phòng trong cấu hình stage).

---

## 9. Công việc (Task) | Tasks

- CRUD, lọc; tra cứu theo `display_code`: `/api/tasks/by-display-code`.
- Liên kết `related_type` / `related_id` với deal; `parent_display_code` khi tạo từ deal.
- UI: `/tasks`, modal chi tiết/hoàn thành.

---

## 10. Dashboard & báo cáo | Dashboard & reports

**API thống kê / báo cáo (trích từ `server.js`)**

- `GET /api/dashboard/stats`, `/api/dashboard/analytics`
- Breakdown: `/api/dashboard/breakdown/employees`, `/api/dashboard/breakdown/departments`, `/api/dashboard/employee-detail`
- Báo cáo: `/api/reports/sales-forecast`, `employee-performance`, `loss-analysis`, `task-activity-log`
- KPI nhân viên: `/api/dashboard/employee-kpi-report`

**Dự báo & trọng số (trong service)**

- Báo cáo có dùng **tỷ lệ stage** và **hệ số confidence** (`high=1.0`, `medium=0.5`, `low=0.2`) cho **giá trị có trọng số** (`weighted_value`) — xem `reportService.js`, `analyticsService.js`.

**Xuất Excel (frontend)**

- Trang Dashboard có xuất file `.xlsx` cho một số báo cáo (KPI, forecast, loss analysis, task activity) qua các module `lib/export*.ts` — **xuất phía client**, không phải endpoint export riêng trên server.

---

## 11. Chuyển giao khách hàng (quy trình duyệt) | Transfer workflow

- Tạo yêu cầu: `POST /api/transfer/request`.
- Hàng chờ duyệt: `GET /api/transfer/pending`.
- Duyệt/từ chối: `PATCH /api/transfer/approve/:id`.
- Yêu cầu của tôi: `GET /api/transfer/my-requests`.
- Kiểm tra pending theo khách: `GET /api/transfer/check-pending/:customerId`.
- Nhật ký phê duyệt: `GET /api/transfer/approval-logs`.

UI: `/transfers`, `/transfer-approvals`, `/transfer-logs`.

---

## 12. Thông báo | Notifications

- `GET /api/notifications`, đánh dấu đã đọc, đọc tất cả.
- Component `NotificationBell` trên navbar.

---

## 13. Hồ sơ & bảo mật cơ bản | Profile & security

- Đổi mật khẩu: `/api/auth/change-password`.
- Trang profile: `/profile`.

---

## 14. Điểm khác với “manifest” cũ (tham khảo) | Gaps vs old manifest

Các mục sau **có thể đã mô tả ở mức ý tưởng** trước đây; cần đối chiếu code nếu muốn khẳng định 100%:

| Chủ đề | Ghi chú |
|--------|---------|
| **Event bus đầy đủ** | Có emitter + listener cho đổi stage deal; không phải mọi hook trong manifest cũ đều tồn tại. |
| **Audit trail toàn phần** | Không thấy bảng `audit_logs` cho mọi thay đổi deal; có log hoạt động deal và interaction khi chuyển giao. |
| **Xuất Excel — audit server** | Xuất báo cáo chủ yếu từ frontend; không mô tả sẵn “lưu lịch sử mỗi lần xuất” trên backend trong phạm vi rà soát nhanh. |
| **ON_USER_DELETE chặn xóa** | Cần xác minh trong `authController`/xoá user nếu có. |

---

## 15. Cách dùng tài liệu này với Cursor | Using this doc in Cursor

**English:** Reference `@docs/crm-logic-manifest.md` when adding features so that tenancy, RBAC, and subscription rules stay consistent.

**Tiếng Việt:** Khi thêm tính năng, tham chiếu `@docs/crm-logic-manifest.md` để giữ thống nhất tenant, RBAC và gói dịch vụ.

Ví dụ gợi ý kiểm tra:

1. Endpoint mới có cần `requireTenant` và `checkTenantSubscription` không?
2. Super Admin có cần `X-Tenant-Id` không?
3. Lọc dữ liệu có đi qua `tenant_id` và scope quyền giống `getCustomers`/`dealService` không?

---

*Tài liệu phản ánh codebase tại thời điểm cập nhật; khi refactor route hoặc RBAC, nên sửa song song file này.*
