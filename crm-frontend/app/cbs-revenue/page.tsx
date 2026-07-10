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
  CheckSquare,
} from 'lucide-react'
import { saveAs } from 'file-saver'
import toast from 'react-hot-toast'
import { CbsConfigModal } from '@/components/CbsConfigModal'
import { CbsClaimPolicyModal } from '@/components/CbsClaimPolicyModal'
import { CbsOrderDetailModal } from '@/components/CbsOrderDetailModal'
import {
  groupCbsOrdersByContract,
  type CbsOrderGroup,
  type CbsOrderRow,
} from '@/lib/cbsRevenueGrouping'

interface ListResp {
  success: boolean
  period: string
  data: CbsOrderRow[]
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
  claim_policy?: {
    sales_claim_auto_approve: boolean
  }
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
  serial: string
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
  serial: '',
  cbsStaff: '',
  priceMin: '',
  priceMax: '',
  seller: '',
  sellerStatus: 'all',
}

function moneyNum(v: string | number | null | undefined): number {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

/** Tổng doanh thu theo bộ lọc cột — kpiNotVat khớp công thức KPI (chưa VAT, đã duyệt, chưa link deal). */
function computeFilteredRevenueSummary(groups: CbsOrderGroup[]) {
  let totalVat = 0
  let totalNotVat = 0
  let lineCount = 0
  let kpiNotVat = 0
  let kpiLineCount = 0

  for (const g of groups) {
    totalVat += moneyNum(g.price_vat)
    totalNotVat += moneyNum(g.price_not_vat_round ?? g.price_not_vat)
    lineCount += g._childCount

    for (const c of g._children) {
      if (c.claim_status !== 'approved' || !c.claimed_by) continue
      if (c.deal_id) continue
      kpiNotVat += moneyNum(c.price_not_vat_round ?? c.price_not_vat)
      kpiLineCount++
    }
  }

  return {
    contractCount: groups.length,
    lineCount,
    totalVat,
    totalNotVat,
    kpiNotVat,
    kpiLineCount,
  }
}

/** Tổng mọi dòng CRM cùng serial với bộ lọc — khớp cách cộng file CBS export (có thể gồm bản trùng). */
function computeSerialScopeSummary(
  allRows: CbsOrderRow[],
  groups: CbsOrderGroup[]
) {
  const serials = new Set<string>()
  for (const g of groups) {
    for (const c of g._children) {
      const s = String(c.serial || '').trim()
      if (s) serials.add(s)
    }
  }
  if (serials.size === 0) return null

  let notVat = 0
  let vat = 0
  let lineCount = 0
  let unclaimedNotVat = 0
  for (const row of allRows) {
    const s = String(row.serial || '').trim()
    if (!serials.has(s)) continue
    lineCount++
    const nv = moneyNum(row.price_not_vat_round ?? row.price_not_vat)
    notVat += nv
    vat += moneyNum(row.price_vat)
    if (!row.claimed_by) unclaimedNotVat += nv
  }
  return { notVat, vat, lineCount, unclaimedNotVat, serialCount: serials.size }
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
  const [claimPolicyOpen, setClaimPolicyOpen] = useState(false)
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())
  const [selectedGroupKeys, setSelectedGroupKeys] = useState<Set<string>>(new Set())
  const [bulkClaiming, setBulkClaiming] = useState(false)
  const [salesList, setSalesList] = useState<SalesEmployee[]>([])
  const [detailOrder, setDetailOrder] = useState<CbsOrderGroup | null>(null)

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

  const groupedAll = useMemo(
    () => groupCbsOrdersByContract((resp?.data || []) as CbsOrderRow[]),
    [resp]
  )

  const filteredData = useMemo(() => {
    const f = columnFilters
    const fromMs = dateInputToMs(f.dateFrom, false)
    const toMs = dateInputToMs(f.dateTo, true)
    const minPrice = f.priceMin ? Number(f.priceMin.replace(/[^\d.-]/g, '')) : null
    const maxPrice = f.priceMax ? Number(f.priceMax.replace(/[^\d.-]/g, '')) : null
    const nCustomer = normalizeVN(f.customer)
    const nProduct = normalizeVN(f.product)
    const nContract = normalizeVN(f.contract)
    const nSerial = normalizeVN(f.serial)
    const nCbsStaff = normalizeVN(f.cbsStaff)
    const nSeller = normalizeVN(f.seller)

    return groupedAll.filter((g) => {
      if (fromMs != null || toMs != null) {
        const dayMs = toDayMs(g.active_date)
        if (dayMs == null) return false
        if (fromMs != null && dayMs < fromMs) return false
        if (toMs != null && dayMs > toMs) return false
      }

      if (nCustomer) {
        const hay = normalizeVN(
          `${g.customer_name || ''} ${g.customer_type || ''} ${g.external_id1 || ''}`
        )
        if (!hay.includes(nCustomer)) return false
      }
      if (nProduct) {
        const match = g._children.some((c) => {
          const hay = normalizeVN(
            `${c.product_name || ''} ${c.product_code || ''} ${c.masp || ''}`
          )
          return hay.includes(nProduct)
        })
        if (!match) return false
      }
      if (nContract) {
        const hay = normalizeVN(`${g.contract_no || ''} ${g.contract_type || ''}`)
        if (!hay.includes(nContract)) return false
      }
      if (nSerial) {
        const match = g._children.some((c) => normalizeVN(c.serial || '').includes(nSerial))
        if (!match) return false
      }
      if (nCbsStaff) {
        const match = g._children.some((c) => {
          const hay = normalizeVN(`${c.cbs_staff || ''} ${c.partner || ''}`)
          return hay.includes(nCbsStaff)
        })
        if (!match) return false
      }

      if (minPrice != null && Number.isFinite(minPrice)) {
        if (Number(g.price_vat || 0) < minPrice) return false
      }
      if (maxPrice != null && Number.isFinite(maxPrice)) {
        if (Number(g.price_vat || 0) > maxPrice) return false
      }

      if (nSeller) {
        const hay = normalizeVN(
          `${g.claimed_by_name || ''} ${g.claimed_by_username || ''} ${g.claimed_by_territory || ''}`
        )
        if (!hay.includes(nSeller)) return false
      }

      if (f.sellerStatus !== 'all') {
        const statuses = g._children.map((c) => c.claim_status)
        const hasClaimed = g._children.some((c) => c.claimed_by)
        if (f.sellerStatus === 'unclaimed') {
          if (hasClaimed) return false
        } else if (f.sellerStatus === 'pending') {
          if (!statuses.includes('pending')) return false
        } else if (f.sellerStatus === 'approved') {
          if (!g._children.every((c) => c.claim_status === 'approved' && c.claimed_by)) {
            return false
          }
        }
      }

      return true
    })
  }, [groupedAll, columnFilters])

  const filteredRevenueSummary = useMemo(
    () => computeFilteredRevenueSummary(filteredData),
    [filteredData]
  )

  const serialScopeSummary = useMemo(() => {
    if (!resp?.data?.length) return null
    return computeSerialScopeSummary(resp.data as CbsOrderRow[], filteredData)
  }, [resp?.data, filteredData])

  const showRevenueReconcile = useMemo(
    () =>
      !!(
        columnFilters.seller.trim() ||
        columnFilters.sellerStatus === 'approved' ||
        owner === 'mine'
      ),
    [columnFilters.seller, columnFilters.sellerStatus, owner]
  )

  const claimableGroups = useMemo(
    () => filteredData.filter((g) => !g.claimed_by),
    [filteredData]
  )

  const selectedClaimCount = useMemo(
    () =>
      claimableGroups.filter((g) => selectedGroupKeys.has(g._groupKey)).length,
    [claimableGroups, selectedGroupKeys]
  )

  const allClaimableSelected =
    claimableGroups.length > 0 &&
    claimableGroups.every((g) => selectedGroupKeys.has(g._groupKey))

  useEffect(() => {
    setSelectedGroupKeys(new Set())
  }, [period, owner, q, columnFilters])

  const toggleGroupSelection = (groupKey: string) => {
    setSelectedGroupKeys((prev) => {
      const next = new Set(prev)
      if (next.has(groupKey)) next.delete(groupKey)
      else next.add(groupKey)
      return next
    })
  }

  const toggleSelectAllClaimable = () => {
    if (allClaimableSelected) {
      setSelectedGroupKeys(new Set())
    } else {
      setSelectedGroupKeys(new Set(claimableGroups.map((g) => g._groupKey)))
    }
  }

  const hasActiveColumnFilter = useMemo(() => {
    const f = columnFilters
    return !!(
      f.dateFrom ||
      f.dateTo ||
      f.customer ||
      f.product ||
      f.contract ||
      f.serial ||
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
  const jumpToSummaryList = useCallback(
    (target: 'all' | 'mine' | 'claimed' | 'pending' | 'unclaimed') => {
      if (target === 'all') {
        setOwner('all')
        setColumnFilters((prev) => ({ ...prev, sellerStatus: 'all' }))
        return
      }
      if (target === 'mine') {
        setOwner('mine')
        setColumnFilters((prev) => ({ ...prev, sellerStatus: 'all' }))
        return
      }
      if (target === 'claimed') {
        setOwner('all')
        setColumnFilters((prev) => ({ ...prev, sellerStatus: 'approved' }))
        return
      }
      if (target === 'pending') {
        if (canAssignSeller) {
          setOwner('pending')
          setColumnFilters((prev) => ({ ...prev, sellerStatus: 'all' }))
        } else {
          setOwner('all')
          setColumnFilters((prev) => ({ ...prev, sellerStatus: 'pending' }))
        }
        return
      }
      setOwner('unclaimed')
      setColumnFilters((prev) => ({ ...prev, sellerStatus: 'unclaimed' }))
    },
    [canAssignSeller]
  )

  const setBusy = (key: string, on: boolean) => {
    setBusyIds((prev) => {
      const next = new Set(prev)
      if (on) next.add(key)
      else next.delete(key)
      return next
    })
  }

  const runOnGroup = async (
    group: CbsOrderGroup,
    fn: (id: string) => Promise<void>,
    successMsg: string,
    targetIds?: string[]
  ) => {
    const ids = targetIds ?? group._childIds
    if (ids.length === 0) {
      toast.error('Không có dòng phù hợp để xử lý.')
      return
    }
    setBusy(group._groupKey, true)
    let ok = 0
    let fail = 0
    try {
      for (const id of ids) {
        try {
          await fn(id)
          ok++
        } catch {
          fail++
        }
      }
      if (ok > 0) {
        const suffix = ids.length > 1 ? ` (${ok}/${ids.length} dòng)` : ''
        toast.success(`${successMsg}${suffix}`)
        await load()
      }
      if (fail > 0) {
        toast.error(
          fail === ids.length
            ? 'Thao tác thất bại.'
            : `${fail} dòng không xử lý được (có thể đã được gán trước đó).`
        )
      }
    } finally {
      setBusy(group._groupKey, false)
    }
  }

  const salesClaimAutoApprove = resp?.claim_policy?.sales_claim_auto_approve === true

  const claimSelf = (group: CbsOrderGroup) =>
    runOnGroup(
      group,
      async (id) => {
        await apiClient.post(`/api/cbs/revenue/${id}/claim`)
      },
      salesClaimAutoApprove ? 'Đã tích và duyệt đơn hàng.' : 'Đã gửi yêu cầu, chờ duyệt.'
    )

  const bulkClaimSelf = async () => {
    const groups = filteredData.filter(
      (g) => selectedGroupKeys.has(g._groupKey) && !g.claimed_by
    )
    if (groups.length === 0) {
      toast.error('Chưa chọn đơn chưa có người bán.')
      return
    }
    setBulkClaiming(true)
    let okLines = 0
    let failLines = 0
    try {
      for (const g of groups) {
        for (const id of g._childIds) {
          try {
            await apiClient.post(`/api/cbs/revenue/${id}/claim`)
            okLines++
          } catch {
            failLines++
          }
        }
      }
      const msg = salesClaimAutoApprove
        ? 'Đã tích và duyệt đơn hàng.'
        : 'Đã gửi yêu cầu, chờ duyệt.'
      if (okLines > 0) {
        toast.success(`${msg} (${groups.length} đơn, ${okLines} dòng)`)
        setSelectedGroupKeys(new Set())
        await load()
      }
      if (failLines > 0) {
        toast.error(
          okLines === 0
            ? 'Thao tác thất bại.'
            : `${failLines} dòng không xử lý được (có thể đã được gán trước đó).`
        )
      }
    } finally {
      setBulkClaiming(false)
    }
  }

  const assignSeller = (group: CbsOrderGroup, sellerId: string) =>
    runOnGroup(group, async (id) => {
      await apiClient.post(`/api/cbs/revenue/${id}/claim`, { seller_id: sellerId })
    }, 'Đã gán người bán.')

  const approve = (group: CbsOrderGroup) =>
    runOnGroup(
      group,
      async (id) => {
        await apiClient.post(`/api/cbs/revenue/${id}/approve`)
      },
      'Đã duyệt đơn hàng.',
      group._children.filter((c) => c.claim_status === 'pending').map((c) => c.id)
    )

  const unclaim = (group: CbsOrderGroup) =>
    runOnGroup(group, async (id) => {
      await apiClient.post(`/api/cbs/revenue/${id}/unclaim`)
    }, 'Đã gỡ người bán.')

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
                  tháng 4). Sales tích đơn của mình
                  {salesClaimAutoApprove ? (
                    <> được <strong>tự động duyệt</strong> và tính vào KPI ngay</>
                  ) : (
                    <> ở trạng thái <strong>chờ duyệt</strong>; quản lý xác nhận người bán</>
                  )}
                  . Các dòng cùng <strong>số hợp đồng</strong> hiển thị gộp một dòng (tiền
                  cộng dồn; KPI tiếp cận: <strong>1 lần / khách CBS</strong> (không trùng deal
                  cùng kỳ); sản phẩm: <strong>1 / hợp đồng</strong> khi đã duyệt).
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
                <>
                  <button
                    type="button"
                    onClick={() => setClaimPolicyOpen(true)}
                    className="inline-flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-50"
                    title="Thiết lập tự động duyệt hoặc cần kiểm duyệt khi Sales tích đơn"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    Cấu hình duyệt đơn
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfigOpen(true)}
                    className="inline-flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-50"
                  >
                    <Settings className="w-4 h-4" />
                    Cấu hình CBS
                  </button>
                </>
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
              tone="primary"
              onClick={() => jumpToSummaryList('all')}
              clickHint="Bấm để xem tất cả"
            />
            <Card
              label="Tổng doanh thu (VAT)"
              value={formatVND(summary?.total_vat ?? 0)}
              strong
              tone="success"
              onClick={() => jumpToSummaryList('all')}
              clickHint="Bấm để xem tất cả"
            />
            <Card
              label="Đơn của tôi"
              value={summary?.mine ?? 0}
              tone="primary"
              onClick={() => jumpToSummaryList('mine')}
              clickHint="Bấm để lọc Của tôi"
            />
            <Card
              label="Đã xác nhận"
              value={summary?.claimed ?? 0}
              tone="success"
              onClick={() => jumpToSummaryList('claimed')}
              clickHint="Bấm để lọc Đã duyệt"
            />
            {canAssignSeller && (
              <Card
                label="Chờ duyệt"
                value={summary?.pending ?? 0}
                tone="warn"
                onClick={() => jumpToSummaryList('pending')}
                clickHint="Bấm để lọc Chờ duyệt"
              />
            )}
            <Card
              label="Chưa có người bán"
              value={summary?.unclaimed ?? 0}
              tone="alert"
              onClick={() => jumpToSummaryList('unclaimed')}
              clickHint="Bấm để lọc Chưa có người bán"
            />
          </div>

          {showRevenueReconcile && resp && resp.data.length > 0 && !loading && (
            <div className="mb-4 rounded-xl border border-primary-200 bg-primary-50/50 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-semibold text-primary-900">
                    <Wallet className="w-4 h-4 shrink-0" />
                    Đối chiếu KPI — kỳ {period}
                  </div>
                  <p className="text-xs text-primary-900/75 mt-1">
                    Theo bộ lọc cột:{' '}
                    <strong>{filteredRevenueSummary.contractCount}</strong> HĐ,{' '}
                    <strong>{filteredRevenueSummary.lineCount}</strong> dòng CBS.
                    KPI tháng dùng đơn vị <strong>chưa VAT</strong>.
                  </p>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-2 sm:justify-end">
                  <div className="text-right">
                    <div className="text-xs text-gray-600">Tổng chưa VAT (đang lọc)</div>
                    <div className="text-lg font-bold text-primary-900 tabular-nums">
                      {formatVND(filteredRevenueSummary.totalNotVat)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-600">Tổng VAT (đang lọc)</div>
                    <div className="text-sm font-semibold text-gray-800 tabular-nums">
                      {formatVND(filteredRevenueSummary.totalVat)}
                    </div>
                  </div>
                  <div className="text-right sm:border-l sm:border-primary-200 sm:pl-6">
                    <div
                      className="text-xs text-gray-600 inline-flex items-center justify-end gap-1"
                      title="Đã duyệt, chưa gắn deal — cùng công thức tính KPI tháng"
                    >
                      Khớp KPI tháng (TH)
                      <Info className="w-3.5 h-3.5" />
                    </div>
                    <div className="text-lg font-bold text-emerald-800 tabular-nums">
                      {formatVND(filteredRevenueSummary.kpiNotVat)}
                    </div>
                    <div className="text-xs text-gray-500">
                      {filteredRevenueSummary.kpiLineCount} dòng đã duyệt
                    </div>
                  </div>
                </div>
              </div>
              {serialScopeSummary &&
                serialScopeSummary.notVat !== filteredRevenueSummary.kpiNotVat && (
                  <div className="mt-2 text-xs border-t border-primary-100 pt-2 space-y-1">
                    <p className="text-amber-900">
                      <strong>File CBS export</strong> (cộng mọi dòng cùng serial):{' '}
                      <span className="font-semibold tabular-nums">
                        {formatVND(serialScopeSummary.notVat)}
                      </span>{' '}
                      — {serialScopeSummary.lineCount} dòng / {serialScopeSummary.serialCount}{' '}
                      serial.
                      {serialScopeSummary.unclaimedNotVat > 0 && (
                        <>
                          {' '}
                          Trong đó{' '}
                          <span className="font-semibold tabular-nums">
                            {formatVND(serialScopeSummary.unclaimedNotVat)}
                          </span>{' '}
                          là bản <strong>trùng chưa claim</strong> (không tính KPI).
                        </>
                      )}
                    </p>
                    <p className="text-gray-600">
                      KPI chỉ tính mỗi đơn <strong>đã duyệt một lần</strong> → dùng ô{' '}
                      <strong>Khớp KPI tháng (TH)</strong>, không cộng dòng trùng từ file CBS.
                    </p>
                  </div>
                )}
              {columnFilters.sellerStatus !== 'approved' &&
                filteredRevenueSummary.kpiNotVat !== filteredRevenueSummary.totalNotVat && (
                  <p className="mt-2 text-xs text-amber-800 border-t border-primary-100 pt-2">
                    Gợi ý: lọc trạng thái người bán <strong>Đã duyệt</strong> để tổng
                    chưa VAT khớp cột <strong>DT Tổng — TH</strong> trên trang KPI tháng.
                  </p>
                )}
            </div>
          )}

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
                placeholder="Tìm theo khách hàng, hợp đồng, serial, sản phẩm, mã thuê bao, nhân viên CBS..."
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
                    Đang lọc <strong className="text-gray-900">{filteredData.length}</strong> hợp
                    đồng / {groupedAll.length} (tổng {resp.data.length} dòng CBS) theo cột.
                    {filteredData.length === 0 && (
                      <span className="ml-2 text-red-600">Không có dòng nào khớp bộ lọc.</span>
                    )}
                  </div>
                )}
              <div
                className="overflow-auto"
                style={{ maxHeight: 'calc(100vh - 380px)', minHeight: '320px' }}
              >
                <table className="min-w-[1320px] w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                    <tr className="text-xs font-semibold text-gray-600 uppercase">
                      <th className="px-2 py-3 text-center whitespace-nowrap w-12">STT</th>
                      <th className="px-3 py-3 text-left whitespace-nowrap">Ngày kích hoạt</th>
                      <th className="px-3 py-3 text-left">Khách hàng</th>
                      <th className="px-3 py-3 text-left">Sản phẩm</th>
                      <th className="px-3 py-3 text-left">Hợp đồng</th>
                      <th className="px-3 py-3 text-left whitespace-nowrap">Serial</th>
                      <th className="px-3 py-3 text-left">NV CBS</th>
                      <th className="px-3 py-3 text-right whitespace-nowrap">Giá (VAT)</th>
                      <th className="px-3 py-3 text-center whitespace-nowrap min-w-[14rem]">
                        {!canAssignSeller ? (
                          <div className="inline-flex items-center justify-center gap-2 normal-case">
                            <input
                              type="checkbox"
                              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                              checked={allClaimableSelected}
                              disabled={
                                claimableGroups.length === 0 || bulkClaiming
                              }
                              onChange={toggleSelectAllClaimable}
                              title="Chọn tất cả đơn chưa có người bán"
                              aria-label="Chọn tất cả đơn chưa có người bán"
                            />
                            <span>Người bán</span>
                          </div>
                        ) : (
                          'Người bán'
                        )}
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
                          value={columnFilters.serial}
                          onChange={(e) => updateFilter('serial', e.target.value)}
                          placeholder="Serial..."
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
                          {!canAssignSeller && selectedClaimCount > 0 && (
                            <div className="flex flex-col gap-1 pt-0.5 border-t border-primary-100 mt-0.5">
                              <span className="text-[10px] text-primary-800 font-medium">
                                Đã chọn {selectedClaimCount} đơn
                              </span>
                              <button
                                type="button"
                                disabled={bulkClaiming}
                                onClick={bulkClaimSelf}
                                className="w-full inline-flex items-center justify-center gap-1 text-[11px] font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 px-2 py-1 rounded"
                              >
                                {bulkClaiming ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <CheckSquare className="w-3 h-3" />
                                )}
                                Tích {selectedClaimCount} đơn
                              </button>
                              <button
                                type="button"
                                disabled={bulkClaiming}
                                onClick={() => setSelectedGroupKeys(new Set())}
                                className="text-[10px] text-gray-600 hover:text-gray-900 underline disabled:opacity-50"
                              >
                                Bỏ chọn
                              </button>
                            </div>
                          )}
                        </div>
                      </th>
                      <th className="px-2 py-1.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredData.map((o, idx) => {
                      const busy = busyIds.has(o._groupKey)
                      return (
                        <tr
                          key={o._groupKey}
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
                              <span>{o.product_code || ''}</span>
                              {o._childCount > 1 ? (
                                <span className="text-[10px] font-medium text-primary-700 bg-primary-50 px-1.5 py-0.5 rounded ml-1">
                                  {o._childCount} dòng
                                </span>
                              ) : null}
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
                          <td className="px-3 py-2 text-xs text-gray-600 font-mono">
                            <div
                              className="truncate max-w-[12rem]"
                              title={
                                o._childCount > 1
                                  ? o._children
                                      .map((c) => c.serial)
                                      .filter(Boolean)
                                      .join(', ')
                                  : o.serial || ''
                              }
                            >
                              {o.serial || '—'}
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
                              bulkClaiming={bulkClaiming}
                              myId={user.id}
                              canAssignSeller={canAssignSeller}
                              salesClaimAutoApprove={salesClaimAutoApprove}
                              sellerOptions={sellerOptions}
                              selected={selectedGroupKeys.has(o._groupKey)}
                              onToggleSelect={() => toggleGroupSelection(o._groupKey)}
                              onClaimSelf={() => claimSelf(o)}
                              onAssign={(sid) => assignSeller(o, sid)}
                              onApprove={() => approve(o)}
                              onUnclaim={() => unclaim(o)}
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
            {salesClaimAutoApprove ? (
              <>
                Sales tự tích đơn thì đơn được <strong>duyệt ngay</strong> và tính vào KPI; có thể{' '}
                <strong>gỡ</strong> đơn tích nhầm của mình.
              </>
            ) : (
              <>
                Sales tự tích đơn thì đơn ở trạng thái <strong>chờ duyệt</strong>.
              </>
            )}{' '}
            {!canAssignSeller && (
              <>
                Có thể <strong>chọn nhiều đơn</strong> (ô tick cột Người bán) rồi bấm{' '}
                <strong>Tích … đơn</strong> ngay dưới bộ lọc cột đó.
              </>
            )}{' '}
            Admin / Lãnh đạo / Quản lý / Leader có thể gán trực tiếp người bán
            hoặc duyệt các đơn đang chờ. Dữ liệu được đồng bộ định kỳ bằng tài
            khoản CBS của công ty (Admin đặt tại <strong>Cấu hình CBS</strong>).
          </p>
        </div>

        {canManage && (
          <>
            <CbsClaimPolicyModal
              open={claimPolicyOpen}
              onClose={() => setClaimPolicyOpen(false)}
              onSaved={load}
              cbsConfigured={lastSync != null}
              initialAutoApprove={salesClaimAutoApprove}
            />
            <CbsConfigModal
              open={configOpen}
              onClose={() => setConfigOpen(false)}
              onSaved={() => {
                setConfigOpen(false)
                load()
              }}
            />
          </>
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
  bulkClaiming,
  myId,
  canAssignSeller,
  salesClaimAutoApprove,
  sellerOptions,
  selected,
  onToggleSelect,
  onClaimSelf,
  onAssign,
  onApprove,
  onUnclaim,
}: {
  order: CbsOrderGroup
  busy: boolean
  bulkClaiming: boolean
  myId: string
  canAssignSeller: boolean
  salesClaimAutoApprove: boolean
  sellerOptions: { id: string; label: string }[]
  selected: boolean
  onToggleSelect: () => void
  onClaimSelf: () => void
  onAssign: (sellerId: string) => void
  onApprove: () => void
  onUnclaim: () => void
}) {
  const mine = order.claimed_by && order.claimed_by === myId
  const isMixed = order.claim_status === 'mixed'
  const isPending = order.claim_status === 'pending' || isMixed
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
            {isMixed ? (
              <>
                <Info className="w-3 h-3" />
                Nhiều trạng thái
              </>
            ) : isPending ? (
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
      <div
        className={`flex items-center justify-center gap-2 ${
          selected ? 'rounded-lg bg-primary-50/80 px-1 py-0.5' : ''
        }`}
      >
        <input
          type="checkbox"
          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 flex-shrink-0"
          checked={selected}
          disabled={bulkClaiming || busy}
          onChange={onToggleSelect}
          aria-label={`Chọn đơn ${order.contract_no || order.customer_name || ''}`}
          title="Chọn để tích nhiều đơn"
        />
        <button
          type="button"
          disabled={busy || bulkClaiming}
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
        {isMixed ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold bg-sky-50 text-sky-800 border border-sky-200 px-2.5 py-1 rounded-full">
            <Info className="w-3.5 h-3.5" />
            Hợp đồng nhiều dòng — xem chi tiết
          </span>
        ) : isPending ? (
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
        ) : isApproved ? (
          <>
            <span
              className="inline-flex items-center gap-1 text-xs font-semibold bg-green-50 text-green-700 border border-green-200 px-2.5 py-1 rounded-full"
              title={
                salesClaimAutoApprove
                  ? 'Đã tự duyệt — có thể gỡ nếu tích nhầm'
                  : 'Đã được quản lý duyệt'
              }
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Của tôi — đã duyệt
            </span>
            {salesClaimAutoApprove && order.approved_by === myId && (
              <button
                type="button"
                disabled={busy || bulkClaiming}
                onClick={onUnclaim}
                className="text-[11px] text-red-600 hover:underline disabled:opacity-50 inline-flex items-center gap-0.5"
                title="Gỡ đơn tích nhầm"
              >
                <XCircle className="w-3 h-3" />
                Gỡ
              </button>
            )}
          </>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-700 bg-gray-100 px-2 py-1 rounded-full">
            Của tôi
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
  onClick,
  clickHint,
}: {
  label: string
  value: number | string
  tone?: 'primary' | 'success' | 'warn' | 'alert'
  strong?: boolean
  hint?: string
  onClick?: () => void
  clickHint?: string
}) {
  const toneClass =
    tone === 'primary'
      ? 'text-primary-900'
      : tone === 'success'
      ? 'text-green-900'
      : tone === 'warn'
      ? 'text-amber-900'
      : tone === 'alert'
      ? 'text-red-900'
      : 'text-gray-900'
  const bgClass =
    tone === 'primary'
      ? 'bg-primary-100'
      : tone === 'success'
      ? 'bg-green-100'
      : tone === 'warn'
      ? 'bg-amber-100'
      : tone === 'alert'
      ? 'bg-red-100'
      : 'bg-white'
  const labelClass =
    tone === 'primary'
      ? 'text-primary-900'
      : tone === 'success'
      ? 'text-green-900'
      : tone === 'warn'
      ? 'text-amber-900'
      : tone === 'alert'
      ? 'text-red-900'
      : 'text-gray-500'
  const borderClass =
    tone === 'primary'
      ? 'border-primary-300'
      : tone === 'success'
      ? 'border-green-300'
      : tone === 'warn'
      ? 'border-amber-300'
      : tone === 'alert'
      ? 'border-red-300'
      : 'border-gray-200'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${bgClass} ${borderClass} rounded-xl shadow border p-3 text-left w-full ${
        onClick ? 'hover:border-primary-300 hover:shadow-md transition' : ''
      }`}
      title={clickHint}
      disabled={!onClick}
    >
      <div className={`text-[11px] uppercase tracking-wider ${labelClass}`}>
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
      {onClick ? (
        <p className="mt-1 text-[10px] text-primary-600 font-medium normal-case">
          {clickHint || 'Bấm để xem danh sách'}
        </p>
      ) : null}
    </button>
  )
}
