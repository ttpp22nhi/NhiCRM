import {
  addSummaryCards,
  applyReportHeader,
  base64ToImageId,
  createStandardWorkbook,
  drawPieChartBase64,
  finalizeDataSheet,
  formatCurrency,
  saveWorkbook,
  styleTableHeader
} from './reportWorkbook'

export interface LossAnalysisRow {
  display_code?: string | null
  title: string
  customer_name: string
  amount: number
  loss_reason: string
  note: string
  assigned_employee_name: string
  updated_at?: number | null
}

export interface LossAnalysisPayload {
  reportName: string
  tenantName: string
  exportedBy: string
  generatedAt?: number
  dateRangeLabel?: string
  scopeLabel?: string
  dealCategory?: 'MASS' | 'PROJECT' | null
  rows: LossAnalysisRow[]
  reasonBreakdown: Array<{ reason: string; count: number; amount: number }>
  totals: { totalDeals: number; totalAmount: number }
}

export async function exportLossAnalysisReport(payload: LossAnalysisPayload) {
  const { workbook, dashboardSheet, dataSheet } = await createStandardWorkbook(payload)

  applyReportHeader(dashboardSheet, payload, 'H')
  addSummaryCards(dashboardSheet, [
    { label: 'Tổng deal thất bại', value: payload.totals.totalDeals },
    { label: 'Tổng giá trị thất bại', value: formatCurrency(payload.totals.totalAmount) }
  ])

  const chartBase64 = drawPieChartBase64(
    'Phân bổ lý do thất bại',
    payload.reasonBreakdown.map((item) => ({ label: item.reason, value: item.count }))
  )
  const imageId = base64ToImageId(workbook, chartBase64)
  if (imageId) {
    dashboardSheet.addImage(imageId, {
      tl: { col: 3, row: 4 },
      ext: { width: 820, height: 430 }
    })
  }

  dataSheet.columns = [
    { header: 'Mã Deal', key: 'display_code', width: 18 },
    { header: 'Tên Deal', key: 'title', width: 28 },
    { header: 'Khách hàng', key: 'customer_name', width: 24 },
    { header: 'Giá trị', key: 'amount', width: 16 },
    { header: 'Lý do thất bại', key: 'loss_reason', width: 20 },
    { header: 'Ghi chú', key: 'note', width: 36 },
    { header: 'Người phụ trách', key: 'assigned_employee_name', width: 20 }
  ]

  applyReportHeader(dataSheet, payload, 'G')
  const headerRow = dataSheet.getRow(4)
  headerRow.values = dataSheet.columns.map((column) => column.header as string)
  styleTableHeader(headerRow, 'FFDC2626')

  payload.rows.forEach((row) => dataSheet.addRow(row))
  for (let i = 5; i < 5 + payload.rows.length; i += 1) {
    dataSheet.getCell(`D${i}`).numFmt = '#,##0'
  }

  finalizeDataSheet(dataSheet, 'A4', 'G4', 4)
  const today = new Date()
  const fileName = `Bao_cao_loss_analysis_${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}.xlsx`
  await saveWorkbook(workbook, fileName)
}
