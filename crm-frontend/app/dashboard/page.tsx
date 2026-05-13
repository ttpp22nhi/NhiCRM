'use client'

import { useState, useEffect, useMemo } from 'react'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { Navbar } from '@/components/Navbar'
import { apiClient } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import {
  DollarSign,
  TrendingUp,
  Percent,
  Briefcase,
  Loader2,
  Calendar,
  Building2,
  User,
  AlertCircle,
  Download,
  Target,
  Search,
  ChevronLeft,
  ChevronRight,
  Users,
  Package,
  FolderKanban,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  LabelList,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import toast from 'react-hot-toast'
import Link from 'next/link'
import { canAccessKpiPage } from '@/lib/rbac'
import { exportEmployeeKpiReport, type EmployeeKpiReportPayload } from '@/lib/exportEmployeeKpiReport'
import { exportSalesForecastReport, type SalesForecastPayload } from '@/lib/exportSalesForecastReport'
import { exportLossAnalysisReport, type LossAnalysisPayload } from '@/lib/exportLossAnalysisReport'
import { exportTaskActivityReport, type TaskActivityPayload } from '@/lib/exportTaskActivityReport'

interface DashboardAnalytics {
  revenue: { totalRevenue: number; pipelineValue: number }
  winRate: { winRate: number; won: number; closed: number }
  kpiProgress: { targetValue: number; actualRevenue: number; progressPercent: number }
  funnel: Array<{ stage: string; label: string; count: number }>
  monthlyTrend: Array<{ month: number; year: number; label: string; revenue: number }>
  topSales: Array<{
    employee_id: string
    full_name: string
    username?: string
    avatar_url?: string | null
    total_revenue: number
  }>
  activeDealsCount: number
  scopeLabel?: 'personal' | 'team' | 'company' | 'filter'
  staleDeals: Array<{
    deal_id: string
    title: string
    amount: number
    stage: string
    display_code?: string | null
    updated_at?: number | null
    confidence_level?: string
  }>
  pipelineHealth?: Array<{ level: string; label: string; count: number; color: string }>
  massStats?: {
    dealCountTrend: Array<{ month: number; year: number; label: string; count: number }>
    growthRate: { thisMonthCount: number; lastMonthCount: number; growthRate: number }
    serviceBreakdown?: Array<{ service_name: string; deal_count: number; total_amount: number }>
  }
  projectStats?: {
    totalWeightValue: number
    topOpportunities: Array<{ deal_id: string; title: string; amount: number; stage: string; display_code?: string | null; status?: string }>
  }
  monthlyKpiLeaderboard?: {
    period: string
    rows: Array<{
      employee_id: string
      full_name: string
      username: string
      target_revenue_total: number
      actual_revenue_total: number
      approach_target: number
      approach_actual: number
      target_product_total: number
      actual_product_total: number
      revenue_achievement_pct: number | null
      approach_achievement_pct: number | null
      product_achievement_pct: number | null
    }>
  }
}

interface DepartmentOption {
  id: string
  name: string
  path?: string
}

interface DepartmentBreakdownRow {
  department_id: string
  department_name: string
  department_path: string
  employee_count: number
  revenue_won: number
  pipeline_value: number
  win_rate: number
  open_deals: number
  completed_tasks: number
  pending_tasks: number
  overdue_tasks: number
}

interface EmployeeBreakdownRow {
  rank: number
  employee_id: string
  full_name: string
  username: string
  role: string
  department_id: string | null
  department_name: string
  department_path: string
  revenue_won: number
  pipeline_value: number
  win_rate: number
  open_deals: number
  completed_tasks: number
  pending_tasks: number
  overdue_tasks: number
}

interface EmployeeDetailPayload {
  employee: {
    employee_id: string
    full_name: string
    username: string
    role: string
    department_id: string | null
    department_name: string
    department_path: string
  }
  kpi: {
    revenue: { totalRevenue: number; pipelineValue: number }
    winRate: { winRate: number; won: number; closed: number }
    activeDealsCount: number
  }
  dealsNeedingAttention: DashboardAnalytics['staleDeals']
  overdueTasks: Array<{ task_id: string; display_code?: string | null; title: string; due_date?: number | null; created_at?: number | null }>
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value)

const formatShortCurrency = (value: number) => {
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)} tỷ`
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)} tr`
  if (value >= 1e3) return `${(value / 1e3).toFixed(0)}k`
  return String(value)
}

/** Nhãn giai đoạn deal (API dùng stage code) */
const DEAL_STAGE_LABEL: Record<string, string> = {
  tiep_can: 'Tiếp cận',
  tu_van: 'Tư vấn',
  khao_sat: 'Khảo sát',
  bao_gia: 'Báo giá',
  thuong_thao: 'Thương thảo',
  thanh_cong: 'Thành công',
}

const PIE_COLORS = ['#0369a1', '#0f766e', '#7c3aed', '#c2410c', '#b91c1c', '#0d9488', '#4338ca', '#a16207', '#be185d', '#059669', '#6d28d9', '#d97706', '#e11d48', '#047857', '#4f46e5']

const canFilterByDepartment = (role: string) => role === 'admin' || role === 'super_admin'

const canExportForecast = (role: string) => ['admin', 'super_admin', 'director', 'manager', 'leader'].includes(role)
const canExportLossAnalysis = (role: string) => ['admin', 'super_admin', 'director', 'manager', 'leader'].includes(role)
const canExportEmployeePerformance = (role: string) => !!role
const canExportTaskLog = (role: string) => !!role
const canDrillDown = (role: string) => ['admin', 'super_admin', 'director', 'manager', 'leader'].includes(role)

const formatDateInput = (value: Date) => {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function DashboardPage() {
  const { user } = useAuth()
  const role = user?.role ?? ''
  const [data, setData] = useState<DashboardAnalytics | null>(null)
  const [departments, setDepartments] = useState<DepartmentOption[]>([])
  const [loading, setLoading] = useState(true)
  const [exportingReportKey, setExportingReportKey] = useState<string | null>(null)
  const [deptBreakdown, setDeptBreakdown] = useState<DepartmentBreakdownRow[]>([])
  const [employeeBreakdown, setEmployeeBreakdown] = useState<EmployeeBreakdownRow[]>([])
  const [drillDepartmentId, setDrillDepartmentId] = useState<string | null>(null)
  const [employeeDetail, setEmployeeDetail] = useState<EmployeeDetailPayload | null>(null)
  const [loadingBreakdown, setLoadingBreakdown] = useState(false)
  const [loadingEmployeeDetail, setLoadingEmployeeDetail] = useState(false)
  const [fromDate, setFromDate] = useState(() => formatDateInput(new Date(new Date().getFullYear(), new Date().getMonth(), 1)))
  const [toDate, setToDate] = useState(() => formatDateInput(new Date()))
  const [scopePath, setScopePath] = useState<string>('')
  const [businessType, setBusinessType] = useState<'MASS' | 'PROJECT' | ''>('')
  const [confidenceFilter, setConfidenceFilter] = useState<'all' | 'low'>('all')
  const showDeptFilter = canFilterByDepartment(user?.role ?? '')
  const [kpiLbSearch, setKpiLbSearch] = useState('')
  const [kpiLbPage, setKpiLbPage] = useState(1)

  const monthlyKpiLeaderboard = data?.monthlyKpiLeaderboard

  type KpiLbRow = NonNullable<DashboardAnalytics['monthlyKpiLeaderboard']>['rows'][number]

  const KPI_LB_PAGE_SIZE = 25

  const kpiLbDerived = useMemo(() => {
    const rows = monthlyKpiLeaderboard?.rows
    if (!rows?.length) {
      return {
        sortedForTable: [] as KpiLbRow[],
        histogram: [] as { key: string; label: string; count: number; fill: string }[],
        top10Revenue: [] as Array<KpiLbRow & { chartLabel: string }>,
        summary: { total: 0, atOrOver100: 0, below100WithTarget: 0, noTarget: 0 },
      }
    }

    let noTarget = 0
    let b0_80 = 0
    let b80_100 = 0
    let b100_120 = 0
    let b120 = 0
    let atOrOver100 = 0
    let below100WithTarget = 0

    for (const r of rows) {
      const t = r.target_revenue_total || 0
      const pct = r.revenue_achievement_pct
      if (t <= 0) {
        noTarget += 1
        continue
      }
      if (pct != null) {
        if (pct >= 100) atOrOver100 += 1
        else below100WithTarget += 1
        if (pct < 80) b0_80 += 1
        else if (pct < 100) b80_100 += 1
        else if (pct < 120) b100_120 += 1
        else b120 += 1
      }
    }

    const histogram = [
      { key: 'no_ct', label: 'Chưa giao CT doanh thu', count: noTarget, fill: '#94a3b8' },
      { key: 'lt80', label: 'Dưới 80%', count: b0_80, fill: '#f87171' },
      { key: '80_100', label: '80% – dưới 100%', count: b80_100, fill: '#fbbf24' },
      { key: '100_120', label: '100% – dưới 120%', count: b100_120, fill: '#34d399' },
      { key: 'gte120', label: 'Từ 120% trở lên', count: b120, fill: '#0f766e' },
    ]

    const sortedForTable = [...rows].sort((a, b) => {
      const pa = a.revenue_achievement_pct
      const pb = b.revenue_achievement_pct
      if (pa != null && pb != null && pb !== pa) return pb - pa
      if (pa != null && pb == null) return -1
      if (pa == null && pb != null) return 1
      return (b.actual_revenue_total || 0) - (a.actual_revenue_total || 0)
    })

    const top10Revenue = [...rows]
      .sort((a, b) => (b.actual_revenue_total || 0) - (a.actual_revenue_total || 0))
      .slice(0, 10)
      .map((r) => {
        const raw = (r.full_name || r.username || '').trim()
        const chartLabel = raw.length > 18 ? `${raw.slice(0, 17)}…` : raw
        return { ...r, chartLabel }
      })
      .reverse()

    return {
      sortedForTable,
      histogram,
      top10Revenue,
      summary: {
        total: rows.length,
        atOrOver100,
        below100WithTarget,
        noTarget,
      },
    }
  }, [monthlyKpiLeaderboard])

  const kpiFilteredRows = useMemo(() => {
    const q = kpiLbSearch.trim().toLowerCase()
    if (!q) return kpiLbDerived.sortedForTable
    return kpiLbDerived.sortedForTable.filter(
      (r) =>
        (r.full_name || '').toLowerCase().includes(q) ||
        (r.username || '').toLowerCase().includes(q)
    )
  }, [kpiLbDerived.sortedForTable, kpiLbSearch])

  const kpiLbPageCount = Math.max(1, Math.ceil(kpiFilteredRows.length / KPI_LB_PAGE_SIZE))
  const kpiLbSafePage = Math.min(Math.max(1, kpiLbPage), kpiLbPageCount)
  const kpiLbPageRows = kpiFilteredRows.slice(
    (kpiLbSafePage - 1) * KPI_LB_PAGE_SIZE,
    kpiLbSafePage * KPI_LB_PAGE_SIZE
  )

  useEffect(() => {
    setKpiLbSearch('')
    setKpiLbPage(1)
  }, [monthlyKpiLeaderboard?.period])

  useEffect(() => {
    setKpiLbPage((p) => Math.min(Math.max(1, p), kpiLbPageCount))
  }, [kpiLbPageCount])

  useEffect(() => {
    if (!showDeptFilter) return
    let cancelled = false
    const load = async () => {
      try {
        const res = await apiClient.get('/api/departments/flat')
        if (res.data?.data && !cancelled) {
          setDepartments(
            (Array.isArray(res.data.data) ? res.data.data : []).map((d: { id: string; name: string; path?: string }) => ({
              id: d.id,
              name: d.name || d.id,
              path: d.path
            }))
          )
        }
      } catch (_) {
        if (!cancelled) setDepartments([])
      }
    }
    load()
    return () => { cancelled = true }
  }, [showDeptFilter])

  useEffect(() => {
    let cancelled = false
    const fetchAnalytics = async () => {
      try {
        setLoading(true)
        if (fromDate && toDate && fromDate > toDate) {
          toast.error('Ngày bắt đầu không được lớn hơn ngày kết thúc')
          setLoading(false)
          return
        }
        const params: Record<string, string | number> = {}
        if (fromDate) params.from_date = fromDate
        if (toDate) params.to_date = toDate
        if (showDeptFilter && scopePath) params.scopePath = scopePath
        if (businessType) params.deal_category = businessType
        const response = await apiClient.get('/api/dashboard/analytics', { params })
        if (cancelled) return
        if (response.data.success) {
          setData(response.data.data)
        } else {
          toast.error(response.data.message || 'Không thể tải thống kê')
        }
      } catch (err: any) {
        if (!cancelled) {
          toast.error(err.response?.data?.message || 'Lỗi khi tải thống kê')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchAnalytics()
    return () => { cancelled = true }
  }, [fromDate, toDate, scopePath, showDeptFilter, businessType])

  useEffect(() => {
    if (!canDrillDown(role)) {
      setDeptBreakdown([])
      setEmployeeBreakdown([])
      setDrillDepartmentId(null)
      return
    }

    let cancelled = false
    const fetchBreakdown = async () => {
      try {
        setLoadingBreakdown(true)
        const params: Record<string, string> = {}
        if (fromDate) params.from_date = fromDate
        if (toDate) params.to_date = toDate
        if (showDeptFilter && scopePath) params.scopePath = scopePath
        if (businessType) params.deal_category = businessType
        const [deptRes, empRes] = await Promise.all([
          apiClient.get('/api/dashboard/breakdown/departments', { params }),
          apiClient.get('/api/dashboard/breakdown/employees', { params: { ...params, ...(drillDepartmentId ? { department_id: drillDepartmentId } : {}) } })
        ])
        if (cancelled) return
        setDeptBreakdown(Array.isArray(deptRes.data?.data) ? deptRes.data.data : [])
        setEmployeeBreakdown(Array.isArray(empRes.data?.data) ? empRes.data.data : [])
      } catch (err: any) {
        if (!cancelled) {
          setDeptBreakdown([])
          setEmployeeBreakdown([])
        }
      } finally {
        if (!cancelled) setLoadingBreakdown(false)
      }
    }
    fetchBreakdown()
    return () => { cancelled = true }
  }, [fromDate, toDate, scopePath, showDeptFilter, businessType, role, drillDepartmentId])

  const openEmployeeDetail = async (employeeId: string) => {
    try {
      setLoadingEmployeeDetail(true)
      const params: Record<string, string> = {}
      if (fromDate) params.from_date = fromDate
      if (toDate) params.to_date = toDate
      if (showDeptFilter && scopePath) params.scopePath = scopePath
      if (businessType) params.deal_category = businessType
      params.employee_id = employeeId
      const res = await apiClient.get('/api/dashboard/employee-detail', { params })
      if (res.data?.success) {
        setEmployeeDetail(res.data.data as EmployeeDetailPayload)
      } else {
        toast.error(res.data?.message || 'Không thể tải chi tiết nhân viên')
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi khi tải chi tiết nhân viên')
    } finally {
      setLoadingEmployeeDetail(false)
    }
  }

  const getDateRangeLabel = () => `${fromDate || '...'} -> ${toDate || '...'}`

  const getScopeSubtitle = () => {
    const label = data?.scopeLabel
    if (label === 'personal') return 'Dữ liệu của tôi'
    if (label === 'team') return 'Phạm vi đơn vị của tôi'
    if (label === 'filter' && scopePath) {
      const dept = departments.find((d) => d.id === scopePath)
      return dept ? `Đơn vị: ${dept.name}` : 'Đơn vị đã chọn'
    }
    return 'Toàn công ty'
  }

  const buildReportParams = () => {
    const params: Record<string, string> = {}
    if (fromDate) params.from_date = fromDate
    if (toDate) params.to_date = toDate
    if (showDeptFilter && scopePath) params.scopePath = scopePath
    if (businessType) params.deal_category = businessType
    return params
  }

  const handleExportEmployeeKpi = async () => {
    try {
      setExportingReportKey('employee')
      if (fromDate && toDate && fromDate > toDate) {
        toast.error('Ngày bắt đầu không được lớn hơn ngày kết thúc')
        return
      }
      const response = await apiClient.get('/api/reports/employee-performance', { params: buildReportParams() })
      if (!response.data?.success) {
        toast.error(response.data?.message || 'Không thể xuất báo cáo KPI')
        return
      }
      const reportData = response.data.data as EmployeeKpiReportPayload
      if (!reportData?.rows?.length) {
        toast.error('Không có dữ liệu KPI nhân viên để xuất')
        return
      }
      await exportEmployeeKpiReport(reportData, { businessType, periodLabel: getDateRangeLabel() })
      toast.success(`Đã xuất báo cáo KPI (${reportData.rows.length} nhân viên)`)
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi khi xuất báo cáo KPI')
    } finally {
      setExportingReportKey(null)
    }
  }

  const handleExportSalesForecast = async () => {
    try {
      setExportingReportKey('forecast')
      if (fromDate && toDate && fromDate > toDate) {
        toast.error('Ngày bắt đầu không được lớn hơn ngày kết thúc')
        return
      }
      const response = await apiClient.get('/api/reports/sales-forecast', { params: buildReportParams() })
      if (!response.data?.success) {
        toast.error(response.data?.message || 'Không thể xuất báo cáo forecast')
        return
      }
      const reportData = response.data.data as SalesForecastPayload
      if (!reportData?.rows?.length) {
        toast.error('Không có dữ liệu forecast để xuất')
        return
      }
      await exportSalesForecastReport(reportData)
      toast.success(`Đã xuất báo cáo forecast (${reportData.rows.length} deal)`)
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi khi xuất báo cáo forecast')
    } finally {
      setExportingReportKey(null)
    }
  }

  const handleExportLossAnalysis = async () => {
    try {
      setExportingReportKey('loss')
      if (fromDate && toDate && fromDate > toDate) {
        toast.error('Ngày bắt đầu không được lớn hơn ngày kết thúc')
        return
      }
      const response = await apiClient.get('/api/reports/loss-analysis', { params: buildReportParams() })
      if (!response.data?.success) {
        toast.error(response.data?.message || 'Không thể xuất báo cáo thất bại')
        return
      }
      const reportData = response.data.data as LossAnalysisPayload
      if (!reportData?.rows?.length) {
        toast.error('Không có dữ liệu deal thất bại để xuất')
        return
      }
      await exportLossAnalysisReport(reportData)
      toast.success(`Đã xuất báo cáo loss (${reportData.rows.length} deal)`)
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi khi xuất báo cáo thất bại')
    } finally {
      setExportingReportKey(null)
    }
  }

  const handleExportTaskActivity = async () => {
    try {
      setExportingReportKey('task')
      if (fromDate && toDate && fromDate > toDate) {
        toast.error('Ngày bắt đầu không được lớn hơn ngày kết thúc')
        return
      }
      const response = await apiClient.get('/api/reports/task-activity-log', { params: buildReportParams() })
      if (!response.data?.success) {
        toast.error(response.data?.message || 'Không thể xuất nhật ký công việc')
        return
      }
      const reportData = response.data.data as TaskActivityPayload
      if (!reportData?.rows?.length) {
        toast.error('Không có dữ liệu task để xuất')
        return
      }
      await exportTaskActivityReport(reportData)
      toast.success(`Đã xuất nhật ký công việc (${reportData.rows.length} task)`)
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi khi xuất nhật ký công việc')
    } finally {
      setExportingReportKey(null)
    }
  }

  if (loading && !data) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50">
          <Navbar />
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
              <span className="ml-3 text-gray-600">Đang tải thống kê...</span>
            </div>
          </div>
        </div>
      </ProtectedRoute>
    )
  }

  if (!data) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50">
          <Navbar />
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <p className="text-gray-600">Không có dữ liệu thống kê</p>
          </div>
        </div>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header + Filters */}
          <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                {data?.scopeLabel === 'personal' ? 'Dashboard của tôi' : 'Dashboard'}
              </h1>
              <p className="text-gray-600 mt-2">{getScopeSubtitle()}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">Loại hình:</span>
                <select
                  value={businessType}
                  onChange={(e) => setBusinessType(e.target.value as 'MASS' | 'PROJECT' | '')}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white"
                >
                  <option value="">Tất cả</option>
                  <option value="MASS">MASS</option>
                  <option value="PROJECT">Dự án (Customize)</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-gray-400" />
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-700">Từ ngày:</span>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-700">Đến ngày:</span>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white"
                  />
                </div>
              </div>
              {showDeptFilter && (
                <div className="flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-gray-400" />
                  <select
                    value={scopePath}
                    onChange={(e) => setScopePath(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white min-w-[180px]"
                  >
                    <option value="">Toàn đơn vị</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">Cần chú ý:</span>
                <select
                  value={confidenceFilter}
                  onChange={(e) => setConfidenceFilter(e.target.value as 'all' | 'low')}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white"
                >
                  <option value="all">Tất cả</option>
                  <option value="low">Chỉ mức Đỏ (rủi ro cao)</option>
                </select>
              </div>
              {canExportForecast(role) && (
                <button
                  type="button"
                  onClick={handleExportSalesForecast}
                  disabled={!!exportingReportKey}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {exportingReportKey === 'forecast' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  <span>Xuất Forecast</span>
                </button>
              )}
              {canExportEmployeePerformance(role) && (
                <button
                  type="button"
                  onClick={handleExportEmployeeKpi}
                  disabled={!!exportingReportKey}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {exportingReportKey === 'employee' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  <span>Xuất KPI nhân viên</span>
                </button>
              )}
              {canExportLossAnalysis(role) && (
                <button
                  type="button"
                  onClick={handleExportLossAnalysis}
                  disabled={!!exportingReportKey}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-60"
                >
                  {exportingReportKey === 'loss' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  <span>Xuất Loss Analysis</span>
                </button>
              )}
              {canExportTaskLog(role) && (
                <button
                  type="button"
                  onClick={handleExportTaskActivity}
                  disabled={!!exportingReportKey}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-700 text-white hover:bg-amber-800 disabled:opacity-60"
                >
                  {exportingReportKey === 'task' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  <span>Xuất Task Log</span>
                </button>
              )}
            </div>
          </div>

          {/* Row 1: 4 KPI cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-xl shadow p-6 border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Tổng doanh thu (Won)</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {formatCurrency(data.revenue.totalRevenue)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Deal đã thắng</p>
                </div>
                <div className="bg-emerald-100 p-3 rounded-lg">
                  <DollarSign className="w-6 h-6 text-emerald-600" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow p-6 border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Pipeline (Active)</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {formatCurrency(data.revenue.pipelineValue)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Đang chào báo / thương thảo</p>
                </div>
                <div className="bg-blue-100 p-3 rounded-lg">
                  <TrendingUp className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow p-6 border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Tỷ lệ thắng</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {data.winRate.winRate}%
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {data.winRate.won}/{data.winRate.closed} deal đã kết thúc
                  </p>
                </div>
                <div className="bg-amber-100 p-3 rounded-lg">
                  <Percent className="w-6 h-6 text-amber-600" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow p-6 border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Deal đang active</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {data.activeDealsCount}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Trong pipeline</p>
                </div>
                <div className="bg-violet-100 p-3 rounded-lg">
                  <Briefcase className="w-6 h-6 text-violet-600" />
                </div>
              </div>
            </div>
          </div>

          {/* MASS & PROJECT: API luôn trả hai khối riêng (không phụ thuộc ô lọc Loại hình trên header) */}
          {(data.massStats || data.projectStats) && (
            <div className="mb-8 grid grid-cols-1 gap-6">
              {data.massStats && (
                <div className="bg-white rounded-xl shadow p-6 border border-gray-100">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-sky-50 text-sky-700">
                      <Package className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Deal MASS</h3>
                      <p className="text-sm text-gray-500 mt-1">
                        Luôn chỉ tính deal <strong>MASS</strong> (cột deal_category). Phạm vi nhân viên/ngày giống các chỉ
                        số chính; <strong>không</strong> đổi khi bạn chỉ lọc “Dự án” ở ô Loại hình — khối này vẫn là MASS
                        riêng.
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                    <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
                      <p className="text-xs text-gray-500 font-medium">Deal tạo (khoảng lọc)</p>
                      <p className="text-xl font-bold text-gray-900 mt-1">{data.massStats.growthRate.thisMonthCount}</p>
                    </div>
                    <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
                      <p className="text-xs text-gray-500 font-medium">Kỳ liền trước (cùng độ dài)</p>
                      <p className="text-xl font-bold text-gray-700 mt-1">{data.massStats.growthRate.lastMonthCount}</p>
                    </div>
                    <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
                      <p className="text-xs text-gray-500 font-medium">% thay đổi</p>
                      <p
                        className={`text-xl font-bold mt-1 ${
                          data.massStats.growthRate.growthRate >= 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {data.massStats.growthRate.growthRate >= 0 ? '+' : ''}
                        {data.massStats.growthRate.growthRate}%
                      </p>
                    </div>
                  </div>
                  {data.massStats.dealCountTrend.some((x) => x.count > 0) ? (
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={data.massStats.dealCountTrend} margin={{ left: 0, right: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis allowDecimals={false} width={36} />
                        <Tooltip formatter={(v: number | string | undefined) => [Number(v ?? 0), 'Số deal MASS']} />
                        <Bar dataKey="count" fill="#0369a1" name="Số deal" radius={[4, 4, 0, 0]} maxBarSize={40} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-40 text-sm text-gray-500 border border-dashed border-gray-200 rounded-lg">
                      Không có deal MASS được tạo trong khoảng ngày đã chọn.
                    </div>
                  )}
                  {data.massStats.serviceBreakdown && data.massStats.serviceBreakdown.length > 0 && (
                    <div className="mt-6">
                      <h4 className="text-sm font-semibold text-gray-800 mb-1">Tỉ trọng theo Sản phẩm (CBS)</h4>
                      <p className="text-xs text-gray-500 mb-3">Phân bổ đơn CBS theo tên sản phẩm trong khoảng ngày đã chọn.</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Pie: Doanh thu */}
                        <div>
                          <p className="text-xs font-medium text-gray-600 text-center mb-1">Tỉ trọng doanh thu</p>
                          <ResponsiveContainer width="100%" height={280}>
                            <PieChart>
                              <Pie
                                data={data.massStats.serviceBreakdown}
                                dataKey="total_amount"
                                nameKey="service_name"
                                cx="50%"
                                cy="50%"
                                outerRadius={95}
                                label={(props: { name?: string; percent?: number }) =>
                                  `${(props.name || '').length > 14 ? (props.name || '').slice(0, 13) + '…' : props.name}: ${((props.percent || 0) * 100).toFixed(0)}%`
                                }
                                labelLine
                              >
                                {data.massStats.serviceBreakdown.map((_, idx) => (
                                  <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                                ))}
                              </Pie>
                              <Tooltip
                                formatter={(v: number | string | undefined, _name: string | undefined, props: any) => [
                                  formatCurrency(Number(v ?? 0)),
                                  props?.payload?.service_name || '',
                                ]}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        {/* Donut: Số lượng */}
                        <div>
                          <p className="text-xs font-medium text-gray-600 text-center mb-1">Tỉ trọng số lượng</p>
                          <ResponsiveContainer width="100%" height={280}>
                            <PieChart>
                              <Pie
                                data={data.massStats.serviceBreakdown}
                                dataKey="deal_count"
                                nameKey="service_name"
                                cx="50%"
                                cy="50%"
                                innerRadius={55}
                                outerRadius={95}
                                label={(props: { name?: string; value?: number; percent?: number }) =>
                                  `${(props.name || '').length > 14 ? (props.name || '').slice(0, 13) + '…' : props.name}: ${props.value} (${((props.percent || 0) * 100).toFixed(0)}%)`
                                }
                                labelLine
                              >
                                {data.massStats.serviceBreakdown.map((_, idx) => (
                                  <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                                ))}
                              </Pie>
                              <Tooltip
                                formatter={(v: number | string | undefined, _name: string | undefined, props: any) => [
                                  `${Number(v ?? 0)} đơn`,
                                  props?.payload?.service_name || '',
                                ]}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {data.projectStats && (
                <div className="bg-white rounded-xl shadow p-6 border border-gray-100">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-violet-50 text-violet-700">
                      <FolderKanban className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Dự án (PROJECT)</h3>
                      <p className="text-sm text-gray-500 mt-1">
                        Luôn chỉ deal <strong>PROJECT</strong>. Tổng trọng số = SUM(amount × % giai đoạn × hệ số độ tự tin);
                        danh sách là top cơ hội theo <strong>amount</strong>.
                      </p>
                    </div>
                  </div>
                  <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-4 mb-4">
                    <p className="text-xs font-medium text-violet-800 uppercase tracking-wide">Tổng giá trị có trọng số</p>
                    <p className="text-2xl font-bold text-violet-900 mt-1">{formatCurrency(data.projectStats.totalWeightValue)}</p>
                    <p className="text-xs text-violet-700/90 mt-1">Won + active (created_at trong khoảng lọc)</p>
                  </div>
                  {data.projectStats.topOpportunities.length > 0 ? (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-800 mb-2">Top cơ hội</h4>
                      <ul className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                        {data.projectStats.topOpportunities.map((deal) => (
                          <li
                            key={deal.deal_id}
                            className="flex items-start justify-between gap-2 py-2 border-b border-gray-100 last:border-0 text-sm"
                          >
                            <div className="min-w-0">
                              <Link
                                href={`/deals?openDealId=${deal.deal_id}`}
                                className="font-medium text-primary-600 hover:underline"
                              >
                                {deal.display_code || deal.deal_id} — {deal.title}
                              </Link>
                              <p className="text-xs text-gray-500">
                                {DEAL_STAGE_LABEL[deal.stage] || deal.stage}
                                {deal.status ? ` · ${deal.status}` : ''} · {formatCurrency(deal.amount)}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500 border border-dashed border-gray-200 rounded-lg py-8 text-center">
                      Chưa có deal PROJECT trong phạm vi lọc.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* KPI progress (chỉ hiện khi có chỉ tiêu) */}
          {data.kpiProgress.targetValue > 0 && (
            <div className="mb-8 bg-white rounded-xl shadow p-6 border border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Tiến độ KPI — tổng toàn Sales (tenant)</h3>
              <p className="text-xs text-gray-500 mb-3">
                Gộp chỉ tiêu và thực đạt từ KPI tháng: <strong>mọi tháng</strong> có trong khoảng ngày lọc,{' '}
                <strong>toàn tenant</strong> (không lọc theo đơn vị / Loại hình MASS–Dự án). Khác với khối so sánh KPI nhân
                viên bên dưới.
              </p>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-gray-500">Chỉ tiêu: {formatCurrency(data.kpiProgress.targetValue)}</p>
                  <p className="text-sm text-gray-500">Thực đạt: {formatCurrency(data.kpiProgress.actualRevenue)}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-primary-600">{data.kpiProgress.progressPercent}%</p>
                  <p className="text-xs text-gray-500">đạt chỉ tiêu</p>
                </div>
              </div>
              <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary-500 rounded-full transition-all"
                  style={{ width: `${Math.min(100, data.kpiProgress.progressPercent)}%` }}
                />
              </div>
            </div>
          )}

          {/* KPI tháng: tối ưu cho nhiều nhân viên (phân bổ + Top 10 + bảng phân trang) */}
          {monthlyKpiLeaderboard && kpiLbDerived.summary.total > 0 && (
            <div className="mb-8 bg-white rounded-xl shadow p-6 border border-gray-100">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-teal-50 text-teal-700">
                    <Target className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">KPI tháng — so sánh nhân viên</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      Kỳ <strong className="text-gray-800">{monthlyKpiLeaderboard.period}</strong> (tháng của ngày kết thúc
                      bộ lọc) — <strong className="text-gray-800">{kpiLbDerived.summary.total}</strong> Sales trong phạm vi
                      Dashboard. KPI tháng <strong>không</strong> đổi khi chọn Loại hình MASS / Dự án. Biểu đồ cột là{' '}
                      <em>phân bổ theo mức đạt</em>; bảng dưới có tìm kiếm và phân trang.
                      {data.scopeLabel === 'personal'
                        ? ' Phạm vi: cá nhân.'
                        : data.scopeLabel === 'team'
                          ? ' Phạm vi: nhóm.'
                          : ' Phạm vi: toàn bộ dữ liệu được phép.'}
                    </p>
                  </div>
                </div>
                {canAccessKpiPage(role) && monthlyKpiLeaderboard.period && (
                  <Link
                    href={`/kpi?period=${encodeURIComponent(monthlyKpiLeaderboard.period)}`}
                    className="text-sm font-semibold text-primary-600 hover:text-primary-800 whitespace-nowrap"
                  >
                    Mở trang KPI →
                  </Link>
                )}
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-4">
                  <div className="flex items-center gap-2 text-gray-500 text-xs font-medium uppercase tracking-wide">
                    <Users className="w-4 h-4" />
                    Tổng Sales
                  </div>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{kpiLbDerived.summary.total}</p>
                </div>
                <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-4">
                  <p className="text-xs font-medium text-emerald-800 uppercase tracking-wide">Đạt / vượt (≥100%)</p>
                  <p className="text-2xl font-bold text-emerald-700 mt-1">{kpiLbDerived.summary.atOrOver100}</p>
                  <p className="text-xs text-emerald-700/80 mt-0.5">Có chỉ tiêu doanh thu</p>
                </div>
                <div className="rounded-lg border border-amber-100 bg-amber-50/60 p-4">
                  <p className="text-xs font-medium text-amber-900 uppercase tracking-wide">Dưới 100%</p>
                  <p className="text-2xl font-bold text-amber-800 mt-1">{kpiLbDerived.summary.below100WithTarget}</p>
                  <p className="text-xs text-amber-800/80 mt-0.5">Có chỉ tiêu, chưa đủ</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-medium text-slate-600 uppercase tracking-wide">Chưa giao CT DT</p>
                  <p className="text-2xl font-bold text-slate-800 mt-1">{kpiLbDerived.summary.noTarget}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Chờ giao chỉ tiêu / kỳ mới</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                <div>
                  <h4 className="text-sm font-semibold text-gray-800 mb-1">Phân bổ mức đạt doanh thu KPI</h4>
                  <p className="text-xs text-gray-500 mb-3">
                    Số nhân viên theo từng nhóm (tổng mọi người = {kpiLbDerived.summary.total}) — phù hợp khi có nhiều
                    nhân viên, ví dụ 100+.
                  </p>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={kpiLbDerived.histogram} margin={{ top: 12, right: 8, left: 0, bottom: 56 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10 }}
                        interval={0}
                        angle={-22}
                        textAnchor="end"
                        height={72}
                      />
                      <YAxis allowDecimals={false} width={36} />
                      <Tooltip formatter={(v: number | string | undefined) => [Number(v ?? 0), 'Số nhân viên']} />
                      <Bar dataKey="count" name="Số NV" radius={[6, 6, 0, 0]} maxBarSize={56}>
                        {kpiLbDerived.histogram.map((entry) => (
                          <Cell key={entry.key} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-800 mb-1">Top 10 thực hiện doanh thu KPI (VNĐ)</h4>
                  <p className="text-xs text-gray-500 mb-3">
                    So sánh nhanh chỉ tiêu vs thực hiện trên 10 người dẫn đầu; toàn bộ nằm ở bảng phía dưới.
                  </p>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={kpiLbDerived.top10Revenue} layout="vertical" margin={{ left: 4, right: 12 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tickFormatter={(v) => formatShortCurrency(Number(v))} />
                      <YAxis type="category" dataKey="chartLabel" width={108} tick={{ fontSize: 11 }} />
                      <Tooltip
                        formatter={(value: number | string | undefined, name: string | undefined) => [
                          formatCurrency(Number(value ?? 0)),
                          name === 'target_revenue_total' ? 'Chỉ tiêu' : 'Thực hiện',
                        ]}
                        labelFormatter={(_, payload) => {
                          const p = (payload?.[0]?.payload ?? {}) as { full_name?: string }
                          return p.full_name || ''
                        }}
                      />
                      <Legend
                        formatter={(value) =>
                          value === 'target_revenue_total' ? 'Chỉ tiêu' : value === 'actual_revenue_total' ? 'Thực hiện' : String(value)
                        }
                      />
                      <Bar dataKey="target_revenue_total" name="target_revenue_total" fill="#94a3b8" radius={[0, 3, 3, 0]} barSize={11} />
                      <Bar dataKey="actual_revenue_total" name="actual_revenue_total" fill="#0f766e" radius={[0, 3, 3, 0]} barSize={11} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-800">Bảng chi tiết theo nhân viên</h4>
                    <p className="text-xs text-gray-500 mt-0.5">
                      SP: chỉ tiêu / thực hiện <strong>số lượng</strong> sản phẩm (mới + hiện hữu).
                    </p>
                  </div>
                  <div className="relative max-w-md w-full sm:w-72">
                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="search"
                      value={kpiLbSearch}
                      onChange={(e) => {
                        setKpiLbSearch(e.target.value)
                        setKpiLbPage(1)
                      }}
                      placeholder="Tìm theo tên hoặc username..."
                      className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 bg-white"
                    />
                  </div>
                </div>
                <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
                  <table className="min-w-[1120px] w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-white shadow-sm">
                      <tr className="text-left text-gray-600 border-b border-gray-200">
                        <th className="px-3 py-2.5 font-semibold w-10">#</th>
                        <th className="px-3 py-2.5 font-semibold">Họ tên</th>
                        <th className="px-3 py-2.5 font-semibold text-right">CT doanh thu</th>
                        <th className="px-3 py-2.5 font-semibold text-right">TH doanh thu</th>
                        <th className="px-3 py-2.5 font-semibold text-right">% đạt DT</th>
                        <th className="px-3 py-2.5 font-semibold text-right">CT tiếp cận</th>
                        <th className="px-3 py-2.5 font-semibold text-right">TH tiếp cận</th>
                        <th className="px-3 py-2.5 font-semibold text-right">% đạt TC</th>
                        <th className="px-3 py-2.5 font-semibold text-right">CT SP</th>
                        <th className="px-3 py-2.5 font-semibold text-right">TH SP</th>
                        <th className="px-3 py-2.5 font-semibold text-right">% đạt SP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {kpiLbPageRows.map((r, idx) => {
                        const stt = (kpiLbSafePage - 1) * KPI_LB_PAGE_SIZE + idx + 1
                        const pctDt =
                          r.revenue_achievement_pct != null
                            ? `${r.revenue_achievement_pct.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`
                            : '—'
                        const pctTc =
                          r.approach_achievement_pct != null
                            ? `${r.approach_achievement_pct.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`
                            : '—'
                        const pctSp =
                          r.product_achievement_pct != null
                            ? `${r.product_achievement_pct.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`
                            : '—'
                        return (
                          <tr key={r.employee_id} className="border-b border-gray-100 hover:bg-gray-50/80">
                            <td className="px-3 py-2 text-gray-500">{stt}</td>
                            <td className="px-3 py-2 font-medium text-gray-900">
                              {r.full_name}
                              {r.username ? (
                                <span className="block text-xs font-normal text-gray-500">@{r.username}</span>
                              ) : null}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-gray-700">{formatCurrency(r.target_revenue_total)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-gray-900">{formatCurrency(r.actual_revenue_total)}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-800">{pctDt}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-gray-700">{r.approach_target}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-gray-900">{r.approach_actual}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-800">{pctTc}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-gray-700">{r.target_product_total}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-gray-900">{r.actual_product_total}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-800">{pctSp}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 bg-gray-50 border-t border-gray-200 text-sm text-gray-600">
                  <span>
                    {kpiFilteredRows.length === 0 ? (
                      'Không có dòng nào khớp tìm kiếm.'
                    ) : (
                      <>
                        Hiển thị{' '}
                        <strong className="text-gray-900">
                          {(kpiLbSafePage - 1) * KPI_LB_PAGE_SIZE + 1}–
                          {Math.min(kpiLbSafePage * KPI_LB_PAGE_SIZE, kpiFilteredRows.length)}
                        </strong>{' '}
                        / {kpiFilteredRows.length}
                        {kpiLbSearch.trim() ? ' (đã lọc)' : ''}
                      </>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={kpiLbSafePage <= 1}
                      onClick={() => setKpiLbPage((p) => Math.max(1, p - 1))}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:pointer-events-none"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Trước
                    </button>
                    <span className="tabular-nums px-2">
                      Trang {kpiLbSafePage} / {kpiLbPageCount}
                    </span>
                    <button
                      type="button"
                      disabled={kpiLbSafePage >= kpiLbPageCount}
                      onClick={() => setKpiLbPage((p) => Math.min(kpiLbPageCount, p + 1))}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:pointer-events-none"
                    >
                      Sau
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Pipeline health by confidence (pie) */}
          {data.pipelineHealth && (() => {
            const pieData = data.pipelineHealth.filter((p) => p.count > 0)
            return pieData.length > 0 && (
              <div className="mb-8 bg-white rounded-xl shadow p-6 border border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Phân tích sức khỏe Pipeline</h3>
                <p className="text-sm text-gray-500 mb-4">Phân bố deal đang active theo mức độ tự tin (Traffic Light)</p>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="count"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      label={(props: { name?: string; value?: number }) => `${props.name ?? ''}: ${props.value ?? 0}`}
                    >
                      {pieData.map((entry) => (
                        <Cell key={entry.level} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number | string | undefined, _name, props) => [Number(v ?? 0), (props?.payload as { label?: string } | undefined)?.label ?? '']} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )
          })()}

          {/* Row 2: Funnel (left) + Line trend (right) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <div className="bg-white rounded-xl shadow p-6 border border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Phễu Deal theo giai đoạn</h3>
              <p className="text-sm text-gray-500 mb-4">Số lượng deal (theo bộ lọc ngày và loại hình) — trục ngang là số deal, không phải tiền.</p>
              {data.funnel.some((f) => f.count > 0) ? (
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={data.funnel} layout="vertical" margin={{ left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      allowDecimals={false}
                      tickFormatter={(v) => new Intl.NumberFormat('vi-VN').format(Number(v))}
                    />
                    <YAxis type="category" dataKey="label" width={80} />
                    <Tooltip formatter={(v: number | string | undefined) => [Number(v ?? 0), 'Số Deal']} />
                    <Bar dataKey="count" fill="#0066CC" name="Số Deal" radius={[0, 4, 4, 0]}>
                      <LabelList dataKey="count" position="right" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-64 text-gray-500">Chưa có dữ liệu</div>
              )}
            </div>
            <div className="bg-white rounded-xl shadow p-6 border border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Doanh thu Won theo tháng</h3>
              <p className="text-sm text-gray-500 mb-4">
                {data.monthlyTrend.length} tháng trong khoảng {fromDate} → {toDate} (deal thắng theo ngày cập nhật).
              </p>
              {data.monthlyTrend.some((m) => m.revenue > 0) ? (
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={data.monthlyTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" />
                    <YAxis tickFormatter={(v) => formatShortCurrency(v)} />
                    <Tooltip formatter={(v: number | string | undefined) => [formatCurrency(Number(v ?? 0)), 'Doanh thu']} />
                    <Legend />
                    <Line type="monotone" dataKey="revenue" stroke="#0066CC" strokeWidth={2} name="Doanh thu" dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-64 text-gray-500">Chưa có dữ liệu</div>
              )}
            </div>
          </div>

          {/* Row 3: Top Sales + Stale Deals */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow p-6 border border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <User className="w-5 h-5" />
                {data.scopeLabel === 'personal' ? 'Doanh số của tôi' : 'Top 5 nhân viên doanh số'}
              </h3>
              {data.topSales.length > 0 ? (
                <ul className="space-y-3">
                  {data.topSales.map((emp, idx) => (
                    <li key={emp.employee_id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-gray-500 w-6">{idx + 1}</span>
                        {emp.avatar_url ? (
                          <img src={emp.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                            <User className="w-5 h-5 text-primary-600" />
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-gray-900">{emp.full_name}</p>
                          <p className="text-xs text-gray-500">{emp.employee_id}</p>
                        </div>
                      </div>
                      <span className="font-semibold text-primary-600">{formatCurrency(emp.total_revenue)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="py-8 text-center text-gray-500">Chưa có dữ liệu</div>
              )}
            </div>
            <div className="bg-white rounded-xl shadow p-6 border border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-500" />
                {data.scopeLabel === 'personal' ? 'Deal của tôi cần chú ý' : 'Deal cần chú ý'}
              </h3>
              <p className="text-sm text-gray-500 mb-3">Dự án giá trị lớn (&gt;100tr) mức Đỏ hoặc deal trì trệ (30 ngày không cập nhật)</p>
              {(confidenceFilter === 'low' ? data.staleDeals.filter((d) => d.confidence_level === 'low') : data.staleDeals).length > 0 ? (
                <ul className="space-y-2">
                  {(confidenceFilter === 'low' ? data.staleDeals.filter((d) => d.confidence_level === 'low') : data.staleDeals).map((deal) => (
                    <li key={deal.deal_id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`flex-shrink-0 w-2.5 h-2.5 rounded-full ${
                            deal.confidence_level === 'high' ? 'bg-emerald-500' : deal.confidence_level === 'low' ? 'bg-red-500' : 'bg-amber-400'
                          }`}
                          title={deal.confidence_level === 'low' ? 'Rủi ro cao' : deal.confidence_level === 'high' ? 'Chắc chắn' : '50/50'}
                        />
                        <div className="min-w-0">
                          <Link href={`/deals?openDealId=${deal.deal_id}`} className="font-medium text-primary-600 hover:underline">
                            {deal.display_code || deal.deal_id} — {deal.title}
                          </Link>
                          <p className="text-xs text-gray-500">{deal.stage} · {formatCurrency(deal.amount)}</p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="py-8 text-center text-gray-500">
                  {confidenceFilter === 'low' ? 'Không có deal nào ở mức Đỏ' : 'Không có deal cần chú ý'}
                </div>
              )}
            </div>
          </div>

          {/* Drill-down for leadership */}
          {canDrillDown(role) && (
            <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl shadow p-6 border border-gray-100">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Hiệu suất theo đơn vị con</h3>
                    <p className="text-sm text-gray-500">Click đơn vị để drill-down danh sách nhân viên</p>
                  </div>
                  {drillDepartmentId && (
                    <button
                      type="button"
                      onClick={() => setDrillDepartmentId(null)}
                      className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
                    >
                      Bỏ lọc đơn vị
                    </button>
                  )}
                </div>

                {loadingBreakdown ? (
                  <div className="py-10 flex items-center justify-center text-gray-500">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" /> Đang tải...
                  </div>
                ) : deptBreakdown.length === 0 ? (
                  <div className="py-10 text-center text-gray-500">Chưa có dữ liệu</div>
                ) : (
                  <div className="overflow-auto">
                    <table className="min-w-full text-sm">
                      <thead className="text-gray-600">
                        <tr className="border-b">
                          <th className="text-left py-2 pr-3">Đơn vị</th>
                          <th className="text-right py-2 px-3">NV</th>
                          <th className="text-right py-2 px-3">Won</th>
                          <th className="text-right py-2 px-3">Pipeline</th>
                          <th className="text-right py-2 pl-3">Overdue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deptBreakdown.map((d) => (
                          <tr
                            key={d.department_id}
                            className={`border-b last:border-0 cursor-pointer hover:bg-gray-50 ${drillDepartmentId === d.department_id ? 'bg-blue-50' : ''}`}
                            onClick={() => setDrillDepartmentId(d.department_id)}
                          >
                            <td className="py-2 pr-3">
                              <div className="font-medium text-gray-900">{d.department_name || d.department_id}</div>
                              <div className="text-xs text-gray-500 truncate max-w-[240px]">{d.department_path}</div>
                            </td>
                            <td className="py-2 px-3 text-right">{d.employee_count}</td>
                            <td className="py-2 px-3 text-right font-medium text-emerald-700">{formatShortCurrency(d.revenue_won)}</td>
                            <td className="py-2 px-3 text-right text-gray-700">{formatShortCurrency(d.pipeline_value)}</td>
                            <td className="py-2 pl-3 text-right">
                              <span className={d.overdue_tasks > 0 ? 'text-red-600 font-semibold' : 'text-gray-600'}>
                                {d.overdue_tasks}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl shadow p-6 border border-gray-100">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      Hiệu suất theo nhân viên {drillDepartmentId ? '(đã lọc theo đơn vị)' : ''}
                    </h3>
                    <p className="text-sm text-gray-500">Click nhân viên để xem chi tiết (deal cần chú ý, task overdue)</p>
                  </div>
                </div>

                {loadingBreakdown ? (
                  <div className="py-10 flex items-center justify-center text-gray-500">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" /> Đang tải...
                  </div>
                ) : employeeBreakdown.length === 0 ? (
                  <div className="py-10 text-center text-gray-500">Chưa có dữ liệu</div>
                ) : (
                  <div className="overflow-auto">
                    <table className="min-w-full text-sm">
                      <thead className="text-gray-600">
                        <tr className="border-b">
                          <th className="text-left py-2 pr-3">Nhân viên</th>
                          <th className="text-right py-2 px-3">Won</th>
                          <th className="text-right py-2 px-3">Pipeline</th>
                          <th className="text-right py-2 pl-3">Overdue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {employeeBreakdown.map((e) => (
                          <tr
                            key={e.employee_id}
                            className="border-b last:border-0 cursor-pointer hover:bg-gray-50"
                            onClick={() => openEmployeeDetail(e.employee_id)}
                          >
                            <td className="py-2 pr-3">
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="font-medium text-gray-900 truncate">
                                    #{e.rank} {e.full_name}
                                  </div>
                                  <div className="text-xs text-gray-500 truncate">{e.department_name}</div>
                                </div>
                                <span className="text-xs text-gray-400">{e.employee_id}</span>
                              </div>
                            </td>
                            <td className="py-2 px-3 text-right font-medium text-emerald-700">{formatShortCurrency(e.revenue_won)}</td>
                            <td className="py-2 px-3 text-right text-gray-700">{formatShortCurrency(e.pipeline_value)}</td>
                            <td className="py-2 pl-3 text-right">
                              <span className={e.overdue_tasks > 0 ? 'text-red-600 font-semibold' : 'text-gray-600'}>
                                {e.overdue_tasks}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Employee detail modal */}
          {employeeDetail && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
              <div className="w-full max-w-4xl max-h-[90vh] bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden flex flex-col">
                <div className="flex items-start justify-between p-6 border-b">
                  <div className="min-w-0">
                    <h3 className="text-xl font-semibold text-gray-900 truncate">
                      {employeeDetail.employee.full_name} ({employeeDetail.employee.employee_id})
                    </h3>
                    <p className="text-sm text-gray-500 mt-1 truncate">
                      {employeeDetail.employee.department_name || 'Chưa có đơn vị'} · {getDateRangeLabel()}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm"
                    onClick={() => setEmployeeDetail(null)}
                  >
                    Đóng
                  </button>
                </div>

                {loadingEmployeeDetail ? (
                  <div className="p-10 flex items-center justify-center text-gray-500">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" /> Đang tải...
                  </div>
                ) : (
                  <div className="p-6 space-y-6 overflow-y-auto">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                        <div className="text-xs text-gray-500">Doanh thu Won</div>
                        <div className="text-lg font-semibold text-gray-900 mt-1">
                          {formatCurrency(employeeDetail.kpi.revenue.totalRevenue)}
                        </div>
                      </div>
                      <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                        <div className="text-xs text-gray-500">Pipeline</div>
                        <div className="text-lg font-semibold text-gray-900 mt-1">
                          {formatCurrency(employeeDetail.kpi.revenue.pipelineValue)}
                        </div>
                      </div>
                      <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                        <div className="text-xs text-gray-500">Win rate</div>
                        <div className="text-lg font-semibold text-gray-900 mt-1">
                          {employeeDetail.kpi.winRate.winRate}%
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {employeeDetail.kpi.winRate.won}/{employeeDetail.kpi.winRate.closed} deal đã kết thúc
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div className="rounded-xl border border-gray-100 p-4">
                        <h4 className="font-semibold text-gray-900 mb-2">Deal cần chú ý</h4>
                        {employeeDetail.dealsNeedingAttention?.length ? (
                          <ul className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                            {employeeDetail.dealsNeedingAttention.slice(0, 10).map((deal) => (
                              <li key={deal.deal_id} className="flex items-center justify-between gap-3 py-2 border-b border-gray-100 last:border-0">
                                <div className="min-w-0">
                                  <Link href={`/deals?openDealId=${deal.deal_id}`} className="text-sm font-medium text-primary-600 hover:underline">
                                    {deal.display_code || deal.deal_id} — {deal.title}
                                  </Link>
                                  <div className="text-xs text-gray-500 truncate">
                                    {deal.stage} · {formatCurrency(deal.amount)}
                                  </div>
                                </div>
                                <span
                                  className={`flex-shrink-0 w-2.5 h-2.5 rounded-full ${
                                    deal.confidence_level === 'high' ? 'bg-emerald-500' : deal.confidence_level === 'low' ? 'bg-red-500' : 'bg-amber-400'
                                  }`}
                                  title={deal.confidence_level || ''}
                                />
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="py-6 text-center text-gray-500 text-sm">Không có deal cần chú ý</div>
                        )}
                      </div>

                      <div className="rounded-xl border border-gray-100 p-4">
                        <h4 className="font-semibold text-gray-900 mb-2">Task quá hạn</h4>
                        {employeeDetail.overdueTasks?.length ? (
                          <ul className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                            {employeeDetail.overdueTasks.slice(0, 20).map((t) => (
                              <li key={t.task_id} className="py-2 border-b border-gray-100 last:border-0">
                                <div className="text-sm font-medium text-gray-900">
                                  {t.display_code || t.task_id} — {t.title}
                                </div>
                                <div className="text-xs text-gray-500 mt-0.5">
                                  Due: {t.due_date ? new Date(t.due_date).toLocaleDateString('vi-VN') : 'Chưa có hạn'}
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="py-6 text-center text-gray-500 text-sm">Không có task quá hạn</div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  )
}



