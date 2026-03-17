import {
  addSummaryCards,
  applyReportHeader,
  base64ToImageId,
  createStandardWorkbook,
  drawBarChartBase64,
  finalizeDataSheet,
  formatCurrency,
  saveWorkbook,
  styleTableHeader
} from './reportWorkbook'

export interface SalesForecastRow {
  display_code?: string | null
  title: string
  customer_name: string
  assigned_employee_name: string
  department_name: string
  department_path: string
  amount: number
  stage: string
  stage_percent: number
  confidence_level: 'high' | 'medium' | 'low'
  weighted_value: number
  status: string
}

export interface SalesForecastPayload {
  reportName: string
  tenantName: string
  exportedBy: string
  generatedAt?: number
  dateRangeLabel?: string
  scopeLabel?: string
  dealCategory?: 'MASS' | 'PROJECT' | null
  rows: SalesForecastRow[]
  totals: {
    totalDeals: number
    totalAmount: number
    totalWeightedValue: number
  }
  groupedByPath: Array<{
    path: string
    dealCount: number
    totalAmount: number
    totalWeightedValue: number
  }>
}

const CONFIDENCE_COLOR: Record<string, string> = {
  high: 'FFE8F5E9',
  medium: 'FFFFF8E1',
  low: 'FFFFEBEE'
}

export async function exportSalesForecastReport(payload: SalesForecastPayload) {
  const { workbook, dashboardSheet, dataSheet } = await createStandardWorkbook(payload)

  applyReportHeader(dashboardSheet, payload, 'H')
  addSummaryCards(dashboardSheet, [
    { label: 'Tổng số deal', value: payload.totals.totalDeals },
    { label: 'Tổng giá trị thực', value: formatCurrency(payload.totals.totalAmount) },
    { label: 'Tổng doanh thu kỳ vọng', value: formatCurrency(payload.totals.totalWeightedValue) }
  ])

  const chartBase64 = drawBarChartBase64(
    'Weighted Value theo đơn vị',
    payload.groupedByPath.map((item) => ({
      label: item.path,
      value: Math.round(item.totalWeightedValue)
    })),
    '#2563eb'
  )
  const imageId = base64ToImageId(workbook, chartBase64)
  if (imageId) {
    dashboardSheet.addImage(imageId, {
      tl: { col: 3, row: 4 },
      ext: { width: 920, height: 420 }
    })
  }

  dataSheet.columns = [
    { header: 'Mã Deal', key: 'display_code', width: 18 },
    { header: 'Tên Deal', key: 'title', width: 28 },
    { header: 'Khách hàng', key: 'customer_name', width: 24 },
    { header: 'Người phụ trách', key: 'assigned_employee_name', width: 20 },
    { header: 'Đơn vị', key: 'department_name', width: 18 },
    { header: 'Path', key: 'department_path', width: 26 },
    { header: 'Giá trị thực', key: 'amount', width: 16 },
    { header: 'Giai đoạn', key: 'stage', width: 16 },
    { header: '% Giai đoạn', key: 'stage_percent', width: 14 },
    { header: 'Confidence', key: 'confidence_level', width: 12 },
    { header: 'Weighted Value', key: 'weighted_value', width: 18 },
    { header: 'Trạng thái', key: 'status', width: 14 }
  ]

  applyReportHeader(dataSheet, payload, 'L')
  const headerRow = dataSheet.getRow(4)
  headerRow.values = dataSheet.columns.map((column) => column.header as string)
  styleTableHeader(headerRow, 'FF1D4ED8')

  payload.rows.forEach((row) => {
    const added = dataSheet.addRow(row)
    const fillColor = CONFIDENCE_COLOR[row.confidence_level] || 'FFFFFFFF'
    added.eachCell((cell: any) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillColor } }
    })
  })

  for (let i = 5; i < 5 + payload.rows.length; i += 1) {
    dataSheet.getCell(`G${i}`).numFmt = '#,##0'
    dataSheet.getCell(`I${i}`).numFmt = '0%'
    dataSheet.getCell(`K${i}`).numFmt = '#,##0'
  }

  finalizeDataSheet(dataSheet, 'A4', 'L4', 4)
  const today = new Date()
  const fileName = `Bao_cao_forecast_${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}.xlsx`
  await saveWorkbook(workbook, fileName)
}
