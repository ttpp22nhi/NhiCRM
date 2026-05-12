'use client'

import { useEffect, useState, useCallback, useMemo, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { Navbar } from '@/components/Navbar'
import { apiClient } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import {
  canAccessCbsRevenue,
  canSyncCbsRevenue,
  canManageCbsConfig,
} from '@/lib/rbac'
import {
  Loader2,
  Wallet,
  RefreshCcw,
  Settings,
  CheckCircle2,
  Circle,
  XCircle,
  Search,
  Eye,
  ShieldCheck,
  Clock,
  Calculator,
  FilterX,
  Info,
  Download,
} from 'lucide-react'
import { saveAs } from 'file-saver'
import toast from 'react-hot-toast'
import { CbsConfigModal } from '@/components/CbsConfigModal'
import { CbsOrderDetailModal, CbsOrderDetail } from '@/components/CbsOrderDetailModal'

interface CbsOrder extends CbsOrderDetail {
  claimed_by_username?: string | null
  claimed_by_territory?: string | null
  claimed_by_role?: string | null
}

interface ListResp {
  success: boolean
  period: string
  data: CbsOrder[]
  summary: {
    total: number
    total_vat: number
    total_not_vat: number
    claimed: number
    unclaimed: number
    mine: number
    pending: number
  }
  last_sync: {
    last_synced_at: number | null
    last_sync_status: string | null
    last_sync_message: string | null
  } | null
  last_sync_batch?: {
    period_ym: string | null
    received: number
    inserted: number
    updated: number
  } | null
}

interface SalesEmployee {
  employee_id: string
  username: string
  full_name: string
  role?: string
  is_active?: boolean
}

function defaultPeriod(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function formatVND(n: number | string | null | undefined): string {
  const x = Number(n ?? 0)
  if (Number.isNaN(x)) return '—'
  try {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
      maximumFractionDigits: 0,
    }).format(x)
  } catch {
    return `${x.toLocaleString('vi-VN')} ₫`
  }
}

function formatDateVN(ms: string | number | null | undefined): string {
  if (ms == null || ms === '') return '—'
  const n = Number(ms)
  if (!Number.isFinite(n)) return '—'
  const d = new Date(n)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`
}

function normalizeVN(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .trim()
}

function toDayMs(ms: string | number | null | undefined): number | null {
  if (ms == null || ms === '') return null
  const n = Number(ms)
  if (!Number.isFinite(n)) return null
  const d = new Date(n)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function dateInputToMs(v: string, endOfDay = false): number | null {
  if (!v) return null
  const [y, m, day] = v.split('-').map((x) => parseInt(x, 10))
  if (!y || !m || !day) return null
  const d = new Date(y, m - 1, day)
  if (endOfDay) d.setHours(23, 59, 59, 999)
  else d.setHours(0, 0, 0, 0)
  return d.getTime()
}

type OwnerFilter = 'all' | 'mine' | 'unclaimed' | 'others' | 'pending'

type SellerStatusFilter = 'all' | 'unclaimed' | 'pending' | 'approved'

interface ColumnFilters {
  dateFrom: string // yyyy-mm-dd
  dateTo: string
  customer: string
  product: string
  contract: string
  cbsStaff: string
  priceMin: string
  priceMax: string
  seller: string
  sellerStatus: SellerStatusFilter
}

const EMPTY_COL_FILTERS: ColumnFilters = {
  dateFrom: '',
  dateTo: '',
  customer: '',
  product: '',
  contract: '',
  cbsStaff: '',
  priceMin: '',
  priceMax: '',
  seller: '',
  sellerStatus: 'all',
}

function CbsRevenuePageContent() {
  const { user } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const canAccess = canAccessCbsRevenue(user?.role)
  const canSync = canSyncCbsRevenue(user?.role)
  const canManage = canManageCbsConfig(user?.role)
  const role = String(user?.role || '').toLowerCase()
  const canAssignSeller = role !== 'sales' // admin/director/manager/leader

  // Prefill từ URL query (dùng cho deep-link từ KPI tháng):
  //   ?period=YYYY-MM & seller=<username|full_name> & status=approved|pending|unclaimed
  const initialPeriod = (() => {
    const p = searchParams?.get('period') || ''
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(p) ? p : defaultPeriod()
  })()
  const initialSeller = searchParams?.get('seller') || ''
  const initialStatusParam = String(searchParams?.get('status') || '').toLowerCase()
  const initialStatus: SellerStatusFilter = (
    ['all', 'unclaimed', 'pending', 'approved'].includes(initialStatusParam)
      ? (initialStatusParam as SellerStatusFilter)
      : 'all'
  )
  const hasDeepLink = Boolean(initialSeller) || initialStatusParam === 'approved'

  const [period, setPeriod] = useState(initialPeriod)
  const [owner, setOwner] = useState<OwnerFilter>('all')
  const [q, setQ] = useState('')
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({
    ...EMPTY_COL_FILTERS,
    seller: initialSeller,
    sellerStatus: initialStatus,
  })
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [recomputing, setRecomputing] = useState(false)
  const [resp, setResp] = useState<ListResp | null>(null)
  const [configOpen, setConfigOpen] = useState(false)
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())
  const [salesList, setSalesList] = useState<SalesEmployee[]>([])
  const [detailOrder, setDetailOrder] = useState<CbsOrder | null>(null)

  const load = useCallback(async () => {
    if (!canAccess) return
    setLoading(true)
    try {
      const res = await apiClient.get<ListResp>('/api/cbs/revenue', {
        params: { period, owner, q: q.trim() || undefined },
      })
      setResp(res.data)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } }
      toast.error(err.response?.data?.message || 'Không tải được doanh thu CBS.')
    } finally {
      setLoading(false)
    }
  }, [canAccess, period, owner, q])

  // Danh sách Sales để non-sales chọn người bán
  const loadSalesList = useCallback(async () => {
    if (!canAssignSeller) return
    try {
      const res = await apiClient.get<{ success: boolean; data: SalesEmployee[] }>(
        '/api/employees/sales'
      )
      setSalesList(res.data.data || [])
    } catch {
      // Không chặn luồng chính nếu không lấy được danh sách
      setSalesList([])
    }
  }, [canAssignSeller])

  useEffect(() => {
    if (user && !canAccess) router.replace('/dashboard')
  }, [user, canAccess, router])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    loadSalesList()
  }, [loadSalesList])

  const sellerOptions = useMemo(
    () =>
      salesList
        .filter((s) => s.is_active !== false)
        .map((s) => ({
          id: s.employee_id,
          label: `${s.full_name} (${s.username})`,
        })),
    [salesList]
  )

  const filteredData = useMemo(() => {
    const rows = resp?.data || []
    const f = columnFilters
    const fromMs = dateInputToMs(f.dateFrom, false)
    const toMs = dateInputToMs(f.dateTo, true)
    const minPrice = f.priceMin ? Number(f.priceMin.replace(/[^\d.-]/g, '')) : null
    const maxPrice = f.priceMax ? Number(f.priceMax.replace(/[^\d.-]/g, '')) : null
    const nCustomer = normalizeVN(f.customer)
    const nProduct = normalizeVN(f.product)
    const nContract = normalizeVN(f.contract)
    const nCbsStaff = normalizeVN(f.cbsStaff)
    const nSeller = normalizeVN(f.seller)

    return rows.filter((o) => {
      // Ngày kích hoạt
      if (fromMs != null || toMs != null) {
        const dayMs = toDayMs(o.active_date)
        if (dayMs == null) return false
        if (fromMs != null && dayMs < fromMs) return false
        if (toMs != null && dayMs > toMs) return false
      }

      if (nCustomer) {
        const hay = normalizeVN(
          `${o.customer_name || ''} ${o.customer_type || ''} ${o.external_id1 || ''}`
        )
        if (!hay.includes(nCustomer)) return false
      }
      if (nProduct) {
        const hay = normalizeVN(`${o.product_name || ''} ${o.product_code || ''} ${o.masp || ''}`)
        if (!hay.includes(nProduct)) return false
      }
      if (nContract) {
        const hay = normalizeVN(`${o.contract_no || ''} ${o.contract_type || ''}`)
        if (!hay.includes(nContract)) return false
      }
      if (nCbsStaff) {
        const hay = normalizeVN(`${o.cbs_staff || ''} ${o.partner || ''}`)
        if (!hay.includes(nCbsStaff)) return false
      }

      if (minPrice != null && Number.isFinite(minPrice)) {
        if (Number(o.price_vat || 0) < minPrice) return false
      }
      if (maxPrice != null && Number.isFinite(maxPrice)) {
        if (Number(o.price_vat || 0) > maxPrice) return false
      }

      if (nSeller) {
        const hay = normalizeVN(
          `${o.claimed_by_name || ''} ${o.claimed_by_username || ''} ${o.claimed_by_territory || ''}`
        )
        if (!hay.includes(nSeller)) return false
      }

      if (f.sellerStatus !== 'all') {
        if (f.sellerStatus === 'unclaimed') {
          if (o.claimed_by) return false
        } else if (f.sellerStatus === 'pending') {
          if (o.claim_status !== 'pending') return false
        } else if (f.sellerStatus === 'approved') {
          if (o.claim_status !== 'approved') return false
        }
      }

      return true
    })
  }, [resp, columnFilters])

  const hasActiveColumnFilter = useMemo(() => {
    const f = columnFilters
    return !!(
      f.dateFrom ||
      f.dateTo ||
      f.customer ||
      f.product ||
      f.contract ||
      f.cbsStaff ||
      f.priceMin ||
      f.priceMax ||
      f.seller ||
      f.sellerStatus !== 'all'
    )
  }, [columnFilters])

  const updateFilter = <K extends keyof ColumnFilters>(key: K, value: ColumnFilters[K]) => {
    setColumnFilters((prev) => ({ ...prev, [key]: value }))
  }
  const clearColumnFilters = () => setColumnFilters(EMPTY_COL_FILTERS)

  const setBusy = (id: string, on: boolean) => {
    setBusyIds((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  // Sales tự tích đơn của mình (pending)
  const claimSelf = async (id: string) => {
    setBusy(id, true)
    try {
      const r = await apiClient.post<{ success: boolean; message?: string }>(
        `/api/cbs/revenue/${id}/claim`
      )
      toast.success(r.data.message || 'Đã gửi yêu cầu, chờ duyệt.')
      await load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } }
      toast.error(err.response?.data?.message || 'Không thể tích đơn.')
    } finally {
      setBusy(id, false)
    }
  }

  // Non-sales gán người bán (tự động duyệt)
  const assignSeller = async (id: string, sellerId: string) => {
    setBusy(id, true)
    try {
      const r = await apiClient.post<{ success: boolean; message?: string }>(
        `/api/cbs/revenue/${id}/claim`,
        { seller_id: sellerId }
      )
      toast.success(r.data.message || 'Đã gán người bán.')
      await load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } }
      toast.error(err.response?.data?.message || 'Không thể gán người bán.')
    } finally {
      setBusy(id, false)
    }
  }

  // Non-sales duyệt pending claim
  const approve = async (id: string) => {
    setBusy(id, true)
    try {
      const r = await apiClient.post<{ success: boolean; message?: string }>(
        `/api/cbs/revenue/${id}/approve`
      )
      toast.success(r.data.message || 'Đã duyệt đơn hàng.')
      await load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } }
      toast.error(err.response?.data?.message || 'Không thể duyệt đơn.')
    } finally {
      setBusy(id, false)
    }
  }

  const unclaim = async (id: string) => {
    setBusy(id, true)
    try {
      await apiClient.post(`/api/cbs/revenue/${id}/unclaim`)
      toast.success('Đã gỡ người bán.')
      await load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } }
      toast.error(err.response?.data?.message || 'Không thể gỡ.')
    } finally {
      setBusy(id, false)
    }
  }

  const recomputeKpi = async () => {
    if (!canAssignSeller) return
    const confirmed = window.confirm(
      'Tính lại KPI sẽ ghi đè toàn bộ chỉ tiêu Thực hiện (actual) của mọi nhân viên dựa trên đơn CBS đã duyệt hiện tại.\n\nBạn có chắc chắn muốn tiếp tục?'
    )
    if (!confirmed) return
    setRecomputing(true)
    try {
      const r = await apiClient.post<{ success: boolean; message: string }>(
        '/api/cbs/revenue/recompute-kpi'
      )
      toast.success(r.data.message || 'Đã tính lại KPI.')
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } }
      toast.error(err.response?.data?.message || 'Không thể tính lại KPI.')
    } finally {
      setRecomputing(false)
    }
  }

  const syncNow = async () => {
    if (!canSync) return
    setSyncing(true)
    try {
      const r = await apiClient.post<{ success: boolean; message: string }>(
        '/api/cbs/sync',
        { period }
      )
      toast.success(r.data.message || 'Đồng bộ CBS thành công.')
      await load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } }
      toast.error(err.response?.data?.message || 'Đồng bộ CBS thất bại.')
    } finally {
      setSyncing(false)
    }
  }

  const exportExcel = async () => {
    const data = filteredData
    if (!data || data.length === 0) {
      toast.error('Không có dữ liệu để xuất Excel.')
      return
    }

    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet(`Doanh thu CBS ${period}`)

    const columns = [
      { header: 'STT', key: 'stt', width: 6 },
      { header: 'Ngày kích hoạt', key: 'active_date', width: 18 },
      { header: 'Khách hàng', key: 'customer_name', width: 30 },
      { header: 'Hợp đồng', key: 'contract_no', width: 18 },
      { header: 'Serial', key: 'serial', width: 15 },
      { header: 'Sản phẩm', key: 'product_name', width: 30 },
      { header: 'Giá (VAT)', key: 'price_vat', width: 15 },
      { header: 'Giá (chưa VAT)', key: 'price_not_vat_round', width: 15 },
      { header: 'VAT', key: 'vat', width: 12 },
      { header: 'NV CBS', key: 'cbs_staff', width: 20 },
      { header: 'Đối tác', key: 'partner', width: 20 },
      { header: 'Người bán', key: 'claimed_by_name', width: 22 },
      { header: 'Trạng thái', key: 'claim_status', width: 14 },
      { header: 'Người duyệt', key: 'approved_by_name', width: 22 },
      { header: 'Ngày thanh toán', key: 'payment_date', width: 18 },
      { header: 'Loại KH', key: 'customer_type', width: 12 },
      { header: 'Mã KH (CBS)', key: 'external_id1', width: 15 },
      { header: 'Mã SP chính', key: 'primary_product_code', width: 15 },
      { header: 'Mã SP', key: 'masp', width: 12 },
      { header: 'Loại HĐ', key: 'contract_type', width: 12 },
    ]
    ws.columns = columns

    data.forEach((o, idx) => {
      ws.addRow({
        stt: idx + 1,
        active_date: formatDateVN(o.active_date),
        customer_name: o.customer_name || '',
        contract_no: o.contract_no || '',
        serial: o.serial || '',
        product_name: o.product_name || '',
        price_vat: Number(o.price_vat) || 0,
        price_not_vat_round: Number(o.price_not_vat_round) || 0,
        vat: Number(o.vat) || 0,
        cbs_staff: o.cbs_staff || '',
        partner: o.partner || '',
        claimed_by_name: o.claimed_by_name || '',
        claim_status: o.claim_status === 'approved' ? 'Đã duyệt'
          : o.claim_status === 'pending' ? 'Chờ duyệt'
          : 'Chưa xác nhận',
        approved_by_name: o.approved_by_name || '',
        payment_date: formatDateVN(o.payment_date),
        customer_type: o.customer_type || '',
        external_id1: o.external_id1 || '',
        primary_product_code: o.primary_product_code || '',
        masp: o.masp || '',
        contract_type: o.contract_type || '',
      })
    })

    // Style header row: bold + wrap
    const headerRow = ws.getRow(1)
    headerRow.font = { bold: true }
    headerRow.alignment = { wrapText: true, vertical: 'middle' }

    // Wrap text for all data rows
    ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
      if (rowNum === 1) return
      row.alignment = { wrapText: true, vertical: 'top' }
    })

    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const now = new Date()
    const dd = String(now.getDate()).padStart(2, '0')
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const yyyy = now.getFullYear()
    saveAs(blob, `Doanh_thu_CBS_${dd}-${mm}-${yyyy}.xlsx`)
    toast.success(`Đã xuất ${data.length} dòng ra Excel.`)
  }

  if (!user || !canAccess) return null

  const summary = resp?.summary
  const lastSync = resp?.last_sync
  const lastSyncBatch = resp?.last_sync_batch

  const ownerTabs: { id: OwnerFilter; label: string }[] = [
    { id: 'all', label: 'Tất cả' },
    { id: 'mine', label: 'Của tôi' },
    { id: 'unclaimed', label: 'Chưa có người bán' },
    ...(canAssignSeller
      ? ([{ id: 'pending', label: 'Chờ duyệt' }] as {
          id: OwnerFilter
          label: string
        }[])
      : []),
    { id: 'others', label: 'Người khác' },
  ]

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary-100 rounded-lg">
                <Wallet className="w-7 h-7 text-primary-700" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Doanh thu CBS
                </h1>
                <p className="text-sm text-gray-600">
                  Đồng bộ định kỳ 06:00 và 18:00 (giờ VN) theo <strong>tháng hiện tại</strong>. Nút{' '}
                  <strong>Đồng bộ ngay</strong> lấy đúng <strong>Kỳ</strong> bạn chọn ở ô tháng bên cạnh (ví dụ
                  tháng 4). Sales tích đơn của mình ở trạng thái <strong>chờ duyệt</strong>; quản lý xác nhận
                  người bán.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Kỳ</label>
              <input
                type="month"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500"
              />
              {canSync && (
                <button
                  type="button"
                  onClick={syncNow}
                  disabled={syncing}
                  className="inline-flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary-700 disabled:opacity-50"
                >
                  {syncing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCcw className="w-4 h-4" />
                  )}
                  Đồng bộ ngay
                </button>
              )}
              {canAssignSeller && (
                <button
                  type="button"
                  onClick={recomputeKpi}
                  disabled={recomputing}
                  className="inline-flex items-center gap-2 bg-white border border-red-300 text-red-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-red-50 disabled:opacity-50"
                  title="Ghi đè lại toàn bộ KPI Thực hiện từ đơn CBS đã duyệt — thao tác không hoàn tác được"
                >
                  {recomputing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Calculator className="w-4 h-4" />
                  )}
                  Tính lại KPI
                </button>
              )}
              <button
                type="button"
                onClick={exportExcel}
                disabled={!filteredData || filteredData.length === 0}
                className="inline-flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
                title="Xuất dữ liệu đang hiển thị ra file Excel"
              >
                <Download className="w-4 h-4" />
                Xuất Excel
              </button>
              {canManage && (
                <button
                  type="button"
                  onClick={() => setConfigOpen(true)}
                  className="inline-flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-50"
                >
                  <Settings className="w-4 h-4" />
                  Cấu hình CBS
                </button>
              )}
            </div>
          </div>

          {/* Summary cards */}
          <div
            className={`grid grid-cols-2 gap-3 mb-4 ${
              canAssignSeller ? 'md:grid-cols-6' : 'md:grid-cols-5'
            }`}
          >
            <Card
              label="Tổng đơn"
              hint="Số dòng trong CRM có mã kỳ = Kỳ (sau lọc tab / tìm kiếm API)"
              value={summary?.total ?? 0}
            />
            <Card
              label="Tổng doanh thu (VAT)"
              value={formatVND(summary?.total_vat ?? 0)}
              strong
            />
            <Card
              label="Đơn của tôi"
              value={summary?.mine ?? 0}
              tone="primary"
            />
            <Card
              label="Đã xác nhận"
              value={summary?.claimed ?? 0}
              tone="success"
            />
            {canAssignSeller && (
              <Card
                label="Chờ duyệt"
                value={summary?.pending ?? 0}
                tone="warn"
              />
            )}
            <Card
              label="Chưa có người bán"
              value={summary?.unclaimed ?? 0}
              tone="warn"
            />
          </div>

          {lastSync?.last_synced_at && (
            <div className="text-xs text-gray-500 mb-3">
              Đồng bộ gần nhất:{' '}
              <strong className="text-gray-700">
                {formatDateVN(lastSync.last_synced_at)}
              </strong>{' '}
              —{' '}
              <span
                className={
                  lastSync.last_sync_status === 'error'
                    ? 'text-red-600'
                    : 'text-green-700'
                }
              >
                {lastSync.last_sync_status === 'error' ? 'Lỗi' : 'OK'}
              </span>
              {lastSync.last_sync_message && (
                <span className="ml-2 text-gray-500">
                  — {lastSync.last_sync_message}
                </span>
              )}
            </div>
          )}

          {lastSyncBatch?.period_ym === period &&
            typeof summary?.total === 'number' &&
            lastSyncBatch.received !== summary.total && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm text-sky-950">
                <Info className="w-4 h-4 mt-0.5 flex-shrink-0 text-sky-700" aria-hidden />
                <div>
                  <strong>Giải thích số liệu:</strong> mỗi lần đồng bộ, đơn trong kỳ <strong>chưa duyệt</strong>{' '}
                  mà <em>không</em> còn trong file CBS sẽ được <strong>gỡ</strong> để dữ liệu CRM sát CBS. Nếu{' '}
                  <strong>Tổng đơn</strong> (<strong>{summary.total}</strong>) vẫn khác{' '}
                  <strong>{lastSyncBatch.received}</strong> dòng CBS trả về: có thể do <strong>đơn đã duyệt</strong>{' '}
                  vẫn được giữ (không xóa tự động), hoặc bạn đang dùng tab lọc (Của tôi, …) / ô tìm kiếm — thống kê
                  trên thẻ đã áp lọc API.
                </div>
              </div>
            )}

          {/* Filters */}
          <div className="bg-white rounded-xl shadow border border-gray-200 p-3 mb-3 flex flex-col sm:flex-row gap-3 sm:items-center">
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 flex-wrap">
              {ownerTabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setOwner(t.id)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                    owner === t.id
                      ? 'bg-white shadow text-primary-700'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Tìm theo khách hàng, hợp đồng, sản phẩm, mã thuê bao, nhân viên CBS..."
                className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-primary-500"
              />
            </div>
            {hasActiveColumnFilter && (
              <button
                type="button"
                onClick={clearColumnFilters}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 border border-gray-300 bg-white hover:bg-gray-50 px-3 py-2 rounded-lg whitespace-nowrap"
                title="Xoá tất cả bộ lọc theo cột"
              >
                <FilterX className="w-3.5 h-3.5" />
                Xoá bộ lọc cột
              </button>
            )}
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-10 h-10 animate-spin text-primary-600" />
              </div>
            ) : !resp || resp.data.length === 0 ? (
              <div className="py-16 px-6 text-center text-gray-500">
                <p className="mb-2">Chưa có dữ liệu CBS cho kỳ này.</p>
                {canSync && (
                  <p className="text-xs">
                    Thử bấm <strong>Đồng bộ ngay</strong> để lấy dữ liệu mới
                    nhất từ CBS.
                  </p>
                )}
              </div>
            ) : (
              <>
                {hasActiveColumnFilter && (
                  <div className="px-3 py-2 text-xs text-gray-600 border-b border-gray-100 bg-amber-50/60">
                    Đang lọc <strong className="text-gray-900">{filteredData.length}</strong>/
                    {resp.data.length} đơn theo cột.
                    {filteredData.length === 0 && (
                      <span className="ml-2 text-red-600">Không có dòng nào khớp bộ lọc.</span>
                    )}
                  </div>
                )}
              <div
                className="overflow-auto"
                style={{ maxHeight: 'calc(100vh - 380px)', minHeight: '320px' }}
              >
                <table className="min-w-[1240px] w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                    <tr className="text-xs font-semibold text-gray-600 uppercase">
                      <th className="px-2 py-3 text-center whitespace-nowrap w-12">STT</th>
                      <th className="px-3 py-3 text-left whitespace-nowrap">Ngày kích hoạt</th>
                      <th className="px-3 py-3 text-left">Khách hàng</th>
                      <th className="px-3 py-3 text-left">Sản phẩm</th>
                      <th className="px-3 py-3 text-left">Hợp đồng</th>
                      <th className="px-3 py-3 text-left">NV CBS</th>
                      <th className="px-3 py-3 text-right whitespace-nowrap">Giá (VAT)</th>
                      <th className="px-3 py-3 text-center whitespace-nowrap min-w-[14rem]">
                        Người bán
                      </th>
                      <th className="px-3 py-3 text-center whitespace-nowrap">Xem</th>
                    </tr>
                    {/* Hàng filter theo cột (client-side) */}
                    <tr className="bg-white border-t border-gray-100">
                      <th className="px-2 py-1.5 align-top" />
                      <th className="px-2 py-1.5 align-top">
                        <div className="flex flex-col gap-1">
                          <input
                            type="date"
                            value={columnFilters.dateFrom}
                            onChange={(e) => updateFilter('dateFrom', e.target.value)}
                            title="Từ ngày"
                            className="w-full text-[11px] border border-gray-200 rounded px-1.5 py-1 focus:ring-1 focus:ring-primary-500 font-normal normal-case"
                          />
                          <input
                            type="date"
                            value={columnFilters.dateTo}
                            onChange={(e) => updateFilter('dateTo', e.target.value)}
                            title="Đến ngày"
                            className="w-full text-[11px] border border-gray-200 rounded px-1.5 py-1 focus:ring-1 focus:ring-primary-500 font-normal normal-case"
                          />
                        </div>
                      </th>
                      <th className="px-2 py-1.5 align-top">
                        <input
                          type="search"
                          value={columnFilters.customer}
                          onChange={(e) => updateFilter('customer', e.target.value)}
                          placeholder="Tên / TCCN / Mã KH..."
                          className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:ring-1 focus:ring-primary-500 font-normal normal-case"
                        />
                      </th>
                      <th className="px-2 py-1.5 align-top">
                        <input
                          type="search"
                          value={columnFilters.product}
                          onChange={(e) => updateFilter('product', e.target.value)}
                          placeholder="Tên / mã sản phẩm..."
                          className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:ring-1 focus:ring-primary-500 font-normal normal-case"
                        />
                      </th>
                      <th className="px-2 py-1.5 align-top">
                        <input
                          type="search"
                          value={columnFilters.contract}
                          onChange={(e) => updateFilter('contract', e.target.value)}
                          placeholder="Số / loại HĐ..."
                          className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:ring-1 focus:ring-primary-500 font-normal normal-case"
                        />
                      </th>
                      <th className="px-2 py-1.5 align-top">
                        <input
                          type="search"
                          value={columnFilters.cbsStaff}
                          onChange={(e) => updateFilter('cbsStaff', e.target.value)}
                          placeholder="NV CBS / partner..."
                          className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:ring-1 focus:ring-primary-500 font-normal normal-case"
                        />
                      </th>
                      <th className="px-2 py-1.5 align-top">
                        <div className="flex flex-col gap-1">
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            value={columnFilters.priceMin}
                            onChange={(e) => updateFilter('priceMin', e.target.value)}
                            placeholder="≥ min"
                            className="w-full text-[11px] text-right tabular-nums border border-gray-200 rounded px-1.5 py-1 focus:ring-1 focus:ring-primary-500 font-normal normal-case"
                          />
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            value={columnFilters.priceMax}
                            onChange={(e) => updateFilter('priceMax', e.target.value)}
                            placeholder="≤ max"
                            className="w-full text-[11px] text-right tabular-nums border border-gray-200 rounded px-1.5 py-1 focus:ring-1 focus:ring-primary-500 font-normal normal-case"
                          />
                        </div>
                      </th>
                      <th className="px-2 py-1.5 align-top">
                        <div className="flex flex-col gap-1">
                          <input
                            type="search"
                            value={columnFilters.seller}
                            onChange={(e) => updateFilter('seller', e.target.value)}
                            placeholder="Tên người bán..."
                            className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:ring-1 focus:ring-primary-500 font-normal normal-case"
                          />
                          <select
                            value={columnFilters.sellerStatus}
                            onChange={(e) =>
                              updateFilter('sellerStatus', e.target.value as SellerStatusFilter)
                            }
                            className="w-full text-xs border border-gray-200 rounded px-1.5 py-1 bg-white focus:ring-1 focus:ring-primary-500 font-normal normal-case"
                          >
                            <option value="all">Trạng thái: tất cả</option>
                            <option value="unclaimed">Chưa có người bán</option>
                            <option value="pending">Chờ duyệt</option>
                            <option value="approved">Đã duyệt</option>
                          </select>
                        </div>
                      </th>
                      <th className="px-2 py-1.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredData.map((o, idx) => {
                      const busy = busyIds.has(o.id)
                      return (
                        <tr
                          key={o.id}
                          className="hover:bg-gray-50/80 cursor-pointer"
                          onClick={() => setDetailOrder(o)}
                        >
                          <td className="px-2 py-2 text-xs text-center tabular-nums text-gray-500 whitespace-nowrap w-12">
                            {idx + 1}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-700 whitespace-nowrap">
                            {formatDateVN(o.active_date)}
                          </td>
                          <td className="px-3 py-2 text-sm">
                            <div
                              className="font-medium text-gray-900 truncate max-w-[18rem]"
                              title={o.customer_name || ''}
                            >
                              {o.customer_name || '—'}
                            </div>
                            <div className="text-xs text-gray-500">
                              {o.customer_type || ''}
                              {o.external_id1 ? ` · ${o.external_id1}` : ''}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-sm">
                            <div
                              className="text-gray-900 truncate max-w-[16rem]"
                              title={o.product_name || ''}
                            >
                              {o.product_name || '—'}
                            </div>
                            <div className="text-xs text-gray-500">
                              {o.product_code || ''}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-600">
                            <div
                              className="truncate max-w-[14rem]"
                              title={o.contract_no || ''}
                            >
                              {o.contract_no || '—'}
                            </div>
                            <div className="text-gray-400">
                              {o.contract_type || ''}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-600">
                            <div
                              className="truncate max-w-[14rem]"
                              title={o.cbs_staff || ''}
                            >
                              {o.cbs_staff || '—'}
                            </div>
                            <div
                              className="text-gray-400 truncate max-w-[14rem]"
                              title={o.partner || ''}
                            >
                              {o.partner || ''}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-sm text-right tabular-nums font-medium text-gray-900 whitespace-nowrap">
                            {formatVND(o.price_vat)}
                          </td>
                          <td
                            className="px-3 py-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <SellerCell
                              order={o}
                              busy={busy}
                              myId={user.id}
                              canAssignSeller={canAssignSeller}
                              sellerOptions={sellerOptions}
                              onClaimSelf={() => claimSelf(o.id)}
                              onAssign={(sid) => assignSeller(o.id, sid)}
                              onApprove={() => approve(o.id)}
                              onUnclaim={() => unclaim(o.id)}
                            />
                          </td>
                          <td
                            className="px-3 py-2 text-center"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => setDetailOrder(o)}
                              className="inline-flex items-center gap-1 text-xs text-primary-700 border border-primary-200 bg-primary-50 hover:bg-primary-100 px-2.5 py-1 rounded-full"
                              title="Xem chi tiết đơn"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Chi tiết
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </div>

          <p className="mt-4 text-xs text-gray-500">
            Sales tự tích đơn thì đơn ở trạng thái <strong>chờ duyệt</strong>.
            Admin / Lãnh đạo / Quản lý / Leader có thể gán trực tiếp người bán
            hoặc duyệt các đơn đang chờ. Dữ liệu được đồng bộ định kỳ bằng tài
            khoản CBS của công ty (Admin đặt tại <strong>Cấu hình CBS</strong>).
          </p>
        </div>

        {canManage && (
          <CbsConfigModal
            open={configOpen}
            onClose={() => setConfigOpen(false)}
            onSaved={() => {
              setConfigOpen(false)
              load()
            }}
          />
        )}

        <CbsOrderDetailModal
          open={!!detailOrder}
          order={detailOrder}
          onClose={() => setDetailOrder(null)}
        />
      </div>
    </ProtectedRoute>
  )
}

export default function CbsRevenuePage() {
  return (
    <Suspense
      fallback={
        <ProtectedRoute>
          <div className="min-h-screen bg-gray-50">
            <Navbar />
            <div className="flex justify-center py-24">
              <Loader2 className="h-10 w-10 animate-spin text-primary-600" aria-hidden />
            </div>
          </div>
        </ProtectedRoute>
      }
    >
      <CbsRevenuePageContent />
    </Suspense>
  )
}

// ------ Seller cell: dropdown cho non-sales; chip + nút cho sales ------

function SellerCell({
  order,
  busy,
  myId,
  canAssignSeller,
  sellerOptions,
  onClaimSelf,
  onAssign,
  onApprove,
  onUnclaim,
}: {
  order: CbsOrder
  busy: boolean
  myId: string
  canAssignSeller: boolean
  sellerOptions: { id: string; label: string }[]
  onClaimSelf: () => void
  onAssign: (sellerId: string) => void
  onApprove: () => void
  onUnclaim: () => void
}) {
  const mine = order.claimed_by && order.claimed_by === myId
  const isPending = order.claim_status === 'pending'
  const isApproved = order.claim_status === 'approved'

  if (canAssignSeller) {
    // Nếu người bán hiện tại là Sales thuộc danh sách option → đã có trong dropdown.
    // Nếu không (ví dụ admin khác / nhân viên cũ), thêm option tạm thời.
    const currentId = order.claimed_by || ''
    const currentInList = currentId
      ? sellerOptions.some((o) => o.id === currentId)
      : true
    const extendedOptions =
      currentInList || !currentId
        ? sellerOptions
        : [
            ...sellerOptions,
            {
              id: currentId,
              label: `${order.claimed_by_name || currentId} (ngoài DS Sales)`,
            },
          ]

    return (
      <div className="flex flex-col items-stretch gap-1 min-w-[12rem]">
        <select
          disabled={busy}
          value={currentId}
          onChange={(e) => {
            const v = e.target.value
            if (v === currentId) return
            if (!v) {
              onUnclaim()
            } else {
              onAssign(v)
            }
          }}
          className={`w-full text-xs rounded-md border px-2 py-1.5 bg-white disabled:opacity-60 ${
            isPending
              ? 'border-amber-300 ring-1 ring-amber-200'
              : 'border-gray-300'
          }`}
          title={
            isPending
              ? 'Đơn đang chờ duyệt — đổi người bán sẽ tự động duyệt.'
              : 'Chọn người bán cho đơn này'
          }
        >
          <option value="">— Chưa có người bán —</option>
          {extendedOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span
            className={`inline-flex items-center gap-1 ${
              isPending
                ? 'text-amber-700'
                : isApproved
                ? 'text-green-700'
                : 'text-gray-400'
            }`}
          >
            {isPending ? (
              <>
                <Clock className="w-3 h-3" />
                Chờ duyệt
              </>
            ) : isApproved ? (
              <>
                <ShieldCheck className="w-3 h-3" />
                Đã duyệt
              </>
            ) : (
              'Chưa xác nhận'
            )}
          </span>
          <div className="flex items-center gap-2">
            {isPending && (
              <button
                type="button"
                disabled={busy}
                onClick={onApprove}
                className="text-[11px] font-semibold text-green-700 hover:underline disabled:opacity-50 inline-flex items-center gap-0.5"
                title="Duyệt yêu cầu của Sales"
              >
                <CheckCircle2 className="w-3 h-3" />
                Duyệt
              </button>
            )}
            {order.claimed_by && (
              <button
                type="button"
                disabled={busy}
                onClick={onUnclaim}
                className="text-[11px] text-red-600 hover:underline disabled:opacity-50 inline-flex items-center gap-0.5"
                title="Gỡ người bán"
              >
                <XCircle className="w-3 h-3" />
                Gỡ
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ------ Sales ------
  if (!order.claimed_by) {
    return (
      <div className="flex justify-center">
        <button
          type="button"
          disabled={busy}
          onClick={onClaimSelf}
          className="inline-flex items-center gap-1 text-xs font-semibold text-gray-700 border border-gray-300 bg-white px-2.5 py-1 rounded-full hover:bg-primary-50 hover:text-primary-700 hover:border-primary-300 disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Circle className="w-3.5 h-3.5" />
          )}
          Tích là của tôi
        </button>
      </div>
    )
  }

  if (mine) {
    return (
      <div className="flex flex-col items-center gap-1">
        {isPending ? (
          <>
            <span className="inline-flex items-center gap-1 text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full">
              <Clock className="w-3.5 h-3.5" />
              Chờ duyệt
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={onUnclaim}
              className="text-[11px] text-red-600 hover:underline disabled:opacity-50 inline-flex items-center gap-0.5"
              title="Huỷ yêu cầu của mình"
            >
              <XCircle className="w-3 h-3" />
              Huỷ
            </button>
          </>
        ) : (
          <span
            className="inline-flex items-center gap-1 text-xs font-semibold bg-green-50 text-green-700 border border-green-200 px-2.5 py-1 rounded-full"
            title="Đã được quản lý duyệt"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Của tôi — đã duyệt
          </span>
        )}
      </div>
    )
  }

  // Người khác đang claim
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span
        className="inline-flex items-center gap-1 text-xs font-medium text-gray-700 bg-gray-100 px-2 py-1 rounded-full max-w-[12rem] truncate"
        title={`${order.claimed_by_name || order.claimed_by}${
          order.claimed_by_territory ? ' · ' + order.claimed_by_territory : ''
        }`}
      >
        {order.claimed_by_name || order.claimed_by}
      </span>
      {isPending && (
        <span className="text-[10px] text-amber-700 inline-flex items-center gap-0.5">
          <Clock className="w-3 h-3" />
          đang chờ duyệt
        </span>
      )}
    </div>
  )
}

function Card({
  label,
  value,
  tone,
  strong,
  hint,
}: {
  label: string
  value: number | string
  tone?: 'primary' | 'success' | 'warn'
  strong?: boolean
  hint?: string
}) {
  const toneClass =
    tone === 'primary'
      ? 'text-primary-700'
      : tone === 'success'
      ? 'text-green-700'
      : tone === 'warn'
      ? 'text-amber-700'
      : 'text-gray-900'
  return (
    <div className="bg-white rounded-xl shadow border border-gray-200 p-3">
      <div className="text-[11px] uppercase tracking-wider text-gray-500">
        {label}
      </div>
      <div
        className={`mt-1 ${
          strong ? 'text-lg md:text-xl' : 'text-xl'
        } font-bold tabular-nums ${toneClass}`}
      >
        {value}
      </div>
      {hint ? (
        <p className="mt-1.5 text-[10px] leading-snug text-gray-500 font-normal normal-case">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
