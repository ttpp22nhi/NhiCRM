import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Chạy migration SQL file
 */
async function runMigration(migrationFile) {
  try {
    const filePath = path.join(__dirname, 'migrations', migrationFile);
    
    if (!fs.existsSync(filePath)) {
      console.error(`❌ File migration không tồn tại: ${filePath}`);
      process.exit(1);
    }

    const sql = fs.readFileSync(filePath, 'utf8');
    
    console.log(`🔄 Đang chạy migration: ${migrationFile}...`);
    
    await pool.query(sql);
    
    console.log(`✅ Migration ${migrationFile} đã chạy thành công!`);
    process.exit(0);
  } catch (error) {
    console.error(`❌ Lỗi khi chạy migration ${migrationFile}:`, error.message);
    process.exit(1);
  }
}

// Lấy tên file migration từ tham số dòng lệnh
const migrationFile = process.argv[2];

if (!migrationFile) {
  console.error('❌ Vui lòng cung cấp tên file migration.');
  console.log('📝 Cách sử dụng: node run-migration.js <tên-file>.sql');
  console.log('📝 Ví dụ: node run-migration.js create_notifications_table.sql');
  process.exit(1);
}

runMigration(migrationFile);
