import {
  applyReportHeader,
  addSummaryCards,
  base64ToImageId,
  createStandardWorkbook,
  drawBarChartBase64,
  saveWorkbook,
  styleTableHeader,
} from './reportWorkbook'

export interface MonthlyKpiExportInputRow {
  full_name: string
  username: string
  territory: string
  department_name: string
  target_revenue_new: number
  actual_revenue_new: number
  target_revenue_existing: number
  actual_revenue_existing: number
  target_product_count_new: number
  actual_product_count_new: number
  target_product_count_existing: number
  actual_product_count_existing: number
  approach_target: number
  approach_actual: number
}

function pctLabel(actual: number, target: number): string {
  if (!target || target <= 0) return actual > 0 ? '—' : '0%'
  const p = (actual / target) * 100
  if (!Number.isFinite(p)) return '—'
  return `${p.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`
}

function formatVND(n: number): string {
  if (!n) return '0'
  return n.toLocaleString('vi-VN')
}

export interface MonthlyKpiReportPayload {
  period: string
  tenantName: string
  exportedBy: string
  filterNote?: string
  rows: MonthlyKpiExportInputRow[]
}

export async function exportMonthlyKpiReport(payload: MonthlyKpiReportPayload) {
  const { workbook, dashboardSheet, dataSheet } = await createStandardWorkbook({
    reportName: 'Báo cáo KPI tháng',
    tenantName: payload.tenantName || '—',
    exportedBy: payload.exportedBy,
    dateRangeLabel: `Kỳ ${payload.period}`,
    scopeLabel: 'company',
    dealCategory: null,
    generatedAt: Date.now(),
  })

  const periodLabel = `Kỳ ${payload.period}`
  const rows = payload.rows

  const sum = (fn: (r: MonthlyKpiExportInputRow) => number) => rows.reduce((s, r) => s + fn(r), 0)
  const tRev = sum((r) => r.target_revenue_new + r.target_revenue_existing)
  const aRev = sum((r) => r.actual_revenue_new + r.actual_revenue_existing)
  const tHd =
    sum((r) => r.target_product_count_new + r.target_product_count_existing)
  const aHd =
    sum((r) => r.actual_product_count_new + r.actual_product_count_existing)
  const tAp = sum((r) => r.approach_target)
  const aAp = sum((r) => r.approach_actual)

  applyReportHeader(
    dashboardSheet,
    {
      reportName: 'Báo cáo KPI tháng',
      tenantName: payload.tenantName || '—',
      exportedBy: payload.exportedBy,
      dateRangeLabel: periodLabel,
      scopeLabel: 'company',
      dealCategory: null,
      generatedAt: Date.now(),
    },
    'H'
  )

  const summaryItems: Array<{ label: string; value: string | number }> = [
    { label: 'Kỳ báo cáo', value: payload.period },
    { label: 'Số nhân viên', value: rows.length },
    { label: 'Tổng kế hoạch doanh thu (VNĐ)', value: formatVND(tRev) },
    { label: 'Tổng thực hiện doanh thu (VNĐ)', value: formatVND(aRev) },
    { label: '% đạt doanh thu', value: pctLabel(aRev, tRev) },
    { label: 'Tổng kế hoạch hợp đồng (HĐ)', value: tHd },
    { label: 'Tổng thực hiện hợp đồng (HĐ)', value: aHd },
    { label: '% đạt hợp đồng', value: pctLabel(aHd, tHd) },
    { label: 'Tổng kế hoạch tiếp cận (lần)', value: tAp },
    { label: 'Tổng thực hiện tiếp cận (lần)', value: aAp },
    { label: '% đạt tiếp cận', value: pctLabel(aAp, tAp) },
  ]
  if (payload.filterNote) {
    summaryItems.push({ label: 'Ghi chú lọc', value: payload.filterNote })
  }
  addSummaryCards(dashboardSheet, summaryItems)

  const chartData = rows.map((r) => ({
    label: r.full_name || r.username || '—',
    value: r.actual_revenue_new + r.actual_revenue_existing,
  }))
  const chartBase64 = drawBarChartBase64('Thực hiện doanh thu theo nhân viên (VNĐ)', chartData, '#0f766e')
  const chartImageId = base64ToImageId(workbook, chartBase64)
  if (chartImageId) {
    dashboardSheet.addImage(chartImageId, {
      tl: { col: 3, row: 4 },
      ext: { width: 920, height: 420 },
    })
  }

  dataSheet.name = 'KPI_theo_NV'

  applyReportHeader(
    dataSheet,
    {
      reportName: 'Báo cáo KPI tháng — Chi tiết',
      tenantName: payload.tenantName || '—',
      exportedBy: payload.exportedBy,
      dateRangeLabel: periodLabel,
      scopeLabel: 'company',
      dealCategory: null,
      generatedAt: Date.now(),
    },
    'T'
  )

  // Row 4: Group header (merged cells)
  const groupRow = dataSheet.getRow(4)
  groupRow.values = [
    'STT', 'Họ tên', 'Username', 'Phòng/Tổ', 'Địa bàn',
    'Hợp đồng', '', '',
    'Doanh thu — Tổng', '', '',
    'Doanh thu — KH mới', '', '',
    'Doanh thu — KH hiện hữu', '', '',
    'Tiếp cận', '', '',
  ]
  dataSheet.mergeCells('F4:H4')
  dataSheet.mergeCells('I4:K4')
  dataSheet.mergeCells('L4:N4')
  dataSheet.mergeCells('O4:Q4')
  dataSheet.mergeCells('R4:T4')
  groupRow.eachCell((cell) => {
    cell.font = { bold: true, size: 10 }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } }
    cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
  })
  // First 5 cells don't need white text
  for (let c = 1; c <= 5; c++) {
    const cell = groupRow.getCell(c)
    cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
  }

  // Row 5: Sub-column header
  const subRow = dataSheet.getRow(5)
  subRow.values = [
    '', '', '', '', '',
    'Kế hoạch', 'Thực hiện', '% đạt',
    'Kế hoạch', 'Thực hiện', '% đạt',
    'Kế hoạch', 'Thực hiện', '% đạt',
    'Kế hoạch', 'Thực hiện', '% đạt',
    'Kế hoạch', 'Thực hiện', '% đạt',
  ]
  subRow.eachCell((cell) => {
    cell.font = { bold: true, size: 9 }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } }
  })

  // Data rows start at row 6
  rows.forEach((r, idx) => {
    const tRevTot = r.target_revenue_new + r.target_revenue_existing
    const aRevTot = r.actual_revenue_new + r.actual_revenue_existing
    const tHdTot = r.target_product_count_new + r.target_product_count_existing
    const aHdTot = r.actual_product_count_new + r.actual_product_count_existing
    dataSheet.addRow([
      idx + 1,
      r.full_name,
      r.username,
      r.department_name || '—',
      r.territory,
      tHdTot,
      aHdTot,
      pctLabel(aHdTot, tHdTot),
      tRevTot,
      aRevTot,
      pctLabel(aRevTot, tRevTot),
      r.target_revenue_new,
      r.actual_revenue_new,
      pctLabel(r.actual_revenue_new, r.target_revenue_new),
      r.target_revenue_existing,
      r.actual_revenue_existing,
      pctLabel(r.actual_revenue_existing, r.target_revenue_existing),
      r.approach_target,
      r.approach_actual,
      pctLabel(r.approach_actual, r.approach_target),
    ])
  })

  // Format money columns (doanh thu)
  const lastRow = 5 + rows.length
  const moneyCols = ['I', 'J', 'L', 'M', 'O', 'P']
  for (let i = 6; i <= lastRow; i += 1) {
    moneyCols.forEach((col) => {
      dataSheet.getCell(`${col}${i}`).numFmt = '#,##0'
    })
  }

  // Column widths
  const colWidths = [
    5, 22, 14, 18, 14,
    16, 16, 10, 16, 16, 10, 16, 16, 10,
    10, 10, 10,
    10, 10, 10,
  ]
  colWidths.forEach((w, i) => {
    dataSheet.getColumn(i + 1).width = w
  })

  // Wrap text for all data cells
  for (let i = 6; i <= lastRow; i++) {
    const row = dataSheet.getRow(i)
    row.alignment = { wrapText: true, vertical: 'top' }
  }

  dataSheet.views = [{ state: 'frozen', ySplit: 5 }]

  const safePeriod = payload.period.replace(/[^\d-]/g, '_')
  const now = new Date()
  const dd = String(now.getDate()).padStart(2, '0')
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const yyyy = now.getFullYear()
  const fileName = `Bao_cao_KPI_thang_${safePeriod}_${dd}-${mm}-${yyyy}.xlsx`
  await saveWorkbook(workbook, fileName)
}
