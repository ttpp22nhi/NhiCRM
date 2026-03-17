/**
 * Giai đoạn 1 - Multi-tenant SaaS: Chạy migration tenants + tenant_id
 * Chạy: node run-multi-tenant-migrations.js
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
    const sql1 = readSql('create_tenants_table.sql')
    await pool.query(sql1)
    console.log('✅ Đã tạo bảng tenants')
  } catch (e) {
    console.error('❌ Migration create_tenants_table:', e.message)
  }

  try {
    const sql2 = readSql('seed_tenants.sql')
    await pool.query(sql2)
    console.log('✅ Đã seed tenants (MobiFoneTayNinh, Công ty Khách hàng A)')
  } catch (e) {
    console.error('❌ Migration seed_tenants:', e.message)
  }

  try {
    const sql3 = readSql('add_tenant_id_multi_tenant.sql')
    await pool.query(sql3)
    console.log('✅ Đã thêm tenant_id vào departments, employees, role_permissions')
  } catch (e) {
    console.error('❌ Migration add_tenant_id_multi_tenant:', e.message)
  }

  try {
    const sql4 = readSql('set_default_tenant_employees.sql')
    await pool.query(sql4)
    console.log('✅ Đã gán tenant mặc định cho nhân viên chưa có tenant_id')
  } catch (e) {
    console.error('❌ Migration set_default_tenant_employees:', e.message)
  }

  try {
    const sql5 = readSql('alter_role_permissions_tenant_unique.sql')
    await pool.query(sql5)
    console.log('✅ Đã đổi unique constraint role_permissions theo tenant')
  } catch (e) {
    console.error('❌ Migration alter_role_permissions_tenant_unique:', e.message)
  }

  await pool.end()
  process.exit(0)
}

run()
