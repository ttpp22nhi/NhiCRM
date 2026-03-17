/**
 * Chạy migration cho bảng departments và cột employees
 * Chạy: node run-department-migrations.js
 * Schema: DB_SCHEMA (mặc định: public)
 */
import pool from './database.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getSchema, applySchemaToSql } from './config/schema.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const readSql = (name) => applySchemaToSql(fs.readFileSync(path.join(__dirname, 'migrations', name), 'utf8'))

async function run() {
  console.log('Schema:', getSchema())
  try {
    const sql1 = readSql('create_departments_table.sql')
    await pool.query(sql1)
    console.log('✅ Đã tạo bảng departments')
  } catch (e) {
    console.error('❌ Migration 1:', e.message)
  }

  try {
    const sql2 = readSql('add_department_title_rank_to_employees.sql')
    await pool.query(sql2)
    console.log('✅ Đã thêm cột department_id, title, rank vào employees')
  } catch (e) {
    console.error('❌ Migration 2:', e.message)
  }

  try {
    const sql3 = readSql('add_path_to_departments.sql')
    await pool.query(sql3)
    console.log('✅ Đã thêm path vào departments')
  } catch (e) {
    console.error('❌ Migration 3:', e.message)
  }

  try {
    const sql4 = readSql('create_role_permissions_table.sql')
    await pool.query(sql4)
    console.log('✅ Đã tạo bảng role_permissions')
  } catch (e) {
    console.error('❌ Migration 4:', e.message)
  }

  try {
    const sql5 = readSql('seed_role_permissions.sql')
    await pool.query(sql5)
    console.log('✅ Đã seed role_permissions')
  } catch (e) {
    console.error('❌ Migration 5:', e.message)
  }

  try {
    const sql6 = readSql('create_organization_levels_table.sql')
    await pool.query(sql6)
    console.log('✅ Đã tạo bảng organization_levels')
  } catch (e) {
    console.error('❌ Migration 6:', e.message)
  }

  await pool.end()
  process.exit(0)
}

run()
