import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';
import pool from '../database.js';
import { getTenantId } from '../utils/tenantHelper.js';

const VALID_IMPORT_ROLES = ['admin', 'director', 'manager', 'leader', 'sales'];

/** Chuẩn hóa tiêu đề cột (hỗ trợ tiếng Việt không dấu / có dấu + tiếng Anh). */
function normalizeHeader(cell) {
  const raw = String(cell ?? '')
    .trim()
    .toLowerCase()
    .replace(/\u00a0/g, ' ')
  const compact = raw.replace(/\s+/g, ' ')
  const map = new Map([
    ['username', 'username'],
    ['tên đăng nhập', 'username'],
    ['ten dang nhap', 'username'],
    ['user', 'username'],
    ['password', 'password'],
    ['mật khẩu', 'password'],
    ['mat khau', 'password'],
    ['full_name', 'full_name'],
    ['họ tên', 'full_name'],
    ['ho ten', 'full_name'],
    ['fullname', 'full_name'],
    ['email', 'email'],
    ['role', 'role'],
    ['vai trò', 'role'],
    ['vai tro', 'role'],
    ['department_id', 'department_id'],
    ['mã phòng', 'department_id'],
    ['ma phong', 'department_id'],
    ['id phòng', 'department_id'],
    ['department_name', 'department_name'],
    ['tên phòng', 'department_name'],
    ['ten phong', 'department_name'],
    ['phòng ban', 'department_name'],
    ['phong ban', 'department_name'],
    ['title', 'title'],
    ['chức danh', 'title'],
    ['chuc danh', 'title'],
    ['rank', 'rank'],
    ['cấp bậc', 'rank'],
    ['cap bac', 'rank'],
  ])
  if (map.has(compact)) return map.get(compact)
  return raw.replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
}

function cellStr(v) {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number') return String(v)
  return String(v).trim()
}

/**
 * GET /api/employees/import/template — file mẫu .xlsx
 */
export async function downloadEmployeeImportTemplate(_req, res) {
  try {
    const header = [
      'username',
      'password',
      'full_name',
      'email',
      'role',
      'department_id',
      'department_name',
      'title',
      'rank',
    ]
    const sample = [
      'vidu_nv01',
      'MatKhau@123',
      'Nguyễn Văn A',
      'a@example.com',
      'sales',
      '',
      'Tên phòng theo hệ thống (nếu không dùng department_id)',
      'Nhân viên kinh doanh',
      '1',
    ]
    const note = [
      'Ghi chú:',
      '- username, password, full_name là bắt buộc.',
      '- role: admin | director | manager | leader | sales (mặc định sales).',
      '- Điền department_id HOẶC department_name (ưu tiên department_id).',
      '- Email có thể để trống.',
      '- title (chức danh): tùy chọn, mô tả chức danh hiển thị — VD: Chuyên viên, NVKD.',
      '- rank (cấp bậc): tùy chọn, chuỗi tự quy ước trong công ty (không có danh mục cố định trong hệ thống).',
      '  Có thể ghi mức số (1,2,3), cấp chữ (A,B), hoặc tên cấp (NV1, CVCC…) — để trống nếu không dùng.',
    ]
    const ws = XLSX.utils.aoa_to_sheet([header, sample])
    ws['!cols'] = [
      { wch: 14 },
      { wch: 14 },
      { wch: 22 },
      { wch: 18 },
      { wch: 10 },
      { wch: 36 },
      { wch: 28 },
      { wch: 18 },
      { wch: 10 },
    ]
    const wsNote = XLSX.utils.aoa_to_sheet(note.map((l) => [l]))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Nhân viên')
    XLSX.utils.book_append_sheet(wb, wsNote, 'Hướng dẫn')
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="mau_import_nhan_vien.xlsx"'
    )
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    return res.send(Buffer.from(buf))
  } catch (err) {
    console.error('downloadEmployeeImportTemplate:', err)
    return res.status(500).json({ success: false, message: 'Không tạo được file mẫu.' })
  }
}

async function resolveDepartmentId(tenantId, departmentIdRaw, departmentNameRaw) {
  const idTrim = cellStr(departmentIdRaw)
  if (idTrim) {
    const r = await pool.query(
      'SELECT id FROM departments WHERE id = $1 AND tenant_id = $2',
      [idTrim, tenantId]
    )
    if (r.rows.length) return { id: r.rows[0].id, error: null }
    return { id: null, error: 'department_id không tồn tại trong công ty' }
  }
  const nameTrim = cellStr(departmentNameRaw)
  if (!nameTrim) return { id: null, error: null }
  const r = await pool.query(
    `SELECT id FROM departments
     WHERE tenant_id = $1 AND LOWER(TRIM(name)) = LOWER(TRIM($2))
     ORDER BY id
     LIMIT 2`,
    [tenantId, nameTrim]
  )
  if (r.rows.length === 0) {
    return { id: null, error: `Không tìm thấy phòng ban "${nameTrim}"` }
  }
  if (r.rows.length > 1) {
    return {
      id: r.rows[0].id,
      error: null,
      warn: 'Nhiều phòng trùng tên — đã gán phòng đầu tiên tìm được',
    }
  }
  return { id: r.rows[0].id, error: null }
}

/**
 * POST /api/employees/import — multipart file field "file"
 */
export async function importEmployeesFromExcel(req, res) {
  const tenantId = getTenantId(req)
  if (!req.file?.buffer) {
    return res.status(400).json({
      success: false,
      message: 'Vui lòng gửi file Excel (trường file).',
    })
  }

  let workbook
  try {
    workbook = XLSX.read(req.file.buffer, { type: 'buffer' })
  } catch (e) {
    console.error('importEmployees XLSX.read:', e)
    return res.status(400).json({
      success: false,
      message: 'Không đọc được file Excel. Kiểm tra định dạng .xlsx/.xls.',
    })
  }

  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    return res.status(400).json({
      success: false,
      message: 'File không có sheet dữ liệu.',
    })
  }

  const sheet = workbook.Sheets[sheetName]
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: false,
  })

  if (!matrix.length) {
    return res.status(400).json({
      success: false,
      message: 'File trống.',
    })
  }

  const headerRow = matrix[0].map((c) => normalizeHeader(c))
  const requiredCols = ['username', 'password', 'full_name']
  const missing = requiredCols.filter((k) => !headerRow.includes(k))
  if (missing.length) {
    return res.status(400).json({
      success: false,
      message: `Thiếu cột bắt buộc trong dòng tiêu đề: ${missing.join(', ')}.`,
    })
  }

  const colIndex = {}
  headerRow.forEach((key, idx) => {
    if (key) colIndex[key] = idx
  })

  const dataRows = []
  for (let i = 1; i < matrix.length; i++) {
    const row = matrix[i]
    if (!row || !row.length) continue
    const obj = {}
    for (const k of Object.keys(colIndex)) {
      const j = colIndex[k]
      obj[k] = row[j]
    }
    const u = cellStr(obj.username)
    const p = cellStr(obj.password)
    const fn = cellStr(obj.full_name)
    if (!u && !p && !fn && !cellStr(obj.email) && !cellStr(obj.role)) continue
    dataRows.push({ excelRow: i + 1, obj })
  }

  if (dataRows.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Không có dòng dữ liệu hợp lệ sau tiêu đề.',
    })
  }

  try {
    const tenantRow = await pool.query(
      'SELECT max_users FROM tenants WHERE id = $1 AND is_active = TRUE',
      [tenantId]
    )
    if (tenantRow.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Tenant không tồn tại hoặc đã bị khóa.',
      })
    }
    const countRow = await pool.query(
      'SELECT COUNT(*) AS cnt FROM employees WHERE tenant_id = $1',
      [tenantId]
    )
    const totalUsers = parseInt(countRow.rows[0].cnt, 10)
    const maxUsers = tenantRow.rows[0].max_users
    if (totalUsers + dataRows.length > maxUsers) {
      return res.status(400).json({
        success: false,
        message: `Import ${dataRows.length} nhân viên sẽ vượt giới hạn gói (hiện ${totalUsers}/${maxUsers}). Giảm số dòng hoặc nâng gói.`,
      })
    }

    const created = []
    const errors = []
    const warnings = []
    const saltRounds = 10

    for (const { excelRow, obj } of dataRows) {
      const username = cellStr(obj.username)
      const password = cellStr(obj.password)
      const full_name = cellStr(obj.full_name)
      const emailRaw = cellStr(obj.email)
      const email = emailRaw || null

      if (!username || !password || !full_name) {
        errors.push({
          row: excelRow,
          message: 'Thiếu username, password hoặc full_name.',
        })
        continue
      }

      let role = (cellStr(obj.role) || 'sales').toLowerCase()
      if (!VALID_IMPORT_ROLES.includes(role)) {
        errors.push({
          row: excelRow,
          message: `Vai trò không hợp lệ: "${role}". Cho phép: ${VALID_IMPORT_ROLES.join(', ')}.`,
        })
        continue
      }

      const dupUser = await pool.query(
        'SELECT 1 FROM employees WHERE username = $1 AND tenant_id = $2',
        [username, tenantId]
      )
      if (dupUser.rows.length > 0) {
        errors.push({
          row: excelRow,
          message: `Tên đăng nhập "${username}" đã tồn tại.`,
        })
        continue
      }

      if (email) {
        const dupE = await pool.query(
          `SELECT 1 FROM employees WHERE tenant_id = $1 AND email = $2 AND email IS NOT NULL AND email <> ''`,
          [tenantId, email]
        )
        if (dupE.rows.length > 0) {
          errors.push({
            row: excelRow,
            message: `Email "${email}" đã được dùng.`,
          })
          continue
        }
      }

      const dept = await resolveDepartmentId(
        tenantId,
        obj.department_id,
        obj.department_name
      )
      if (dept.error) {
        errors.push({ row: excelRow, message: dept.error })
        continue
      }
      if (dept.warn) {
        warnings.push({ row: excelRow, message: dept.warn })
      }

      const title = cellStr(obj.title) || null
      const rank = cellStr(obj.rank) || null
      const department_id = dept.id

      const password_hash = await bcrypt.hash(password, saltRounds)
      const employee_id = uuidv4()
      const created_at = Date.now()

      try {
        await pool.query(
          `INSERT INTO employees (employee_id, username, password_hash, full_name, email, role, department_id, title, rank, tenant_id, is_active, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11)`,
          [
            employee_id,
            username,
            password_hash,
            full_name,
            email,
            role,
            department_id,
            title,
            rank,
            tenantId,
            created_at,
          ]
        )
        created.push({ row: excelRow, username, full_name })
      } catch (err) {
        console.error(`import row ${excelRow}:`, err)
        if (err.code === '23505') {
          errors.push({
            row: excelRow,
            message: 'Trùng username hoặc email (ràng buộc DB).',
          })
        } else {
          errors.push({
            row: excelRow,
            message: err.message || 'Lỗi khi ghi CSDL',
          })
        }
      }
    }

    return res.json({
      success: true,
      message: `Đã tạo ${created.length} nhân viên.${errors.length ? ` Lỗi: ${errors.length} dòng.` : ''}`,
      data: {
        created_count: created.length,
        error_count: errors.length,
        warning_count: warnings.length,
        created,
        errors,
        warnings,
      },
    })
  } catch (err) {
    console.error('importEmployeesFromExcel:', err)
    return res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi import nhân viên.',
    })
  }
}
