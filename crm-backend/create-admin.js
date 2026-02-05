
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import pool from './database.js';

/**
 * Script khởi tạo tài khoản Admin mẫu
 * Quy tắc: 
 * - ID: UUID string
 * - Password: Hash bằng bcrypt
 * - Thời gian: Unix Timestamp (BIGINT)
 */
async function createAdmin() {
  const username = 'admin';
  const password = '123456@Admin'; // Sử dụng mật khẩu theo yêu cầu cuối cùng của bạn
  const role = 'admin';
  const fullName = 'Quản trị viên hệ thống';
  const email = 'admin@crm-alpha.vn';

  try {
    console.log('⏳ Đang kiểm tra dữ liệu hệ thống...');

    // 1. Kiểm tra xem tài khoản admin đã tồn tại chưa để tránh lỗi trùng lặp
    const checkQuery = 'SELECT employee_id FROM employees WHERE username = $1';
    const checkResult = await pool.query(checkQuery, [username]);

    if (checkResult.rows.length > 0) {
      console.log('⚠️ Tài khoản admin đã tồn tại. Không cần tạo mới.');
      process.exit(0);
    }

    // 2. Mã hóa mật khẩu bảo mật
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // 3. Chuẩn bị dữ liệu tuân thủ nguyên tắc hệ thống
    const employeeId = uuidv4();
    const createdAt = Date.now(); // Trả về số miligiây (BIGINT)

    const insertQuery = `
      INSERT INTO employees (
        employee_id, 
        username, 
        password_hash, 
        full_name, 
        email, 
        role, 
        is_active, 
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;

    const values = [
      employeeId, 
      username, 
      passwordHash, 
      fullName, 
      email, 
      role, 
      true, 
      createdAt
    ];

    // 4. Thực thi truy vấn
    await pool.query(insertQuery, values);

    console.log('✅ Đã tạo tài khoản admin thành công');
    console.log('-----------------------------------');
    console.log(`Username: ${username}`);
    console.log(`Password: ${password}`);
    console.log('-----------------------------------');

  } catch (error) {
    console.error('❌ Lỗi trong quá trình tạo tài khoản:', error.message);
  } finally {
    // Đóng pool kết nối để kết thúc script
    await pool.end();
    process.exit(0);
  }
}

// Chạy hàm khởi tạo
createAdmin();
