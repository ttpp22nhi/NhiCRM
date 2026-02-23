/**
 * Giai đoạn 1 - Multi-tenant SaaS: Chạy migration tenants + tenant_id
 * Chạy: node run-multi-tenant-migrations.js
 */
import pool from './database.js'
import fs from 'fs'

async function run() {
  try {
    const sql1 = fs.readFileSync('./migrations/create_tenants_table.sql', 'utf8')
    await pool.query(sql1)
    console.log('✅ Đã tạo bảng tenants')
  } catch (e) {
    console.error('❌ Migration create_tenants_table:', e.message)
  }

  try {
    const sql2 = fs.readFileSync('./migrations/seed_tenants.sql', 'utf8')
    await pool.query(sql2)
    console.log('✅ Đã seed tenants (MobiFoneTayNinh, Công ty Khách hàng A)')
  } catch (e) {
    console.error('❌ Migration seed_tenants:', e.message)
  }

  try {
    const sql3 = fs.readFileSync('./migrations/add_tenant_id_multi_tenant.sql', 'utf8')
    await pool.query(sql3)
    console.log('✅ Đã thêm tenant_id vào departments, employees, role_permissions')
  } catch (e) {
    console.error('❌ Migration add_tenant_id_multi_tenant:', e.message)
  }

  try {
    const sql4 = fs.readFileSync('./migrations/set_default_tenant_employees.sql', 'utf8')
    await pool.query(sql4)
    console.log('✅ Đã gán tenant mặc định cho nhân viên chưa có tenant_id')
  } catch (e) {
    console.error('❌ Migration set_default_tenant_employees:', e.message)
  }

  try {
    const sql5 = fs.readFileSync('./migrations/alter_role_permissions_tenant_unique.sql', 'utf8')
    await pool.query(sql5)
    console.log('✅ Đã đổi unique constraint role_permissions theo tenant')
  } catch (e) {
    console.error('❌ Migration alter_role_permissions_tenant_unique:', e.message)
  }

  await pool.end()
  process.exit(0)
}

run()
