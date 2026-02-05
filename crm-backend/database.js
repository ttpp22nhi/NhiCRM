
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

/**
 * Cấu hình kết nối Database
 * Sử dụng Pool để tối ưu hóa hiệu suất và quản lý kết nối đồng thời
 */
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  // Cấu hình bổ sung nếu cần (ví dụ: SSL cho production)
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

pool.on('connect', () => {
  console.log('✅ Đã kết nối thành công tới cơ sở dữ liệu PostgreSQL');
});

pool.on('error', (err) => {
  console.error('❌ Lỗi kết nối Database:', err.message);
});

export default pool;
