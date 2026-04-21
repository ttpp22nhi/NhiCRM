import jwt from 'jsonwebtoken';
import pool from '../database.js';
import {
  isExecutiveRole,
  isTenantAdminRole,
  canCreateEmployees,
} from '../config/rbac.js';

/**
 * Middleware xác thực mã Token (JWT)
 * Kiểm tra Header Authorization: Bearer <token>
 */
export const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  // Token thường có dạng "Bearer ABCXYZ..."
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Truy cập bị từ chối. Vui lòng cung cấp mã xác thực (Token).'
    });
  }

  try {
    const secret = process.env.JWT_SECRET || 'crm_secret_key_2025';
    const decoded = jwt.verify(token, secret);

    // Gán thông tin user vào request để các controller sau có thể sử dụng
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({
      success: false,
      message: 'Mã xác thực không hợp lệ hoặc đã hết hạn.'
    });
  }
};

/**
 * Middleware trích xuất tenant_id từ JWT (chạy sau verifyToken).
 * Gán req.tenantId = decoded.tenant_id.
 * Super Admin (role === 'super_admin') được phép không có tenant_id (req.tenantId = null, req.isSuperAdmin = true).
 * Nếu không phải Super Admin và không có tenant_id hợp lệ -> 403.
 */
export const extractTenant = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Vui lòng đăng nhập trước.'
    });
  }

  const isSuperAdmin = req.user.role === 'super_admin';
  // Super Admin có thể gửi header X-Tenant-Id để "vào công ty" (chọn tenant) khi JWT không có tenant_id
  const headerTenantId = req.headers['x-tenant-id'] && String(req.headers['x-tenant-id']).trim();
  let tenantId = req.user.tenant_id;
  if (isSuperAdmin && headerTenantId) {
    tenantId = headerTenantId;
  }

  if (isSuperAdmin && (!tenantId || typeof tenantId !== 'string' || !tenantId.trim())) {
    req.tenantId = null;
    req.isSuperAdmin = true;
    next();
    return;
  }

  if (!tenantId || typeof tenantId !== 'string' || !tenantId.trim()) {
    return res.status(403).json({
      success: false,
      message: 'Tenant không hợp lệ. Truy cập bị từ chối.'
    });
  }

  req.tenantId = tenantId.trim();
  req.isSuperAdmin = !!isSuperAdmin;

  if (process.env.NODE_ENV !== 'production') {
    console.log('[Tenant] req.tenantId =', req.tenantId, '| path:', req.method, req.path);
  }

  next();
};

/**
 * Bắt buộc phải có tenantId (sau extractTenant).
 * Super Admin không gắn tenant (req.tenantId = null) sẽ bị 403 khi gọi API nội bộ công ty.
 */
export const requireTenant = (req, res, next) => {
  if (req.tenantId) return next();
  return res.status(403).json({
    success: false,
    message: 'Yêu cầu đăng nhập trong phạm vi một công ty. Chỉ Super Admin có thể dùng menu Hệ thống khi chưa gắn công ty.'
  });
};

/**
 * Kiểm tra gói dịch vụ tenant (is_active, end_date).
 * Chạy sau requireTenant (đã có req.tenantId).
 * - is_active = false -> 403 Tài khoản bị khóa.
 * - end_date đã quá: GET cho phép (xem dữ liệu), POST/PUT/PATCH/DELETE chặn với thông báo hết hạn.
 * Gán req.tenantSubscription = { is_active, end_date, expired, end_date_formatted } cho frontend.
 */
export const checkTenantSubscription = async (req, res, next) => {
  if (!req.tenantId) return next();
  try {
    const row = await pool.query(
      'SELECT is_active, end_date FROM tenants WHERE id = $1',
      [req.tenantId]
    );
    if (row.rows.length === 0) {
      return res.status(403).json({ success: false, message: 'Tenant không tồn tại.' });
    }
    const { is_active, end_date } = row.rows[0];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let endDateObj = null;
    if (end_date) {
      endDateObj = new Date(end_date);
      endDateObj.setHours(0, 0, 0, 0);
    }
    const expired = endDateObj ? today > endDateObj : false;
    const endDateFormatted = endDateObj ? endDateObj.toLocaleDateString('vi-VN') : null;
    let days_remaining = null;
    if (endDateObj && !expired) {
      days_remaining = Math.ceil((endDateObj - today) / (1000 * 60 * 60 * 24));
    }
    req.tenantSubscription = {
      is_active: !!is_active,
      end_date: end_date,
      expired,
      end_date_formatted: endDateFormatted,
      days_remaining
    };

    if (!is_active) {
      return res.status(403).json({
        success: false,
        message: 'Tài khoản bị khóa.'
      });
    }

    const method = (req.method || '').toUpperCase();
    if (expired && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return res.status(403).json({
        success: false,
        message: `Gói dịch vụ đã hết hạn vào ngày ${endDateFormatted || 'N/A'}. Vui lòng gia hạn để tiếp tục sử dụng.`
      });
    }

    next();
  } catch (err) {
    console.error('checkTenantSubscription:', err);
    res.status(500).json({ success: false, message: 'Lỗi kiểm tra gói dịch vụ.' });
  }
};

/**
 * Chỉ Super Admin (cấp hệ thống) mới được gọi API.
 * Dùng cho routes quản lý tenants, global_configs, system_logs.
 */
export const verifySuperAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Vui lòng đăng nhập trước.'
    });
  }
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({
      success: false,
      message: 'Chỉ Super Admin mới có quyền thực hiện thao tác này.'
    });
  }
  next();
};

/**
 * Quản trị tenant: chỉ admin + super_admin (cấu trúc tổ chức, ma trận phân quyền, sửa nhân viên, đăng ký…).
 */
export const verifyTenantAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Vui lòng đăng nhập trước.',
    });
  }
  if (!isTenantAdminRole(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Chỉ quản trị viên (Admin) mới có quyền thực hiện thao tác này.',
    });
  }
  next();
};

/**
 * Lãnh đạo vận hành: admin, super_admin, giám đốc, quản lý — không gồm chỉnh cấu hình tenant.
 */
export const verifyExecutive = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Vui lòng đăng nhập trước.',
    });
  }
  if (!isExecutiveRole(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Chỉ quản trị viên, giám đốc hoặc quản lý mới có quyền thực hiện thao tác này.',
    });
  }
  next();
};

/**
 * Tạo nhân viên mới (POST /api/auth/register, import Excel): Admin, Super Admin, Giám đốc, Quản lý.
 */
export const verifyEmployeeCreator = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Vui lòng đăng nhập trước.',
    });
  }
  if (!canCreateEmployees(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Chỉ Quản trị viên, Giám đốc hoặc Quản lý mới được thêm nhân viên mới.',
    });
  }
  next();
};

/** @deprecated Dùng verifyTenantAdmin — giữ export để tương thích mã cũ */
export const verifyAdmin = verifyTenantAdmin;

/** @deprecated Dùng verifyExecutive */
export const verifyAdminOrDirector = verifyExecutive;

/** Đồng nghĩa verifyTenantAdmin (reset mật khẩu, v.v.) */
export const verifyStrictAdmin = verifyTenantAdmin;
