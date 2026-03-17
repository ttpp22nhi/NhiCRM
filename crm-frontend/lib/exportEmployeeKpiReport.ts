import {
  applyReportHeader,
  addSummaryCards,
  base64ToImageId,
  createStandardWorkbook,
  drawBarChartBase64,
  finalizeDataSheet,
  formatBusinessType,
  formatScopeLabel,
  saveWorkbook,
  styleTableHeader
} from './reportWorkbook'

export interface EmployeeKpiReportRow {
  employee_id: string
  full_name: string
  username: string
  role: string
  department_name: string
  open_deals: number
  win_rate: number
  won_amount: number
  completed_tasks_on_time: number
  completed_tasks: number
  rank: number
}

export interface EmployeeKpiReportPayload {
  reportName: string
  tenantName: string
  exportedBy: string
  generatedAt?: number
  dateRangeLabel?: string
  scopeLabel?: string
  dealCategory?: 'MASS' | 'PROJECT' | null
  rows: EmployeeKpiReportRow[]
  totals: {
    totalEmployees: number
    totalWonAmount: number
    avgWinRate: number
  }
}

function formatRole(role: string) {
  switch ((role || '').toLowerCase()) {
    case 'admin':
      return 'Admin'
    case 'super_admin':
      return 'Super Admin'
    case 'director':
      return 'Giám đốc'
    case 'manager':
      return 'Quản lý'
    case 'leader':
      return 'Tổ trưởng'
    case 'sales':
      return 'Sales'
    default:
      return role || ''
  }
}

export async function exportEmployeeKpiReport(payload: EmployeeKpiReportPayload, filters: { businessType?: string; periodLabel?: string }) {
  const { workbook, dashboardSheet, dataSheet } = await createStandardWorkbook({
    reportName: payload.reportName,
    tenantName: payload.tenantName,
    exportedBy: payload.exportedBy,
    dateRangeLabel: filters.periodLabel || payload.dateRangeLabel,
    scopeLabel: payload.scopeLabel,
    dealCategory: payload.dealCategory,
    generatedAt: payload.generatedAt
  })

  applyReportHeader(dashboardSheet, {
    reportName: payload.reportName,
    tenantName: payload.tenantName,
    exportedBy: payload.exportedBy,
    dateRangeLabel: filters.periodLabel || payload.dateRangeLabel,
    scopeLabel: payload.scopeLabel,
    dealCategory: payload.dealCategory,
    generatedAt: payload.generatedAt
  }, 'H')

  addSummaryCards(dashboardSheet, [
    { label: 'Tổng nhân viên', value: payload.totals.totalEmployees },
    { label: 'Tổng doanh số Won', value: payload.totals.totalWonAmount },
    { label: 'Win rate trung bình', value: `${payload.totals.avgWinRate}%` },
    { label: 'Phạm vi', value: formatScopeLabel(payload.scopeLabel) },
    { label: 'Loại hình', value: formatBusinessType(payload.dealCategory || filters.businessType) }
  ])

  const chartBase64 = drawBarChartBase64(
    'So sánh doanh số Won theo nhân viên',
    payload.rows.map((row) => ({ label: row.full_name, value: row.won_amount })),
    '#0f766e'
  )
  const chartImageId = base64ToImageId(workbook, chartBase64)
  if (chartImageId) {
    dashboardSheet.addImage(chartImageId, {
      tl: { col: 3, row: 4 },
      ext: { width: 920, height: 420 }
    })
  }

  dataSheet.name = 'Data'
  dataSheet.columns = [
    { header: 'Xếp hạng', key: 'rank', width: 10 },
    { header: 'Mã NV', key: 'employee_id', width: 18 },
    { header: 'Họ tên', key: 'full_name', width: 24 },
    { header: 'Username', key: 'username', width: 18 },
    { header: 'Vai trò', key: 'role', width: 16 },
    { header: 'Phòng/Ban', key: 'department_name', width: 20 },
    { header: 'Deal đang mở', key: 'open_deals', width: 14 },
    { header: 'Win Rate (%)', key: 'win_rate', width: 14 },
    { header: 'Doanh số Won', key: 'won_amount', width: 18 },
    { header: 'Task đúng hạn', key: 'completed_tasks_on_time', width: 16 },
    { header: 'Task hoàn thành', key: 'completed_tasks', width: 16 }
  ]

  applyReportHeader(dataSheet, {
    reportName: payload.reportName,
    tenantName: payload.tenantName,
    exportedBy: payload.exportedBy,
    dateRangeLabel: filters.periodLabel || payload.dateRangeLabel,
    scopeLabel: payload.scopeLabel,
    dealCategory: payload.dealCategory,
    generatedAt: payload.generatedAt
  }, 'K')

  const headerRow = dataSheet.getRow(4)
  headerRow.values = dataSheet.columns.map((column) => column.header as string)
  styleTableHeader(headerRow, 'FF0F766E')

  payload.rows.forEach((row) => {
    dataSheet.addRow({
      ...row,
      role: formatRole(row.role)
    })
  })

  for (let i = 5; i < 5 + payload.rows.length; i += 1) {
    dataSheet.getCell(`H${i}`).numFmt = '0.00'
    dataSheet.getCell(`I${i}`).numFmt = '#,##0'
  }

  finalizeDataSheet(dataSheet, 'A4', 'K4', 4)

  const today = new Date()
  const fileName = `Bao_cao_KPI_nhan_vien_${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}.xlsx`
  await saveWorkbook(workbook, fileName)
}
