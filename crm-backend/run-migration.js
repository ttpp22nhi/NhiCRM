import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './database.js';
import { getSchema, applySchemaToSql } from './config/schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Resolve đường dẫn file: nếu là path (có / hoặc \) thì resolve từ __dirname, không thì tìm trong migrations/
 */
function resolveMigrationPath(input) {
  const hasPathSep = input.includes('/') || input.includes(path.sep);
  if (path.isAbsolute(input)) {
    return input;
  }
  if (hasPathSep) {
    return path.join(__dirname, input);
  }
  return path.join(__dirname, 'migrations', input);
}

/**
 * Chạy migration SQL file (schema lấy từ DB_SCHEMA, mặc định: public).
 * Tham số: tên file (vd. create_tenants_table.sql) hoặc đường dẫn (vd. database/schema_full_reference.sql).
 */
async function runMigration(migrationInput) {
  try {
    const filePath = resolveMigrationPath(migrationInput);
    
    if (!fs.existsSync(filePath)) {
      console.error(`❌ File migration không tồn tại: ${filePath}`);
      process.exit(1);
    }

    let sql = fs.readFileSync(filePath, 'utf8');
    sql = applySchemaToSql(sql);
    
    console.log(`🔄 Đang chạy migration: ${migrationInput} (schema: ${getSchema()})...`);
    
    await pool.query(sql);
    
    console.log(`✅ Migration đã chạy thành công!`);
    process.exit(0);
  } catch (error) {
    console.error(`❌ Lỗi khi chạy migration:`, error.message);
    process.exit(1);
  }
}

// Lấy tên file migration từ tham số dòng lệnh
const migrationFile = process.argv[2];

if (!migrationFile) {
  console.error('❌ Vui lòng cung cấp tên file hoặc đường dẫn migration.');
  console.log('📝 Cách sử dụng: node run-migration.js <file.sql> hoặc <đường-dẫn/file.sql>');
  console.log('📝 Ví dụ: node run-migration.js create_notifications_table.sql');
  console.log('📝 Ví dụ: node run-migration.js database/schema_full_reference.sql');
  process.exit(1);
}

runMigration(migrationFile);
