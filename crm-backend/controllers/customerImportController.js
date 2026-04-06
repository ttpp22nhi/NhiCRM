import { v4 as uuidv4 } from 'uuid'
import ExcelJS from 'exceljs'
import * as XLSX from 'xlsx'
import pool from '../database.js'
import { getTenantId } from '../utils/tenantHelper.js'
import { getAssignableEmployeeIds } from '../services/assignableEmployeesService.js'
import { CUSTOMER_TYPE_VALUES } from '../constants/customerTypes.js'

function normalizeCustomerHeader(cell) {
  const raw = String(cell ?? '')
    .trim()
    .toLowerCase()
    .replace(/\u00a0/g, ' ')
  const compact = raw.replace(/\s+/g, ' ')
  const map = new Map([
    ['full_name', 'full_name'],
    ['họ tên', 'full_name'],
    ['ho ten', 'full_name'],
    ['ten khach', 'full_name'],
    ['tên khách', 'full_name'],
    ['phone', 'phone'],
    ['sđt', 'phone'],
    ['sdt', 'phone'],
    ['điện thoại', 'phone'],
    ['dien thoai', 'phone'],
    ['số điện thoại', 'phone'],
    ['so dien thoai', 'phone'],
    ['email', 'email'],
    ['address', 'address'],
    ['địa chỉ', 'address'],
    ['dia chi', 'address'],
    ['customer_type', 'customer_type'],
    ['loại khách', 'customer_type'],
    ['loai khach', 'customer_type'],
    ['company_name', 'company_name'],
    ['tên công ty', 'company_name'],
    ['ten cong ty', 'company_name'],
    ['tax_code', 'tax_code'],
    ['mã số thuế', 'tax_code'],
    ['ma so thue', 'tax_code'],
    ['mst', 'tax_code'],
    ['source', 'source'],
    ['nguồn', 'source'],
    ['nguon', 'source'],
    ['assigned_to', 'assigned_to'],
    ['mã nhân viên', 'assigned_to'],
    ['ma nhan vien', 'assigned_to'],
    ['employee_id', 'assigned_to'],
    ['assigned_username', 'assigned_username'],
    ['username nv', 'assigned_username'],
    ['tên đăng nhập nv', 'assigned_username'],
    ['ten dang nhap nv', 'assigned_username'],
    ['nhân viên chăm sóc', 'assigned_username'],
    ['nhan vien cham soc', 'assigned_username'],
    ['login nv', 'assigned_username'],
  ])
  if (map.has(compact)) return map.get(compact)
  return raw.replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
}

function cellStr(v) {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number') return String(v)
  return String(v).trim()
}

async function resolveFinalAssignedTo(req, row) {
  const { id: userId, role } = req.user
  const tenantId = getTenantId(req)
  const roleNorm = String(role || '').toLowerCase()

  if (roleNorm === 'sales') {
    return { employeeId: userId, error: null }
  }

  const idRaw = cellStr(row.assigned_to)
  const userRaw = cellStr(row.assigned_username)

  let targetId = null
  if (idRaw) {
    const r = await pool.query(
      'SELECT employee_id FROM employees WHERE employee_id = $1 AND tenant_id = $2 AND is_active = TRUE',
      [idRaw, tenantId]
    )
    if (!r.rows.length) {
      return { employeeId: null, error: 'assigned_to (mã NV) không tồn tại hoặc đã khóa.' }
    }
    targetId = r.rows[0].employee_id
  } else if (userRaw) {
    const r = await pool.query(
      'SELECT employee_id FROM employees WHERE LOWER(TRIM(username)) = LOWER(TRIM($1)) AND tenant_id = $2 AND is_active = TRUE',
      [userRaw, tenantId]
    )
    if (!r.rows.length) {
      return { employeeId: null, error: `Không tìm thấy nhân viên username "${userRaw}".` }
    }
    targetId = r.rows[0].employee_id
  } else {
    targetId = userId
  }

  if (targetId !== userId) {
    const allowedIds = await getAssignableEmployeeIds(tenantId, userId, role)
    if (!allowedIds.includes(targetId)) {
      return {
        employeeId: null,
        error: 'Không được phép gán khách cho nhân viên này (vượt phạm vi phân cấp).',
      }
    }
  }
  return { employeeId: targetId, error: null }
}

export async function downloadCustomerImportTemplate(req, res) {
  const isSales = String(req.user?.role || '').toLowerCase() === 'sales'
  try {
    const workbook = new ExcelJS.Workbook()
    const ws = workbook.addWorksheet('Khách hàng')

    ws.addRow([
      'full_name',
      'phone',
      'email',
      'address',
      'customer_type',
      'company_name',
      'tax_code',
      'source',
      'assigned_username',
      'assigned_to',
    ])
    ws.addRow([
      'Nguyễn Văn B',
      '0909123456',
      'b@example.com',
      'Hà Nội',
      'individual',
      '',
      '',
      'Direct',
      isSales ? '' : 'username_nv_cham_soc',
      '',
    ])

    ws.columns = [
      { width: 22 },
      { width: 14 },
      { width: 20 },
      { width: 24 },
      { width: 22 },
      { width: 22 },
      { width: 14 },
      { width: 12 },
      { width: 28 },
      { width: 36 },
    ]

    // Danh sách chọn (dropdown) cột E — đồng bộ form Thêm khách hàng trên web
    const listFormula = `"${CUSTOMER_TYPE_VALUES.join(',')}"`
    ws.dataValidations.add('E2:E5000', {
      type: 'list',
      allowBlank: true,
      showInputMessage: true,
      promptTitle: 'Loại khách hàng',
      prompt: 'Chọn từ danh sách (cùng các mục khi Thêm khách hàng trên web). Để trống = cá nhân (individual).',
      showErrorMessage: true,
      errorStyle: 'error',
      errorTitle: 'Giá trị không hợp lệ',
      error: 'Chỉ được chọn một giá trị trong danh sách.',
      formulae: [listFormula],
    })

    const noteWs = workbook.addWorksheet('Hướng dẫn')
    const noteLines = [
      'Ghi chú import khách hàng:',
      '- full_name và phone là bắt buộc.',
      '- customer_type (cột E): bấm mũi tên ô để chọn loại khách — danh mục giống màn hình Thêm khách hàng; để trống = individual.',
      '- assigned_username: tên đăng nhập NV chăm sóc; assigned_to: UUID nhân viên (ưu tiên nếu cả hai có).',
      '- Để trống assigned_* → gán cho chính tài khoản đang import.',
      '- Vai trò Sales: mọi dòng gán cho chính bạn; hai cột assigned_* bị bỏ qua.',
    ]
    noteLines.forEach((line) => noteWs.addRow([line]))
    noteWs.getColumn(1).width = 92

    const buf = await workbook.xlsx.writeBuffer()
    res.setHeader('Content-Disposition', 'attachment; filename="mau_import_khach_hang.xlsx"')
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    return res.send(Buffer.from(buf))
  } catch (err) {
    console.error('downloadCustomerImportTemplate:', err)
    return res.status(500).json({ success: false, message: 'Không tạo được file mẫu.' })
  }
}

export async function importCustomersFromExcel(req, res) {
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
    console.error('customer import XLSX.read:', e)
    return res.status(400).json({
      success: false,
      message: 'Không đọc được file Excel.',
    })
  }

  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    return res.status(400).json({ success: false, message: 'File không có sheet dữ liệu.' })
  }

  const sheet = workbook.Sheets[sheetName]
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: false,
  })

  if (!matrix.length) {
    return res.status(400).json({ success: false, message: 'File trống.' })
  }

  const headerRow = matrix[0].map((c) => normalizeCustomerHeader(c))
  const requiredCols = ['full_name', 'phone']
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
    const fn = cellStr(obj.full_name)
    const ph = cellStr(obj.phone)
    if (!fn && !ph && !cellStr(obj.email)) continue
    dataRows.push({ excelRow: i + 1, obj })
  }

  if (dataRows.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Không có dòng dữ liệu hợp lệ sau tiêu đề.',
    })
  }

  try {
    const created = []
    const errors = []

    for (const { excelRow, obj } of dataRows) {
      const full_name = cellStr(obj.full_name)
      const phone = cellStr(obj.phone)
      if (!full_name || !phone) {
        errors.push({
          row: excelRow,
          message: 'Thiếu full_name hoặc phone.',
        })
        continue
      }

      const dup = await pool.query(
        `SELECT 1 FROM customers WHERE tenant_id = $1 AND phone = $2 AND deleted_at IS NULL LIMIT 1`,
        [tenantId, phone]
      )
      if (dup.rows.length > 0) {
        errors.push({
          row: excelRow,
          message: `Số điện thoại "${phone}" đã tồn tại trong công ty.`,
        })
        continue
      }

      const taxRaw = cellStr(obj.tax_code)
      if (taxRaw) {
        const dupTax = await pool.query(
          `SELECT 1 FROM customers WHERE tenant_id = $1 AND tax_code = $2 AND tax_code IS NOT NULL AND tax_code != '' AND deleted_at IS NULL LIMIT 1`,
          [tenantId, taxRaw]
        )
        if (dupTax.rows.length > 0) {
          errors.push({
            row: excelRow,
            message: `Mã số thuế "${taxRaw}" đã tồn tại.`,
          })
          continue
        }
      }

      const typeRaw = cellStr(obj.customer_type)
      let customer_type = (typeRaw || 'individual').toLowerCase()
      if (!customer_type) customer_type = 'individual'
      if (!CUSTOMER_TYPE_VALUES.includes(customer_type)) {
        errors.push({
          row: excelRow,
          message: `customer_type không hợp lệ (${typeRaw || 'trống'}). Chọn một trong: ${CUSTOMER_TYPE_VALUES.join(', ')}.`,
        })
        continue
      }

      const assignRes = await resolveFinalAssignedTo(req, obj)
      if (assignRes.error) {
        errors.push({ row: excelRow, message: assignRes.error })
        continue
      }
      const finalAssignedTo = assignRes.employeeId

      const customer_id = uuidv4()
      const now = Date.now()
      const email = cellStr(obj.email) || ''
      const address = cellStr(obj.address) || ''
      const company_name = cellStr(obj.company_name) || ''
      const tax_code = taxRaw || ''
      const source = cellStr(obj.source) || 'Direct'

      try {
        await pool.query(
          `INSERT INTO customers (
            customer_id, full_name, email, phone, address, customer_type, company_name, tax_code, source,
            assigned_to, tenant_id, created_at, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [
            customer_id,
            full_name,
            email,
            phone,
            address,
            customer_type,
            company_name,
            tax_code,
            source,
            finalAssignedTo,
            tenantId,
            now,
            now,
          ]
        )
        created.push({ row: excelRow, full_name, phone })
      } catch (err) {
        console.error(`customer import row ${excelRow}:`, err)
        errors.push({
          row: excelRow,
          message: err.message || 'Lỗi khi ghi CSDL.',
        })
      }
    }

    return res.json({
      success: true,
      message: `Đã tạo ${created.length} khách hàng.${errors.length ? ` Lỗi: ${errors.length} dòng.` : ''}`,
      data: {
        created_count: created.length,
        error_count: errors.length,
        created,
        errors,
      },
    })
  } catch (err) {
    console.error('importCustomersFromExcel:', err)
    return res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi import khách hàng.',
    })
  }
}
