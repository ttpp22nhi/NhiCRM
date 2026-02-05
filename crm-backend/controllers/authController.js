
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
