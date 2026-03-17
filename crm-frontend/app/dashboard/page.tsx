'use client'

import { useState, useEffect } from 'react'
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
  Download
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
  Cell
} from 'recharts'
import toast from 'react-hot-toast'
import Link from 'next/link'
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
  }
  projectStats?: {
    totalWeightValue: number
    topOpportunities: Array<{ deal_id: string; title: string; amount: number; stage: string; display_code?: string | null; status?: string }>
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

          {/* KPI progress (chỉ hiện khi có chỉ tiêu) */}
          {data.kpiProgress.targetValue > 0 && (
            <div className="mb-8 bg-white rounded-xl shadow p-6 border border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Tiến độ KPI (tháng/năm hiện tại)</h3>
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
              {data.funnel.some((f) => f.count > 0) ? (
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={data.funnel} layout="vertical" margin={{ left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(v) => formatShortCurrency(v)} />
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
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Xu hướng doanh thu 12 tháng</h3>
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
              <div className="w-full max-w-4xl bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
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
                  <div className="p-6 space-y-6">
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
                          <ul className="space-y-2">
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
                          <ul className="space-y-2">
                            {employeeDetail.overdueTasks.slice(0, 20).map((t) => (
                              <li key={t.task_id} className="py-2 border-b border-gray-100 last:border-0">
                                <div className="text-sm font-medium text-gray-900">
                                  {t.display_code || t.task_id} — {t.title}
                                </div>
                                <div className="text-xs text-gray-500 mt-0.5">
                                  Due: {t.due_date ? new Date(t.due_date).toLocaleDateString('vi-VN') : '-'}
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



