import pg from 'pg';
import dotenv from 'dotenv';
import { getSchema, getSchemaForSql } from './config/schema.js';

dotenv.config();

const { Pool } = pg;

/**
 * Cấu hình kết nối Database
 * Sử dụng Pool để tối ưu hóa hiệu suất và quản lý kết nối đồng thời.
 * search_path được set theo DB_SCHEMA (mặc định: public) để scale theo schema.
 */
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

pool.on('connect', (client) => {
  const schema = getSchemaForSql();
  client.query(`SET search_path TO ${schema}`).catch((err) => {
    console.error('❌ Set search_path:', err.message);
  });
  if (process.env.NODE_ENV !== 'production') {
    console.log('✅ Đã kết nối PostgreSQL, search_path =', getSchema());
  }
});

pool.on('error', (err) => {
  console.error('❌ Lỗi kết nối Database:', err.message);
});

export default pool;
