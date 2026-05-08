import {
  applyReportHeader,
  addSummaryCards,
  base64ToImageId,
  createStandardWorkbook,
  drawBarChartBase64,
  finalizeDataSheet,
  saveWorkbook,
  styleTableHeader,
} from './reportWorkbook'

export interface MonthlyKpiExportInputRow {
  full_name: string
  username: string
  territory: string
  target_revenue_new: number
  actual_revenue_new: number
  target_revenue_existing: number
  actual_revenue_existing: number
  approach_target: number
  approach_actual: number
  target_product_new: number
  actual_product_new: number
  target_product_existing: number
  actual_product_existing: number
}

function pctLabel(actual: number, target: number): string {
  if (!target || target <= 0) return actual > 0 ? '—' : '0%'
  const p = (actual / target) * 100
  if (!Number.isFinite(p)) return '—'
  return `${p.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`
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
  const tAp = sum((r) => r.approach_target)
  const aAp = sum((r) => r.approach_actual)
  const tPn = sum((r) => r.target_product_new)
  const aPn = sum((r) => r.actual_product_new)
  const tPe = sum((r) => r.target_product_existing)
  const aPe = sum((r) => r.actual_product_existing)

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
    { label: 'Tổng chỉ tiêu doanh thu (VNĐ)', value: tRev },
    { label: 'Tổng thực hiện doanh thu (VNĐ)', value: aRev },
    { label: 'Tổng chỉ tiêu tiếp cận (lần)', value: tAp },
    { label: 'Tổng thực hiện tiếp cận (lần)', value: aAp },
    { label: 'Tổng chỉ tiêu SP (mới + HH)', value: tPn + tPe },
    { label: 'Tổng thực hiện SP (mới + HH)', value: aPn + aPe },
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
  const headers = [
    'STT',
    'Họ tên',
    'Username',
    'Địa bàn',
    'CT DT KH mới (đ)',
    'TH DT KH mới (đ)',
    '% đạt DT mới',
    'CT DT KH HH (đ)',
    'TH DT KH HH (đ)',
    '% đạt DT HH',
    'CT DT tổng (đ)',
    'TH DT tổng (đ)',
    '% đạt DT tổng',
    'CT tiếp cận',
    'TH tiếp cận',
    '% đạt tiếp cận',
    'CT SP mới',
    'TH SP mới',
    '% đạt SP mới',
    'CT SP HH',
    'TH SP HH',
    '% đạt SP HH',
    'CT SP tổng',
    'TH SP tổng',
    '% đạt SP tổng',
  ]

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
    'Y'
  )

  const headerRow = dataSheet.getRow(4)
  headerRow.values = headers
  styleTableHeader(headerRow, 'FF0F766E')

  rows.forEach((r, idx) => {
    const tTot = r.target_revenue_new + r.target_revenue_existing
    const aTot = r.actual_revenue_new + r.actual_revenue_existing
    const tPt = r.target_product_new + r.target_product_existing
    const aPt = r.actual_product_new + r.actual_product_existing
    dataSheet.addRow([
      idx + 1,
      r.full_name,
      r.username,
      r.territory,
      r.target_revenue_new,
      r.actual_revenue_new,
      pctLabel(r.actual_revenue_new, r.target_revenue_new),
      r.target_revenue_existing,
      r.actual_revenue_existing,
      pctLabel(r.actual_revenue_existing, r.target_revenue_existing),
      tTot,
      aTot,
      pctLabel(aTot, tTot),
      r.approach_target,
      r.approach_actual,
      pctLabel(r.approach_actual, r.approach_target),
      r.target_product_new,
      r.actual_product_new,
      pctLabel(r.actual_product_new, r.target_product_new),
      r.target_product_existing,
      r.actual_product_existing,
      pctLabel(r.actual_product_existing, r.target_product_existing),
      tPt,
      aPt,
      pctLabel(aPt, tPt),
    ])
  })

  const lastRow = 4 + rows.length
  const moneyCols = ['E', 'F', 'H', 'I', 'K', 'L']
  for (let i = 5; i <= lastRow; i += 1) {
    moneyCols.forEach((col) => {
      dataSheet.getCell(`${col}${i}`).numFmt = '#,##0'
    })
  }

  finalizeDataSheet(dataSheet, 'A4', 'Y4', 4)

  const safePeriod = payload.period.replace(/[^\d-]/g, '_')
  const fileName = `Bao_cao_KPI_thang_${safePeriod}_${new Date().toISOString().slice(0, 10)}.xlsx`
  await saveWorkbook(workbook, fileName)
}
