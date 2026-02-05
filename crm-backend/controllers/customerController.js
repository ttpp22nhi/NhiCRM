
import { v4 as uuidv4 } from 'uuid';
import pool from '../database.js';

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
    company_name, 
    tax_code, 
    source,
    assigned_to // Trường này chỉ dùng cho admin/manager
  } = req.body;

  const { role, id } = req.user;

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
      
      // Nếu admin/manager chọn nhân viên, kiểm tra nhân viên có tồn tại không
      if (assigned_to && assigned_to !== id) {
        const checkEmployee = await pool.query(
          'SELECT employee_id FROM employees WHERE employee_id = $1 AND is_active = TRUE',
          [assigned_to]
        );
        
        if (checkEmployee.rows.length === 0) {
          return res.status(400).json({ 
            success: false, 
            message: 'Nhân viên được chọn không tồn tại hoặc đã bị khóa.' 
          });
        }
      }
    }

    const customer_id = uuidv4();
    const now = Date.now(); // Unix Timestamp (BIGINT)

    // 2. Thực thi truy vấn SQL - Đã thêm cột assigned_to
    const query = `
      INSERT INTO customers (
        customer_id, 
        full_name, 
        email, 
        phone, 
        address, 
        customer_type, 
        company_name, 
        tax_code, 
        source, 
        assigned_to, 
        created_at, 
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *;
    `;

    const values = [
      customer_id,
      full_name,
      email || '',
      phone,
      address || '',
      customer_type || 'individual',
      company_name || '',
      tax_code || '',
      source || 'Direct',
      finalAssignedTo, // Lưu ID nhân viên chăm sóc
      now,
      now
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
 * - search: Tìm kiếm theo tên, email, phone, company_name (không phân biệt hoa thường)
 * - type: Lọc theo loại khách hàng (customer_type) - có thể gửi nhiều lần để chọn nhiều loại
 * - page: Số trang hiện tại (mặc định là 1)
 * - limit: Số lượng bản ghi mỗi trang (mặc định là 10)
 */
export const getCustomers = async (req, res) => {
  const { role, id } = req.user;
  const { search, type, page, limit } = req.query;
  
  // Xử lý pagination parameters
  const currentPage = parseInt(page) || 1;
  const pageSize = parseInt(limit) || 10;
  const offset = (currentPage - 1) * pageSize;
  
  // Xử lý type có thể là string hoặc array
  let types = [];
  if (type) {
    types = Array.isArray(type) ? type : [type];
    // Loại bỏ 'all' và các giá trị rỗng
    types = types.filter(t => t && t.trim() !== '' && t !== 'all');
  }

  try {
    let query = '';
    let values = [];
    let paramIndex = 1;

    // Base query với JOIN employees
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

    // Xây dựng WHERE conditions
    const conditions = [];

    // Soft Delete: Chỉ lấy khách hàng chưa bị xóa
    conditions.push(`c.deleted_at IS NULL`);

    // Phân quyền: Sales chỉ thấy khách hàng của mình
    if (role !== 'admin') {
      conditions.push(`c.assigned_to = $${paramIndex}`);
      values.push(id);
      paramIndex++;
    }

    // Tìm kiếm: Tìm trong full_name, email, phone, company_name
    if (search && search.trim() !== '') {
      const searchPattern = `%${search.trim()}%`;
      conditions.push(`(
        c.full_name ILIKE $${paramIndex} OR
        c.email ILIKE $${paramIndex} OR
        c.phone ILIKE $${paramIndex} OR
        c.company_name ILIKE $${paramIndex}
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

    // Query để đếm tổng số bản ghi (cho pagination)
    // Luôn có điều kiện deleted_at IS NULL (đã thêm vào conditions)
    const countQuery = `SELECT COUNT(*) as total FROM customers c WHERE ${conditions.join(' AND ')}`;

    // Thực thi query đếm tổng số bản ghi
    const countResult = await pool.query(countQuery, values);
    const totalItems = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(totalItems / pageSize);

    // Xây dựng query lấy dữ liệu với pagination
    // Luôn có điều kiện deleted_at IS NULL (đã thêm vào conditions)
    query = `${baseSelect} WHERE ${conditions.join(' AND ')} ORDER BY c.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    
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
    company_name,
    tax_code,
    source,
    assigned_to // Chỉ dùng cho admin/manager
  } = req.body;

  const { role, id: userId } = req.user;

  try {
    // 1. Kiểm tra khách hàng có tồn tại và chưa bị xóa không
    const checkCustomer = await pool.query(
      'SELECT assigned_to, deleted_at FROM customers WHERE customer_id = $1',
      [id]
    );

    if (checkCustomer.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Khách hàng không tồn tại.'
      });
    }

    const customer = checkCustomer.rows[0];

    // Kiểm tra soft delete
    if (customer.deleted_at !== null) {
      return res.status(404).json({
        success: false,
        message: 'Khách hàng đã bị xóa.'
      });
    }

    // 2. Kiểm tra phân quyền
    // Sales chỉ được sửa khách hàng của mình
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
      // Admin/manager có thể chọn nhân viên, nếu không chọn thì giữ nguyên
      if (assigned_to) {
        // Kiểm tra nhân viên có tồn tại không
        const checkEmployee = await pool.query(
          'SELECT employee_id FROM employees WHERE employee_id = $1 AND is_active = TRUE',
          [assigned_to]
        );

        if (checkEmployee.rows.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'Nhân viên được chọn không tồn tại hoặc đã bị khóa.'
          });
        }

        finalAssignedTo = assigned_to;
      }
    }

    // 5. Cập nhật thông tin
    const now = Date.now();
    const updateQuery = `
      UPDATE customers 
      SET 
        full_name = $1,
        email = $2,
        phone = $3,
        address = $4,
        customer_type = $5,
        company_name = $6,
        tax_code = $7,
        source = $8,
        assigned_to = $9,
        updated_at = $10
      WHERE customer_id = $11 AND deleted_at IS NULL
      RETURNING *;
    `;

    const values = [
      full_name,
      email || '',
      phone,
      address || '',
      customer_type || 'individual',
      company_name || '',
      tax_code || '',
      source || 'Direct',
      finalAssignedTo,
      now,
      id
    ];

    const result = await pool.query(updateQuery, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không thể cập nhật khách hàng.'
      });
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
  const { id } = req.params; // customer_id
  const { role, id: userId } = req.user;

  try {
    // 1. Kiểm tra khách hàng có tồn tại và chưa bị xóa không
    const checkCustomer = await pool.query(
      'SELECT assigned_to, deleted_at FROM customers WHERE customer_id = $1',
      [id]
    );

    if (checkCustomer.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Khách hàng không tồn tại.'
      });
    }

    const customer = checkCustomer.rows[0];

    // Kiểm tra đã bị xóa chưa
    if (customer.deleted_at !== null) {
      return res.status(400).json({
        success: false,
        message: 'Khách hàng đã bị xóa trước đó.'
      });
    }

    // 2. Kiểm tra phân quyền
    // Sales chỉ được xóa khách hàng của mình
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
      WHERE customer_id = $2 AND deleted_at IS NULL
      RETURNING *;
    `;

    const result = await pool.query(deleteQuery, [now, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không thể xóa khách hàng.'
      });
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
