'use client'

import { useState, useEffect } from 'react'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { Navbar } from '@/components/Navbar'
import { apiClient } from '@/lib/api'
import { 
  DollarSign, 
  Users, 
  CheckSquare, 
  MessageSquare,
  Loader2,
  Calendar,
  TrendingUp
} from 'lucide-react'
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts'
import toast from 'react-hot-toast'

interface DashboardStats {
  overview: {
    totalRevenue: number
    totalCustomers: number
    pendingTasks: number
    totalInteractions: number
  }
  customerDistribution: Array<{ type: string; count: number }>
  employeePerformance: Array<{
    employee_id: string
    full_name: string
    customer_count: number
    successful_deals: number
    total_revenue: number
  }>
  dealStages: Array<{ stage: string; count: number }>
}

// Màu sắc theo tông màu MobiFone (xanh chủ đạo)
const COLORS = ['#0066CC', '#00A3E0', '#00C49F', '#4CAF50', '#2196F3', '#03A9F4', '#00BCD4', '#009688']

const getCustomerTypeLabel = (type: string) => {
  const types: { [key: string]: string } = {
    individual: 'Cá nhân',
    company: 'Doanh nghiệp',
    so_ban_nganh: 'Sở ban ngành',
    cong_an_tinh: 'Công an Tỉnh',
    cong_an_xa: 'Công an xã',
    xa_phuong: 'Xã phường',
    doanh_nghiep_lon: 'Doanh nghiệp lớn',
    ho_kinh_doanh: 'Hộ kinh doanh',
    hop_tac_xa: 'Hợp tác xã'
  }
  return types[type] || type || 'Không xác định'
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND'
  }).format(value)
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<'month' | 'quarter' | 'year'>('month')

  useEffect(() => {
    fetchStats()
  }, [period])

  const fetchStats = async () => {
    try {
      setLoading(true)
      const response = await apiClient.get('/api/dashboard/stats', {
        params: { period }
      })

      if (response.data.success) {
        setStats(response.data.data)
      } else {
        toast.error(response.data.message || 'Không thể tải thống kê')
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || 'Lỗi khi tải thống kê'
      toast.error(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  const getPeriodLabel = () => {
    switch (period) {
      case 'month':
        return 'Tháng này'
      case 'quarter':
        return 'Quý này'
      case 'year':
        return 'Năm nay'
      default:
        return 'Tháng này'
    }
  }

  if (loading) {
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

  if (!stats) {
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

  // Chuẩn bị dữ liệu cho biểu đồ
  const customerDistributionData = stats.customerDistribution.map(item => ({
    name: getCustomerTypeLabel(item.type),
    value: item.count
  }))

  const employeePerformanceData = stats.employeePerformance.map(emp => ({
    name: emp.full_name.length > 15 ? emp.full_name.substring(0, 15) + '...' : emp.full_name,
    fullName: emp.full_name,
    customers: emp.customer_count,
    deals: emp.successful_deals,
    revenue: emp.total_revenue
  }))

  const dealStagesData = stats.dealStages.map(item => ({
    name: item.stage,
    count: item.count
  }))

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
              <p className="text-gray-600 mt-2">Tổng quan hệ thống CRM MobiFone</p>
            </div>
            
            {/* Bộ lọc thời gian */}
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-gray-400" />
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value as 'month' | 'quarter' | 'year')}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white"
              >
                <option value="month">Tháng này</option>
                <option value="quarter">Quý này</option>
                <option value="year">Năm nay</option>
              </select>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Tổng doanh số</p>
                  <p className="text-2xl font-bold text-gray-900 mt-2">
                    {formatCurrency(stats.overview.totalRevenue)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">{getPeriodLabel()}</p>
                </div>
                <div className="bg-primary-100 p-3 rounded-lg">
                  <DollarSign className="w-6 h-6 text-primary-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Tổng khách hàng</p>
                  <p className="text-2xl font-bold text-gray-900 mt-2">
                    {stats.overview.totalCustomers.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Đang hoạt động</p>
                </div>
                <div className="bg-primary-100 p-3 rounded-lg">
                  <Users className="w-6 h-6 text-primary-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Task chưa hoàn thành</p>
                  <p className="text-2xl font-bold text-gray-900 mt-2">
                    {stats.overview.pendingTasks.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Cần xử lý</p>
                </div>
                <div className="bg-yellow-100 p-3 rounded-lg">
                  <CheckSquare className="w-6 h-6 text-yellow-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Tương tác</p>
                  <p className="text-2xl font-bold text-gray-900 mt-2">
                    {stats.overview.totalInteractions.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">{getPeriodLabel()}</p>
                </div>
                <div className="bg-purple-100 p-3 rounded-lg">
                  <MessageSquare className="w-6 h-6 text-purple-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Pie Chart - Phân bổ khách hàng */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Tỷ lệ Nhóm Khách hàng
              </h3>
              {customerDistributionData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={customerDistributionData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {customerDistributionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-64 text-gray-500">
                  Chưa có dữ liệu
                </div>
              )}
            </div>

            {/* Bar Chart - Top Nhân viên */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Top Nhân viên xuất sắc
              </h3>
              {employeePerformanceData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={employeePerformanceData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="name" 
                      angle={-45}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis />
                    <Tooltip 
                      formatter={(value: any, name: string) => {
                        if (name === 'revenue') {
                          return formatCurrency(value)
                        }
                        return value
                      }}
                      labelFormatter={(label) => {
                        const emp = employeePerformanceData.find(e => e.name === label)
                        return emp?.fullName || label
                      }}
                    />
                    <Legend />
                    <Bar dataKey="customers" fill="#0066CC" name="Số khách hàng" />
                    <Bar dataKey="deals" fill="#00A3E0" name="Deal thành công" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-64 text-gray-500">
                  Chưa có dữ liệu
                </div>
              )}
            </div>

            {/* Bar Chart - Tiến độ Deal */}
            <div className="bg-white rounded-lg shadow p-6 lg:col-span-2">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Tiến độ Deal qua các giai đoạn
              </h3>
              {dealStagesData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={dealStagesData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="count" fill="#0066CC" name="Số lượng Deal" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-64 text-gray-500">
                  Chưa có dữ liệu
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  )
}
