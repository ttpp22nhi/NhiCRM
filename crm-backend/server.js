
import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { register, login, changePassword, getEmployees, getEmployeeById, resetPassword, updateEmployee, transferCustomers, getTransferStats } from './controllers/authController.js';
import { verifyToken, verifyAdmin } from './middleware/auth.js';
import { createCustomer, getCustomers, updateCustomer, deleteCustomer, checkDuplicateCustomer, bulkTransferCustomers } from './controllers/customerController.js';
import { createInteraction, getInteractionsByCustomer } from './controllers/interactionController.js';
import { getDashboardStats } from './controllers/dashboardController.js';
import { getTasks, createTask, updateTask, deleteTask } from './controllers/taskController.js';
import { getNotifications, markAsRead, markAllAsRead } from './controllers/notificationController.js';
import { swaggerSpec, swaggerServe, swaggerSetup } from './swagger.js';

// Tải biến môi trường
dotenv.config();

const app = express();

// Middleware CORS - Xử lý preflight requests tự động
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3001',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Middleware xử lý JSON
app.use(express.json());

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
 * PUBLIC ROUTES
 */
/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Đăng nhập nhân viên
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
 *       401:
 *         description: Thông tin đăng nhập không chính xác
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.post('/api/auth/login', login);

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
app.post('/api/auth/register', verifyToken, verifyAdmin, register);

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
app.post('/api/auth/change-password', verifyToken, changePassword);

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
app.get('/api/employees', verifyToken, verifyAdmin, getEmployees);

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
app.get('/api/employees/:id', verifyToken, getEmployeeById);

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
app.put('/api/employees/:id', verifyToken, verifyAdmin, updateEmployee);

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
app.post('/api/employees/:id/reset-password', verifyToken, verifyAdmin, resetPassword);

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
app.post('/api/employees/transfer-customers', verifyToken, verifyAdmin, transferCustomers);

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
app.get('/api/employees/transfer-stats', verifyToken, verifyAdmin, getTransferStats);

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
app.post('/api/customers', verifyToken, createCustomer);
app.get('/api/customers', verifyToken, getCustomers);
app.post('/api/customers/check-duplicate', verifyToken, checkDuplicateCustomer);
app.put('/api/customers/:id', verifyToken, updateCustomer);
app.delete('/api/customers/:id', verifyToken, deleteCustomer);

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
app.patch('/api/customers/bulk-transfer', verifyToken, bulkTransferCustomers);

/**
 * @swagger
 * /api/interactions:
 *   post:
 *     summary: Tạo mới một tương tác
 *     tags: [Interactions]
 *     security:
 *       - bearerAuth: []
 */
app.post('/api/interactions', verifyToken, createInteraction);

/**
 * @swagger
 * /api/interactions/customer/{customerId}:
 *   get:
 *     summary: Lấy danh sách tương tác của khách hàng
 *     tags: [Interactions]
 *     security:
 *       - bearerAuth: []
 */
app.get('/api/interactions/customer/:customerId', verifyToken, getInteractionsByCustomer);

/**
 * @swagger
 * /api/dashboard/stats:
 *   get:
 *     summary: Lấy thống kê tổng quan Dashboard
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 */
app.get('/api/dashboard/stats', verifyToken, getDashboardStats);

/**
 * @swagger
 * /api/tasks:
 *   get:
 *     summary: Lấy danh sách tasks
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 */
app.get('/api/tasks', verifyToken, getTasks);

/**
 * @swagger
 * /api/tasks:
 *   post:
 *     summary: Tạo task mới
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 */
app.post('/api/tasks', verifyToken, createTask);

/**
 * @swagger
 * /api/tasks/{id}:
 *   patch:
 *     summary: Cập nhật task (hoàn thành task và tạo interaction)
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 */
app.patch('/api/tasks/:id', verifyToken, updateTask);

/**
 * @swagger
 * /api/tasks/{id}:
 *   delete:
 *     summary: Xóa task
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 */
app.delete('/api/tasks/:id', verifyToken, deleteTask);

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     summary: Lấy danh sách thông báo
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 */
app.get('/api/notifications', verifyToken, getNotifications);

/**
 * @swagger
 * /api/notifications/{id}/read:
 *   patch:
 *     summary: Đánh dấu thông báo đã đọc
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 */
app.patch('/api/notifications/:id/read', verifyToken, markAsRead);

/**
 * @swagger
 * /api/notifications/read-all:
 *   patch:
 *     summary: Đánh dấu tất cả thông báo đã đọc
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 */
app.patch('/api/notifications/read-all', verifyToken, markAllAsRead);

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
});
