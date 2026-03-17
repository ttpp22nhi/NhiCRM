/**
 * Cấu hình schema PostgreSQL - dùng biến môi trường để scale (nhiều schema/tenant hoặc môi trường).
 * - Ứng dụng: set search_path khi kết nối (database.js).
 * - Migration: thay "public." bằng schema được cấu hình trước khi chạy SQL.
 */

const SCHEMA_ENV = 'DB_SCHEMA';
const DEFAULT_SCHEMA = 'public';

/**
 * Lấy tên schema từ env (mặc định: public).
 * @returns {string}
 */
export function getSchema() {
  const s = process.env[SCHEMA_ENV];
  if (s === undefined || s === null || String(s).trim() === '') {
    return DEFAULT_SCHEMA;
  }
  return String(s).trim();
}

/**
 * Trả về chuỗi schema an toàn để dùng trong SQL (đã quote nếu cần).
 * PostgreSQL: identifier chỉ chữ thường + số + _ thì không cần quote.
 * @returns {string} Ví dụ: "public" hoặc "\"MySchema\""
 */
export function getSchemaForSql() {
  const schema = getSchema();
  if (/^[a-z][a-z0-9_]*$/.test(schema)) {
    return schema;
  }
  return `"${schema.replace(/"/g, '""')}"`;
}

/**
 * Thay mọi "public." trong SQL bằng schema hiện tại (để scale theo schema).
 * @param {string} sql - Nội dung file SQL (thường dùng public.employees, public.customers, ...)
 * @returns {string} SQL đã thay schema
 */
export function applySchemaToSql(sql) {
  if (!sql || typeof sql !== 'string') return sql;
  const schemaQualifier = getSchemaForSql() + '.';
  return sql.replace(/\bpublic\./g, schemaQualifier);
}
