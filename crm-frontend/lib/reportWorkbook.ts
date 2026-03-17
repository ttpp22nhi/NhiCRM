import { saveAs } from 'file-saver'

export const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export interface ReportContext {
  reportName: string
  tenantName: string
  exportedBy: string
  dateRangeLabel?: string
  scopeLabel?: string
  dealCategory?: string | null
  generatedAt?: number
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value || 0)
}

export function formatDateTime(value?: number | null) {
  if (!value) return '-'
  return new Date(value).toLocaleString('vi-VN')
}

export function formatScopeLabel(scopeLabel?: string) {
  switch (scopeLabel) {
    case 'personal':
      return 'Cá nhân'
    case 'team':
      return 'Đơn vị'
    case 'filter':
      return 'Đơn vị được lọc'
    default:
      return 'Toàn công ty'
  }
}

export function formatBusinessType(value?: string | null) {
  if (value === 'PROJECT') return 'Dự án (Customize)'
  if (value === 'MASS') return 'MASS'
  return 'Tất cả'
}

export async function createStandardWorkbook(context: ReportContext) {
  const ExcelJS = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Cursor'
  workbook.created = new Date()
  const dashboardSheet = workbook.addWorksheet('Dashboard')
  const dataSheet = workbook.addWorksheet('Data')
  return { workbook, dashboardSheet, dataSheet }
}

export function applyReportHeader(sheet: any, context: ReportContext, endColumn: string) {
  sheet.mergeCells(`A1:${endColumn}1`)
  sheet.getCell('A1').value = context.reportName.toUpperCase()
  sheet.getCell('A1').font = { bold: true, size: 18, color: { argb: 'FF0F172A' } }

  sheet.getCell('A2').value = `Đơn vị: ${context.tenantName}`
  sheet.getCell('A3').value = `Người xuất: ${context.exportedBy}`
  sheet.getCell('D2').value = `Phạm vi: ${formatScopeLabel(context.scopeLabel)}`
  sheet.getCell('D3').value = `Loại hình: ${formatBusinessType(context.dealCategory)}`
  sheet.getCell('G2').value = `Khoảng thời gian: ${context.dateRangeLabel || 'Hiện tại'}`
  sheet.getCell('G3').value = `Thời gian xuất: ${new Date(context.generatedAt || Date.now()).toLocaleString('vi-VN')}`

  ;['A2', 'A3', 'D2', 'D3', 'G2', 'G3'].forEach((cell) => {
    sheet.getCell(cell).font = { size: 11, color: { argb: 'FF334155' } }
  })
}

export function addSummaryCards(sheet: any, items: Array<{ label: string; value: string | number }>, startRow = 5) {
  items.forEach((item, index) => {
    const row = startRow + index
    sheet.getCell(`A${row}`).value = item.label
    sheet.getCell(`A${row}`).font = { bold: true, color: { argb: 'FF1E293B' } }
    sheet.getCell(`B${row}`).value = item.value
    sheet.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }
    sheet.getCell(`B${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
    sheet.getCell(`A${row}`).border = sheet.getCell(`B${row}`).border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
    }
  })
}

export function styleTableHeader(row: any, color = 'FF1D4ED8') {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }
  row.alignment = { vertical: 'middle', horizontal: 'center' }
}

export function finalizeDataSheet(sheet: any, fromCell: string, toCell: string, freezeRows = 4) {
  sheet.views = [{ state: 'frozen', ySplit: freezeRows }]
  sheet.autoFilter = { from: fromCell, to: toCell }
}

export function base64ToImageId(workbook: any, base64?: string) {
  if (!base64) return null
  return workbook.addImage({ base64, extension: 'png' })
}

export function drawBarChartBase64(
  title: string,
  data: Array<{ label: string; value: number }>,
  color = '#2563eb'
) {
  const rows = data.length > 0 ? data : [{ label: 'Không có dữ liệu', value: 0 }]
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(960, rows.length * 120)
  canvas.height = 520
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  const width = canvas.width
  const height = canvas.height
  const margin = { top: 50, right: 40, bottom: 140, left: 90 }
  const plotWidth = width - margin.left - margin.right
  const plotHeight = height - margin.top - margin.bottom
  const maxValue = Math.max(...rows.map((item) => item.value), 1)

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#111827'
  ctx.font = 'bold 20px Arial'
  ctx.fillText(title, margin.left, 30)

  ctx.strokeStyle = '#d1d5db'
  for (let i = 0; i <= 5; i += 1) {
    const y = margin.top + (plotHeight / 5) * i
    ctx.beginPath()
    ctx.moveTo(margin.left, y)
    ctx.lineTo(width - margin.right, y)
    ctx.stroke()
  }

  ctx.strokeStyle = '#334155'
  ctx.beginPath()
  ctx.moveTo(margin.left, margin.top)
  ctx.lineTo(margin.left, height - margin.bottom)
  ctx.lineTo(width - margin.right, height - margin.bottom)
  ctx.stroke()

  ctx.fillStyle = '#64748b'
  ctx.font = '12px Arial'
  for (let i = 0; i <= 5; i += 1) {
    const ratio = 1 - i / 5
    const y = margin.top + plotHeight * i / 5
    ctx.fillText(Math.round(maxValue * ratio).toLocaleString('vi-VN'), 10, y + 4)
  }

  const barGroupWidth = plotWidth / rows.length
  const barWidth = Math.min(56, Math.max(28, barGroupWidth * 0.55))
  rows.forEach((item, index) => {
    const value = item.value || 0
    const barHeight = (value / maxValue) * plotHeight
    const x = margin.left + index * barGroupWidth + (barGroupWidth - barWidth) / 2
    const y = height - margin.bottom - barHeight

    ctx.fillStyle = color
    ctx.fillRect(x, y, barWidth, barHeight)

    ctx.fillStyle = '#1f2937'
    ctx.font = 'bold 11px Arial'
    ctx.save()
    ctx.translate(x + barWidth / 2, height - margin.bottom + 14)
    ctx.rotate(-Math.PI / 4)
    const label = item.label.length > 18 ? `${item.label.slice(0, 18)}...` : item.label
    ctx.fillText(label, 0, 0)
    ctx.restore()
  })

  return canvas.toDataURL('image/png')
}

export function drawPieChartBase64(
  title: string,
  data: Array<{ label: string; value: number; color?: string }>
) {
  const rows = data.length > 0 ? data : [{ label: 'Không có dữ liệu', value: 1, color: '#94a3b8' }]
  const canvas = document.createElement('canvas')
  canvas.width = 900
  canvas.height = 520
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  const total = rows.reduce((sum, item) => sum + item.value, 0) || 1
  const centerX = 260
  const centerY = 270
  const radius = 150
  let startAngle = -Math.PI / 2

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#111827'
  ctx.font = 'bold 20px Arial'
  ctx.fillText(title, 40, 32)

  rows.forEach((item, index) => {
    const value = item.value || 0
    const slice = (value / total) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(centerX, centerY)
    ctx.arc(centerX, centerY, radius, startAngle, startAngle + slice)
    ctx.closePath()
    ctx.fillStyle = item.color || ['#2563eb', '#f59e0b', '#ef4444', '#10b981', '#8b5cf6'][index % 5]
    ctx.fill()
    startAngle += slice
  })

  rows.forEach((item, index) => {
    const y = 120 + index * 44
    ctx.fillStyle = item.color || ['#2563eb', '#f59e0b', '#ef4444', '#10b981', '#8b5cf6'][index % 5]
    ctx.fillRect(500, y - 12, 18, 18)
    ctx.fillStyle = '#0f172a'
    ctx.font = '14px Arial'
    const percent = ((item.value / total) * 100).toFixed(1)
    ctx.fillText(`${item.label}: ${item.value} (${percent}%)`, 530, y)
  })

  return canvas.toDataURL('image/png')
}

export async function saveWorkbook(workbook: any, fileName: string) {
  const buffer = await workbook.xlsx.writeBuffer()
  saveAs(new Blob([buffer], { type: MIME_XLSX }), fileName)
}
