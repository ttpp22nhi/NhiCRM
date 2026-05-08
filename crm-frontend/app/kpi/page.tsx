'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { Navbar } from '@/components/Navbar'
import { apiClient } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import {
  canAssignKpi,
  canAccessKpiPage,
  isTenantAdmin,
  canAccessCbsRevenue,
} from '@/lib/rbac'
import {
  Loader2,
  Save,
  Target,
  Percent,
  Coins,
  Lock,
  Search,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  X,
  Package,
  Wallet,
  Download,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { exportMonthlyKpiReport } from '@/lib/exportMonthlyKpiReport'
import {
  isKpiPeriodActualsLocked,
  formatKpiConfirmationDeadlineDdMmYyyy,
} from '@/lib/kpiPeriodLock'

interface KpiRow {
  employee_id: string
  full_name: string
  username: string
  territory?: string | null
  kpi_id: string | null
  period: string | null
  target_revenue_new: string | number | null
  target_revenue_existing: string | number | null
  actual_revenue_new: string | number | null
  actual_revenue_existing: string | number | null
  approach_count: string | number | null
  actual_approach_count?: string | number | null
  target_product_count_new: string | number | null
  target_product_count_existing: string | number | null
  actual_product_count_new?: string | number | null
  actual_product_count_existing?: string | number | null
}

const VN_TZ_OFFSET_MS = 7 * 60 * 60 * 1000 // Asia/Ho_Chi_Minh (UTC+7)

function currentPeriodVN(): string {
  const d = new Date(Date.now() + VN_TZ_OFFSET_MS)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function defaultPeriod(): string {
  return currentPeriodVN()
}

function isPastPeriod(period: string): boolean {
  return period < currentPeriodVN()
}

/** Doanh thu: VNĐ (đồng) — nhập và hiển thị cùng đơn vị để dễ đọc */

function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === '') return 0
  const n = Number(v)
  return Number.isNaN(n) ? 0 : n
}

function revenueToInput(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return ''
  const n = Number(v)
  if (Number.isNaN(n)) return ''
  return String(Math.trunc(n))
}

function digitsOnly(v: string): string {
  return (v || '').replace(/\D+/g, '').replace(/^0+(?=\d)/, '')
}

function formatThousandsVN(digits: string): string {
  if (!digits) return ''
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

function formatVND(dong: number): string {
  if (Number.isNaN(dong)) return '—'
  try {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
      maximumFractionDigits: 0,
    }).format(dong)
  } catch {
    return `${dong.toLocaleString('vi-VN')} ₫`
  }
}

function formatPercent(actual: number, target: number): string {
  if (!target || target <= 0) return actual > 0 ? '—' : '0%'
  const p = (actual / target) * 100
  if (!Number.isFinite(p)) return '—'
  return `${p.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`
}

function achievementTone(actual: number, target: number): string {
  if (!target || target <= 0) return 'text-gray-500'
  const p = (actual / target) * 100
  if (p >= 100) return 'text-green-700'
  if (p >= 70) return 'text-amber-600'
  return 'text-red-600'
}

function formatCount(n: number): string {
  return `${Math.max(0, Math.floor(n)).toLocaleString('vi-VN')} lần`
}


function normalizeVN(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .trim()
}

type DisplayMode = 'number' | 'percent'

type SortKey =
  | 'name'
  | 'territory'
  | 'actual_new'
  | 'actual_existing'
  | 'actual_total'
  | 'actual_approach'
  | 'actual_product_new'
  | 'actual_product_existing'
  | 'actual_product_total'

type SortDir = 'asc' | 'desc'

function achievementRatio(actual: number, target: number): number {
  if (!target || target <= 0) return actual > 0 ? Infinity : 0
  return actual / target
}

export default function KpiPage() {
  const { user } = useAuth()
  const router = useRouter()
  const assigner = canAssignKpi(user?.role)
  const admin = isTenantAdmin(user?.role)
  const canOpenCbsRevenue = canAccessCbsRevenue(user?.role)
  const [period, setPeriod] = useState(defaultPeriod)
  const [rows, setRows] = useState<KpiRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [displayMode, setDisplayMode] = useState<DisplayMode>('number')
  const [employeeFilter, setEmployeeFilter] = useState('')
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [exportingReport, setExportingReport] = useState(false)

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      // Mặc định: cột tên/địa bàn → asc (A→Z); cột số → desc (lớn → bé).
      setSortDir(key === 'name' || key === 'territory' ? 'asc' : 'desc')
    }
  }
  const clearSort = () => {
    setSortKey(null)
    setSortDir('desc')
  }

  // Chốt sau 00:00 ngày 06 (VN) tháng kế sau kỳ — trước đó Quản lý/Lãnh đạo vẫn sửa chỉ tiêu được.
  const periodActualsLocked = isKpiPeriodActualsLocked(period)
  const confirmationDeadlineDdMmYyyy = formatKpiConfirmationDeadlineDdMmYyyy(period)
  const canEditTargets = assigner && (!periodActualsLocked || admin)
  const showLockedBanner = assigner && periodActualsLocked && !admin
  const showDeadlineBanner = assigner && isPastPeriod(period) && !periodActualsLocked && !admin

  const load = useCallback(async () => {
    if (!user || !canAccessKpiPage(user.role)) return
    setLoading(true)
    try {
      const res = await apiClient.get('/api/kpis', { params: { period } })
      if (res.data.success) {
        const raw = (res.data.data || []) as KpiRow[]
        setRows(
          raw.map((row) => ({
            ...row,
            target_revenue_new: revenueToInput(row.target_revenue_new),
            target_revenue_existing: revenueToInput(row.target_revenue_existing),
            actual_revenue_new: revenueToInput(row.actual_revenue_new),
            actual_revenue_existing: revenueToInput(row.actual_revenue_existing),
          }))
        )
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } }
      toast.error(err.response?.data?.message || 'Không tải được KPI.')
    } finally {
      setLoading(false)
    }
  }, [period, user])

  useEffect(() => {
    if (user && !canAccessKpiPage(user.role)) {
      router.replace('/dashboard')
    }
  }, [user, router])

  useEffect(() => {
    load()
  }, [load])

  const updateRow = (employeeId: string, field: keyof KpiRow, value: string) => {
    setRows((prev) =>
      prev.map((r) => (r.employee_id === employeeId ? { ...r, [field]: value } : r))
    )
  }

  const displayRows = useMemo(() => {
    const nFilter = normalizeVN(employeeFilter)
    let list = rows
    if (nFilter) {
      list = list.filter((r) => {
        const hay = normalizeVN(
          `${r.full_name || ''} ${r.username || ''} ${r.territory || ''}`
        )
        return hay.includes(nFilter)
      })
    }
    if (!sortKey) return list

    const getSortVal = (r: KpiRow): number | string => {
      switch (sortKey) {
        case 'name':
          return normalizeVN(r.full_name || r.username || '')
        case 'territory':
          return normalizeVN(String(r.territory || ''))
        case 'actual_new':
          return displayMode === 'percent'
            ? achievementRatio(num(r.actual_revenue_new), num(r.target_revenue_new))
            : num(r.actual_revenue_new)
        case 'actual_existing':
          return displayMode === 'percent'
            ? achievementRatio(
                num(r.actual_revenue_existing),
                num(r.target_revenue_existing)
              )
            : num(r.actual_revenue_existing)
        case 'actual_total': {
          const a = num(r.actual_revenue_new) + num(r.actual_revenue_existing)
          const t = num(r.target_revenue_new) + num(r.target_revenue_existing)
          return displayMode === 'percent' ? achievementRatio(a, t) : a
        }
        case 'actual_approach':
          return displayMode === 'percent'
            ? achievementRatio(
                Math.floor(num(r.actual_approach_count)),
                Math.floor(num(r.approach_count))
              )
            : Math.floor(num(r.actual_approach_count))
        case 'actual_product_new':
          return displayMode === 'percent'
            ? achievementRatio(
                Math.floor(num(r.actual_product_count_new)),
                Math.floor(num(r.target_product_count_new))
              )
            : Math.floor(num(r.actual_product_count_new))
        case 'actual_product_existing':
          return displayMode === 'percent'
            ? achievementRatio(
                Math.floor(num(r.actual_product_count_existing)),
                Math.floor(num(r.target_product_count_existing))
              )
            : Math.floor(num(r.actual_product_count_existing))
        case 'actual_product_total': {
          const a =
            Math.floor(num(r.actual_product_count_new)) +
            Math.floor(num(r.actual_product_count_existing))
          const t =
            Math.floor(num(r.target_product_count_new)) +
            Math.floor(num(r.target_product_count_existing))
          return displayMode === 'percent' ? achievementRatio(a, t) : a
        }
        default:
          return 0
      }
    }
    const sign = sortDir === 'asc' ? 1 : -1
    const sorted = [...list].sort((a, b) => {
      const va = getSortVal(a)
      const vb = getSortVal(b)
      if (typeof va === 'string' && typeof vb === 'string') {
        return va.localeCompare(vb, 'vi') * sign
      }
      const na = Number(va)
      const nb = Number(vb)
      // Infinity: đẩy xuống cuối khi desc (user muốn xem có target xếp trên)
      if (!Number.isFinite(na) && !Number.isFinite(nb)) return 0
      if (!Number.isFinite(na)) return sortDir === 'desc' ? 1 : -1
      if (!Number.isFinite(nb)) return sortDir === 'desc' ? -1 : 1
      return (na - nb) * sign
    })
    return sorted
  }, [rows, employeeFilter, sortKey, sortDir, displayMode])

  const handleExportReport = async () => {
    if (displayRows.length === 0) {
      toast.error('Không có dữ liệu để xuất.')
      return
    }
    setExportingReport(true)
    try {
      const filterNote = employeeFilter.trim()
        ? `Danh sách đã lọc theo từ khoá: "${employeeFilter.trim()}"`
        : undefined
      await exportMonthlyKpiReport({
        period,
        tenantName: user?.tenant_id ? `Tenant ${user.tenant_id}` : '—',
        exportedBy: `${user?.full_name || ''} (${user?.username || ''})`.trim() || '—',
        filterNote,
        rows: displayRows.map((r) => ({
          full_name: r.full_name || '',
          username: r.username || '',
          territory: String(r.territory || '').trim() || '—',
          target_revenue_new: num(r.target_revenue_new),
          actual_revenue_new: num(r.actual_revenue_new),
          target_revenue_existing: num(r.target_revenue_existing),
          actual_revenue_existing: num(r.actual_revenue_existing),
          approach_target: Math.floor(num(r.approach_count)),
          approach_actual: Math.floor(num(r.actual_approach_count)),
          target_product_new: Math.floor(num(r.target_product_count_new)),
          actual_product_new: Math.floor(num(r.actual_product_count_new)),
          target_product_existing: Math.floor(num(r.target_product_count_existing)),
          actual_product_existing: Math.floor(num(r.actual_product_count_existing)),
        })),
      })
      toast.success('Đã tải file Excel.')
    } catch (e: unknown) {
      const err = e as { message?: string }
      toast.error(err?.message || 'Xuất báo cáo thất bại.')
    } finally {
      setExportingReport(false)
    }
  }

  const handleSave = async () => {
    if (!canEditTargets) return
    setSaving(true)
    try {
      await apiClient.put('/api/kpis', {
        period,
        items: rows.map((r) => ({
          user_id: r.employee_id,
          target_revenue_new: num(r.target_revenue_new),
          target_revenue_existing: num(r.target_revenue_existing),
          approach_count: Math.floor(num(r.approach_count)),
          target_product_count_new: Math.floor(num(r.target_product_count_new)),
          target_product_count_existing: Math.floor(num(r.target_product_count_existing)),
        })),
      })
      toast.success('Đã lưu chỉ tiêu KPI.')
      await load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } }
      toast.error(err.response?.data?.message || 'Lưu thất bại.')
    } finally {
      setSaving(false)
    }
  }

  if (!user || !canAccessKpiPage(user.role)) {
    return null
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary-100 rounded-lg">
                <Target className="w-7 h-7 text-primary-700" />
              </div>
              <div>
                  <h1 className="text-2xl font-bold text-gray-900">KPI tháng</h1>
                <p className="text-sm text-gray-600">
                  {assigner
                    ? showLockedBanner
                      ? 'Kỳ đã chốt (sau hạn ngày 5 tháng kế tiếp) — chỉ Admin chỉnh chỉ tiêu; thực tế không còn đồng bộ tự động.'
                      : isPastPeriod(period)
                        ? `Tháng cũ — chỉnh chỉ tiêu đến hết ngày ${confirmationDeadlineDdMmYyyy || '5 / tháng kế tiếp'} (giờ VN).`
                        : 'Giao chỉ tiêu: doanh thu VNĐ (tập mới / hiện hữu), tiếp cận theo lần.'
                    : 'Mục tiêu tháng: doanh thu (VNĐ), tiếp cận (lần).'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm font-medium text-gray-700">Kỳ</label>
              <input
                type="month"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500"
              />
              <div
                className="inline-flex items-center bg-gray-100 rounded-lg p-1"
                title="Đổi cách hiển thị kết quả thực hiện"
              >
                <button
                  type="button"
                  onClick={() => setDisplayMode('number')}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium transition ${
                    displayMode === 'number'
                      ? 'bg-white shadow text-primary-700'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Coins className="w-4 h-4" />
                  Số
                </button>
                <button
                  type="button"
                  onClick={() => setDisplayMode('percent')}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium transition ${
                    displayMode === 'percent'
                      ? 'bg-white shadow text-primary-700'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Percent className="w-4 h-4" />
                  %
                </button>
              </div>
              <button
                type="button"
                onClick={handleExportReport}
                disabled={loading || displayRows.length === 0 || exportingReport}
                className="inline-flex items-center gap-2 border border-gray-300 bg-white text-gray-800 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
              >
                {exportingReport ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                Xuất báo cáo
              </button>
              {canEditTargets && (
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || loading || rows.length === 0}
                  className="inline-flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary-700 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Lưu chỉ tiêu
                </button>
              )}
              {assigner && showLockedBanner && (
                <span
                  className="inline-flex items-center gap-1 text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-300 px-2.5 py-1.5 rounded-lg"
                  title="Hết hạn ngày 5 (VN) tháng kế sau kỳ. Chỉ Admin mới chỉnh chỉ tiêu."
                >
                  <Lock className="w-3.5 h-3.5" />
                  Kỳ đã chốt
                </span>
              )}
            </div>
          </div>

          {showDeadlineBanner && confirmationDeadlineDdMmYyyy && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
              <Target className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <strong>Hạn xác nhận kỳ {period}:</strong> đến hết ngày{' '}
                <strong>{confirmationDeadlineDdMmYyyy}</strong> (giờ Việt Nam). Trước hạn, chỉ tiêu có thể
                chỉnh sửa và số liệu thực tế vẫn đồng bộ từ deal/CBS. Sau hạn, kỳ được chốt để báo cáo quý/năm
                không thay đổi ngược.
              </div>
            </div>
          )}

          {showLockedBanner && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <Lock className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <strong>Kỳ {period} đã chốt</strong> (quá hạn ngày 5 tháng kế tiếp kỳ). Chỉ{' '}
                <strong>Admin</strong> được phép chỉnh chỉ tiêu. Thực tế (doanh thu, tiếp cận, sản phẩm) không còn
                cập nhật tự động — tổng hợp quý/năm từ các tháng đã chốt giữ nguyên.
              </div>
            </div>
          )}

          {/* Thanh filter / sort */}
          <div className="bg-white rounded-xl shadow border border-gray-200 p-3 mb-3 flex flex-col sm:flex-row gap-3 sm:items-center">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={employeeFilter}
                onChange={(e) => setEmployeeFilter(e.target.value)}
                placeholder="Tìm nhân viên theo tên, username, địa bàn..."
                className="w-full border border-gray-300 rounded-lg pl-9 pr-8 py-2 text-sm focus:ring-2 focus:ring-primary-500"
              />
              {employeeFilter && (
                <button
                  type="button"
                  onClick={() => setEmployeeFilter('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-700"
                  title="Xoá tìm kiếm"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="text-xs text-gray-500 flex items-center gap-2">
              <span>
                Hiển thị <strong className="text-gray-900">{displayRows.length}</strong>
                /{rows.length} nhân viên
              </span>
              {sortKey && (
                <button
                  type="button"
                  onClick={clearSort}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-700 border border-gray-300 bg-white hover:bg-gray-50 px-2 py-1 rounded-md"
                  title="Huỷ sắp xếp, về thứ tự mặc định"
                >
                  <X className="w-3 h-3" />
                  Huỷ sắp xếp
                </button>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-10 h-10 animate-spin text-primary-600" />
              </div>
            ) : rows.length === 0 ? (
              <p className="p-8 text-center text-gray-500">Không có dữ liệu Sales cho kỳ này.</p>
            ) : displayRows.length === 0 ? (
              <p className="p-8 text-center text-gray-500">
                Không có nhân viên khớp từ khoá{' '}
                <strong className="text-gray-800">&quot;{employeeFilter}&quot;</strong>.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full divide-y divide-gray-200 text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <SortableTh
                        align="left"
                        title="Nhân viên"
                        sortKey="name"
                        current={sortKey}
                        dir={sortDir}
                        onToggle={toggleSort}
                      />
                      <SortableTh
                        align="left"
                        title="Địa bàn"
                        sortKey="territory"
                        current={sortKey}
                        dir={sortDir}
                        onToggle={toggleSort}
                      />
                      <SortableTh
                        align="right"
                        title="DT — mới"
                        sub={
                          canEditTargets
                            ? `Chỉ tiêu / ${displayMode === 'percent' ? '% đạt' : 'Thực hiện'}`
                            : displayMode === 'percent' ? '% đạt chỉ tiêu' : '(VNĐ)'
                        }
                        sortKey="actual_new"
                        current={sortKey}
                        dir={sortDir}
                        onToggle={toggleSort}
                      />
                      <SortableTh
                        align="right"
                        title="DT — hiện hữu"
                        sub={
                          canEditTargets
                            ? `Chỉ tiêu / ${displayMode === 'percent' ? '% đạt' : 'Thực hiện'}`
                            : displayMode === 'percent' ? '% đạt chỉ tiêu' : '(VNĐ)'
                        }
                        sortKey="actual_existing"
                        current={sortKey}
                        dir={sortDir}
                        onToggle={toggleSort}
                      />
                      <SortableTh
                        align="right"
                        title="DT — tổng"
                        sub={displayMode === 'percent' ? '% đạt tổng' : '(VNĐ)'}
                        sortKey="actual_total"
                        current={sortKey}
                        dir={sortDir}
                        onToggle={toggleSort}
                        headerBg="bg-primary-50/60"
                        strong
                      />
                      <SortableTh
                        align="right"
                        title="Tiếp cận"
                        sub={
                          canEditTargets
                            ? `Mục tiêu / ${displayMode === 'percent' ? '% đạt' : 'Thực hiện'}`
                            : displayMode === 'percent' ? '% đạt mục tiêu' : '(lần)'
                        }
                        sortKey="actual_approach"
                        current={sortKey}
                        dir={sortDir}
                        onToggle={toggleSort}
                      />
                      <SortableTh
                        align="right"
                        title="SP — mới"
                        sub={
                          canEditTargets
                            ? `Chỉ tiêu / ${displayMode === 'percent' ? '% đạt' : 'Thực hiện'}`
                            : displayMode === 'percent' ? '% đạt chỉ tiêu' : '(SP)'
                        }
                        sortKey="actual_product_new"
                        current={sortKey}
                        dir={sortDir}
                        onToggle={toggleSort}
                      />
                      <SortableTh
                        align="right"
                        title="SP — hiện hữu"
                        sub={
                          canEditTargets
                            ? `Chỉ tiêu / ${displayMode === 'percent' ? '% đạt' : 'Thực hiện'}`
                            : displayMode === 'percent' ? '% đạt chỉ tiêu' : '(SP)'
                        }
                        sortKey="actual_product_existing"
                        current={sortKey}
                        dir={sortDir}
                        onToggle={toggleSort}
                      />
                      <SortableTh
                        align="right"
                        title="SP — tổng"
                        sub={displayMode === 'percent' ? '% đạt tổng' : '(SP)'}
                        sortKey="actual_product_total"
                        current={sortKey}
                        dir={sortDir}
                        onToggle={toggleSort}
                        headerBg="bg-primary-50/60"
                        strong
                      />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {displayRows.map((r) => {
                      const targetNew = num(r.target_revenue_new)
                      const targetExisting = num(r.target_revenue_existing)
                      const actualNew = num(r.actual_revenue_new)
                      const actualExisting = num(r.actual_revenue_existing)
                      const totalTarget = targetNew + targetExisting
                      const totalActual = actualNew + actualExisting
                      const productTargetNew = Math.floor(num(r.target_product_count_new))
                      const productTargetExisting = Math.floor(num(r.target_product_count_existing))
                      const productActualNew = Math.floor(num(r.actual_product_count_new))
                      const productActualExisting = Math.floor(num(r.actual_product_count_existing))
                      const productTargetTotal = productTargetNew + productTargetExisting
                      const productActualTotal = productActualNew + productActualExisting
                      return (
                      <tr key={r.employee_id} className="hover:bg-gray-50/80">
                        <td className="px-2 py-2 align-top">
                          <div className="flex items-start gap-1">
                            <div className="min-w-0 flex-1">
                              <div
                                className="font-medium text-gray-900 text-xs leading-tight truncate max-w-[10rem]"
                                title={r.full_name}
                              >
                                {r.full_name}
                              </div>
                              <div className="text-[10px] text-gray-500 truncate max-w-[10rem]">
                                @{r.username}
                              </div>
                            </div>
                            {canOpenCbsRevenue && (
                              <button
                                type="button"
                                onClick={() => {
                                  const qs = new URLSearchParams({
                                    period,
                                    seller: r.username || r.full_name || '',
                                    status: 'approved',
                                  }).toString()
                                  router.push(`/cbs-revenue?${qs}`)
                                }}
                                className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-md text-primary-600 hover:text-primary-700 hover:bg-primary-50 transition"
                                title={`Xem các đơn CBS đã duyệt của ${r.full_name} trong kỳ ${period} (nguồn tính KPI thực hiện)`}
                                aria-label="Mở đơn CBS đóng góp KPI"
                              >
                                <Wallet className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-2 align-top">
                          {r.territory && String(r.territory).trim() ? (
                            <span
                              className="inline-flex items-center rounded-full bg-primary-50 text-primary-700 border border-primary-200 px-1.5 py-0.5 text-[10px] font-medium max-w-[8rem] truncate"
                              title={String(r.territory).trim()}
                            >
                              {String(r.territory).trim()}
                            </span>
                          ) : (
                            <span className="text-[10px] text-gray-400 italic">Chưa gán</span>
                          )}
                        </td>
                        <MergedMoneyCell
                          canEdit={canEditTargets}
                          targetStr={String(r.target_revenue_new ?? '')}
                          onTargetChange={(v) => updateRow(r.employee_id, 'target_revenue_new', v)}
                          actual={actualNew}
                          target={targetNew}
                          mode={displayMode}
                        />
                        <MergedMoneyCell
                          canEdit={canEditTargets}
                          targetStr={String(r.target_revenue_existing ?? '')}
                          onTargetChange={(v) => updateRow(r.employee_id, 'target_revenue_existing', v)}
                          actual={actualExisting}
                          target={targetExisting}
                          mode={displayMode}
                        />
                        <td className="px-2 py-2 text-right align-top bg-primary-50/30">
                          <AchievementCell
                            actual={totalActual}
                            target={totalTarget}
                            mode={displayMode}
                            bold
                          />
                        </td>
                        <MergedCountCell
                          canEdit={canEditTargets}
                          target={r.approach_count}
                          onTargetChange={(v) => updateRow(r.employee_id, 'approach_count', v)}
                          actual={Math.floor(num(r.actual_approach_count))}
                          targetNum={Math.floor(num(r.approach_count))}
                          mode={displayMode}
                          unit="lần"
                        />
                        <MergedProductCell
                          canEdit={canEditTargets}
                          target={r.target_product_count_new}
                          onTargetChange={(v) => updateRow(r.employee_id, 'target_product_count_new', v)}
                          actual={productActualNew}
                          targetNum={productTargetNew}
                          mode={displayMode}
                          title="Số sản phẩm bán cho KH mới"
                        />
                        <MergedProductCell
                          canEdit={canEditTargets}
                          target={r.target_product_count_existing}
                          onTargetChange={(v) => updateRow(r.employee_id, 'target_product_count_existing', v)}
                          actual={productActualExisting}
                          targetNum={productTargetExisting}
                          mode={displayMode}
                          title="Số sản phẩm bán cho KH hiện hữu"
                        />
                        <td className="px-2 py-2 text-right align-top bg-primary-50/30">
                          <AchievementProductCell
                            actual={productActualTotal}
                            target={productTargetTotal}
                            mode={displayMode}
                            bold
                          />
                        </td>
                      </tr>
                    )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p className="mt-4 text-xs text-gray-500 space-y-1">
            <span className="block">
              <strong>Cách đọc ô:</strong> dòng trên là <em>chỉ tiêu</em> (có thể sửa nếu được phân
              quyền), dòng dưới là <em>thực hiện</em> (kèm % đạt). Cột <strong>tổng</strong> (tô
              nền) tính trên tổng chỉ tiêu + tổng thực hiện.
            </span>
            <span className="block">
              <strong>Đơn vị doanh thu:</strong> VNĐ — nhập số tiền trực tiếp, hệ thống tự định dạng (vd: 1.000.000 ₫).
            </span>
            <span className="block">
              <strong>Địa bàn:</strong> lấy từ hồ sơ nhân viên — giúp phân bổ chỉ tiêu theo khu vực.
            </span>
            <span className="block">
              <strong>Tiếp cận:</strong> lần (số nguyên không âm).
            </span>
            <span className="block">
              <strong>Sản phẩm đã bán:</strong> tách <em>mới</em> / <em>hiện hữu</em> theo phân loại
              khách hàng. Mỗi khách hàng tính là 1 sản phẩm, kể cả cùng mã bán cho nhiều khách (bán
              1 sản phẩm cho 5 khách = 5). Thực tế tổng hợp từ:
              (1) deal <strong>Thành công</strong> trong kỳ — tính theo <em>số lượng</em> nhập trên
              deal, mặc định = 1 nếu để trống, nhóm theo <em>kpi_customer_kind</em> của khách; và
              (2) mỗi đơn CBS đã duyệt (không gắn deal) = 1 sản phẩm, ưu tiên snapshot
              <em>kpi_kind_at_approve</em> tại thời điểm duyệt.
            </span>
            <span className="block">
              <strong>Hiển thị kết quả:</strong> chuyển giữa <em>Số</em> (VNĐ thực thu) và{' '}
              <em>%</em> (tỉ lệ đạt chỉ tiêu). Màu xanh ≥ 100%, vàng ≥ 70%, đỏ &lt; 70%.
            </span>
            <span className="block text-gray-400">
              Thực tế doanh thu (mới / hiện hữu) được đồng bộ tự động từ:
              <br />
              (1) Các deal <strong>Thành công</strong> (won) trong kỳ — phân nhóm theo loại khách NEW /
              hiện hữu trên hồ sơ khách hàng; và
              <br />
              Trong tháng có deal thắng hoặc CBS duyệt, hồ sơ khách vẫn là <em>NEW</em> cho tới hết tháng
              đó; từ <strong>tháng kế tiếp</strong> mới tự đổi <em>EXISTING</em>.
              <br />
              (2) Đơn CBS đã <strong>duyệt người bán</strong> — phân loại dựa vào{' '}
              <em>externalId1</em> trên đơn CBS: chỉ cần khớp <strong>một trong hai</strong> với
              khách hàng có trong CRM (mã số thuế <em>hoặc</em> số điện thoại — 9 số cuối, bỏ qua
              prefix "0" / "+84") là tính vào <em>tập hiện hữu</em>; không khớp → mặc định{' '}
              <em>tập mới</em>. Doanh thu CBS dùng giá trị hợp đồng{' '}
              <strong>trước thuế (làm tròn)</strong>.
              <br />
              <strong>Chốt kỳ:</strong> đến hết ngày 5 (giờ VN) của tháng sau kỳ đang xem, chỉ tiêu có thể sửa
              và thực tế vẫn đồng bộ; sau đó kỳ bị khóa — tổng quý/năm cộng các tháng đã chốt sẽ không đổi ngược
              do tính lại tự động.
            </span>
          </p>
        </div>
      </div>
    </ProtectedRoute>
  )
}

function AchievementCell({
  actual,
  target,
  mode,
  bold,
}: {
  actual: number
  target: number
  mode: DisplayMode
  bold?: boolean
}) {
  const tone = achievementTone(actual, target)
  const primary =
    mode === 'percent' ? formatPercent(actual, target) : formatVND(actual)
  const secondary =
    mode === 'percent'
      ? formatVND(actual)
      : target > 0
      ? formatPercent(actual, target)
      : 'Chưa có CT'
  return (
    <div className="flex flex-col items-end leading-tight">
      <span
        className={`tabular-nums text-xs ${
          bold ? 'font-bold' : 'font-semibold'
        } ${tone}`}
      >
        {primary}
      </span>
      <span className="text-[10px] text-gray-400 tabular-nums mt-0.5">
        {secondary}
      </span>
    </div>
  )
}

/**
 * Ô gộp "Chỉ tiêu + Thực hiện" cho cột tiền (VNĐ).
 * - Khi canEdit: input target ở trên, achievement (actual/%) ở dưới.
 * - Khi read-only: chỉ hiện target + actual (2 dòng).
 * Dùng cho DT-mới, DT-hiện hữu.
 */
function MergedMoneyCell({
  canEdit,
  targetStr,
  onTargetChange,
  actual,
  target,
  mode,
}: {
  canEdit: boolean
  targetStr: string
  onTargetChange: (v: string) => void
  actual: number
  target: number
  mode: DisplayMode
}) {
  return (
    <td className="px-2 py-2 text-right align-top">
      {canEdit ? (
        <div className="relative ml-auto w-32">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={formatThousandsVN(targetStr)}
            title="Chỉ tiêu (VNĐ)"
            onChange={(e) => onTargetChange(digitsOnly(e.target.value))}
            className="w-full border border-gray-300 rounded-md pl-1.5 pr-6 py-1 text-xs text-right tabular-nums"
          />
          <span className="pointer-events-none absolute inset-y-0 right-1.5 flex items-center text-[10px] text-gray-400">
            ₫
          </span>
        </div>
      ) : (
        <div className="text-[11px] font-medium text-gray-900 tabular-nums mb-0.5">
          {formatVND(target)}
        </div>
      )}
      <div className="mt-1">
        <AchievementCell actual={actual} target={target} mode={mode} />
      </div>
    </td>
  )
}

/** Ô gộp "Mục tiêu + Thực hiện" cho cột số lần tiếp cận. */
function MergedCountCell({
  canEdit,
  target,
  onTargetChange,
  actual,
  targetNum,
  mode,
  unit,
}: {
  canEdit: boolean
  target: string | number | null
  onTargetChange: (v: string) => void
  actual: number
  targetNum: number
  mode: DisplayMode
  unit: string
}) {
  return (
    <td className="px-2 py-2 text-right align-top">
      {canEdit ? (
        <input
          type="number"
          min={0}
          step={1}
          value={target ?? ''}
          onChange={(e) => onTargetChange(e.target.value)}
          title={`Mục tiêu (${unit})`}
          className="w-16 ml-auto border border-gray-300 rounded-md px-1.5 py-1 text-xs text-right tabular-nums block"
        />
      ) : (
        <div className="text-[11px] font-medium text-gray-900 tabular-nums mb-0.5">
          {targetNum} <span className="text-gray-500 font-normal">{unit}</span>
        </div>
      )}
      <div className="mt-1">
        <AchievementCountCell actual={actual} target={targetNum} mode={mode} />
      </div>
    </td>
  )
}

/** Ô gộp "Chỉ tiêu + Thực hiện" cho cột số sản phẩm (SP). */
function MergedProductCell({
  canEdit,
  target,
  onTargetChange,
  actual,
  targetNum,
  mode,
  title,
}: {
  canEdit: boolean
  target: string | number | null
  onTargetChange: (v: string) => void
  actual: number
  targetNum: number
  mode: DisplayMode
  title: string
}) {
  return (
    <td className="px-2 py-2 text-right align-top">
      {canEdit ? (
        <input
          type="number"
          min={0}
          step={1}
          value={target ?? ''}
          onChange={(e) => onTargetChange(e.target.value)}
          title={title}
          className="w-16 ml-auto border border-gray-300 rounded-md px-1.5 py-1 text-xs text-right tabular-nums block"
        />
      ) : (
        <div className="text-[11px] font-medium text-gray-900 tabular-nums mb-0.5">
          {targetNum} <span className="text-gray-500 font-normal">SP</span>
        </div>
      )}
      <div className="mt-1">
        <AchievementProductCell actual={actual} target={targetNum} mode={mode} />
      </div>
    </td>
  )
}

function SortableTh({
  title,
  sub,
  sortKey,
  current,
  dir,
  onToggle,
  align = 'left',
  headerBg,
  strong,
}: {
  title: string
  sub?: string
  sortKey: SortKey
  current: SortKey | null
  dir: SortDir
  onToggle: (k: SortKey) => void
  align?: 'left' | 'right' | 'center'
  headerBg?: string
  strong?: boolean
}) {
  const active = current === sortKey
  const alignCls = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
  const icon = active ? (
    dir === 'asc' ? (
      <ArrowUp className="w-3 h-3" />
    ) : (
      <ArrowDown className="w-3 h-3" />
    )
  ) : (
    <ArrowUpDown className="w-3 h-3 opacity-40" />
  )
  return (
    <th
      className={`px-2 py-2 text-[11px] font-semibold ${
        strong ? 'text-gray-700' : 'text-gray-600'
      } ${headerBg || ''} ${alignCls}`}
    >
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        className={`inline-flex items-center gap-1 hover:text-primary-700 transition select-none ${
          align === 'right' ? 'flex-row-reverse ml-auto' : ''
        } ${active ? 'text-primary-700' : ''}`}
        title={`Sắp xếp theo "${title}"`}
      >
        {icon}
        <span className="flex flex-col leading-tight">
          <span className="uppercase whitespace-nowrap">{title}</span>
          {sub && (
            <span className="normal-case font-normal text-gray-500 mt-0.5 text-[9px] whitespace-nowrap">
              {sub}
            </span>
          )}
        </span>
      </button>
    </th>
  )
}

function AchievementCountCell({
  actual,
  target,
  mode,
}: {
  actual: number
  target: number
  mode: DisplayMode
}) {
  const tone = achievementTone(actual, target)
  const primary = mode === 'percent' ? formatPercent(actual, target) : formatCount(actual)
  const secondary =
    mode === 'percent'
      ? formatCount(actual)
      : target > 0
      ? formatPercent(actual, target)
      : 'Chưa có MT'
  return (
    <div className="flex flex-col items-end leading-tight">
      <span className={`tabular-nums text-xs font-semibold ${tone}`}>{primary}</span>
      <span className="text-[10px] text-gray-400 tabular-nums mt-0.5">{secondary}</span>
    </div>
  )
}

function AchievementProductCell({
  actual,
  target,
  mode,
  bold,
}: {
  actual: number
  target: number
  mode: DisplayMode
  bold?: boolean
}) {
  const tone = achievementTone(actual, target)
  const primary =
    mode === 'percent'
      ? formatPercent(actual, target)
      : `${Math.max(0, Math.floor(actual)).toLocaleString('vi-VN')} SP`
  const secondary =
    mode === 'percent'
      ? `${Math.max(0, Math.floor(actual)).toLocaleString('vi-VN')} SP`
      : target > 0
      ? formatPercent(actual, target)
      : 'Chưa có CT'
  return (
    <div className="flex flex-col items-end leading-tight">
      <span
        className={`tabular-nums text-xs inline-flex items-center gap-0.5 ${
          bold ? 'font-bold' : 'font-semibold'
        } ${tone}`}
      >
        <Package className="w-3 h-3 opacity-60" />
        {primary}
      </span>
      <span className="text-[10px] text-gray-400 tabular-nums mt-0.5">{secondary}</span>
    </div>
  )
}
