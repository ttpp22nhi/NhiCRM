/**
 * Chạy migration cho bảng departments và cột employees
 * Chạy: node run-department-migrations.js
 */
import pool from './database.js'
import fs from 'fs'

async function run() {
  try {
    const sql1 = fs.readFileSync('./migrations/create_departments_table.sql', 'utf8')
    await pool.query(sql1)
    console.log('✅ Đã tạo bảng departments')
  } catch (e) {
    console.error('❌ Migration 1:', e.message)
  }

  try {
    const sql2 = fs.readFileSync('./migrations/add_department_title_rank_to_employees.sql', 'utf8')
    await pool.query(sql2)
    console.log('✅ Đã thêm cột department_id, title, rank vào employees')
  } catch (e) {
    console.error('❌ Migration 2:', e.message)
  }

  try {
    const sql3 = fs.readFileSync('./migrations/add_path_to_departments.sql', 'utf8')
    await pool.query(sql3)
    console.log('✅ Đã thêm path vào departments')
  } catch (e) {
    console.error('❌ Migration 3:', e.message)
  }

  try {
    const sql4 = fs.readFileSync('./migrations/create_role_permissions_table.sql', 'utf8')
    await pool.query(sql4)
    console.log('✅ Đã tạo bảng role_permissions')
  } catch (e) {
    console.error('❌ Migration 4:', e.message)
  }

  try {
    const sql5 = fs.readFileSync('./migrations/seed_role_permissions.sql', 'utf8')
    await pool.query(sql5)
    console.log('✅ Đã seed role_permissions')
  } catch (e) {
    console.error('❌ Migration 5:', e.message)
  }

  try {
    const sql6 = fs.readFileSync('./migrations/create_organization_levels_table.sql', 'utf8')
    await pool.query(sql6)
    console.log('✅ Đã tạo bảng organization_levels')
  } catch (e) {
    console.error('❌ Migration 6:', e.message)
  }

  await pool.end()
  process.exit(0)
}

run()
