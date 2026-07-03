/**
 * Seed dữ liệu mẫu cho test local — tenant "local-demo"
 *
 * Chạy (từ crm-backend):
 *   node scripts/seed-local-demo.js
 *   node scripts/seed-local-demo.js --fresh   # xóa dữ liệu tenant demo rồi seed lại
 */
import bcrypt from 'bcrypt'
import { v4 as uuidv4 } from 'uuid'
import pool from '../database.js'
import { recomputeKpiActuals } from '../services/kpiFromDealsSyncService.js'

const TENANT_ID = 'tenant-local-demo'
const TENANT_DOMAIN = 'local-demo'
const TENANT_NAME = 'MobiFone Tây Ninh'
const DEMO_PASSWORD = 'Demo@123'

const IDS = {
  admin: 'emp-demo-admin',
  director: 'emp-demo-director',
  manager: 'emp-demo-manager',
  leader: 'emp-demo-leader',
  sales1: 'emp-demo-sales1',
  sales2: 'emp-demo-sales2',
  sales3: 'emp-demo-sales3',
  deptRoot: 'dept-demo-root',
  deptKdgps: 'dept-demo-kdgps',
  deptKdvt: 'dept-demo-kdvt',
}

function now() {
  return Date.now()
}

function currentPeriod() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function monthStartMs(period) {
  const [y, m] = period.split('-').map(Number)
  return new Date(y, m - 1, 1).getTime()
}

function daysAgo(n) {
  return now() - n * 24 * 60 * 60 * 1000
}

async function hashPassword(pw) {
  return bcrypt.hash(pw, 10)
}

async function wipeTenant(client) {
  const tables = [
    'cbs_revenue_orders',
    'kpis',
    'tasks',
    'interactions',
    'deal_activities',
    'deals',
    'customers',
    'transfer_requests',
    'notifications',
    'activities',
    'cbs_config',
    'tenant_kpi_column_settings',
    'pipeline_stages',
    'employees',
    'departments',
    'organization_levels',
    'tenants',
  ]
  for (const t of tables) {
    try {
      if (t === 'tenants') {
        await client.query(`DELETE FROM tenants WHERE id = $1`, [TENANT_ID])
      } else {
        await client.query(`DELETE FROM ${t} WHERE tenant_id = $1`, [TENANT_ID])
      }
    } catch (e) {
      if (e.code !== '42P01') throw e
    }
  }
}

async function seedTenant(client, ts) {
  await client.query(
    `INSERT INTO tenants (id, name, domain, package_type, max_users, max_levels, is_active, start_date, end_date, created_at, updated_at)
     VALUES ($1, $2, $3, 'Growth', 100, 8, true, CURRENT_DATE, CURRENT_DATE + INTERVAL '2 years', $4, $4)
     ON CONFLICT (domain) DO UPDATE SET
       name = EXCLUDED.name,
       is_active = true,
       end_date = EXCLUDED.end_date,
       updated_at = EXCLUDED.updated_at`,
    [TENANT_ID, TENANT_NAME, TENANT_DOMAIN, ts]
  )
}

async function seedOrganizationLevels(client, ts) {
  const levels = [
    ['org-level-1', 1, 'Chi nhánh'],
    ['org-level-2', 2, 'Trung tâm'],
  ]
  for (const [id, order, name] of levels) {
    await client.query(
      `INSERT INTO organization_levels (id, level_order, level_name, tenant_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $5)
       ON CONFLICT (id) DO UPDATE SET
         level_order = EXCLUDED.level_order,
         level_name = EXCLUDED.level_name,
         updated_at = EXCLUDED.updated_at`,
      [id, order, name, TENANT_ID, ts]
    )
  }
}

async function seedDepartments(client, ts) {
  const pathRoot = IDS.deptRoot
  const pathKdgps = `${IDS.deptRoot}/${IDS.deptKdgps}`
  const pathKdvt = `${IDS.deptRoot}/${IDS.deptKdvt}`
  await client.query(
    `INSERT INTO departments (id, name, parent_id, type, tenant_id, path, created_at, updated_at)
     VALUES
       ($1, 'MobiFone Tây Ninh', NULL, 'Chi nhánh', $4, $5, $7, $7),
       ($2, 'Trung tâm KDGPS', $1, 'Trung tâm', $4, $6, $7, $7),
       ($3, 'Trung tâm KDVT', $1, 'Trung tâm', $4, $8, $7, $7)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       parent_id = EXCLUDED.parent_id,
       type = EXCLUDED.type,
       path = EXCLUDED.path,
       updated_at = EXCLUDED.updated_at`,
    [IDS.deptRoot, IDS.deptKdgps, IDS.deptKdvt, TENANT_ID, pathRoot, pathKdgps, ts, pathKdvt]
  )
}

async function seedEmployees(client, ts, passwordHash) {
  const rows = [
    [IDS.admin, 'admin.demo', 'Admin Demo', 'admin@local.demo', 'admin', null, null, null],
    [IDS.director, 'director.demo', 'Lãnh đạo Demo', 'director@local.demo', 'director', IDS.deptRoot, 'Giám đốc Chi nhánh', '1'],
    [IDS.manager, 'manager.demo', 'Quản lý Demo', 'manager@local.demo', 'manager', IDS.deptKdgps, 'Trưởng TT KDGPS', '2'],
    [IDS.leader, 'leader.demo', 'Tổ trưởng KDGPS', 'leader@local.demo', 'leader', IDS.deptKdgps, 'Phó TT KDGPS', '3'],
    [IDS.sales1, 'sales1', 'Nguyễn Văn An', 'sales1@local.demo', 'sales', IDS.deptKdgps, 'NV Kinh doanh', '4', 'Tây Ninh'],
    [IDS.sales2, 'sales2', 'Trần Thị Bình', 'sales2@local.demo', 'sales', IDS.deptKdgps, 'NV Kinh doanh', '4', 'Hòa Thành'],
    [IDS.sales3, 'sales3', 'Lê Văn Cường', 'sales3@local.demo', 'sales', IDS.deptKdvt, 'NV Kinh doanh', '4', 'Tây Ninh'],
  ]
  for (const r of rows) {
    const [id, username, fullName, email, role, deptId, title, rank, territory] = r
    await client.query(
      `INSERT INTO employees (
         employee_id, username, password_hash, full_name, email, phone, role,
         is_active, tenant_id, department_id, title, rank, territory, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (employee_id) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         full_name = EXCLUDED.full_name,
         role = EXCLUDED.role,
         department_id = EXCLUDED.department_id,
         territory = EXCLUDED.territory,
         is_active = true`,
      [
        id,
        username,
        passwordHash,
        fullName,
        email,
        `090${String(id).slice(-7).replace(/\D/g, '0').padStart(7, '0').slice(0, 7)}`,
        role,
        TENANT_ID,
        deptId,
        title || null,
        rank || null,
        territory || null,
        ts,
      ]
    )
  }
}

async function seedCustomers(client, ts) {
  const customers = [
    ['cust-demo-01', 'Công ty TNHH Alpha', '0901111001', '0312345601', 'doanh_nghiep_lon', 'EXISTING', IDS.sales1],
    ['cust-demo-02', 'Công ty CP Beta', '0901111002', '0312345602', 'doanh_nghiep_lon', 'NEW', IDS.sales1],
    ['cust-demo-03', 'UBND Phường Demo', '0901111003', null, 'xa_phuong', 'NEW', IDS.sales2],
    ['cust-demo-04', 'Công an Xã Mẫu', '0901111004', null, 'cong_an_xa', 'NEW', IDS.sales2],
    ['cust-demo-05', 'HKD Minh Phát', '0901111005', '8012345601', 'ho_kinh_doanh', 'EXISTING', IDS.sales3],
    ['cust-demo-06', 'Công ty Gamma Telecom', '0901111006', '0312345606', 'doanh_nghiep_lon', 'NEW', IDS.sales3],
    ['cust-demo-07', 'Trường THCS Demo', '0901111007', null, 'so_ban_nganh', 'NEW', IDS.sales1],
    ['cust-demo-08', 'Công ty Delta', '0901111008', '0312345608', 'doanh_nghiep_lon', 'EXISTING', IDS.sales2],
  ]
  for (const [id, name, phone, tax, ctype, kpiKind, assigned] of customers) {
    await client.query(
      `INSERT INTO customers (
         customer_id, full_name, email, phone, address, customer_type, kpi_customer_kind,
         company_name, tax_code, source, active_status, assigned_to, tenant_id, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Seed local',1,$10,$11,$12,$12)
       ON CONFLICT (customer_id) DO UPDATE SET
         full_name = EXCLUDED.full_name,
         assigned_to = EXCLUDED.assigned_to,
         kpi_customer_kind = EXCLUDED.kpi_customer_kind`,
      [
        id,
        name,
        `${id}@demo.local`,
        phone,
        'Địa chỉ demo — local seed',
        ctype,
        kpiKind,
        name,
        tax,
        assigned,
        TENANT_ID,
        ts,
      ]
    )
  }
  return customers.map((c) => c[0])
}

async function seedDeals(client, ts, period) {
  const closing = monthStartMs(period) + 15 * 24 * 60 * 60 * 1000
  const deals = [
    ['deal-demo-01', 'cust-demo-01', 'Gói MobiFone Doanh nghiệp Alpha', 450_000_000, 'thanh_cong', 'won', IDS.sales1, 'DEAL-DEMO-01'],
    ['deal-demo-02', 'cust-demo-02', 'Triển khai hạ tầng Beta', 280_000_000, 'bao_gia', 'active', IDS.sales1, 'DEAL-DEMO-02'],
    ['deal-demo-03', 'cust-demo-03', 'Dịch vụ số UBND', 120_000_000, 'tu_van', 'active', IDS.sales2, 'DEAL-DEMO-03'],
    ['deal-demo-04', 'cust-demo-04', 'Camera an ninh xã', 95_000_000, 'thuong_thao', 'active', IDS.sales2, 'DEAL-DEMO-04'],
    ['deal-demo-05', 'cust-demo-05', 'Internet HKD Minh Phát', 36_000_000, 'thanh_cong', 'won', IDS.sales3, 'DEAL-DEMO-05'],
    ['deal-demo-06', 'cust-demo-06', 'Tổng đài Gamma', 520_000_000, 'tiep_can', 'active', IDS.sales3, 'DEAL-DEMO-06'],
    ['deal-demo-07', 'cust-demo-07', 'Wifi trường học', 68_000_000, 'bao_gia', 'active', IDS.sales1, 'DEAL-DEMO-07'],
    ['deal-demo-08', 'cust-demo-08', 'Gia hạn hợp đồng Delta', 210_000_000, 'thanh_cong', 'won', IDS.sales2, 'DEAL-DEMO-08'],
  ]
  for (const [id, custId, title, amount, stage, status, assigned, code] of deals) {
    await client.query(
      `INSERT INTO deals (
         deal_id, customer_id, title, amount, stage, status, expected_closing_date,
         assigned_to, tenant_id, created_at, updated_at, display_code, deal_category,
         confidence_level, quantity, is_deleted
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11,'MASS','medium',1,false)
       ON CONFLICT (deal_id) DO UPDATE SET
         amount = EXCLUDED.amount,
         stage = EXCLUDED.stage,
         status = EXCLUDED.status`,
      [id, custId, title, amount, stage, status, closing, assigned, TENANT_ID, ts, code]
    )
  }
}

async function seedKpiPlans(client, ts, period) {
  const plans = [
    [IDS.sales1, 500_000_000, 200_000_000, 8, 5, 12],
    [IDS.sales2, 400_000_000, 150_000_000, 6, 4, 10],
    [IDS.sales3, 350_000_000, 100_000_000, 5, 3, 8],
  ]
  for (const [userId, tNew, tExist, tContracts, tApproach] of plans) {
    const pcn = tContracts
    await client.query(
      `INSERT INTO kpis (
         id, tenant_id, user_id, period,
         target_revenue_new, target_revenue_existing,
         actual_revenue_new, actual_revenue_existing,
         approach_count, actual_approach_count,
         target_product_count_new, target_product_count_existing,
         actual_product_count_new, actual_product_count_existing,
         created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,0,0,$7,0,$8,0,0,0,$9,$9)
       ON CONFLICT (tenant_id, user_id, period) DO UPDATE SET
         target_revenue_new = EXCLUDED.target_revenue_new,
         target_revenue_existing = EXCLUDED.target_revenue_existing,
         approach_count = EXCLUDED.approach_count,
         target_product_count_new = EXCLUDED.target_product_count_new,
         updated_at = EXCLUDED.updated_at`,
      [uuidv4(), TENANT_ID, userId, period, tNew, tExist, tApproach, pcn, ts]
    )
  }
}

async function seedCbsConfig(client, ts) {
  await client.query(
    `INSERT INTO cbs_config (
       tenant_id, base_url, username, password, unit, report_config_code,
       auto_sync, sales_claim_auto_approve, last_synced_at, last_sync_status, last_sync_message,
       updated_at, updated_by
     ) VALUES ($1,'https://cbs.mobifone.vn','demo_cbs','demo_password_local',880,'REPORT_INVOICING_PREPAID',
       false, false, $2, 'success', 'Seed local — đồng bộ CBS (kỳ demo): nhận 6, thêm 6, cập nhật 0.', $2, $3)
     ON CONFLICT (tenant_id) DO UPDATE SET
       last_synced_at = EXCLUDED.last_synced_at,
       last_sync_status = EXCLUDED.last_sync_status,
       last_sync_message = EXCLUDED.last_sync_message,
       updated_at = EXCLUDED.updated_at`,
    [TENANT_ID, ts, IDS.admin]
  )
}

async function seedCbsOrders(client, ts, period) {
  const payBase = monthStartMs(period) + 5 * 24 * 60 * 60 * 1000
  const orders = [
  // id, fp, contract, customer, vat, claimed_by, claim_status, deal_id
    ['cbs-demo-01', 'fp-demo-01', 'HĐ-2026-001', 'Công ty TNHH Alpha', 180_000_000, IDS.sales1, 'approved', 'deal-demo-01'],
    ['cbs-demo-02', 'fp-demo-02', 'HĐ-2026-002', 'Công ty CP Beta', 95_000_000, IDS.sales1, 'pending', null],
    ['cbs-demo-03', 'fp-demo-03', 'HĐ-2026-003', 'UBND Phường Demo', 42_000_000, IDS.sales2, 'approved', null],
    ['cbs-demo-04', 'fp-demo-04', 'HĐ-2026-004', 'HKD Minh Phát', 28_000_000, IDS.sales3, 'approved', 'deal-demo-05'],
    ['cbs-demo-05', 'fp-demo-05', 'HĐ-2026-005', 'Khách hàng mới CBS', 65_000_000, null, null, null],
    ['cbs-demo-06', 'fp-demo-06', 'HĐ-2026-001', 'Công ty TNHH Alpha — gia hạn', 55_000_000, IDS.sales1, 'approved', null],
  ]
  for (const [id, fp, contract, custName, vat, claimedBy, claimStatus, dealId] of orders) {
    const approvedAt = claimStatus === 'approved' ? ts : null
    const approvedBy = claimStatus === 'approved' ? IDS.manager : null
    const customerId =
      contract === 'HĐ-2026-001'
        ? 'cust-demo-01'
        : contract === 'HĐ-2026-003'
          ? 'cust-demo-03'
          : contract === 'HĐ-2026-004'
            ? 'cust-demo-05'
            : null
    await client.query(
      `INSERT INTO cbs_revenue_orders (
         id, tenant_id, fingerprint, period_ym, contract_no, product_name,
         customer_name, price_not_vat, price_not_vat_round, price_vat, vat,
         payment_date, active_date, claimed_by, claimed_at, claim_status,
         approved_by, approved_at, deal_id, customer_id, synced_at, created_at, updated_at
       ) VALUES (
         $1,$2,$3,$4,$5,'Gói dịch vụ Demo',
         $6,$7,$7,$8,round($8*0.1,2),
         $9,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17,$17
       )
       ON CONFLICT (id) DO UPDATE SET
         claim_status = EXCLUDED.claim_status,
         claimed_by = EXCLUDED.claimed_by`,
      [
        id,
        TENANT_ID,
        fp,
        period,
        contract,
        custName,
        Math.round(vat / 1.1),
        vat,
        payBase,
        claimedBy,
        claimedBy ? ts : null,
        claimStatus,
        approvedBy,
        approvedAt,
        dealId,
        customerId,
        ts,
      ]
    )
  }
}

async function seedTasks(client, ts) {
  const tasks = [
    ['task-demo-01', 'Gọi xác nhận báo giá Beta', IDS.sales1, 'cust-demo-02', false, daysAgo(2)],
    ['task-demo-02', 'Khảo sát hiện trường UBND', IDS.sales2, 'cust-demo-03', true, daysAgo(5)],
    ['task-demo-03', 'Theo dõi hợp đồng Gamma', IDS.sales3, 'cust-demo-06', false, daysAgo(1)],
  ]
  for (const [id, title, assigned, custId, done, due] of tasks) {
    await client.query(
      `INSERT INTO tasks (task_id, title, assigned_to, customer_id, is_completed, due_date, tenant_id, created_at, priority)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'medium')
       ON CONFLICT (task_id) DO NOTHING`,
      [id, title, assigned, custId, done, due, TENANT_ID, ts]
    )
  }
}

async function seedTransferPending(client, ts) {
  await client.query(
    `INSERT INTO transfer_requests (
       transfer_request_id, customer_ids, sender_id, receiver_id, status, note, created_at, tenant_id
     ) VALUES ($1, ARRAY['cust-demo-07']::text[], $2, $3, 'pending', 'Seed: chuyển KH trường học khi nghỉ phép', $4, $5)
     ON CONFLICT (transfer_request_id) DO NOTHING`,
    ['xfer-demo-01', IDS.sales1, IDS.sales2, ts, TENANT_ID]
  )
}

async function recomputeAllKpi(period) {
  for (const uid of [IDS.sales1, IDS.sales2, IDS.sales3]) {
    try {
      await recomputeKpiActuals(TENANT_ID, uid, period)
    } catch (e) {
      console.warn(`  ⚠ KPI recompute ${uid}:`, e.message)
    }
  }
}

function printSummary(period) {
  console.log('')
  console.log('═══════════════════════════════════════════════════════')
  console.log('  TNiCRM — Dữ liệu demo local đã sẵn sàng')
  console.log('═══════════════════════════════════════════════════════')
  console.log(`  Domain đăng nhập : ${TENANT_DOMAIN}`)
  console.log(`  Mật khẩu chung   : ${DEMO_PASSWORD}`)
  console.log(`  Kỳ KPI / CBS     : ${period}`)
  console.log('')
  console.log('  Tài khoản:')
  console.log('    admin.demo    — Admin')
  console.log('    director.demo — Lãnh đạo')
  console.log('    manager.demo  — Quản lý')
  console.log('    leader.demo   — Tổ trưởng')
  console.log('    sales1        — NV KDGPS (Tây Ninh)')
  console.log('    sales2        — NV KDGPS (Hòa Thành)')
  console.log('    sales3        — NV KDVT (Tây Ninh)')
  console.log('')
  console.log('  Dữ liệu mẫu: 8 KH, 8 deal, 6 đơn CBS, KPI kế hoạch, 1 chuyển giao chờ duyệt')
  console.log('  Frontend: http://localhost:3000/login')
  console.log('═══════════════════════════════════════════════════════')
}

async function main() {
  const fresh = process.argv.includes('--fresh')
  const ts = now()
  const period = currentPeriod()
  const passwordHash = await hashPassword(DEMO_PASSWORD)

  const client = await pool.connect()
  try {
    if (fresh) {
      console.log('🗑  Xóa dữ liệu tenant demo cũ...')
      await wipeTenant(client)
    } else {
      const exists = await client.query(
        `SELECT 1 FROM employees WHERE tenant_id = $1 LIMIT 1`,
        [TENANT_ID]
      )
      if (exists.rows.length > 0) {
        console.log('ℹ️  Tenant demo đã có dữ liệu. Chạy lại với --fresh để seed lại từ đầu.')
        printSummary(period)
        return
      }
    }

    await client.query('BEGIN')
    console.log('📦 Seed tenant & tổ chức...')
    await seedTenant(client, ts)
    await seedOrganizationLevels(client, ts)
    await seedDepartments(client, ts)
    await seedEmployees(client, ts, passwordHash)

    console.log('👥 Seed khách hàng & deal...')
    await seedCustomers(client, ts)
    await seedDeals(client, ts, period)

    console.log('📊 Seed KPI & CBS...')
    await seedKpiPlans(client, ts, period)
    await seedCbsConfig(client, ts)
    await seedCbsOrders(client, ts, period)

    console.log('✅ Seed task & chuyển giao...')
    await seedTasks(client, ts)
    await seedTransferPending(client, ts)

    await client.query('COMMIT')
    console.log('🔄 Tính lại KPI thực hiện...')
    await recomputeAllKpi(period)

    printSummary(period)
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('❌ Seed thất bại:', err.message)
    console.error(err)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}

main()
