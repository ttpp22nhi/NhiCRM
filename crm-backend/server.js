
import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { register, login, getMe, changePassword, getEmployees, getSalesEmployees, getAssignableEmployeesList, getEmployeeById, resetPassword, updateEmployee, deleteEmployee, transferCustomers, getTransferStats } from './controllers/authController.js';
import { downloadEmployeeImportTemplate, importEmployeesFromExcel } from './controllers/employeeImportController.js';
import { uploadEmployeeImportExcel } from './middleware/uploadEmployeeImport.js';
import { verifyToken, extractTenant, requireTenant, checkTenantSubscription, verifyTenantAdmin, verifyExecutive, verifyStrictAdmin, verifySuperAdmin, verifyEmployeeCreator } from './middleware/auth.js';
import { createCustomer, getCustomers, updateCustomer, deleteCustomer, checkDuplicateCustomer, bulkTransferCustomers, getCustomerOwnershipHistory } from './controllers/customerController.js';
import { downloadCustomerImportTemplate, importCustomersFromExcel } from './controllers/customerImportController.js';
import { createInteraction, getInteractionsByCustomer } from './controllers/interactionController.js';
import {
  getDashboardStats,
  getDashboardAnalytics,
  getEmployeeKpiReport,
  getSalesForecastReport,
  getEmployeePerformanceReport,
  getLossAnalysisReport,
  getTaskActivityLogReport,
  getDashboardEmployeeBreakdown,
  getDashboardDepartmentBreakdown,
  getDashboardEmployeeDetail
} from './controllers/dashboardController.js';
import { getTasks, getTaskById, getTaskByDisplayCode, createTask, updateTask, deleteTask } from './controllers/taskController.js';
import { getNotifications, markAsRead, markAllAsRead } from './controllers/notificationController.js';
import { createTransferRequest, getPendingTransferRequests, approveTransferRequest, getMyTransferRequests, checkCustomerPendingTransfer, getApprovalLogs } from './controllers/transferController.js';
import { getDeals, createDeal, updateDeal, deleteDeal, approveDeal, getDealsTrash, restoreDeal } from './controllers/dealsController.js';
import { getPipelineStages } from './controllers/pipelineStagesController.js';
import { getDealActivities, addDealNote, getDealAttachments, uploadDealAttachment, downloadDealAttachment, getPreviewUrl, streamPreview, loadAttachmentForReplace, replaceDealAttachment, deleteDealAttachment } from './controllers/dealActivitiesController.js';
import { uploadDealFile, uploadDealFileReplace } from './middleware/uploadDealFile.js';
import { getDepartments, getDepartmentsFlat, getDepartmentById, createDepartment, updateDepartment, deleteDepartment } from './controllers/departmentController.js';
import { getRolePermissions, getPermissionMatrix, upsertRolePermission } from './controllers/permissionController.js';
import { getOrganizationLevels, updateOrganizationLevel, createOrganizationLevel, deleteOrganizationLevel, moveOrganizationLevel } from './controllers/organizationLevelController.js';
import { getTenants, getTenantById, createTenant, updateTenant, getMySubscription } from './controllers/tenantController.js';
import {
  getKpis,
  upsertKpis,
  getKpiColumnVisibility,
  upsertKpiColumnVisibility,
} from './controllers/kpiController.js';
import {
  getCbsConfig,
  upsertCbsConfig,
  listCbsOrders,
  listCbsOrdersByDeal,
  claimCbsOrder,
  approveCbsOrder,
  unclaimCbsOrder,
  recomputeKpiFromApprovedOrders,
  syncNow as cbsSyncNow,
} from './controllers/cbsRevenueController.js';
import { startCbsScheduler } from './scheduler/cbsRevenueScheduler.js';
import { swaggerSpec, swaggerServe, swaggerSetup } from './swagger.js';
import './listeners/dealStageChangedListener.js'; // Đăng ký listener event-driven (deal stage → auto task)

// Tải biến môi trường
dotenv.config();

const app = express();

// Middleware CORS - Cho phép mọi origin (domain hoặc IP) để truy cập từ mạng nội bộ không cần cấu hình.
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Id'],
}));

// Middleware xử lý JSON & Cookie
app.use(express.json());
app.use(cookieParser());

/**
 * Swagger API Documentation
 * @swagger
 * /api-docs:
 *   get:
 *     summary: Swagger API Documentation
 *     tags: [Documentation]
 */
app.use('/api-docs', swaggerServe, swaggerSetup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'CRM MobiFone API Documentation'
}));

/**
 * Swagger JSON
 * @swagger
 * /swagger.json:
 *   get:
 *     summary: Swagger OpenAPI JSON
 *     tags: [Documentation]
 *     responses:
 *       200:
 *         description: OpenAPI specification in JSON
 */
app.get('/swagger.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(200).send(swaggerSpec);
});

/**
 * PUBLIC ROUTES
 */
/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Đăng nhập nhân viên (multi-tenant)
 *     description: |
 *       Body gồm username, password và tùy chọn **domain** (tenant).
 *       - Super Admin có thể đăng nhập không cần domain.
 *       - Các role khác (admin, director, manager, leader, sales) bắt buộc gửi **domain** (hoặc truy cập qua subdomain) để xác định công ty.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Đăng nhập thành công
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       400:
 *         description: Thiếu domain / domain không tồn tại / nhiều tenant trùng username
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Thông tin đăng nhập không chính xác
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.post('/api/auth/login', login);
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token', { httpOnly: true, sameSite: 'lax', path: '/' });
  res.json({ success: true, message: 'Đã đăng xuất.' });
});
app.get('/api/auth/me', verifyToken, getMe);

/**
 * PROTECTED ROUTES (Yêu cầu Token)
 */
/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Đăng ký nhân viên mới (Chỉ Admin)
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *     responses:
 *       201:
 *         description: Tạo tài khoản thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền (chỉ Admin)
 */
app.post('/api/auth/register', verifyToken, extractTenant, requireTenant, checkTenantSubscription, verifyEmployeeCreator, register);

/**
 * @swagger
 * /api/auth/change-password:
 *   post:
 *     summary: Đổi mật khẩu cho user hiện tại
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - oldPassword
 *               - newPassword
 *             properties:
 *               oldPassword:
 *                 type: string
 *                 example: oldpassword123
 *               newPassword:
 *                 type: string
 *                 example: newpassword123
 *     responses:
 *       200:
 *         description: Đổi mật khẩu thành công
 *       400:
 *         description: Dữ liệu không hợp lệ hoặc mật khẩu cũ không chính xác
 *       401:
 *         description: Chưa đăng nhập
 */
app.post('/api/auth/change-password', verifyToken, extractTenant, requireTenant, checkTenantSubscription, changePassword);

/**
 * @swagger
 * /api/employees:
 *   get:
 *     summary: Lấy danh sách nhân viên (Chỉ Admin)
 *     tags: [Employees]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách nhân viên
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Employee'
 *                 count:
 *                   type: integer
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền (chỉ Admin)
 */
app.get('/api/employees', verifyToken, extractTenant, requireTenant, checkTenantSubscription, verifyExecutive, getEmployees);

app.get('/api/employees/assignable', verifyToken, extractTenant, requireTenant, checkTenantSubscription, getAssignableEmployeesList);

app.get(
  '/api/employees/import/template',
  verifyToken,
  extractTenant,
  requireTenant,
  checkTenantSubscription,
  verifyEmployeeCreator,
  downloadEmployeeImportTemplate
)
app.post(
  '/api/employees/import',
  verifyToken,
  extractTenant,
  requireTenant,
  checkTenantSubscription,
  verifyEmployeeCreator,
  (req, res, next) => {
    uploadEmployeeImportExcel.single('file')(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: err.message || 'Lỗi tải file.',
        })
      }
      next()
    })
  },
  importEmployeesFromExcel
)

/**
 * @swagger
 * /api/departments:
 *   get:
 *     summary: Lấy danh sách phòng ban/tổ (cây cha-con)
 *     tags: [Departments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách departments
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Chỉ Admin
 */
app.get('/api/departments', verifyToken, extractTenant, requireTenant, checkTenantSubscription, verifyTenantAdmin, getDepartments);

/**
 * @swagger
 * /api/departments/flat:
 *   get:
 *     summary: Lấy danh sách phòng ban phẳng (cho dropdown)
 *     tags: [Departments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách departments
 */
app.get('/api/departments/flat', verifyToken, extractTenant, requireTenant, checkTenantSubscription, getDepartmentsFlat);

/**
 * @swagger
 * /api/departments/{id}:
 *   get:
 *     summary: Lấy chi tiết phòng ban
 *     tags: [Departments]
 */
app.get('/api/departments/:id', verifyToken, extractTenant, requireTenant, checkTenantSubscription, verifyTenantAdmin, getDepartmentById);

/**
 * @swagger
 * /api/departments:
 *   post:
 *     summary: Tạo phòng/tổ mới
 *     tags: [Departments]
 */
app.post('/api/departments', verifyToken, extractTenant, requireTenant, checkTenantSubscription, verifyTenantAdmin, createDepartment);

/**
 * @swagger
 * /api/departments/{id}:
 *   put:
 *     summary: Cập nhật phòng/tổ
 *     tags: [Departments]
 */
app.put('/api/departments/:id', verifyToken, extractTenant, requireTenant, checkTenantSubscription, verifyTenantAdmin, updateDepartment);

/**
 * @swagger
 * /api/departments/{id}:
 *   delete:
 *     summary: Xóa phòng/tổ (kiểm tra còn nhân viên không)
 *     tags: [Departments]
 */
app.delete('/api/departments/:id', verifyToken, extractTenant, requireTenant, checkTenantSubscription, verifyTenantAdmin, deleteDepartment);

app.get('/api/organization-levels', verifyToken, extractTenant, requireTenant, checkTenantSubscription, verifyTenantAdmin, getOrganizationLevels);
app.post('/api/organization-levels', verifyToken, extractTenant, requireTenant, checkTenantSubscription, verifyTenantAdmin, createOrganizationLevel);
app.put('/api/organization-levels/:id', verifyToken, extractTenant, requireTenant, checkTenantSubscription, verifyTenantAdmin, updateOrganizationLevel);
app.delete('/api/organization-levels/:id', verifyToken, extractTenant, requireTenant, checkTenantSubscription, verifyTenantAdmin, deleteOrganizationLevel);
app.post('/api/organization-levels/:id/move', verifyToken, extractTenant, requireTenant, checkTenantSubscription, verifyTenantAdmin, moveOrganizationLevel);

app.get('/api/permissions', verifyToken, extractTenant, requireTenant, checkTenantSubscription, verifyTenantAdmin, getRolePermissions);
app.get('/api/permissions/matrix', verifyToken, extractTenant, requireTenant, checkTenantSubscription, verifyTenantAdmin, getPermissionMatrix);
app.post('/api/permissions', verifyToken, extractTenant, requireTenant, checkTenantSubscription, verifyTenantAdmin, upsertRolePermission);

/**
 * @swagger
 * /api/employees/sales:
 *   get:
 *     summary: Lấy danh sách nhân viên Sales (dành cho Sales)
 *     tags: [Employees]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách nhân viên Sales
 *       401:
 *         description: Chưa đăng nhập
 */
app.get('/api/employees/sales', verifyToken, extractTenant, requireTenant, checkTenantSubscription, getSalesEmployees);

/**
 * @swagger
 * /api/employees/{id}:
 *   get:
 *     summary: Lấy thông tin chi tiết nhân viên
 *     tags: [Employees]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Employee ID
 *     responses:
 *       200:
 *         description: Thông tin nhân viên
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Employee'
 *       401:
 *         description: Chưa đăng nhập
 *       404:
 *         description: Không tìm thấy nhân viên
 */
app.get('/api/employees/:id', verifyToken, extractTenant, requireTenant, checkTenantSubscription, getEmployeeById);

/**
 * @swagger
 * /api/employees/{id}:
 *   put:
 *     summary: Cập nhật thông tin nhân viên (Chỉ Admin)
 *     tags: [Employees]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Employee ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               full_name:
 *                 type: string
 *               email:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [admin, sales, manager]
 *               is_active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền (chỉ Admin)
 *       404:
 *         description: Không tìm thấy nhân viên
 */
app.put('/api/employees/:id', verifyToken, extractTenant, requireTenant, checkTenantSubscription, verifyTenantAdmin, updateEmployee);

app.delete('/api/employees/:id', verifyToken, extractTenant, requireTenant, checkTenantSubscription, verifySuperAdmin, deleteEmployee);

/**
 * @swagger
 * /api/employees/{id}/reset-password:
 *   post:
 *     summary: Reset password nhân viên (Chỉ Admin)
 *     tags: [Employees]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Employee ID
 *     responses:
 *       200:
 *         description: Reset password thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     employee_id:
 *                       type: string
 *                     username:
 *                       type: string
 *                     full_name:
 *                       type: string
 *                     email:
 *                       type: string
 *                     new_password:
 *                       type: string
 *                       description: Password mới (chỉ hiển thị một lần)
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền (chỉ Admin)
 *       404:
 *         description: Không tìm thấy nhân viên
 */
app.post('/api/employees/:id/reset-password', verifyToken, extractTenant, requireTenant, checkTenantSubscription, verifyStrictAdmin, resetPassword);

/**
 * @swagger
 * /api/employees/transfer-customers:
 *   post:
 *     summary: Chuyển giao khách hàng hàng loạt (Chỉ Admin)
 *     tags: [Employees]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - from_employee_id
 *               - to_employee_id
 *             properties:
 *               from_employee_id:
 *                 type: string
 *                 description: ID nhân viên nguồn
 *               to_employee_id:
 *                 type: string
 *                 description: ID nhân viên đích
 *     responses:
 *       200:
 *         description: Chuyển giao thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền (chỉ Admin)
 *       404:
 *         description: Không tìm thấy nhân viên
 */
app.post('/api/employees/transfer-customers', verifyToken, extractTenant, requireTenant, checkTenantSubscription, verifyExecutive, transferCustomers);

/**
 * @swagger
 * /api/employees/transfer-stats:
 *   get:
 *     summary: Lấy thống kê trước khi chuyển giao khách hàng (Chỉ Admin)
 *     tags: [Employees]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: from_employee_id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID nhân viên nguồn
 *     responses:
 *       200:
 *         description: Thống kê chuyển giao
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền (chỉ Admin)
 *       404:
 *         description: Không tìm thấy nhân viên
 */
app.get('/api/employees/transfer-stats', verifyToken, extractTenant, requireTenant, checkTenantSubscription, verifyExecutive, getTransferStats);

/**
 * @swagger
 * /api/customers:
 *   post:
 *     summary: Tạo khách hàng mới
 *     tags: [Customers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - full_name
 *               - phone
 *             properties:
 *               full_name:
 *                 type: string
 *                 example: Nguyễn Văn A
 *               email:
 *                 type: string
 *                 example: customer@example.com
 *               phone:
 *                 type: string
 *                 example: 0123456789
 *               address:
 *                 type: string
 *               customer_type:
 *                 type: string
 *                 enum: [individual, company, so_ban_nganh, cong_an_tinh, cong_an_xa, xa_phuong, doanh_nghiep_lon, ho_kinh_doanh, hop_tac_xa]
 *                 example: individual
 *               company_name:
 *                 type: string
 *               tax_code:
 *                 type: string
 *               source:
 *                 type: string
 *                 example: Direct
 *               assigned_to:
 *                 type: string
 *                 description: Chỉ dùng cho admin/manager, nếu không có sẽ gán cho người tạo
 *     responses:
 *       201:
 *         description: Tạo khách hàng thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Customer'
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa đăng nhập
 *   get:
 *     summary: Lấy danh sách khách hàng (có tìm kiếm và lọc)
 *     tags: [Customers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Tìm kiếm theo tên, email, số điện thoại, tên công ty (không phân biệt hoa thường)
 *         example: Nguyễn Văn A
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [all, individual, company, so_ban_nganh, cong_an_tinh, cong_an_xa, xa_phuong, doanh_nghiep_lon, ho_kinh_doanh, hop_tac_xa]
 *         description: Lọc theo loại khách hàng (có thể gửi nhiều lần để chọn nhiều loại)
 *         example: individual
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Số trang hiện tại
 *         example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Số lượng bản ghi mỗi trang
 *         example: 10
 *     responses:
 *       200:
 *         description: Danh sách khách hàng
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     allOf:
 *                       - $ref: '#/components/schemas/Customer'
 *                       - type: object
 *                         properties:
 *                           assigned_employee_id:
 *                             type: string
 *                           assigned_employee_name:
 *                             type: string
 *                           assigned_employee_username:
 *                             type: string
 *                           assigned_employee_email:
 *                             type: string
 *                           assigned_employee_role:
 *                             type: string
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     totalItems:
 *                       type: integer
 *                       description: Tổng số khách hàng
 *                     totalPages:
 *                       type: integer
 *                       description: Tổng số trang
 *                     currentPage:
 *                       type: integer
 *                       description: Trang hiện tại
 *                     pageSize:
 *                       type: integer
 *                       description: Số lượng bản ghi mỗi trang
 *       401:
 *         description: Chưa đăng nhập
 */
app.post('/api/customers', verifyToken, extractTenant, requireTenant, checkTenantSubscription, createCustomer);
app.get('/api/customers', verifyToken, extractTenant, requireTenant, checkTenantSubscription, getCustomers);
app.post('/api/customers/check-duplicate', verifyToken, extractTenant, requireTenant, checkTenantSubscription, checkDuplicateCustomer);
app.get(
  '/api/customers/import/template',
  verifyToken,
  extractTenant,
  requireTenant,
  checkTenantSubscription,
  downloadCustomerImportTemplate
);
app.post(
  '/api/customers/import',
  verifyToken,
  extractTenant,
  requireTenant,
  checkTenantSubscription,
  (req, res, next) => {
    uploadEmployeeImportExcel.single('file')(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: err.message || 'Lỗi tải file.',
        });
      }
      next();
    });
  },
  importCustomersFromExcel
);
app.put('/api/customers/:id', verifyToken, extractTenant, requireTenant, checkTenantSubscription, updateCustomer);
app.delete('/api/customers/:id', verifyToken, extractTenant, requireTenant, checkTenantSubscription, deleteCustomer);
app.get('/api/customers/:customerId/ownership-history', verifyToken, extractTenant, requireTenant, checkTenantSubscription, getCustomerOwnershipHistory);

/**
 * @swagger
 * /api/customers/bulk-transfer:
 *   patch:
 *     summary: Chuyển giao khách hàng hàng loạt
 *     tags: [Customers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - customer_ids
 *               - new_assigned_to_id
 *             properties:
 *               customer_ids:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Danh sách ID khách hàng cần chuyển giao
 *               new_assigned_to_id:
 *                 type: string
 *                 description: ID nhân viên tiếp nhận mới
 *               transfer_reason:
 *                 type: string
 *                 description: Lý do chuyển giao (tùy chọn)
 *     responses:
 *       200:
 *         description: Chuyển giao thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền
 *       404:
 *         description: Không tìm thấy nhân viên
 */
app.patch('/api/customers/bulk-transfer', verifyToken, extractTenant, requireTenant, checkTenantSubscription, bulkTransferCustomers);

/**
 * @swagger
 * /api/interactions:
 *   post:
 *     summary: Tạo mới một tương tác
 *     tags: [Interactions]
 *     security:
 *       - bearerAuth: []
 */
app.post('/api/interactions', verifyToken, extractTenant, requireTenant, checkTenantSubscription, createInteraction);

/**
 * @swagger
 * /api/interactions/customer/{customerId}:
 *   get:
 *     summary: Lấy danh sách tương tác của khách hàng
 *     tags: [Interactions]
 *     security:
 *       - bearerAuth: []
 */
app.get('/api/interactions/customer/:customerId', verifyToken, extractTenant, requireTenant, checkTenantSubscription, getInteractionsByCustomer);

/**
 * @swagger
 * /api/dashboard/stats:
 *   get:
 *     summary: Lấy thống kê tổng quan Dashboard
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 */
app.get('/api/dashboard/stats', verifyToken, extractTenant, requireTenant, checkTenantSubscription, getDashboardStats);
app.get('/api/dashboard/analytics', verifyToken, extractTenant, requireTenant, checkTenantSubscription, getDashboardAnalytics);
app.get('/api/dashboard/employee-kpi-report', verifyToken, extractTenant, requireTenant, checkTenantSubscription, getEmployeeKpiReport);
app.get('/api/dashboard/breakdown/employees', verifyToken, extractTenant, requireTenant, checkTenantSubscription, getDashboardEmployeeBreakdown);
app.get('/api/dashboard/breakdown/departments', verifyToken, extractTenant, requireTenant, checkTenantSubscription, getDashboardDepartmentBreakdown);
app.get('/api/dashboard/employee-detail', verifyToken, extractTenant, requireTenant, checkTenantSubscription, getDashboardEmployeeDetail);
app.get('/api/reports/sales-forecast', verifyToken, extractTenant, requireTenant, checkTenantSubscription, getSalesForecastReport);
app.get('/api/reports/employee-performance', verifyToken, extractTenant, requireTenant, checkTenantSubscription, getEmployeePerformanceReport);
app.get('/api/reports/loss-analysis', verifyToken, extractTenant, requireTenant, checkTenantSubscription, getLossAnalysisReport);
app.get('/api/reports/task-activity-log', verifyToken, extractTenant, requireTenant, checkTenantSubscription, getTaskActivityLogReport);

/** Thông tin gói dịch vụ tenant (end_date, expired, days_remaining) cho UI banner/disable nút */
app.get('/api/tenant/subscription', verifyToken, extractTenant, requireTenant, checkTenantSubscription, getMySubscription);

/** KPI hàng tháng: xem (Sales: của mình; Lãnh đạo/Quản lý/Admin: toàn bộ Sales) — giao chỉ tiêu qua PUT */
app.get('/api/kpis/column-visibility', verifyToken, extractTenant, requireTenant, checkTenantSubscription, getKpiColumnVisibility);
app.put('/api/kpis/column-visibility', verifyToken, extractTenant, requireTenant, checkTenantSubscription, upsertKpiColumnVisibility);
app.get('/api/kpis', verifyToken, extractTenant, requireTenant, checkTenantSubscription, getKpis);
app.put('/api/kpis', verifyToken, extractTenant, requireTenant, checkTenantSubscription, upsertKpis);

/**
 * CBS (Mobifone) — đồng bộ doanh thu tháng; nhân viên tích đơn của mình.
 *  - GET  /api/cbs/config     (executive xem, admin sửa)
 *  - PUT  /api/cbs/config
 *  - POST /api/cbs/sync       (executive tự chạy đồng bộ thủ công)
 *  - GET  /api/cbs/revenue    (mọi nhân viên trong tenant)
 *  - POST /api/cbs/revenue/:id/claim
 *  - POST /api/cbs/revenue/:id/unclaim
 */
app.get('/api/cbs/config', verifyToken, extractTenant, requireTenant, checkTenantSubscription, getCbsConfig);
app.put('/api/cbs/config', verifyToken, extractTenant, requireTenant, checkTenantSubscription, upsertCbsConfig);
app.post('/api/cbs/sync', verifyToken, extractTenant, requireTenant, checkTenantSubscription, cbsSyncNow);
app.get('/api/cbs/revenue', verifyToken, extractTenant, requireTenant, checkTenantSubscription, listCbsOrders);
app.post('/api/cbs/revenue/:id/claim', verifyToken, extractTenant, requireTenant, checkTenantSubscription, claimCbsOrder);
app.post('/api/cbs/revenue/:id/approve', verifyToken, extractTenant, requireTenant, checkTenantSubscription, approveCbsOrder);
app.post('/api/cbs/revenue/:id/unclaim', verifyToken, extractTenant, requireTenant, checkTenantSubscription, unclaimCbsOrder);
app.post('/api/cbs/revenue/recompute-kpi', verifyToken, extractTenant, requireTenant, checkTenantSubscription, recomputeKpiFromApprovedOrders);

/**
 * @swagger
 * /api/tasks:
 *   get:
 *     summary: Lấy danh sách tasks
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 */
app.get('/api/tasks', verifyToken, extractTenant, requireTenant, checkTenantSubscription, getTasks);
app.get('/api/tasks/by-display-code', verifyToken, extractTenant, requireTenant, checkTenantSubscription, getTaskByDisplayCode);
app.get('/api/tasks/:id', verifyToken, extractTenant, requireTenant, checkTenantSubscription, getTaskById);

/**
 * @swagger
 * /api/tasks:
 *   post:
 *     summary: Tạo task mới
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 */
app.post('/api/tasks', verifyToken, extractTenant, requireTenant, checkTenantSubscription, createTask);

/**
 * @swagger
 * /api/tasks/{id}:
 *   patch:
 *     summary: Cập nhật task (hoàn thành task và tạo interaction)
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 */
app.patch('/api/tasks/:id', verifyToken, extractTenant, requireTenant, checkTenantSubscription, updateTask);

/**
 * @swagger
 * /api/tasks/{id}:
 *   delete:
 *     summary: Xóa task
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 */
app.delete('/api/tasks/:id', verifyToken, extractTenant, requireTenant, checkTenantSubscription, deleteTask);

/**
 * @swagger
 * /api/deals:
 *   get:
 *     summary: Lấy danh sách deals
 *     tags: [Deals]
 *     security:
 *       - bearerAuth: []
 */
app.get('/api/deals', verifyToken, extractTenant, requireTenant, checkTenantSubscription, getDeals);
app.get('/api/pipeline-stages', verifyToken, extractTenant, requireTenant, checkTenantSubscription, getPipelineStages);
app.get('/api/deals/trash', verifyToken, extractTenant, requireTenant, checkTenantSubscription, verifyTenantAdmin, getDealsTrash);

/**
 * @swagger
 * /api/deals:
 *   post:
 *     summary: Tạo deal mới
 *     tags: [Deals]
 *     security:
 *       - bearerAuth: []
 */
app.post('/api/deals', verifyToken, extractTenant, requireTenant, checkTenantSubscription, createDeal);

/**
 * @swagger
 * /api/deals/:id:
 *   patch:
 *     summary: Cập nhật deal
 *     tags: [Deals]
 *     security:
 *       - bearerAuth: []
 */
app.patch('/api/deals/:id', verifyToken, extractTenant, requireTenant, checkTenantSubscription, updateDeal);
app.post('/api/deals/:id/approve', verifyToken, extractTenant, requireTenant, checkTenantSubscription, approveDeal);
app.delete('/api/deals/:id', verifyToken, extractTenant, requireTenant, checkTenantSubscription, deleteDeal);
app.post('/api/deals/:id/restore', verifyToken, extractTenant, requireTenant, checkTenantSubscription, verifyTenantAdmin, restoreDeal);
app.get('/api/deals/:id/activities', verifyToken, extractTenant, requireTenant, checkTenantSubscription, getDealActivities);
app.get('/api/deals/:id/cbs-orders', verifyToken, extractTenant, requireTenant, checkTenantSubscription, listCbsOrdersByDeal);
app.post('/api/deals/:id/activities', verifyToken, extractTenant, requireTenant, checkTenantSubscription, addDealNote);
app.get('/api/deals/:id/attachments', verifyToken, extractTenant, requireTenant, checkTenantSubscription, getDealAttachments);
app.post('/api/deals/:id/upload', verifyToken, extractTenant, requireTenant, checkTenantSubscription, uploadDealFile, uploadDealAttachment);
app.get('/api/deals/download/:fileId', verifyToken, extractTenant, requireTenant, checkTenantSubscription, downloadDealAttachment);
app.get('/api/deals/attachments/:fileId/preview-url', verifyToken, extractTenant, requireTenant, checkTenantSubscription, getPreviewUrl);
app.get('/api/deals/attachments/:fileId/preview', streamPreview);
app.patch('/api/deals/attachments/:fileId', verifyToken, extractTenant, requireTenant, checkTenantSubscription, loadAttachmentForReplace, uploadDealFileReplace, replaceDealAttachment);
app.delete('/api/deals/attachments/:fileId', verifyToken, extractTenant, requireTenant, checkTenantSubscription, deleteDealAttachment);

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     summary: Lấy danh sách thông báo
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 */
app.get('/api/notifications', verifyToken, extractTenant, requireTenant, checkTenantSubscription, getNotifications);

/**
 * @swagger
 * /api/notifications/{id}/read:
 *   patch:
 *     summary: Đánh dấu thông báo đã đọc
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 */
app.patch('/api/notifications/:id/read', verifyToken, extractTenant, requireTenant, checkTenantSubscription, markAsRead);

/**
 * @swagger
 * /api/notifications/read-all:
 *   patch:
 *     summary: Đánh dấu tất cả thông báo đã đọc
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 */
app.patch('/api/notifications/read-all', verifyToken, extractTenant, requireTenant, checkTenantSubscription, markAllAsRead);

/**
 * Transfer Request Routes
 */
/**
 * @swagger
 * /api/transfer/request:
 *   post:
 *     summary: Tạo yêu cầu chuyển giao khách hàng (Sales)
 *     tags: [Transfer Requests]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - customer_ids
 *               - receiver_id
 *             properties:
 *               customer_ids:
 *                 type: array
 *                 items:
 *                   type: string
 *               receiver_id:
 *                 type: string
 *               note:
 *                 type: string
 *     responses:
 *       200:
 *         description: Tạo yêu cầu thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền
 */
app.post('/api/transfer/request', verifyToken, extractTenant, requireTenant, checkTenantSubscription, createTransferRequest);

/**
 * @swagger
 * /api/transfer/pending:
 *   get:
 *     summary: Lấy danh sách yêu cầu chuyển giao đang chờ (Manager/Admin)
 *     tags: [Transfer Requests]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách yêu cầu chuyển giao
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền
 */
app.get('/api/transfer/pending', verifyToken, extractTenant, requireTenant, checkTenantSubscription, getPendingTransferRequests);

/**
 * @swagger
 * /api/transfer/approve/{id}:
 *   patch:
 *     summary: Phê duyệt hoặc từ chối yêu cầu chuyển giao (Manager/Admin)
 *     tags: [Transfer Requests]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - action
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [approve, reject]
 *     responses:
 *       200:
 *         description: Xử lý yêu cầu thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền
 */
app.patch('/api/transfer/approve/:id', verifyToken, extractTenant, requireTenant, checkTenantSubscription, approveTransferRequest);

/**
 * @swagger
 * /api/transfer/my-requests:
 *   get:
 *     summary: Lấy danh sách yêu cầu chuyển giao của người dùng hiện tại
 *     tags: [Transfer Requests]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách yêu cầu chuyển giao
 *       401:
 *         description: Chưa đăng nhập
 */
app.get('/api/transfer/my-requests', verifyToken, extractTenant, requireTenant, checkTenantSubscription, getMyTransferRequests);

/**
 * @swagger
 * /api/transfer/check-pending/{customerId}:
 *   get:
 *     summary: Kiểm tra xem khách hàng có đang chờ chuyển giao không
 *     tags: [Transfer Requests]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: customerId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Trạng thái chuyển giao
 *       401:
 *         description: Chưa đăng nhập
 */
app.get('/api/transfer/check-pending/:customerId', verifyToken, extractTenant, requireTenant, checkTenantSubscription, checkCustomerPendingTransfer);

/**
 * @swagger
 * /api/transfer/approval-logs:
 *   get:
 *     summary: Lấy lịch sử phê duyệt chuyển giao (Manager/Admin)
 *     tags: [Transfer Requests]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: transfer_request_id
 *         schema:
 *           type: string
 *       - in: query
 *         name: approver_id
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Danh sách lịch sử phê duyệt
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền
 */
app.get('/api/transfer/approval-logs', verifyToken, extractTenant, requireTenant, checkTenantSubscription, getApprovalLogs);

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Server đang hoạt động
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: UP
 *                 timestamp:
 *                   type: integer
 *                   format: int64
 */

// ---------- System APIs (chỉ Super Admin, không cần tenant_id) ----------
app.get('/api/system/tenants', verifyToken, verifySuperAdmin, getTenants);
app.get('/api/system/tenants/:id', verifyToken, verifySuperAdmin, getTenantById);
app.post('/api/system/tenants', verifyToken, verifySuperAdmin, createTenant);
app.put('/api/system/tenants/:id', verifyToken, verifySuperAdmin, updateTenant);

app.get('/health', (req, res) => {
  res.json({ status: 'UP', timestamp: Date.now() });
});

// Error handler middleware - phải đặt sau tất cả routes
app.use((err, req, res, next) => {
  console.error('=== Unhandled Error ===');
  console.error('Error:', err);
  console.error('Request URL:', req.url);
  console.error('Request Method:', req.method);
  console.error('Request Body:', req.body);
  console.error('Stack:', err.stack);
  
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Lỗi hệ thống không xác định.',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Xử lý lỗi 404 - phải đặt sau error handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'API Route không tìm thấy.' });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('-------------------------------------------------------');
  console.log(`🚀 CRM Backend Server running: http://localhost:${PORT}`);
  console.log(`📚 Swagger API Docs: http://localhost:${PORT}/api-docs`);
  console.log('🔒 Authentication: JWT (Bearer Token)');
  console.log('📦 Database: PostgreSQL (UUID & Unix Timestamp)');
  console.log('-------------------------------------------------------');

  // Bật scheduler đồng bộ CBS (06:00 & 18:00 giờ VN)
  if (process.env.DISABLE_CBS_SCHEDULER !== '1') {
    try {
      startCbsScheduler();
    } catch (e) {
      console.error('[CBS scheduler] Không khởi động được:', e);
    }
  } else {
    console.log('[CBS scheduler] Bị tắt bằng DISABLE_CBS_SCHEDULER=1');
  }
});
