
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import pool from '../database.js';

/**
 * Đăng ký nhân viên mới (Chỉ Admin mới có quyền)
 */
export const register = async (req, res) => {
  const { username, password, full_name, email, role } = req.body;
  
  // Lấy thông tin admin đang tạo tài khoản (từ verifyToken middleware)
  const created_by = req.user.id;

  try {
    // 1. Kiểm tra username đã tồn tại chưa
    const checkUser = await pool.query('SELECT username FROM employees WHERE username = $1', [username]);
    if (checkUser.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'Tên đăng nhập đã tồn tại.' });
    }

    // 2. Mã hóa mật khẩu
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // 3. Chuẩn bị dữ liệu (UUID và Unix Timestamp)
    const employee_id = uuidv4();
    const created_at = Date.now();

    // 4. Lưu vào Database (Quy tắc: Không dùng khóa ngoại ở DB, ID là string/UUID)
    // Lưu ý: Nếu bảng có cột created_by, có thể lưu ID của admin tạo
    const query = `
      INSERT INTO employees (employee_id, username, password_hash, full_name, email, role, is_active, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING employee_id, username, full_name, email, role;
    `;
    const values = [employee_id, username, password_hash, full_name, email, role || 'sales', true, created_at];

    const result = await pool.query(query, values);

    res.status(201).json({
      success: true,
      message: 'Tạo tài khoản nhân viên thành công!',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Lỗi Register:', error);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống khi tạo tài khoản.' });
  }
};

/**
 * Đăng nhập nhân viên
 */
export const login = async (req, res) => {
  const { username, password } = req.body;

  try {
    // 1. Tìm nhân viên theo username
    const query = 'SELECT * FROM employees WHERE username = $1 AND is_active = TRUE';
    const result = await pool.query(query, [username]);

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Tài khoản không tồn tại hoặc bị khóa.' });
    }

    const employee = result.rows[0];

    // 2. Kiểm tra mật khẩu
    const isMatch = await bcrypt.compare(password, employee.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Mật khẩu không chính xác.' });
    }

    // 3. Tạo JWT Token
    const payload = {
      id: employee.employee_id,
      username: employee.username,
      role: employee.role
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET || 'crm_secret_key_2025', {
      expiresIn: '24h' // Token có hiệu lực trong 1 ngày
    });

    res.json({
      success: true,
      message: 'Đăng nhập thành công!',
      token: token,
      employee: {
        id: employee.employee_id,
        username: employee.username,
        full_name: employee.full_name,
        email: employee.email,
        role: employee.role
      }
    });
  } catch (error) {
    console.error('Lỗi Login:', error);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống khi đăng nhập.' });
  }
};

/**
 * Lấy danh sách nhân viên (Chỉ Admin mới có quyền)
 */
export const getEmployees = async (req, res) => {
  try {
    // Lấy danh sách tất cả nhân viên (không bao gồm password_hash)
    const query = `
      SELECT 
        employee_id,
        username,
        full_name,
        email,
        role,
        is_active,
        created_at
      FROM employees
      ORDER BY created_at DESC
    `;

    const result = await pool.query(query);

    res.json({
      success: true,
      data: result.rows,
      count: result.rowCount
    });
  } catch (error) {
    console.error('Lỗi getEmployees:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Không thể lấy danh sách nhân viên từ cơ sở dữ liệu.' 
    });
  }
};

/**
 * Lấy danh sách Sales (dành cho Sales để chọn người nhận khi chuyển giao)
 */
export const getSalesEmployees = async (req, res) => {
  const { id: userId } = req.user;

  try {
    console.log('getSalesEmployees - userId:', userId);
    
    // Lấy danh sách Sales đang hoạt động (trừ chính mình)
    // Sử dụng employees thay vì public.employees để tương thích với schema hiện tại
    const query = `
      SELECT 
        employee_id,
        username,
        full_name,
        email,
        role,
        is_active
      FROM employees
      WHERE role = 'sales' 
        AND is_active = true
        AND employee_id != $1
      ORDER BY full_name ASC
    `;

    const result = await pool.query(query, [userId]);
    console.log('getSalesEmployees - result:', result.rows.length, 'employees found');

    res.json({
      success: true,
      data: result.rows,
      count: result.rowCount
    });
  } catch (error) {
    console.error('Lỗi getSalesEmployees:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      userId
    });
    res.status(500).json({ 
      success: false, 
      message: 'Không thể lấy danh sách nhân viên Sales.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Lấy thông tin chi tiết một nhân viên theo ID
 */
export const getEmployeeById = async (req, res) => {
  const { id } = req.params; // employee_id

  try {
    const query = `
      SELECT 
        employee_id,
        username,
        full_name,
        email,
        role,
        is_active,
        created_at
      FROM employees
      WHERE employee_id = $1
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Không tìm thấy nhân viên.' 
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Lỗi getEmployeeById:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Lỗi hệ thống khi lấy thông tin nhân viên.' 
    });
  }
};

/**
 * Reset password cho nhân viên (Chỉ Admin mới có quyền)
 * Tạo password mới ngẫu nhiên và trả về để admin có thể gửi cho user
 */
export const resetPassword = async (req, res) => {
  const { id } = req.params; // employee_id

  try {
    // 1. Kiểm tra nhân viên có tồn tại không
    const checkEmployee = await pool.query(
      'SELECT employee_id, username, full_name, email FROM employees WHERE employee_id = $1',
      [id]
    );

    if (checkEmployee.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Không tìm thấy nhân viên.' 
      });
    }

    const employee = checkEmployee.rows[0];

    // 2. Tạo password mới ngẫu nhiên (8-12 ký tự, bao gồm chữ hoa, chữ thường, số)
    const generatePassword = () => {
      const length = Math.floor(Math.random() * 5) + 8; // 8-12 ký tự
      const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const lowercase = 'abcdefghijklmnopqrstuvwxyz';
      const numbers = '0123456789';
      const special = '@#$%';
      const allChars = uppercase + lowercase + numbers + special;
      
      let password = '';
      // Đảm bảo có ít nhất 1 ký tự mỗi loại
      password += uppercase[Math.floor(Math.random() * uppercase.length)];
      password += lowercase[Math.floor(Math.random() * lowercase.length)];
      password += numbers[Math.floor(Math.random() * numbers.length)];
      password += special[Math.floor(Math.random() * special.length)];
      
      // Thêm các ký tự ngẫu nhiên còn lại
      for (let i = password.length; i < length; i++) {
        password += allChars[Math.floor(Math.random() * allChars.length)];
      }
      
      // Xáo trộn password
      return password.split('').sort(() => Math.random() - 0.5).join('');
    };

    const newPassword = generatePassword();

    // 3. Mã hóa password mới
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(newPassword, saltRounds);

    // 4. Cập nhật password trong database
    const updateQuery = `
      UPDATE employees 
      SET password_hash = $1 
      WHERE employee_id = $2
      RETURNING employee_id, username, full_name, email;
    `;

    await pool.query(updateQuery, [password_hash, id]);

    // 5. Trả về password mới (chỉ lần này, không lưu trong log)
    res.json({
      success: true,
      message: 'Đã reset password thành công!',
      data: {
        employee_id: employee.employee_id,
        username: employee.username,
        full_name: employee.full_name,
        email: employee.email,
        new_password: newPassword // Trả về password mới để admin gửi cho user
      }
    });
  } catch (error) {
    console.error('Lỗi resetPassword:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Lỗi hệ thống khi reset password.' 
    });
  }
};

/**
 * Đổi mật khẩu cho user hiện tại
 */
export const changePassword = async (req, res) => {
  const { id } = req.user; // Lấy ID từ token (đã verify)
  const { oldPassword, newPassword } = req.body;

  try {
    // 1. Kiểm tra dữ liệu đầu vào
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ 
        success: false, 
        message: 'Mật khẩu cũ và mật khẩu mới là bắt buộc.' 
      });
    }

    // 2. Kiểm tra mật khẩu mới không trùng mật khẩu cũ
    if (oldPassword === newPassword) {
      return res.status(400).json({ 
        success: false, 
        message: 'Mật khẩu mới không được trùng với mật khẩu cũ.' 
      });
    }

    // 3. Kiểm tra độ dài mật khẩu mới
    if (newPassword.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'Mật khẩu mới phải có ít nhất 6 ký tự.' 
      });
    }

    // 4. Lấy thông tin user từ database
    const userResult = await pool.query(
      'SELECT employee_id, password_hash FROM employees WHERE employee_id = $1',
      [id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Không tìm thấy người dùng.' 
      });
    }

    const user = userResult.rows[0];

    // 5. Kiểm tra mật khẩu cũ
    const isOldPasswordValid = await bcrypt.compare(oldPassword, user.password_hash);
    if (!isOldPasswordValid) {
      return res.status(400).json({ 
        success: false, 
        message: 'Mật khẩu cũ không chính xác.' 
      });
    }

    // 6. Hash mật khẩu mới
    const saltRounds = 10;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

    // 7. Cập nhật mật khẩu mới
    await pool.query(
      'UPDATE employees SET password_hash = $1 WHERE employee_id = $2',
      [newPasswordHash, id]
    );

    res.json({
      success: true,
      message: 'Đổi mật khẩu thành công!'
    });
  } catch (error) {
    console.error('Lỗi changePassword:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Lỗi hệ thống khi đổi mật khẩu.' 
    });
  }
};

/**
 * Cập nhật thông tin nhân viên (Chỉ Admin mới có quyền)
 */
export const updateEmployee = async (req, res) => {
  const { id } = req.params; // employee_id
  const { full_name, email, role, is_active } = req.body;

  try {
    // 1. Kiểm tra nhân viên có tồn tại không
    const checkEmployee = await pool.query(
      'SELECT employee_id FROM employees WHERE employee_id = $1',
      [id]
    );

    if (checkEmployee.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Không tìm thấy nhân viên.' 
      });
    }

    // 2. Kiểm tra dữ liệu đầu vào
    if (!full_name || !email) {
      return res.status(400).json({ 
        success: false, 
        message: 'Họ tên và email là bắt buộc.' 
      });
    }

    // 3. Kiểm tra role hợp lệ
    if (role && !['admin', 'sales', 'manager'].includes(role)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Vai trò không hợp lệ.' 
      });
    }

    // 4. Cập nhật thông tin nhân viên
    const updateQuery = `
      UPDATE employees 
      SET 
        full_name = $1,
        email = $2,
        role = COALESCE($3, role),
        is_active = COALESCE($4, is_active)
      WHERE employee_id = $5
      RETURNING employee_id, username, full_name, email, role, is_active, created_at;
    `;

    const result = await pool.query(updateQuery, [
      full_name,
      email,
      role || null,
      is_active !== undefined ? is_active : null,
      id
    ]);

    res.json({
      success: true,
      message: 'Cập nhật thông tin nhân viên thành công!',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Lỗi updateEmployee:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Lỗi hệ thống khi cập nhật thông tin nhân viên.' 
    });
  }
};

/**
 * Lấy thống kê trước khi chuyển giao khách hàng (Chỉ Admin)
 */
export const getTransferStats = async (req, res) => {
  const { from_employee_id } = req.query;
  const { role } = req.user;

  try {
    // 1. Kiểm tra quyền (chỉ Admin)
    if (role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Chỉ Admin mới có quyền xem thống kê chuyển giao.'
      });
    }

    // 2. Kiểm tra dữ liệu đầu vào
    if (!from_employee_id) {
      return res.status(400).json({
        success: false,
        message: 'from_employee_id là bắt buộc.'
      });
    }

    // 3. Kiểm tra nhân viên có tồn tại không
    const employeeCheck = await pool.query(
      'SELECT employee_id, full_name FROM employees WHERE employee_id = $1',
      [from_employee_id]
    );

    if (employeeCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Nhân viên không tồn tại.'
      });
    }

    // 4. Đếm số lượng khách hàng
    const customerCountResult = await pool.query(
      `SELECT COUNT(*) as count 
       FROM customers 
       WHERE assigned_to = $1 AND deleted_at IS NULL`,
      [from_employee_id]
    );
    const customerCount = parseInt(customerCountResult.rows[0].count);

    // 5. Đếm số lượng deals đang mở
    const dealsCountResult = await pool.query(
      `SELECT COUNT(DISTINCT d.deal_id) as count
       FROM deals d
       INNER JOIN customers c ON d.customer_id = c.customer_id
       WHERE c.assigned_to = $1 
       AND c.deleted_at IS NULL
       AND d.stage NOT IN ('closed_won', 'closed_lost', 'Thành công', 'Thất bại')`,
      [from_employee_id]
    );
    const dealsCount = parseInt(dealsCountResult.rows[0].count);

    // 6. Đếm số lượng tasks chưa hoàn thành
    const tasksCountResult = await pool.query(
      `SELECT COUNT(*) as count 
       FROM tasks 
       WHERE assigned_to = $1 AND is_completed = false`,
      [from_employee_id]
    );
    const tasksCount = parseInt(tasksCountResult.rows[0].count);

    res.json({
      success: true,
      data: {
        employee: {
          employee_id: from_employee_id,
          full_name: employeeCheck.rows[0].full_name
        },
        customers_count: customerCount,
        deals_count: dealsCount,
        tasks_count: tasksCount
      }
    });
  } catch (error) {
    console.error('Lỗi getTransferStats:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi lấy thống kê chuyển giao.',
      error: error.message
    });
  }
};

/**
 * Chuyển giao khách hàng hàng loạt từ nhân viên này sang nhân viên khác (Chỉ Admin)
 * Trong một transaction duy nhất:
 * - Cập nhật assigned_to trong customers
 * - Cập nhật deals đang mở (stage khác 'closed_won'/'closed_lost')
 * - Cập nhật tasks chưa hoàn thành
 * - Tạo audit log interactions cho mỗi khách hàng
 * - Tạo notification cho nhân viên tiếp nhận
 */
export const transferCustomers = async (req, res) => {
  const { from_employee_id, to_employee_id } = req.body;
  const { id: adminId, role } = req.user;

  try {
    // 1. Kiểm tra quyền (chỉ Admin)
    if (role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Chỉ Admin mới có quyền chuyển giao khách hàng.'
      });
    }

    // 2. Kiểm tra dữ liệu đầu vào
    if (!from_employee_id || !to_employee_id) {
      return res.status(400).json({
        success: false,
        message: 'from_employee_id và to_employee_id là bắt buộc.'
      });
    }

    if (from_employee_id === to_employee_id) {
      return res.status(400).json({
        success: false,
        message: 'Không thể chuyển giao khách hàng cho chính nhân viên đó.'
      });
    }

    // 3. Kiểm tra nhân viên có tồn tại không
    const fromEmployeeCheck = await pool.query(
      'SELECT employee_id, full_name FROM employees WHERE employee_id = $1',
      [from_employee_id]
    );

    if (fromEmployeeCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Nhân viên nguồn không tồn tại.'
      });
    }

    const toEmployeeCheck = await pool.query(
      'SELECT employee_id, full_name FROM employees WHERE employee_id = $1 AND is_active = TRUE',
      [to_employee_id]
    );

    if (toEmployeeCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Nhân viên đích không tồn tại hoặc đã bị khóa.'
      });
    }

    const fromEmployee = fromEmployeeCheck.rows[0];
    const toEmployee = toEmployeeCheck.rows[0];

    // 4. Bắt đầu transaction
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 5. Đếm số lượng khách hàng sẽ được chuyển
      const customerCountResult = await client.query(
        `SELECT COUNT(*) as count 
         FROM customers 
         WHERE assigned_to = $1 AND deleted_at IS NULL`,
        [from_employee_id]
      );
      const customerCount = parseInt(customerCountResult.rows[0].count);

      if (customerCount === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Nhân viên này không có khách hàng nào để chuyển giao.'
        });
      }

      // 6. Đếm deals đang mở sẽ được chuyển (deals được liên kết với customers qua customer_id)
      // Phải đếm TRƯỚC khi cập nhật customers
      const dealsCountResult = await client.query(
        `SELECT COUNT(DISTINCT d.deal_id) as count
         FROM deals d
         INNER JOIN customers c ON d.customer_id = c.customer_id
         WHERE c.assigned_to = $1 
         AND c.deleted_at IS NULL
         AND d.stage NOT IN ('closed_won', 'closed_lost', 'Thành công', 'Thất bại')`,
        [from_employee_id]
      );
      const dealsCount = parseInt(dealsCountResult.rows[0].count);

      // 7. Lấy danh sách customer_id để tạo audit log
      const customersResult = await client.query(
        `SELECT customer_id, full_name 
         FROM customers 
         WHERE assigned_to = $1 AND deleted_at IS NULL`,
        [from_employee_id]
      );
      const customers = customersResult.rows;

      // 8. Cập nhật assigned_to trong customers
      await client.query(
        `UPDATE customers 
         SET assigned_to = $1, updated_at = $2
         WHERE assigned_to = $3 AND deleted_at IS NULL`,
        [to_employee_id, Date.now(), from_employee_id]
      );

      // 9. Cập nhật tasks chưa hoàn thành
      const tasksUpdateResult = await client.query(
        `UPDATE tasks 
         SET assigned_to = $1
         WHERE assigned_to = $2 
         AND is_completed = false`,
        [to_employee_id, from_employee_id]
      );
      const tasksCount = tasksUpdateResult.rowCount;

      // 10. Tạo audit log interactions cho mỗi khách hàng
      const now = Date.now();
      const auditContent = `Hệ thống: Chuyển giao người phụ trách từ ${fromEmployee.full_name} sang ${toEmployee.full_name} do thay đổi nhân sự.`;

      for (const customer of customers) {
        const interactionId = uuidv4();
        await client.query(
          `INSERT INTO interactions (
            interaction_id, customer_id, interaction_type, content,
            interaction_date, employee_id, status, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            interactionId,
            customer.customer_id,
            'system',
            auditContent,
            now,
            adminId, // Admin thực hiện chuyển giao
            'system',
            now
          ]
        );
      }

      // 11. Tạo notification cho nhân viên tiếp nhận
      const notificationId = uuidv4();
      await client.query(
        `INSERT INTO public.notifications (
          notification_id, employee_id, type, title, message, is_read, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          notificationId,
          to_employee_id,
          'customer_transfer',
          'Nhận bàn giao khách hàng',
          `Bạn vừa nhận bàn giao ${customerCount} khách hàng từ nhân viên ${fromEmployee.full_name}. Vui lòng kiểm tra danh sách.`,
          false,
          now
        ]
      );

      // 12. Commit transaction
      await client.query('COMMIT');

      res.json({
        success: true,
        message: 'Chuyển giao khách hàng thành công!',
        data: {
          customers_transferred: customerCount,
          deals_transferred: dealsCount,
          tasks_transferred: tasksCount,
          from_employee: {
            employee_id: from_employee_id,
            full_name: fromEmployee.full_name
          },
          to_employee: {
            employee_id: to_employee_id,
            full_name: toEmployee.full_name
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
    console.error('Lỗi transferCustomers:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi chuyển giao khách hàng.',
      error: error.message
    });
  }
};
