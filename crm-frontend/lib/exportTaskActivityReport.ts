import {
  addSummaryCards,
  applyReportHeader,
  base64ToImageId,
  createStandardWorkbook,
  drawBarChartBase64,
  finalizeDataSheet,
  formatDateTime,
  saveWorkbook,
  styleTableHeader
} from './reportWorkbook'

export interface TaskActivityRow {
  display_code?: string | null
  title: string
  assigned_employee_name: string
  deal_display_code?: string | null
  deal_title?: string | null
  status: string
  actual_start?: number | null
  actual_end?: number | null
  overdue: boolean
}

export interface TaskActivityPayload {
  reportName: string
  tenantName: string
  exportedBy: string
  generatedAt?: number
  dateRangeLabel?: string
  scopeLabel?: string
  rows: TaskActivityRow[]
  summary: {
    totalTasks: number
    completedTasks: number
    overdueTasks: number
    statusBreakdown: Array<{ status: string; count: number }>
  }
}

export async function exportTaskActivityReport(payload: TaskActivityPayload) {
  const { workbook, dashboardSheet, dataSheet } = await createStandardWorkbook(payload)

  applyReportHeader(dashboardSheet, payload, 'H')
  addSummaryCards(dashboardSheet, [
    { label: 'Tổng số task', value: payload.summary.totalTasks },
    { label: 'Task hoàn thành', value: payload.summary.completedTasks },
    { label: 'Task quá hạn', value: payload.summary.overdueTasks }
  ])

  const chartBase64 = drawBarChartBase64(
    'Phân bổ trạng thái task',
    payload.summary.statusBreakdown.map((item) => ({ label: item.status, value: item.count })),
    '#7c3aed'
  )
  const imageId = base64ToImageId(workbook, chartBase64)
  if (imageId) {
    dashboardSheet.addImage(imageId, {
      tl: { col: 3, row: 4 },
      ext: { width: 920, height: 420 }
    })
  }

  dataSheet.columns = [
    { header: 'Mã Task', key: 'display_code', width: 18 },
    { header: 'Tên Task', key: 'title', width: 28 },
    { header: 'Người thực hiện', key: 'assigned_employee_name', width: 20 },
    { header: 'Deal liên quan', key: 'deal_display_code', width: 18 },
    { header: 'Tên Deal', key: 'deal_title', width: 24 },
    { header: 'Trạng thái', key: 'status', width: 14 },
    { header: 'Bắt đầu thực tế', key: 'actual_start', width: 22 },
    { header: 'Kết thúc thực tế', key: 'actual_end', width: 22 }
  ]

  applyReportHeader(dataSheet, payload, 'H')
  const headerRow = dataSheet.getRow(4)
  headerRow.values = dataSheet.columns.map((column) => column.header as string)
  styleTableHeader(headerRow, 'FF7C2D12')

  payload.rows.forEach((row) => {
    const added = dataSheet.addRow({
      ...row,
      actual_start: formatDateTime(row.actual_start),
      actual_end: formatDateTime(row.actual_end)
    })
    if (row.overdue) {
      added.eachCell((cell: any) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7F1D1D' } }
        cell.font = { color: { argb: 'FFFFFFFF' } }
      })
    }
  })

  finalizeDataSheet(dataSheet, 'A4', 'H4', 4)
  const today = new Date()
  const fileName = `Nhat_ky_task_activity_${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}.xlsx`
  await saveWorkbook(workbook, fileName)
}
