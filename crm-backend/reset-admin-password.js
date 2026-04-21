/**
 * Script reset mật khẩu Admin
 * 
 * Cách sử dụng:
 * 1. Chạy: node reset-admin-password.js
 * 2. Nhập username của admin (hoặc để trống để reset tất cả admin)
 * 3. Nhập mật khẩu mới (hoặc để trống để tạo mật khẩu mặc định: Admin123@)
 */

import bcrypt from 'bcrypt';
import pool from './database.js';
import { SQL_EMPLOYEE_USERNAME_EQUALS } from './utils/usernameSql.js';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function resetAdminPassword() {
  try {
    console.log('========================================');
    console.log('🔐 Reset Mật khẩu Admin - CRM MobiFone');
    console.log('========================================\n');

    // 1. Nhập username (hoặc để trống để reset tất cả admin)
    const usernameInput = await question('Nhập username của admin (hoặc Enter để reset tất cả admin): ');
    const username = usernameInput.trim() || null;

    // 2. Nhập mật khẩu mới
    const passwordInput = await question('Nhập mật khẩu mới (hoặc Enter để dùng mật khẩu mặc định "Admin123@"): ');
    const newPassword = passwordInput.trim() || 'Admin123@';

    // 3. Xác nhận
    console.log(`\n⚠️  Bạn sắp reset mật khẩu cho: ${username || 'TẤT CẢ ADMIN'}`);
    console.log(`📝 Mật khẩu mới: ${newPassword}`);
    const confirm = await question('\nBạn có chắc chắn? (yes/no): ');

    if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
      console.log('\n❌ Đã hủy thao tác.');
      rl.close();
      process.exit(0);
    }

    // 4. Tìm admin(s)
    let query;
    let params;

    if (username) {
      query = `SELECT employee_id, username, full_name, email, role FROM employees WHERE ${SQL_EMPLOYEE_USERNAME_EQUALS} AND role = $2`;
      params = [username, 'admin'];
    } else {
      query = 'SELECT employee_id, username, full_name, email, role FROM employees WHERE role = $1';
      params = ['admin'];
    }

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      console.log('\n❌ Không tìm thấy admin nào!');
      rl.close();
      process.exit(1);
    }

    console.log(`\n✅ Tìm thấy ${result.rows.length} admin:`);
    result.rows.forEach((emp, index) => {
      console.log(`   ${index + 1}. ${emp.username} - ${emp.full_name || 'N/A'} (${emp.email || 'N/A'})`);
    });

    // 5. Hash mật khẩu mới
    console.log('\n🔄 Đang hash mật khẩu mới...');
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    // 6. Cập nhật mật khẩu cho tất cả admin tìm được
    console.log('🔄 Đang cập nhật mật khẩu...');
    const updateQuery = 'UPDATE employees SET password_hash = $1 WHERE employee_id = $2';
    
    for (const admin of result.rows) {
      await pool.query(updateQuery, [passwordHash, admin.employee_id]);
      console.log(`   ✅ Đã reset mật khẩu cho: ${admin.username}`);
    }

    // 7. Thông báo kết quả
    console.log('\n========================================');
    console.log('✅ RESET MẬT KHẨU THÀNH CÔNG!');
    console.log('========================================');
    console.log(`\n📋 Thông tin đăng nhập:`);
    result.rows.forEach((emp) => {
      console.log(`   👤 Username: ${emp.username}`);
      console.log(`   🔑 Password: ${newPassword}`);
      console.log(`   📧 Email: ${emp.email || 'N/A'}`);
      console.log('');
    });
    console.log('⚠️  LƯU Ý: Vui lòng đổi mật khẩu sau khi đăng nhập!');
    console.log('========================================\n');

  } catch (error) {
    console.error('\n❌ Lỗi:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    rl.close();
    await pool.end();
  }
}

// Chạy script
resetAdminPassword();

