
import { v4 as uuidv4 } from 'uuid';
import pool from '../database.js';
import { getTenantId } from '../utils/tenantHelper.js';
import { getAccessScope, buildCustomerFilter } from '../services/permissionService.js';
import { getAssignableEmployeeIds } from '../services/assignableEmployeesService.js';
import { parseKpiCustomerKind } from '../constants/kpiCustomerKind.js';

/**
 * Kiểm tra trùng lặp khách hàng dựa trên số điện thoại hoặc mã số thuế
 */
export const checkDuplicateCustomer = async (req, res) => {
  const { phone, tax_code } = req.body;
  const { id: userId } = req.user;
  const tenantId = getTenantId(req);

  try {
    // Kiểm tra ít nhất một trong hai trường phải có
    if (!phone && !tax_code) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp số điện thoại hoặc mã số thuế để kiểm tra.'
      });
    }

    let query = `
      SELECT 
        c.customer_id,
        c.full_name,
        c.phone,
        c.tax_code,
        c.assigned_to,
        e.full_name as assigned_employee_name,
        e.username as assigned_employee_username
      FROM customers c
      LEFT JOIN employees e ON c.assigned_to = e.employee_id
      WHERE c.deleted_at IS NULL AND c.tenant_id = $1
    `;
    const params = [tenantId];
    let paramIndex = 2;
    const conditions = [];

    // Tìm theo số điện thoại
    if (phone && phone.trim()) {
      conditions.push(`c.phone = $${paramIndex++}`);
      params.push(phone.trim());
    }

    // Tìm theo mã số thuế (nếu có và không phải empty string)
    if (tax_code && tax_code.trim() !== '') {
      conditions.push(`(c.tax_code = $${paramIndex++} AND c.tax_code IS NOT NULL AND c.tax_code != '')`);
      params.push(tax_code.trim());
    }

    // Nếu có điều kiện, thêm vào query với OR
    if (conditions.length > 0) {
      query += ` AND (${conditions.join(' OR ')})`;
    }

    query += ' LIMIT 1';

    const result = await pool.query(query, params);

    if (result.rows.length > 0) {
      const duplicate = result.rows[0];
      const isOwnCustomer = duplicate.assigned_to === userId;

      return res.json({
        success: true,
        is_duplicate: true,
        customer: {
          customer_id: duplicate.customer_id,
          full_name: duplicate.full_name,
          phone: duplicate.phone,
          tax_code: duplicate.tax_code,
          assigned_employee_name: duplicate.assigned_employee_name || 'Chưa gán',
          assigned_employee_username: duplicate.assigned_employee_username || '',
          is_own_customer: isOwnCustomer
        }
      });
    }

    // Không tìm thấy trùng lặp
    return res.json({
      success: true,
      is_duplicate: false
    });
  } catch (error) {
    console.error('Lỗi checkDuplicateCustomer:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi kiểm tra trùng lặp.',
      error: error.message
    });
  }
};

/**
 * Tạo mới khách hàng và lưu vào Database
 */
export const createCustomer = async (req, res) => {
  const { 
    full_name, 
    email, 
    phone, 
    address, 
    customer_type, 
    kpi_customer_kind,
    company_name, 
    tax_code, 
    source,
    assigned_to // Trường này chỉ dùng cho admin/manager
  } = req.body;

  const { role, id } = req.user;
  const tenantId = getTenantId(req);

  try {
    // 1. Kiểm tra ràng buộc cơ bản
    if (!full_name || !phone) {
      return res.status(400).json({ 
        success: false, 
        message: 'Họ tên và số điện thoại là bắt buộc.' 
      });
    }

    // 2. Logic gán nhân viên chăm sóc:
    // - Nếu là sales: tự động gán cho chính mình
    // - Nếu là admin/manager: dùng assigned_to từ body (nếu có), nếu không thì gán cho chính mình
    let finalAssignedTo;
    if (role === 'sales') {
      // Nhân viên sales luôn tự gán cho mình
      finalAssignedTo = id;
    } else {
      // Admin/manager có thể chọn nhân viên, nếu không chọn thì gán cho chính mình
      finalAssignedTo = assigned_to || id;
      
      // Nếu chọn nhân viên, kiểm tra thuộc tenant + active và nằm trong danh sách được phép gán (phân cấp)
      if (assigned_to && assigned_to !== id) {
        const checkEmployee = await pool.query(
          'SELECT employee_id FROM employees WHERE employee_id = $1 AND tenant_id = $2 AND is_active = TRUE',
          [assigned_to, tenantId]
        );
        if (checkEmployee.rows.length === 0) {
          return res.status(400).json({ success: false, message: 'Nhân viên được chọn không tồn tại hoặc không thuộc đơn vị của bạn.' });
        }
        const allowedIds = await getAssignableEmployeeIds(tenantId, id, role);
        if (!allowedIds.includes(assigned_to)) {
          return res.status(403).json({ success: false, message: 'Bạn không được phép gán khách hàng cho nhân viên này (vượt quyền phân cấp).' });
        }
      }
    }

    const customer_id = uuidv4();
    const now = Date.now();

    const kpiKind = parseKpiCustomerKind(kpi_customer_kind)
    const query = `
      INSERT INTO customers (
        customer_id, full_name, email, phone, address, customer_type, kpi_customer_kind, company_name, tax_code, source,
        assigned_to, tenant_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *;
    `;
    const values = [
      customer_id, full_name, email || '', phone, address || '', customer_type || 'individual',
      kpiKind,
      company_name || '', tax_code || '', source || 'Direct', finalAssignedTo, tenantId, now, now
    ];

    const result = await pool.query(query, values);

    res.status(201).json({
      success: true,
      message: 'Tạo khách hàng thành công!',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Lỗi CreateCustomer:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Lỗi hệ thống khi tạo khách hàng.',
      error: error.message 
    });
  }
};

/**
 * Lấy danh sách khách hàng dựa theo phân quyền
 * - Admin: Thấy toàn bộ khách hàng
 * - Sales: Thấy khách hàng do mình phụ trách (assigned_to)
 * 
 * Query parameters:
 * - search: Tìm kiếm theo tên khách hàng, tên công ty, số điện thoại, mã số thuế (không phân biệt hoa thường)
 * - type: Lọc theo loại khách hàng (customer_type) - có thể gửi nhiều lần để chọn nhiều loại
 * - page: Số trang hiện tại (mặc định là 1)
 * - limit: Số lượng bản ghi mỗi trang (mặc định là 10)
 */
export const getCustomers = async (req, res) => {
  const { id } = req.user;
  const { search, type, page, limit, assigned_to: assignedToQuery, kind: kindQuery } = req.query;

  const currentPage = parseInt(page) || 1;
  const pageSize = parseInt(limit) || 10;
  const offset = (currentPage - 1) * pageSize;

  let types = [];
  if (type) {
    types = Array.isArray(type) ? type : [type];
    types = types.filter(t => t && t.trim() !== '' && t !== 'all');
  }

  // Lọc theo phân loại KPI (khách mới / hiện hữu). Giữ đúng logic
  // inferKpiCustomerKind: ưu tiên kpi_customer_kind; fallback nếu
  // customer_type vô tình là 'NEW'/'EXISTING'; mặc định 'NEW'.
  const kindRaw = String(kindQuery || '').trim().toUpperCase();
  const kpiKindFilter =
    kindRaw === 'EXISTING' ? 'EXISTING' : kindRaw === 'NEW' ? 'NEW' : null;

  try {
    const tenantId = getTenantId(req);
    const access = await getAccessScope(id, 'customers', 'read', tenantId);
    const { clause: accessClause, params: accessParams, paramIndex: paramIndexAfter } = buildCustomerFilter(access, 2);

    let values = [tenantId, ...accessParams];
    let paramIndex = paramIndexAfter;

    const baseSelect = `
      SELECT 
        c.*,
        e.employee_id as assigned_employee_id,
        e.full_name as assigned_employee_name,
        e.username as assigned_employee_username,
        e.email as assigned_employee_email,
        e.role as assigned_employee_role
      FROM customers c
      LEFT JOIN employees e ON c.assigned_to = e.employee_id
    `;

    const conditions = [];
    conditions.push(`c.deleted_at IS NULL`);
    conditions.push(`c.tenant_id = $1`);
    conditions.push(`(${accessClause})`);

    // Tìm kiếm: Tên KH, tên công ty, số điện thoại, mã số thuế
    if (search && search.trim() !== '') {
      const searchPattern = `%${search.trim()}%`;
      conditions.push(`(
        c.full_name ILIKE $${paramIndex} OR
        c.phone ILIKE $${paramIndex} OR
        c.company_name ILIKE $${paramIndex} OR
        c.tax_code ILIKE $${paramIndex}
      )`);
      values.push(searchPattern);
      paramIndex++;
    }

    // Lọc theo loại khách hàng (có thể nhiều loại)
    if (types.length > 0) {
      // Tạo placeholders cho IN clause: $1, $2, $3, ...
      const placeholders = types.map((_, index) => `$${paramIndex + index}`).join(', ');
      conditions.push(`c.customer_type IN (${placeholders})`);
      values.push(...types);
      paramIndex += types.length;
    }

    if (assignedToQuery && String(assignedToQuery).trim() !== '') {
      const aid = String(assignedToQuery).trim();
      const allowedIds = await getAssignableEmployeeIds(tenantId, id, req.user.role);
      if (!allowedIds.includes(aid)) {
        return res.status(403).json({
          success: false,
          message: 'Không được lọc theo nhân viên chăm sóc này.',
        });
      }
      conditions.push(`c.assigned_to = $${paramIndex}`);
      values.push(aid);
      paramIndex++;
    }

    if (kpiKindFilter === 'EXISTING') {
      conditions.push(
        `(UPPER(COALESCE(c.kpi_customer_kind, '')) = 'EXISTING'
          OR UPPER(COALESCE(c.customer_type, '')) = 'EXISTING')`
      );
    } else if (kpiKindFilter === 'NEW') {
      conditions.push(
        `(UPPER(COALESCE(c.kpi_customer_kind, 'NEW')) <> 'EXISTING'
          AND UPPER(COALESCE(c.customer_type, '')) <> 'EXISTING')`
      );
    }

    // Query để đếm tổng số bản ghi (cho pagination)
    // Luôn có điều kiện deleted_at IS NULL (đã thêm vào conditions)
    const countQuery = `SELECT COUNT(*) as total FROM customers c WHERE ${conditions.join(' AND ')}`;

    // Thực thi query đếm tổng số bản ghi
    const countResult = await pool.query(countQuery, values);
    const totalItems = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(totalItems / pageSize);

    // Xây dựng query lấy dữ liệu với pagination
    const query = `${baseSelect} WHERE ${conditions.join(' AND ')} ORDER BY c.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    
    // Thêm limit và offset vào values
    values.push(pageSize, offset);

    const result = await pool.query(query, values);
    
    res.json({
      success: true,
      data: result.rows,
      pagination: {
        totalItems,
        totalPages,
        currentPage,
        pageSize
      }
    });
  } catch (error) {
    console.error('Lỗi getCustomers:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Không thể lấy danh sách khách hàng từ cơ sở dữ liệu.' 
    });
  }
};

/**
 * Cập nhật thông tin khách hàng
 * - Admin/Manager: Có quyền sửa mọi khách hàng
 * - Sales: Chỉ được sửa khách hàng được gán cho mình (assigned_to)
 */
export const updateCustomer = async (req, res) => {
  const { id } = req.params; // customer_id
  const {
    full_name,
    email,
    phone,
    address,
    customer_type,
    kpi_customer_kind,
    company_name,
    tax_code,
    source,
    active_status,
    assigned_to // Chỉ dùng cho admin/manager
  } = req.body;

  const { role, id: userId } = req.user;

  try {
    const tenantId = getTenantId(req);

    // 1. Kiểm tra khách hàng có tồn tại, thuộc tenant và chưa bị xóa
    const checkCustomer = await pool.query(
      'SELECT assigned_to, deleted_at, kpi_customer_kind, active_status FROM customers WHERE customer_id = $1 AND tenant_id = $2',
      [id, tenantId]
    );
    if (checkCustomer.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Khách hàng không tồn tại.' });
    }
    const customer = checkCustomer.rows[0];
    if (customer.deleted_at !== null) {
      return res.status(404).json({ success: false, message: 'Khách hàng đã bị xóa.' });
    }
    if (role === 'sales' && customer.assigned_to !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền sửa khách hàng này. Chỉ có thể sửa khách hàng được gán cho bạn.'
      });
    }

    // 3. Kiểm tra ràng buộc cơ bản
    if (!full_name || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Họ tên và số điện thoại là bắt buộc.'
      });
    }

    // 4. Logic gán nhân viên chăm sóc
    let finalAssignedTo = customer.assigned_to; // Giữ nguyên mặc định

    if (role === 'sales') {
      // Sales không thể thay đổi assigned_to, luôn giữ nguyên
      finalAssignedTo = customer.assigned_to;
    } else {
      // Director/manager/leader có thể chọn nhân viên trong phạm vi được phép
      if (assigned_to) {
        const checkEmployee = await pool.query(
          'SELECT employee_id FROM employees WHERE employee_id = $1 AND tenant_id = $2 AND is_active = TRUE',
          [assigned_to, tenantId]
        );
        if (checkEmployee.rows.length === 0) {
          return res.status(400).json({ success: false, message: 'Nhân viên được chọn không tồn tại hoặc không thuộc đơn vị của bạn.' });
        }
        const allowedIds = await getAssignableEmployeeIds(tenantId, userId, role);
        if (!allowedIds.includes(assigned_to)) {
          return res.status(403).json({ success: false, message: 'Bạn không được phép gán khách hàng cho nhân viên này (vượt quyền phân cấp).' });
        }
        finalAssignedTo = assigned_to;
      }
    }

    const now = Date.now();
    let nextActiveStatus = Number(customer.active_status ?? 1);
    if (active_status !== undefined) {
      const parsed = Number(active_status);
      if (![0, 1].includes(parsed)) {
        return res.status(400).json({
          success: false,
          message: 'Trạng thái hoạt động chỉ nhận 0 (không hoạt động) hoặc 1 (hoạt động).'
        });
      }
      nextActiveStatus = parsed;
    }
    const existingKpi = checkCustomer.rows[0].kpi_customer_kind
    const nextKpiKind =
      kpi_customer_kind !== undefined
        ? parseKpiCustomerKind(kpi_customer_kind)
        : parseKpiCustomerKind(existingKpi)

    const updateQuery = `
      UPDATE customers 
      SET full_name = $1, email = $2, phone = $3, address = $4, customer_type = $5, kpi_customer_kind = $6, company_name = $7, tax_code = $8, source = $9, active_status = $10, assigned_to = $11, updated_at = $12
      WHERE customer_id = $13 AND tenant_id = $14 AND deleted_at IS NULL
      RETURNING *;
    `;

    const values = [
      full_name, email || '', phone, address || '', customer_type || 'individual',
      nextKpiKind,
      company_name || '', tax_code || '', source || 'Direct', nextActiveStatus, finalAssignedTo, now, id, tenantId
    ];
    const result = await pool.query(updateQuery, values);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không thể cập nhật khách hàng.' });
    }

    res.json({
      success: true,
      message: 'Cập nhật khách hàng thành công!',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Lỗi updateCustomer:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi cập nhật khách hàng.',
      error: error.message
    });
  }
};

/**
 * Xóa khách hàng (Soft Delete)
 * - Admin/Manager: Có quyền xóa mọi khách hàng
 * - Sales: Chỉ được xóa khách hàng được gán cho mình (assigned_to)
 */
export const deleteCustomer = async (req, res) => {
  const { id } = req.params;
  const { role, id: userId } = req.user;
  const tenantId = getTenantId(req);

  try {
    const checkCustomer = await pool.query(
      'SELECT assigned_to, deleted_at FROM customers WHERE customer_id = $1 AND tenant_id = $2',
      [id, tenantId]
    );
    if (checkCustomer.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Khách hàng không tồn tại.' });
    }
    const customer = checkCustomer.rows[0];
    if (customer.deleted_at !== null) {
      return res.status(400).json({ success: false, message: 'Khách hàng đã bị xóa trước đó.' });
    }
    if (role === 'sales' && customer.assigned_to !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền xóa khách hàng này. Chỉ có thể xóa khách hàng được gán cho bạn.'
      });
    }

    // 3. Soft Delete: Cập nhật deleted_at
    const now = Date.now();
    const deleteQuery = `
      UPDATE customers 
      SET deleted_at = $1, updated_at = $1
      WHERE customer_id = $2 AND tenant_id = $3 AND deleted_at IS NULL
      RETURNING *;
    `;

    const result = await pool.query(deleteQuery, [now, id, tenantId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không thể xóa khách hàng.' });
    }

    res.json({
      success: true,
      message: 'Xóa khách hàng thành công. Dữ liệu đã được lưu trữ trong kho lưu trữ tạm thời.'
    });

  } catch (error) {
    console.error('Lỗi deleteCustomer:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi xóa khách hàng.',
      error: error.message
    });
  }
};

/**
 * Chuyển giao khách hàng hàng loạt
 * - Admin/Manager: Có quyền chuyển giao mọi khách hàng
 * - Sales: Chỉ được chuyển giao khách hàng của mình
 */
export const bulkTransferCustomers = async (req, res) => {
  const { customer_ids, new_assigned_to_id, transfer_reason, include_completed_tasks } = req.body;
  const { role, id: userId } = req.user;
  const tenantId = getTenantId(req);

  try {
    if (!customer_ids || !Array.isArray(customer_ids) || customer_ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Danh sách customer_ids là bắt buộc và phải là mảng không rỗng.'
      });
    }
    if (!new_assigned_to_id) {
      return res.status(400).json({
        success: false,
        message: 'new_assigned_to_id là bắt buộc.'
      });
    }

    const employeeCheck = await pool.query(
      'SELECT employee_id, full_name FROM employees WHERE employee_id = $1 AND tenant_id = $2 AND is_active = TRUE',
      [new_assigned_to_id, tenantId]
    );

    if (employeeCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Nhân viên tiếp nhận không tồn tại hoặc đã bị khóa.'
      });
    }

    const newEmployee = employeeCheck.rows[0];

    const placeholders = customer_ids.map((_, index) => `$${index + 1}`).join(', ');
    const customersCheckQuery = `
      SELECT customer_id, full_name, assigned_to, deleted_at
      FROM customers
      WHERE customer_id IN (${placeholders}) AND tenant_id = $${customer_ids.length + 1}
    `;
    const customersCheck = await pool.query(customersCheckQuery, [...customer_ids, tenantId]);

    if (customersCheck.rows.length !== customer_ids.length) {
      return res.status(400).json({
        success: false,
        message: 'Một số khách hàng không tồn tại.'
      });
    }

    // Kiểm tra soft delete và phân quyền
    const validCustomers = [];
    for (const customer of customersCheck.rows) {
      if (customer.deleted_at !== null) {
        return res.status(400).json({
          success: false,
          message: `Khách hàng ${customer.full_name} đã bị xóa.`
        });
      }

      // Sales chỉ được chuyển giao khách hàng của mình
      if (role === 'sales' && customer.assigned_to !== userId) {
        return res.status(403).json({
          success: false,
          message: `Bạn không có quyền chuyển giao khách hàng ${customer.full_name}.`
        });
      }

      validCustomers.push(customer);
    }

    // 4. Bắt đầu transaction
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const now = Date.now();
      const oldEmployeeNames = {};

      const uniqueOldEmployeeIds = [...new Set(validCustomers.map(c => c.assigned_to).filter(Boolean))];
      if (uniqueOldEmployeeIds.length > 0) {
        const oldEmployeePlaceholders = uniqueOldEmployeeIds.map((_, index) => `$${index + 1}`).join(', ');
        const oldEmployeesQuery = `
          SELECT employee_id, full_name
          FROM employees
          WHERE employee_id IN (${oldEmployeePlaceholders}) AND tenant_id = $${uniqueOldEmployeeIds.length + 1}
        `;
        const oldEmployeesResult = await client.query(oldEmployeesQuery, [...uniqueOldEmployeeIds, tenantId]);
        oldEmployeesResult.rows.forEach(emp => {
          oldEmployeeNames[emp.employee_id] = emp.full_name;
        });
      }

      // 6. Xử lý Deals đang mở
      // Lưu ý: Bảng deals không có trường assigned_to, chỉ liên kết với customers qua customer_id
      // Khi chuyển giao khách hàng, deals sẽ tự động "chuyển giao" vì liên kết với customer_id
      // Chỉ đếm các deal có stage KHÔNG PHẢI là 'Thành công' hoặc 'Thất bại' để thông báo
      const customerPlaceholders = customer_ids.map((_, index) => `$${index + 1}`).join(', ');
      const dealsCountResult = await client.query(
        `SELECT COUNT(DISTINCT d.deal_id) as count
         FROM deals d
         INNER JOIN customers c ON d.customer_id = c.customer_id
         WHERE c.customer_id IN (${customerPlaceholders})
         AND c.tenant_id = $${customer_ids.length + 1} AND c.deleted_at IS NULL
         AND (COALESCE(d.is_deleted, false) = false)
         AND d.stage NOT IN ('closed_won', 'closed_lost', 'Thành công', 'Thất bại')`,
        [...customer_ids, tenantId]
      );
      const dealsCount = parseInt(dealsCountResult.rows[0].count) || 0;

      // 7. Đếm và cập nhật tasks
      // Nếu include_completed_tasks = true: cập nhật tất cả tasks (bao gồm cả đã hoàn thành)
      // Nếu include_completed_tasks = false hoặc undefined: chỉ cập nhật tasks chưa hoàn thành
      let tasksUpdateQuery;
      if (include_completed_tasks === true) {
        tasksUpdateQuery = `
          UPDATE tasks 
          SET assigned_to = $1
          WHERE customer_id IN (${customerPlaceholders}) AND tenant_id = $${customer_ids.length + 2}
          RETURNING task_id
        `;
      } else {
        tasksUpdateQuery = `
          UPDATE tasks 
          SET assigned_to = $1
          WHERE customer_id IN (${customerPlaceholders}) AND tenant_id = $${customer_ids.length + 2}
          AND is_completed = false
          RETURNING task_id
        `;
      }
      const tasksUpdateResult = await client.query(
        tasksUpdateQuery,
        [new_assigned_to_id, ...customer_ids, tenantId]
      );
      const tasksCount = tasksUpdateResult.rowCount || 0;

      const customerPlaceholdersUpdate = customer_ids.map((_, index) => `$${index + 4}`).join(', ');
      await client.query(
        `UPDATE customers 
         SET assigned_to = $1, updated_at = $2
         WHERE customer_id IN (${customerPlaceholdersUpdate}) AND tenant_id = $3 AND deleted_at IS NULL`,
        [new_assigned_to_id, now, tenantId, ...customer_ids]
      );

      // 9. Tạo audit log interactions cho mỗi khách hàng
      // Với mỗi khách hàng được chuyển giao, tự động chèn 1 dòng vào bảng interactions
      for (const customer of validCustomers) {
        const interactionId = uuidv4();
        const oldEmployeeName = customer.assigned_to ? (oldEmployeeNames[customer.assigned_to] || 'Chưa gán') : 'Chưa gán';
        
        // Format content theo yêu cầu: 'BÀN GIAO HỆ THỐNG: Khách hàng và các công việc đang dang dở được chuyển từ [Tên người cũ] sang [Tên người mới].'
        const content = `BÀN GIAO HỆ THỐNG: Khách hàng và các công việc đang dang dở được chuyển từ ${oldEmployeeName} sang ${newEmployee.full_name}.${transfer_reason ? ` Lý do: ${transfer_reason}` : ''}`;

        await client.query(
          `INSERT INTO interactions (
            interaction_id, customer_id, interaction_type, content,
            interaction_date, employee_id, status, tenant_id, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            interactionId,
            customer.customer_id,
            'system',
            content.trim(),
            now,
            userId,
            'system',
            tenantId,
            now
          ]
        );
      }

      // 10. Gửi thông báo hệ thống cho nhân viên tiếp nhận
      // Thông báo số lượng Deal và Task cụ thể vừa nhận được
      const notificationId = uuidv4();
      const taskDescription = include_completed_tasks 
        ? `${tasksCount} task (bao gồm cả đã hoàn thành)`
        : `${tasksCount} task chưa hoàn thành`;
      const notificationMessage = `Bạn vừa nhận bàn giao ${validCustomers.length} khách hàng với ${dealsCount} deal đang mở và ${taskDescription}. Vui lòng kiểm tra danh sách.`;
      
      await client.query(
        `INSERT INTO public.notifications (
          notification_id, employee_id, type, title, message, is_read, tenant_id, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          notificationId,
          new_assigned_to_id,
          'customer_bulk_transfer',
          'Nhận bàn giao khách hàng hàng loạt',
          notificationMessage,
          false,
          tenantId,
          now
        ]
      );

      // 11. Commit transaction
      await client.query('COMMIT');

      res.json({
        success: true,
        message: `Đã chuyển giao thành công ${validCustomers.length} khách hàng cho ${newEmployee.full_name}.`,
        data: {
          customers_transferred: validCustomers.length,
          deals_count: dealsCount,
          tasks_transferred: tasksCount,
          new_employee: {
            employee_id: new_assigned_to_id,
            full_name: newEmployee.full_name
          }
        }
      });
    } catch (error) {
      // Rollback transaction nếu có lỗi
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Lỗi bulkTransferCustomers:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi chuyển giao khách hàng hàng loạt.',
      error: error.message
    });
  }
};

/**
 * Lấy lịch sử sở hữu và ghi chú bàn giao của khách hàng
 * GET /api/customers/:customerId/ownership-history
 */
export const getCustomerOwnershipHistory = async (req, res) => {
  const { customerId } = req.params;
  const { role, id: userId } = req.user;
  const tenantId = getTenantId(req);

  try {
    const customerCheck = await pool.query(
      'SELECT customer_id, assigned_to FROM customers WHERE customer_id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [customerId, tenantId]
    );

    if (customerCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Khách hàng không tồn tại hoặc đã bị xóa.'
      });
    }

    // Kiểm tra quyền: Sales chỉ xem được khách hàng được gán cho mình
    const customer = customerCheck.rows[0];
    if (role !== 'admin' && role !== 'manager' && customer.assigned_to !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền xem thông tin khách hàng này.'
      });
    }

    // 1. Lấy lịch sử sở hữu từ interactions với type='system' và content chứa "BÀN GIAO HỆ THỐNG"
    const ownershipHistoryQuery = `
      SELECT 
        i.interaction_id,
        i.content,
        i.created_at,
        i.interaction_date,
        e.full_name as employee_name,
        e.username as employee_username,
        e.employee_id
      FROM interactions i
      LEFT JOIN employees e ON i.employee_id = e.employee_id
      WHERE i.customer_id = $1 AND i.tenant_id = $2
        AND i.interaction_type = 'system'
        AND i.content LIKE '%BÀN GIAO HỆ THỐNG%'
      ORDER BY i.created_at DESC
    `;
    const ownershipResult = await pool.query(ownershipHistoryQuery, [customerId, tenantId]);

    // 2. Lấy ghi chú bàn giao gần nhất từ transfer_approval_logs
    const latestTransferNoteQuery = `
      SELECT 
        tal.approval_note,
        tal.created_at,
        tal.action,
        approver.full_name as approver_name,
        approver.username as approver_username,
        sender.full_name as sender_name,
        receiver.full_name as receiver_name
      FROM transfer_approval_logs tal
      LEFT JOIN employees approver ON tal.approver_id = approver.employee_id
      LEFT JOIN employees sender ON tal.sender_id = sender.employee_id
      LEFT JOIN employees receiver ON tal.receiver_id = receiver.employee_id
      LEFT JOIN transfer_requests tr ON tal.transfer_request_id = tr.transfer_request_id
      WHERE $1 = ANY(tr.customer_ids) AND tr.tenant_id = $2
        AND tal.action = 'approve'
      ORDER BY tal.created_at DESC
      LIMIT 1
    `;
    const transferNoteResult = await pool.query(latestTransferNoteQuery, [customerId, tenantId]);

    // 3. Parse ownership history để trích xuất thông tin người phụ trách
    const ownershipHistory = ownershipResult.rows.map((row, index) => {
      // Parse content để lấy tên người cũ và người mới
      // Format: "BÀN GIAO HỆ THỐNG: Khách hàng và các công việc đang dang dở được chuyển từ [Tên người cũ] sang [Tên người mới]..."
      const content = row.content || '';
      const fromMatch = content.match(/từ\s+([^s]+?)\s+sang/);
      const toMatch = content.match(/sang\s+([^(]+?)(?:\s*\(|$)/);
      const reasonMatch = content.match(/Lý do:\s*(.+?)(?:\.|$)/);

      const fromName = fromMatch ? fromMatch[1].trim() : 'Chưa gán';
      const toName = toMatch ? toMatch[1].trim() : row.employee_name || 'Không xác định';
      const reason = reasonMatch ? reasonMatch[1].trim() : null;

      // Tính thời gian quản lý (từ lần chuyển giao này đến lần tiếp theo, hoặc đến hiện tại)
      const nextTransfer = ownershipResult.rows[index + 1];
      const startTime = row.created_at;
      const endTime = nextTransfer ? nextTransfer.created_at : null;

      return {
        interaction_id: row.interaction_id,
        from_employee_name: fromName,
        to_employee_name: toName,
        to_employee_id: row.employee_id,
        to_employee_username: row.employee_username,
        transfer_reason: reason,
        created_at: row.created_at,
        interaction_date: row.interaction_date,
        start_time: startTime,
        end_time: endTime,
        duration_days: endTime ? Math.floor((endTime - startTime) / (1000 * 60 * 60 * 24)) : null,
        is_current: index === 0 // Lần chuyển giao gần nhất là người hiện tại
      };
    });

    res.json({
      success: true,
      data: {
        ownership_history: ownershipHistory,
        latest_transfer_note: transferNoteResult.rows.length > 0 ? {
          approval_note: transferNoteResult.rows[0].approval_note,
          created_at: transferNoteResult.rows[0].created_at,
          approver_name: transferNoteResult.rows[0].approver_name,
          approver_username: transferNoteResult.rows[0].approver_username,
          sender_name: transferNoteResult.rows[0].sender_name,
          receiver_name: transferNoteResult.rows[0].receiver_name,
          action: transferNoteResult.rows[0].action
        } : null
      }
    });
  } catch (error) {
    console.error('Lỗi getCustomerOwnershipHistory:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi lấy lịch sử sở hữu khách hàng.',
      error: error.message
    });
  }
};
