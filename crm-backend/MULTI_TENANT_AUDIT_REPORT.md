# Báo cáo Rà soát & Áp dụng Multi-tenant cho toàn bộ API

**Ngày:** 2025-02-11  
**Phạm vi:** `crm-backend/controllers`, `crm-backend/services`, `server.js` (routes)

---

## 1. Kết quả Quét Logic (Audit)

### 1.1 Middleware extractTenant / requireTenant trên Routes

| Route | extractTenant | requireTenant | Ghi chú |
|-------|---------------|---------------|---------|
| `POST /api/auth/login` | ❌ | ❌ | **Đúng** – API công khai, không có tenant |
| Tất cả route bảo vệ (employees, departments, customers, deals, tasks, notifications, transfer, dashboard, permissions, organization-levels) | ✅ | ✅ | Đã áp dụng |
| `GET/POST/PUT /api/system/tenants*` | ❌ | ❌ | **Đúng** – Chỉ `verifySuperAdmin`, quản lý bảng `tenants` (hệ thống) |
| `GET /health` | ❌ | ❌ | Health check, không cần tenant |

**Kết luận:** Mọi API nghiệp vụ đều đã dùng `extractTenant` + `requireTenant`. Không cần bổ sung middleware.

---

### 1.2 Controllers đã có tenant_id đầy đủ (không sửa)

- **customerController.js** – CRUD, checkDuplicate, bulkTransfer, ownership-history đều lọc theo `tenant_id` / `getTenantId(req)`.
- **dealsController.js** – getDeals, createDeal, updateDeal có `tenant_id`.
- **taskController.js** – getTasks, createTask, updateTask, deleteTask có `tenant_id`.
- **dashboardController.js** – Tất cả truy vấn lọc theo `tenant_id`.
- **interactionController.js** – createInteraction, getInteractionsByCustomer có `tenant_id`.
- **notificationController.js** – getNotifications, markAsRead, markAllAsRead lọc theo `tenant_id`.
- **transferController.js** – createTransferRequest, getPending, approve, getMyTransferRequests, getApprovalLogs, checkCustomerPendingTransfer đều dùng `tenant_id`.
- **departmentController.js** – getDepartments, getDepartmentsFlat, getDepartmentById, createDepartment, updateDepartment, deleteDepartment đều dùng `getTenantId(req)` và service có `tenant_id`.
- **permissionController.js** – getRolePermissions, getPermissionMatrix, upsertRolePermission lọc/insert theo `tenant_id`.
- **authController.js** – register, getEmployees, getSalesEmployees, getEmployeeById, updateEmployee, resetPassword, changePassword đã có `tenant_id`. **Đã sửa thêm:** getTransferStats, transferCustomers (xem mục 2).

### 1.3 Controllers đã được sửa trong đợt này

- **authController.js**
  - **getTransferStats:** Thêm `tenantId = getTenantId(req)`; tất cả truy vấn (employees, customers, deals, tasks) đều thêm điều kiện `tenant_id = $tenantId`.
  - **transferCustomers:** Thêm `tenantId = getTenantId(req)`; kiểm tra from/to employee trong tenant; COUNT/SELECT/UPDATE customers và tasks có `tenant_id`; INSERT interactions và notifications có cột `tenant_id`.
- **organizationLevelController.js**
  - **getOrganizationLevels, updateOrganizationLevel, createOrganizationLevel, deleteOrganizationLevel, moveOrganizationLevel:** Lấy `tenantId = getTenantId(req)`; mọi SELECT/INSERT/UPDATE/DELETE đều lọc hoặc gán theo `tenant_id` để mỗi công ty có bộ cấp bậc riêng (VD Công ty A: Level 1 = Phòng, Công ty B: Level 1 = Trung tâm).

### 1.4 Services đã kiểm tra

- **departmentService.js** – Mọi truy vấn đều nhận `tenantId` và dùng `d.tenant_id = $1` (hoặc filter tương đương). **Không sửa.**
- **departmentPathService.js** – computePathForDepartment, calculateAndSyncPath, syncChildrenPathInTransaction đều dùng `tenant_id` trong WHERE. Hàm `updatePathsRecursive(departmentId, newPath, tenantId)` khi gọi với `tenantId` sẽ thêm `AND tenant_id = $4`. **Không sửa.**
- **permissionService.js** – getAccessScope, buildDepartmentFilter, buildCustomerFilter, buildDealFilter đều dùng `tenant_id` (employees, departments, role_permissions). **Không sửa.**

---

## 2. Ngoại lệ – Bảng hệ thống (không lọc theo tenant_id)

Các bảng sau **không** có cột `tenant_id` hoặc được dùng toàn hệ thống, **không** áp dụng lọc tenant:

| Bảng | Controller / API | Lý do |
|------|------------------|--------|
| **tenants** | tenantController (GET/POST/PUT /api/system/tenants) | Bảng quản lý đơn vị; chỉ Super Admin; không có tenant_id. |

**Đã chuyển sang per-tenant:** **organization_levels** – Mỗi đơn vị có bộ cấp bậc riêng (VD Công ty A: Level 1 = Phòng, Công ty B: Level 1 = Trung tâm). Đã thêm migration `add_tenant_id_to_organization_levels.sql` và cập nhật organizationLevelController (GET/POST/PUT/DELETE/move đều lọc theo `tenant_id`).

---

## 3. Danh sách File đã cập nhật (Refactoring)

| File | Thay đổi |
|------|----------|
| **controllers/authController.js** | getTransferStats: thêm `tenantId`, lọc employees/customers/deals/tasks theo `tenant_id`. transferCustomers: thêm `tenantId`, kiểm tra from/to employee trong tenant; mọi SELECT/UPDATE customers và tasks có `tenant_id`; INSERT interactions và notifications có `tenant_id`. |
| **controllers/organizationLevelController.js** | Tất cả API (GET/POST/PUT/DELETE/move) dùng `getTenantId(req)`; SELECT/INSERT/UPDATE/DELETE đều theo `tenant_id`. |
| **migrations/add_tenant_id_to_organization_levels.sql** | Thêm cột `tenant_id`, unique (tenant_id, level_order), backfill và seed mặc định theo từng tenant. |

Các controller và service còn lại đã đúng multi-tenant từ trước hoặc từ các đợt refactor trước; không thay đổi thêm trong báo cáo này.

---

## 4. API đã xử lý dứt điểm (từng nằm trong mục kiểm tra thủ công)

1. **POST /api/auth/login** ✅  
   - **Đã sửa:** Domain bắt buộc (SaaS: username trùng giữa các tenant). Có thể gửi `domain` trong body hoặc dùng subdomain từ URL (vd: `tenant1.yourcrm.com` → domain `tenant1`). Truy vấn luôn dùng `WHERE username = $1 AND tenant_id = $2` (tenant_id lấy từ bảng tenants theo domain).

2. **organization_levels** ✅  
   - Đã chuyển sang per-tenant; migration `add_tenant_id_to_organization_levels.sql` đã có.

3. **departmentPathService.updatePathsRecursive(departmentId, newPath, tenantId)** ✅  
   - **Đã thêm guard:** Ngay đầu hàm: `if (!tenantId) throw new Error('tenantId is required for recursive path updates');` để tránh gọi thiếu tenantId và cập nhật nhầm dữ liệu.

---

## 5. Tóm tắt

- **Routes:** Mọi API nghiệp vụ đều dùng `extractTenant` + `requireTenant`; không cần chỉnh.
- **Data isolation:** Các bảng nghiệp vụ (employees, customers, deals, tasks, interactions, notifications, transfer_requests, departments, role_permissions) đều được lọc hoặc gán theo `tenant_id` trong controller/service tương ứng.
- **Đã sửa thêm:** authController – getTransferStats và transferCustomers.
- **Ngoại lệ:** tenants (system), organization_levels (global config).
- **Kiểm tra thủ công:** login khi không có domain; organization_levels nếu muốn per-tenant; caller của updatePathsRecursive phải luôn truyền tenantId.
