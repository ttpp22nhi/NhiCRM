/**
 * Khởi tạo schema DB local (chạy một lần khi DB trống hoặc thiếu bảng).
 * Sau đó chạy: npm run seed:local:fresh
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import pool from '../database.js'
import { getSchema, applySchemaToSql } from '../config/schema.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

const MIGRATION_FILES = [
  'database/schema_full_reference.sql',
  'migrations/add_deal_cancel_soft_delete.sql',
  'migrations/init_kpi_and_activity_schema.sql',
  'migrations/add_deal_product_and_contact_date.sql',
  'migrations/add_deal_detail_fields.sql',
  'migrations/add_kpi_product_count.sql',
  'migrations/add_kpi_customer_kind_to_customers.sql',
  'migrations/split_kpi_product_count_by_customer_kind.sql',
  'migrations/add_cbs_customer_link_and_kpi_actual_approach.sql',
  'migrations/add_display_code_to_deals_tasks.sql',
  'migrations/add_deal_category_and_pipeline_stages.sql',
  'migrations/add_confidence_level_to_deals.sql',
  'migrations/add_deal_description.sql',
  'migrations/add_deal_activities_and_attachments.sql',
  'migrations/add_tasks_related_and_attachments_owner.sql',
  'migrations/add_display_code_link_deal_task.sql',
  'migrations/add_doc_type_to_deal_attachments.sql',
  'migrations/add_deals_metadata_jsonb.sql',
  'migrations/add_task_description.sql',
  'migrations/add_task_activities.sql',
  'migrations/add_cbs_claim_workflow.sql',
  'migrations/add_cbs_sales_claim_auto_approve.sql',
  'migrations/add_customer_active_status.sql',
  'migrations/add_tenant_kpi_column_settings.sql',
  'migrations/add_territory_to_employees.sql',
  'migrations/seed_role_permissions.sql',
]

function readSql(rel) {
  const p = path.join(ROOT, rel.replace(/\//g, path.sep))
  return applySchemaToSql(fs.readFileSync(p, 'utf8'))
}

async function runOne(rel) {
  const sql = readSql(rel)
  console.log(`  → ${rel}`)
  await pool.query(sql)
}

async function main() {
  console.log(`Bootstrap local DB (schema: ${getSchema()})`)
  for (const f of MIGRATION_FILES) {
    try {
      await runOne(f)
      console.log(`    ✓ OK`)
    } catch (e) {
      const benign = ['already exists', 'duplicate', '42701', '42P07', '42P10'].some(
        (s) => String(e.message).toLowerCase().includes(s) || e.code === s
      )
      if (benign) {
        console.log(`    ⚠ Bỏ qua (đã có): ${e.message.split('\n')[0]}`)
      } else {
        console.error(`    ✗ Lỗi: ${e.message}`)
        throw e
      }
    }
  }
  console.log('\n✅ Bootstrap xong. Chạy: npm run seed:local:fresh')
  await pool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
