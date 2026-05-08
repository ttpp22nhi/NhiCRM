'use client'

import { useState, useEffect } from 'react'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { Navbar } from '@/components/Navbar'
import { CompleteTaskModal } from '@/components/CompleteTaskModal'
import { CreateTaskModal } from '@/components/CreateTaskModal'
import { TaskDetailModal } from '@/components/TaskDetailModal'
import { useAuth } from '@/contexts/AuthContext'
import { apiClient } from '@/lib/api'
import {
  CheckSquare,
  Clock,
  AlertCircle,
  Plus,
  List,
  Calendar as CalendarIcon,
  Filter,
  Loader2,
  User,
  Phone,
  Trash2,
  UserCircle,
  Pencil,
  Eye,
  ExternalLink
} from 'lucide-react'
import Calendar from 'react-calendar'
import 'react-calendar/dist/Calendar.css'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { useAlert } from '@/components/AlertModal'
import Link from 'next/link'

interface Task {
  task_id: string
  title: string
  description?: string | null
  display_code?: string
  parent_display_code?: string
  related_type?: string
  related_id?: string
  customer_id?: string
  customer_full_name?: string
  customer_phone?: string
  due_date?: number
  priority: string
  is_completed: boolean
  created_at: number
  assigned_to?: string
  assigned_employee_name?: string
  assigned_employee_username?: string
}

type ViewMode = 'list' | 'calendar'

export default function TasksPage() {
  const { user } = useAuth()
  const { showConfirm, AlertComponent } = useAlert()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [assignedToFilter, setAssignedToFilter] = useState<string>('')
  const [relatedFilter, setRelatedFilter] = useState<string>('') // '' | 'DEAL' | 'CUSTOMER' | 'CBS_ORDER' | 'NONE'
  const [employees, setEmployees] = useState<any[]>([])
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null)
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [viewingTask, setViewingTask] = useState<Task | null>(null)

  useEffect(() => {
    fetchTasks()
    if (user) fetchEmployees()
  }, [user, assignedToFilter, relatedFilter, refreshKey])

  useEffect(() => {
    // Kiểm tra task sắp đến hạn (trong 30 phút)
    const checkUpcomingTasks = () => {
      const now = Date.now()
      const thirtyMinutes = 30 * 60 * 1000

      tasks.forEach(task => {
        if (!task.is_completed && task.due_date) {
          const timeUntilDue = task.due_date - now
          if (timeUntilDue > 0 && timeUntilDue <= thirtyMinutes) {
            // Hiển thị browser notification
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification('Task sắp đến hạn', {
                body: `"${task.title}" sẽ đến hạn trong ${Math.floor(timeUntilDue / 60000)} phút`,
                icon: '/favicon.ico',
                tag: `task-${task.task_id}`
              })
            }
          }
        }
      })
    }

    if (tasks.length > 0) {
      checkUpcomingTasks()
      const interval = setInterval(checkUpcomingTasks, 60000) // Kiểm tra mỗi phút
      return () => clearInterval(interval)
    }
  }, [tasks])

  const fetchTasks = async () => {
    try {
      setLoading(true)
      const params: any = {}
      if (assignedToFilter) {
        params.assigned_to = assignedToFilter
      }
      if (relatedFilter) {
        params.related_type = relatedFilter
      }

      const response = await apiClient.get('/api/tasks', { params })

      if (response.data.success) {
        setTasks(response.data.data)
      } else {
        toast.error(response.data.message || 'Không thể tải danh sách công việc')
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || 'Lỗi khi tải danh sách công việc'
      toast.error(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  const fetchEmployees = async () => {
    try {
      const response = await apiClient.get('/api/employees/assignable')
      if (response.data.success) {
        setEmployees(response.data.data || [])
      }
    } catch (error) {
      console.error('Lỗi khi lấy danh sách nhân viên:', error)
    }
  }

  const handleCompleteTask = (task: Task) => {
    // Cho phép hoàn thành mọi loại task: task có khách (DEAL/CUSTOMER) sẽ tạo interaction;
    // task CBS_ORDER hoặc task độc lập sẽ chỉ ghi note (backend xử lý nhánh phù hợp).
    setCompletingTaskId(task.task_id)
  }

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa công việc này?')) {
      return
    }

    try {
      const response = await apiClient.delete(`/api/tasks/${taskId}`)
      if (response.data.success) {
        toast.success('Xóa công việc thành công!')
        setRefreshKey(prev => prev + 1)
      } else {
        toast.error(response.data.message || 'Xóa công việc thất bại')
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi khi xóa công việc')
    }
  }

  const getTaskStatus = (task: Task) => {
    if (task.is_completed) return 'completed'
    if (!task.due_date) return 'pending'
    const now = Date.now()
    if (task.due_date < now) return 'overdue'
    const thirtyMinutes = 30 * 60 * 1000
    if (task.due_date - now <= thirtyMinutes) return 'upcoming'
    return 'pending'
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'bg-red-100 text-red-800 border-red-300'
      case 'high':
        return 'bg-orange-100 text-orange-800 border-orange-300'
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300'
      case 'low':
        return 'bg-gray-100 text-gray-800 border-gray-300'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300'
    }
  }

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'Khẩn cấp'
      case 'high':
        return 'Cao'
      case 'medium':
        return 'Trung bình'
      case 'low':
        return 'Thấp'
      default:
        return 'Trung bình'
    }
  }

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return 'Không có hạn'
    const date = new Date(timestamp)
    return date.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getTasksForDate = (date: Date) => {
    const dateStart = new Date(date)
    dateStart.setHours(0, 0, 0, 0)
    const dateEnd = new Date(date)
    dateEnd.setHours(23, 59, 59, 999)

    return tasks.filter(task => {
      if (!task.due_date) return false
      const taskDate = new Date(task.due_date)
      return taskDate >= dateStart && taskDate <= dateEnd
    })
  }

  const filteredTasks = selectedDate
    ? getTasksForDate(selectedDate)
    : tasks

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50">
          <Navbar />
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
              <span className="ml-3 text-gray-600">Đang tải...</span>
            </div>
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
          {/* Header */}
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Quản lý công việc</h1>
              <p className="text-gray-600 mt-2">Danh sách công việc và nhiệm vụ</p>
            </div>
            <button
              type="button"
              onClick={() => setShowCreateTaskModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
            >
              <Plus className="w-5 h-5" />
              <span>Thêm công việc</span>
            </button>
          </div>

          {/* Filters and View Toggle */}
          <div className="bg-white rounded-lg shadow p-4 mb-6">
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
              <div className="flex items-center gap-4 flex-1 flex-wrap">
                {(user?.role === 'admin' || user?.role === 'manager') && (
                  <div className="flex items-center gap-2">
                    <Filter className="w-5 h-5 text-gray-400" />
                    <select
                      value={assignedToFilter}
                      onChange={(e) => setAssignedToFilter(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white"
                    >
                      <option value="">Tất cả nhân viên</option>
                      {employees.map(emp => (
                        <option key={emp.employee_id} value={emp.employee_id}>
                          {emp.full_name || emp.username}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">Nguồn:</span>
                  <select
                    value={relatedFilter}
                    onChange={(e) => setRelatedFilter(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white"
                    title="Lọc theo nguồn gốc của công việc"
                  >
                    <option value="">Tất cả nguồn</option>
                    <option value="DEAL">Việc của Cơ hội</option>
                    <option value="CBS_ORDER">Việc của Đơn CBS</option>
                    <option value="CUSTOMER">Việc của Khách hàng</option>
                    <option value="NONE">Việc độc lập</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setViewMode('list')}
                  className={`px-4 py-2 rounded-lg transition ${
                    viewMode === 'list'
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <List className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setViewMode('calendar')}
                  className={`px-4 py-2 rounded-lg transition ${
                    viewMode === 'calendar'
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <CalendarIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Content */}
          {viewMode === 'list' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <AnimatePresence>
                {filteredTasks.map(task => {
                  const status = getTaskStatus(task)
                  const isOverdue = status === 'overdue'
                  const isUpcoming = status === 'upcoming'

                  return (
                    <motion.div
                      key={task.task_id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      className={`bg-white rounded-lg shadow p-6 border-2 ${
                        isOverdue
                          ? 'border-red-500 animate-pulse'
                          : isUpcoming
                          ? 'border-orange-500'
                          : task.is_completed
                          ? 'border-green-500 opacity-75'
                          : 'border-gray-200'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                            {task.display_code && (
                              <span className="text-xs font-medium text-gray-500">{task.display_code}</span>
                            )}
                            {task.related_type === 'DEAL' && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700">
                                Cơ hội
                              </span>
                            )}
                            {task.related_type === 'CBS_ORDER' && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-700">
                                Đơn CBS
                              </span>
                            )}
                            {task.related_type === 'CUSTOMER' && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700">
                                Khách hàng
                              </span>
                            )}
                            {!task.related_type && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
                                Độc lập
                              </span>
                            )}
                          </div>
                          <h3
                            className={`font-semibold text-gray-900 mb-2 ${
                              task.is_completed ? 'line-through' : ''
                            }`}
                          >
                            {task.title}
                          </h3>
                          {task.description && String(task.description).trim() && (
                            <p className="text-xs text-gray-600 mb-2 line-clamp-3 whitespace-pre-wrap break-words">
                              {String(task.description).trim()}
                            </p>
                          )}
                          {task.customer_full_name && (
                            <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                              <User className="w-4 h-4" />
                              <span>{task.customer_full_name}</span>
                            </div>
                          )}
                          {task.customer_phone && (
                            <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                              <Phone className="w-4 h-4" />
                              <span>{task.customer_phone}</span>
                            </div>
                          )}
                          {task.assigned_employee_name && (
                            <div className="flex items-center gap-2 text-sm text-primary-600 mt-2 pt-2 border-t border-gray-200">
                              <UserCircle className="w-4 h-4" />
                              <span className="font-medium">Người chăm sóc: {task.assigned_employee_name}</span>
                            </div>
                          )}
                          {(task.related_type === 'DEAL' && (task.parent_display_code || task.related_id)) && (
                            <div className="mt-2 pt-2 border-t border-gray-200 text-sm text-gray-600">
                              Công việc này thuộc Cơ hội:{' '}
                              <Link
                                href={`/deals?openDealId=${task.related_id}`}
                                className="inline-flex items-center gap-1 text-[#0074BD] font-medium hover:underline"
                              >
                                [{task.parent_display_code || task.related_id}]
                                <ExternalLink className="w-3.5 h-3.5" />
                              </Link>
                            </div>
                          )}
                        </div>
                        {isOverdue && (
                          <AlertCircle className="w-5 h-5 text-red-500 animate-pulse flex-shrink-0" />
                        )}
                      </div>

                      <div className="flex items-center justify-between mb-4">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium border ${getPriorityColor(
                            task.priority
                          )}`}
                        >
                          {getPriorityLabel(task.priority)}
                        </span>
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          {formatDate(task.due_date)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-4 border-t">
                        {!task.is_completed ? (
                          <button
                            onClick={() => handleCompleteTask(task)}
                            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm font-medium"
                          >
                            <CheckSquare className="w-4 h-4" />
                            <span>Hoàn thành</span>
                          </button>
                        ) : (
                          <span className="text-sm text-green-600 font-medium flex items-center gap-2">
                            <CheckSquare className="w-4 h-4" />
                            Đã hoàn thành
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => setViewingTask(task)}
                          className="p-2 text-gray-500 hover:text-[#0074BD] hover:bg-gray-100 rounded-lg transition"
                          title="Xem chi tiết"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingTask(task)}
                          className="p-2 text-gray-500 hover:text-[#0074BD] hover:bg-gray-100 rounded-lg transition"
                          title="Sửa"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteTask(task.task_id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                          title="Xóa"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow p-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                  <Calendar
                    onChange={(value) => setSelectedDate(value as Date)}
                    value={selectedDate}
                    tileContent={({ date }) => {
                      const tasksForDate = getTasksForDate(date)
                      if (tasksForDate.length === 0) return null
                      return (
                        <div className="flex gap-1 justify-center mt-1">
                          {tasksForDate.map(task => {
                            const status = getTaskStatus(task)
                            return (
                              <div
                                key={task.task_id}
                                className={`w-2 h-2 rounded-full ${
                                  task.is_completed
                                    ? 'bg-green-500'
                                    : status === 'overdue'
                                    ? 'bg-red-500'
                                    : status === 'upcoming'
                                    ? 'bg-orange-500'
                                    : 'bg-blue-500'
                                }`}
                              />
                            )
                          })}
                        </div>
                      )
                    }}
                  />
                </div>
                <div>
                  {selectedDate ? (
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-4">
                        Công việc ngày {selectedDate.toLocaleDateString('vi-VN')}
                      </h3>
                      {getTasksForDate(selectedDate).length === 0 ? (
                        <p className="text-gray-500 text-sm">Không có công việc</p>
                      ) : (
                        <div className="space-y-2">
                          {getTasksForDate(selectedDate).map(task => (
                            <div
                              key={task.task_id}
                              className="p-3 bg-gray-50 rounded-lg border border-gray-200"
                            >
                              {task.display_code && (
                                <p className="text-xs text-gray-500 mb-0.5">{task.display_code}</p>
                              )}
                              <p className="font-medium text-sm text-gray-900">{task.title}</p>
                              {task.assigned_employee_name && (
                                <p className="text-xs text-primary-600 mt-1 flex items-center gap-1">
                                  <UserCircle className="w-3 h-3" />
                                  {task.assigned_employee_name}
                                </p>
                              )}
                              <p className="text-xs text-gray-500 mt-1">
                                {formatDate(task.due_date)}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center text-gray-500 py-8">
                      <CalendarIcon className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                      <p>Chọn ngày để xem công việc</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {filteredTasks.length === 0 && (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <CheckSquare className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <p className="text-gray-600">Chưa có công việc nào</p>
            </div>
          )}
        </div>

        {/* Create Task Modal */}
        {showCreateTaskModal && !editingTask && (
          <CreateTaskModal
            onClose={() => setShowCreateTaskModal(false)}
            onSuccess={() => setRefreshKey((prev) => prev + 1)}
            employees={employees}
            userRole={user?.role}
          />
        )}

        {/* Edit Task Modal */}
        {editingTask && (
          <CreateTaskModal
            task={editingTask}
            onClose={() => setEditingTask(null)}
            onSuccess={() => {
              setEditingTask(null)
              setRefreshKey((prev) => prev + 1)
            }}
            employees={employees}
            userRole={user?.role}
          />
        )}

        {/* Task Detail Modal (xem chi tiết + link Cơ hội) */}
        {viewingTask && (
          <TaskDetailModal
            task={viewingTask}
            onClose={() => setViewingTask(null)}
            onOpenDeal={(dealId) => {
              setViewingTask(null)
              window.location.href = `/deals?openDealId=${dealId}`
            }}
          />
        )}

        {/* Complete Task Modal */}
        {completingTaskId && (
          <CompleteTaskModal
            taskId={completingTaskId}
            taskTitle={tasks.find(t => t.task_id === completingTaskId)?.title || ''}
            customerName={tasks.find(t => t.task_id === completingTaskId)?.customer_full_name}
            onSuccess={() => {
              setCompletingTaskId(null)
              setRefreshKey(prev => prev + 1)
            }}
            onCancel={() => setCompletingTaskId(null)}
          />
        )}
        {AlertComponent}
      </div>
    </ProtectedRoute>
  )
}

