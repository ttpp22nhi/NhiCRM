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
  X,
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
  department_id?: string | null
  department_name?: string | null
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
  const [departmentFilter, setDepartmentFilter] = useState('')
  const [departments, setDepartments] = useState<{ id: string; name: string; parent_id: string | null; type: string }[]>([])
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

  useEffect(() => {
    apiClient
      .get<{ success: boolean; data: { id: string; name: string; parent_id: string | null; type: string }[] }>('/api/departments/flat')
      .then((res) => {
        if (res.data.success) setDepartments(res.data.data || [])
      })
      .catch(() => {})
  }, [])

  const updateRow = (employeeId: string, field: keyof KpiRow, value: string) => {
    setRows((prev) =>
      prev.map((r) => (r.employee_id === employeeId ? { ...r, [field]: value } : r))
    )
  }

  // Build set of department IDs including children for tree filter
  const filteredDeptIds = useMemo(() => {
    if (!departmentFilter) return null
    if (departmentFilter === '__unassigned__') return '__unassigned__'
    const ids = new Set<string>()
    const collect = (parentId: string) => {
      ids.add(parentId)
      for (const d of departments) {
        if (d.parent_id === parentId) collect(d.id)
      }
    }
    collect(departmentFilter)
    return ids
  }, [departmentFilter, departments])

  const displayRows = useMemo(() => {
    const nFilter = normalizeVN(employeeFilter)
    let list = rows

    // Department tree filter
    if (filteredDeptIds === '__unassigned__') {
      list = list.filter((r) => !r.department_id)
    } else if (filteredDeptIds) {
      list = list.filter((r) => r.department_id && filteredDeptIds.has(r.department_id))
    }

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
  }, [rows, employeeFilter, filteredDeptIds, sortKey, sortDir, displayMode])

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
          department_name: r.department_name || '',
          target_revenue_new: num(r.target_revenue_new),
          actual_revenue_new: num(r.actual_revenue_new),
          target_revenue_existing: num(r.target_revenue_existing),
          actual_revenue_existing: num(r.actual_revenue_existing),
          approach_target: Math.floor(num(r.approach_count)),
          approach_actual: Math.floor(num(r.actual_approach_count)),
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
                <strong>Admin</strong> được phép chỉnh chỉ tiêu. Thực tế (doanh thu, tiếp cận) không còn
                cập nhật tự động — tổng hợp quý/năm từ các tháng đã chốt giữ nguyên.
              </div>
            </div>
          )}

          {/* Thanh filter / sort */}
          <div className="bg-white rounded-xl shadow border border-gray-200 p-3 mb-3 flex flex-col sm:flex-row gap-3 sm:items-center">
            <div className="relative flex-1 min-w-0">
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
            {departments.length > 0 && (
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 min-w-[200px]"
                title="Lọc theo phòng/tổ"
              >
                <option value="">Tất cả phòng/tổ</option>
                <option value="__unassigned__">Chưa gán phòng/tổ</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.type === 'team' ? `└ ${d.name}` : d.name}
                  </option>
                ))}
              </select>
            )}
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
                <table className="w-full divide-y divide-gray-200 text-sm border-collapse">
                  <thead className="sticky top-0 z-10">
                    {/* Group header row */}
                    <tr className="bg-gray-100 border-b border-gray-300">
                      <th
                        rowSpan={2}
                        className="px-3 py-2 text-left text-xs font-semibold text-gray-700 align-middle border-r border-gray-200 cursor-pointer hover:text-primary-700 select-none"
                        onClick={() => toggleSort('name')}
                        title="Sắp xếp theo tên"
                      >
                        <span className="inline-flex items-center gap-1">
                          Nhân viên
                          {sortKey === 'name' && (sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                        </span>
                      </th>
                      <th
                        rowSpan={2}
                        className="px-3 py-2 text-left text-xs font-semibold text-gray-700 align-middle border-r border-gray-200 cursor-pointer hover:text-primary-700 select-none"
                        onClick={() => toggleSort('territory')}
                        title="Sắp xếp theo địa bàn"
                      >
                        <span className="inline-flex items-center gap-1">
                          Địa bàn
                          {sortKey === 'territory' && (sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                        </span>
                      </th>
                      <th
                        colSpan={2}
                        className="px-3 py-2 text-center text-xs font-semibold text-gray-700 border-r border-gray-200 cursor-pointer hover:text-primary-700 select-none"
                        onClick={() => toggleSort('actual_new')}
                        title="Sắp xếp theo DT mới"
                      >
                        <span className="inline-flex items-center gap-1 justify-center">
                          Doanh thu — KH mới
                          {sortKey === 'actual_new' && (sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                        </span>
                      </th>
                      <th
                        colSpan={2}
                        className="px-3 py-2 text-center text-xs font-semibold text-gray-700 border-r border-gray-200 cursor-pointer hover:text-primary-700 select-none"
                        onClick={() => toggleSort('actual_existing')}
                        title="Sắp xếp theo DT hiện hữu"
                      >
                        <span className="inline-flex items-center gap-1 justify-center">
                          Doanh thu — KH hiện hữu
                          {sortKey === 'actual_existing' && (sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                        </span>
                      </th>
                      <th
                        colSpan={2}
                        className="px-3 py-2 text-center text-xs font-bold text-primary-700 bg-primary-50/60 border-r border-gray-200 cursor-pointer hover:text-primary-800 select-none"
                        onClick={() => toggleSort('actual_total')}
                        title="Sắp xếp theo DT tổng"
                      >
                        <span className="inline-flex items-center gap-1 justify-center">
                          Doanh thu — Tổng
                          {sortKey === 'actual_total' && (sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                        </span>
                      </th>
                      <th
                        colSpan={2}
                        className="px-3 py-2 text-center text-xs font-semibold text-gray-700 cursor-pointer hover:text-primary-700 select-none"
                        onClick={() => toggleSort('actual_approach')}
                        title="Sắp xếp theo tiếp cận"
                      >
                        <span className="inline-flex items-center gap-1 justify-center">
                          Tiếp cận
                          {sortKey === 'actual_approach' && (sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                        </span>
                      </th>
                    </tr>
                    {/* Sub-column header row */}
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-2 py-1.5 text-right text-[11px] font-medium text-gray-500 border-r border-gray-100">
                        Chỉ tiêu
                      </th>
                      <th className="px-2 py-1.5 text-right text-[11px] font-medium text-gray-500 border-r border-gray-200">
                        Thực hiện
                      </th>
                      <th className="px-2 py-1.5 text-right text-[11px] font-medium text-gray-500 border-r border-gray-100">
                        Chỉ tiêu
                      </th>
                      <th className="px-2 py-1.5 text-right text-[11px] font-medium text-gray-500 border-r border-gray-200">
                        Thực hiện
                      </th>
                      <th className="px-2 py-1.5 text-right text-[11px] font-medium text-primary-600 bg-primary-50/40 border-r border-gray-100">
                        Chỉ tiêu
                      </th>
                      <th className="px-2 py-1.5 text-right text-[11px] font-medium text-primary-600 bg-primary-50/40 border-r border-gray-200">
                        Thực hiện
                      </th>
                      <th className="px-2 py-1.5 text-right text-[11px] font-medium text-gray-500 border-r border-gray-100">
                        Mục tiêu
                      </th>
                      <th className="px-2 py-1.5 text-right text-[11px] font-medium text-gray-500">
                        Thực hiện
                      </th>
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
                      const approachTarget = Math.floor(num(r.approach_count))
                      const approachActual = Math.floor(num(r.actual_approach_count))
                      return (
                      <tr key={r.employee_id} className="hover:bg-gray-50/80 transition-colors">
                        <td className="px-3 py-1.5 align-middle border-r border-gray-100">
                          <div className="flex items-center gap-2">
                            <div className="min-w-0 flex-1">
                              <div
                                className="font-semibold text-gray-900 text-sm leading-snug truncate max-w-[14rem]"
                                title={r.full_name}
                              >
                                {r.full_name}
                              </div>
                              <div className="text-xs text-gray-500 truncate max-w-[14rem]">
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
                                className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-md text-primary-600 hover:text-primary-700 hover:bg-primary-100 transition"
                                title={`Xem các đơn CBS đã duyệt của ${r.full_name} trong kỳ ${period}`}
                                aria-label="Mở đơn CBS đóng góp KPI"
                              >
                                <Wallet className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-1.5 align-middle border-r border-gray-100">
                          {r.territory && String(r.territory).trim() ? (
                            <span
                              className="inline-flex items-center rounded-full bg-primary-50 text-primary-700 border border-primary-200 px-2 py-0.5 text-xs font-medium max-w-[10rem] truncate"
                              title={String(r.territory).trim()}
                            >
                              {String(r.territory).trim()}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400 italic">Chưa gán</span>
                          )}
                        </td>
                        {/* DT mới — Chỉ tiêu */}
                        <td className="px-3 py-1.5 text-right align-middle border-r border-gray-50">
                          {canEditTargets ? (
                            <div className="relative ml-auto w-32">
                              <input
                                type="text"
                                inputMode="numeric"
                                autoComplete="off"
                                value={formatThousandsVN(String(r.target_revenue_new ?? ''))}
                                title="Chỉ tiêu DT mới (VNĐ)"
                                onChange={(e) => updateRow(r.employee_id, 'target_revenue_new', digitsOnly(e.target.value))}
                                className="w-full border border-gray-300 rounded-lg pl-2 pr-6 py-1.5 text-sm text-right tabular-nums focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                              />
                              <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-gray-400">₫</span>
                            </div>
                          ) : (
                            <span className="text-sm font-medium text-gray-900 tabular-nums">{formatVND(targetNew)}</span>
                          )}
                        </td>
                        {/* DT mới — Thực hiện */}
                        <td className="px-3 py-1.5 text-right align-middle border-r border-gray-200">
                          <AchievementCell actual={actualNew} target={targetNew} mode={displayMode} />
                        </td>
                        {/* DT hiện hữu — Chỉ tiêu */}
                        <td className="px-3 py-1.5 text-right align-middle border-r border-gray-50">
                          {canEditTargets ? (
                            <div className="relative ml-auto w-32">
                              <input
                                type="text"
                                inputMode="numeric"
                                autoComplete="off"
                                value={formatThousandsVN(String(r.target_revenue_existing ?? ''))}
                                title="Chỉ tiêu DT hiện hữu (VNĐ)"
                                onChange={(e) => updateRow(r.employee_id, 'target_revenue_existing', digitsOnly(e.target.value))}
                                className="w-full border border-gray-300 rounded-lg pl-2 pr-6 py-1.5 text-sm text-right tabular-nums focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                              />
                              <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-gray-400">₫</span>
                            </div>
                          ) : (
                            <span className="text-sm font-medium text-gray-900 tabular-nums">{formatVND(targetExisting)}</span>
                          )}
                        </td>
                        {/* DT hiện hữu — Thực hiện */}
                        <td className="px-3 py-1.5 text-right align-middle border-r border-gray-200">
                          <AchievementCell actual={actualExisting} target={targetExisting} mode={displayMode} />
                        </td>
                        {/* DT tổng — Chỉ tiêu */}
                        <td className="px-3 py-1.5 text-right align-middle bg-primary-50/20 border-r border-gray-50">
                          <span className="text-sm font-bold text-gray-900 tabular-nums">{formatVND(totalTarget)}</span>
                        </td>
                        {/* DT tổng — Thực hiện */}
                        <td className="px-3 py-1.5 text-right align-middle bg-primary-50/20 border-r border-gray-200">
                          <AchievementCell actual={totalActual} target={totalTarget} mode={displayMode} bold />
                        </td>
                        {/* Tiếp cận — Mục tiêu */}
                        <td className="px-3 py-1.5 text-right align-middle border-r border-gray-50">
                          {canEditTargets ? (
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={r.approach_count ?? ''}
                              onChange={(e) => updateRow(r.employee_id, 'approach_count', e.target.value)}
                              title="Mục tiêu tiếp cận (lần)"
                              className="w-20 ml-auto border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right tabular-nums block focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                            />
                          ) : (
                            <span className="text-sm font-medium text-gray-900 tabular-nums">
                              {approachTarget} <span className="text-gray-400 font-normal text-xs">lần</span>
                            </span>
                          )}
                        </td>
                        {/* Tiếp cận — Thực hiện */}
                        <td className="px-3 py-1.5 text-right align-middle">
                          <AchievementCountCell actual={approachActual} target={approachTarget} mode={displayMode} />
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
              <strong>Tiếp cận:</strong> lần — mỗi deal tạo trong kỳ; cộng thêm mỗi khách có CBS
              đã duyệt trong kỳ nếu <em>chưa</em> trùng khách trên deal (theo mã KH, MST, SĐT
              hoặc tên DN).
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

