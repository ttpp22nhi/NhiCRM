'use client'

import { useState, useEffect, useRef } from 'react'
import { apiClient } from '@/lib/api'
import { FileText, Image, FileSpreadsheet, MessageSquare, Loader2, Paperclip, Download, Upload, Trash2, X, Eye } from 'lucide-react'
import toast from 'react-hot-toast'
import { TaskDetailModal, type TaskForDetail } from './TaskDetailModal'

const PREVIEW_EXT = ['jpg', 'jpeg', 'png', 'pdf']

function isPreviewable(fileName: string): boolean {
  const ext = (fileName || '').split('.').pop()?.toLowerCase()
  return PREVIEW_EXT.includes(ext || '')
}

const STAGE_LABELS: Record<string, string> = {
  tiep_can: 'Tiếp cận',
  tu_van: 'Tư vấn',
  bao_gia: 'Báo giá',
  thuong_thao: 'Thương thảo',
  thanh_cong: 'Thành công'
}

interface Activity {
  id: string
  deal_id: string
  stage: string | null
  content: string | null
  type: string
  created_by: string | null
  created_at: number | string
  created_by_name?: string | null
  task_id?: string | null
}

interface Attachment {
  id: string
  deal_id: string
  stage: string | null
  doc_type?: string | null
  file_name: string
  file_path: string
  file_size: number | null
  uploaded_by: string | null
  created_at: number | string
  uploaded_by_name?: string | null
}

type FeedItem =
  | { kind: 'activity'; created_at: number | string; id: string; data: Activity }
  | { kind: 'file'; created_at: number | string; id: string; data: Attachment }

interface DealTimelineProps {
  dealId: string
  onRefresh?: () => void
}

const DISPLAY_CODE_TASK_REGEX = /\[(TSK-\d{4}-\d{3})\]/g

/** Tách nội dung thành các phần: text thuần hoặc mã [TSK-xxx] để render tag click được */
function parseContentWithTaskCodes(content: string): { type: 'text' | 'code'; value: string }[] {
  if (!content) return []
  const parts: { type: 'text' | 'code'; value: string }[] = []
  let lastIndex = 0
  let m: RegExpExecArray | null
  const re = new RegExp(DISPLAY_CODE_TASK_REGEX.source, 'g')
  while ((m = re.exec(content)) !== null) {
    if (m.index > lastIndex) {
      parts.push({ type: 'text', value: content.slice(lastIndex, m.index) })
    }
    parts.push({ type: 'code', value: m[1] })
    lastIndex = m.index + m[0].length
  }
  if (lastIndex < content.length) {
    parts.push({ type: 'text', value: content.slice(lastIndex) })
  }
  return parts
}

function formatTime(ts: number | string | undefined | null): string {
  if (ts == null) return '—'
  const n = typeof ts === 'string' ? parseInt(ts, 10) : Number(ts)
  if (Number.isNaN(n)) return '—'
  const d = new Date(n.toString().length <= 10 ? n * 1000 : n)
  return d.toLocaleString('vi-VN')
}

function fileIcon(fileName: string) {
  const ext = (fileName || '').split('.').pop()?.toLowerCase()
  if (['pdf'].includes(ext || '')) return <FileText className="w-4 h-4 text-red-500 flex-shrink-0" />
  if (['jpg', 'jpeg', 'png'].includes(ext || '')) return <Image className="w-4 h-4 text-green-500 flex-shrink-0" />
  if (['xlsx', 'xls'].includes(ext || '')) return <FileSpreadsheet className="w-4 h-4 text-green-600 flex-shrink-0" />
  return <FileText className="w-4 h-4 text-gray-500 flex-shrink-0" />
}

export function DealTimeline({ dealId, onRefresh }: DealTimelineProps) {
  const [activities, setActivities] = useState<Activity[]>([])
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [loading, setLoading] = useState(true)
  const [noteContent, setNoteContent] = useState('')
  const [addingNote, setAddingNote] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<number>(0)
  const [uploadDocType, setUploadDocType] = useState<string>('other')
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const replaceFileInputRef = useRef<HTMLInputElement>(null)
  const replaceTargetRef = useRef<string | null>(null)

  const [replacingId, setReplacingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [viewingTask, setViewingTask] = useState<TaskForDetail | null>(null)
  const [loadingTask, setLoadingTask] = useState(false)

  const buildFeed = (): FeedItem[] => {
    const items: FeedItem[] = []
    for (const a of activities) items.push({ kind: 'activity', created_at: a.created_at, id: `act:${a.id}`, data: a })
    for (const f of attachments) items.push({ kind: 'file', created_at: f.created_at, id: `file:${f.id}`, data: f })
    return items.sort((x, y) => {
      const tx = typeof x.created_at === 'string' ? parseInt(x.created_at, 10) : Number(x.created_at)
      const ty = typeof y.created_at === 'string' ? parseInt(y.created_at, 10) : Number(y.created_at)
      return (Number.isFinite(ty) ? ty : 0) - (Number.isFinite(tx) ? tx : 0)
    })
  }

  const fetchData = async () => {
    if (!dealId) return
    try {
      setLoading(true)
      const [actRes, attRes] = await Promise.all([
        apiClient.get(`/api/deals/${dealId}/activities`),
        apiClient.get(`/api/deals/${dealId}/attachments`)
      ])
      if (actRes.data.success) setActivities(actRes.data.data || [])
      if (attRes.data.success) setAttachments(attRes.data.data || [])
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Không tải được Timeline.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [dealId])

  useEffect(() => {
    if (!previewAttachment) {
      setPreviewUrl(null)
      setPreviewError(null)
      return
    }
    let cancelled = false
    setPreviewLoading(true)
    setPreviewUrl(null)
    setPreviewError(null)
    apiClient
      .get(`/api/deals/attachments/${previewAttachment.id}/preview-url`)
      .then((res) => {
        if (!cancelled && res.data?.success && res.data?.data?.url) {
          setPreviewUrl(res.data.data.url)
        }
      })
      .catch((err: any) => {
        if (!cancelled) {
          setPreviewError(err.response?.data?.message || 'Không thể tải link xem.')
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [previewAttachment])

  const openTaskByCodeOrId = async (taskId: string | null, displayCode: string | null) => {
    if (!taskId && !displayCode) return
    setLoadingTask(true)
    try {
      const res = taskId
        ? await apiClient.get(`/api/tasks/${taskId}`)
        : await apiClient.get('/api/tasks/by-display-code', { params: { display_code: displayCode } })
      if (res.data?.success && res.data?.data) {
        setViewingTask(res.data.data as TaskForDetail)
      } else {
        toast.error('Không tìm thấy công việc.')
      }
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Không tải được công việc.')
    } finally {
      setLoadingTask(false)
    }
  }

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = noteContent.trim()
    if (!text) return
    setAddingNote(true)
    try {
      await apiClient.post(`/api/deals/${dealId}/activities`, { content: text })
      setNoteContent('')
      await fetchData()
      onRefresh?.()
      toast.success('Đã thêm ghi chú.')
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Không thêm được ghi chú.')
    } finally {
      setAddingNote(false)
    }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    await uploadFile(file)
    setUploading(true)
    try {
      // handled in uploadFile
    } finally {
      e.target.value = ''
    }
  }

  const uploadFile = async (file: File) => {
    const form = new FormData()
    form.append('file', file)
    form.append('doc_type', uploadDocType || 'other')
    setUploading(true)
    setUploadProgress(0)
    try {
      await apiClient.post(`/api/deals/${dealId}/upload`, form, {
        headers: { 'Content-Type': undefined as any },
        onUploadProgress: (evt: any) => {
          const total = evt?.total || file.size
          const loaded = evt?.loaded || 0
          if (!total) return
          const pct = Math.max(0, Math.min(100, Math.round((loaded / total) * 100)))
          setUploadProgress(pct)
        }
      })
      await fetchData()
      onRefresh?.()
      toast.success('Đã tải lên tài liệu.')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Tải lên thất bại.')
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    await uploadFile(file)
  }

  const handleDownload = async (fileId: string, fileName: string) => {
    try {
      const res = await fetch(`/api/deals/download/${fileId}`, {
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Tải thất bại')
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName || 'download'
      a.click()
      window.URL.revokeObjectURL(url)
    } catch (e) {
      toast.error('Không tải được file.')
    }
  }

  const handleReplaceClick = (att: Attachment) => {
    replaceTargetRef.current = att.id
    replaceFileInputRef.current?.click()
  }

  const handleReplaceFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    const attachmentId = replaceTargetRef.current
    if (!file || !attachmentId) {
      replaceTargetRef.current = null
      return
    }
    replaceTargetRef.current = null
    setReplacingId(attachmentId)
    const form = new FormData()
    form.append('file', file)
    try {
      await apiClient.patch(`/api/deals/attachments/${attachmentId}`, form, {
        headers: { 'Content-Type': undefined as any }
      })
      await fetchData()
      onRefresh?.()
      toast.success('Đã thay file.')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Thay file thất bại.')
    } finally {
      setReplacingId(null)
      replaceTargetRef.current = null
    }
  }

  const handleDelete = async (att: Attachment) => {
    if (!window.confirm(`Xóa tài liệu "${att.file_name}"?`)) return
    setDeletingId(att.id)
    try {
      await apiClient.delete(`/api/deals/attachments/${att.id}`)
      await fetchData()
      onRefresh?.()
      toast.success('Đã xóa tài liệu.')
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Không xóa được.')
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="w-6 h-6 animate-spin text-[#0074BD]" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium text-gray-700">Timeline & Tài liệu</p>

      {/* Thêm ghi chú nhanh */}
      <form onSubmit={handleAddNote} className="flex gap-2">
        <input
          type="text"
          value={noteContent}
          onChange={(e) => setNoteContent(e.target.value)}
          placeholder="Thêm ghi chú..."
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#0074BD] focus:border-transparent"
        />
        <button
          type="submit"
          disabled={addingNote || !noteContent.trim()}
          className="flex items-center gap-1 px-3 py-2 bg-[#0074BD] text-white rounded-lg text-sm hover:bg-[#005a94] disabled:opacity-50"
        >
          <MessageSquare className="w-4 h-4" />
          {addingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Gửi'}
        </button>
      </form>

      {/* Đính kèm tài liệu */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-700">Loại tài liệu:</span>
            <select
              value={uploadDocType}
              onChange={(e) => setUploadDocType(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-[#0074BD]"
              disabled={uploading}
            >
              <option value="quotation">Báo giá</option>
              <option value="contract">Hợp đồng</option>
              <option value="survey">Khảo sát</option>
              <option value="invoice">Hóa đơn</option>
              <option value="other">Khác</option>
            </select>
          </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.pdf,.docx,.xlsx"
          onChange={handleUpload}
          className="hidden"
        />
        <input
          ref={replaceFileInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.pdf,.docx,.xlsx"
          onChange={handleReplaceFileChange}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1 px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          <Paperclip className="w-4 h-4" />
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Đính kèm tài liệu'}
        </button>
        <span className="text-xs text-gray-500">.jpg, .png, .pdf, .docx, .xlsx (tối đa 10MB)</span>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`rounded-lg border-2 border-dashed px-4 py-4 text-sm text-gray-600 ${
            dragOver ? 'border-[#0074BD] bg-[#0074BD]/5' : 'border-gray-200 bg-gray-50'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium text-gray-800">Kéo thả file vào đây để upload</div>
              <div className="text-xs text-gray-500 mt-1">Hệ thống sẽ tự gắn loại tài liệu + lưu vào Timeline</div>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="px-3 py-2 rounded-lg bg-[#0074BD] text-white text-sm hover:bg-[#005a94] disabled:opacity-60"
            >
              Chọn file
            </button>
          </div>
          {uploading && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                <span>Đang tải lên...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
                <div className="h-full bg-[#0074BD]" style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Unified activity feed: stage/note/task tags + file uploads (sorted by time) */}
      <div className="border-l-2 border-gray-200 pl-4 space-y-3 max-h-72 overflow-y-auto">
        {buildFeed().length === 0 ? (
          <p className="text-sm text-gray-500">Chưa có hoạt động hoặc tài liệu.</p>
        ) : (
          buildFeed().map((item) => {
            if (item.kind === 'activity') {
              const a = item.data
              const isSystem = a.type === 'system'
              const parts = (a.content || '').split(/\n/)
              const stepLine = parts[0] || ''
              const noteLines = parts.slice(1).filter(Boolean).join('\n')
              const renderContentWithTags = (line: string) => {
                const segments = parseContentWithTaskCodes(line)
                return (
                  <>
                    {segments.map((seg, i) =>
                      seg.type === 'text' ? (
                        <span key={i}>{seg.value}</span>
                      ) : (
                        <button
                          key={i}
                          type="button"
                          onClick={() => openTaskByCodeOrId(a.task_id || null, seg.value)}
                          disabled={loadingTask}
                          className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-[#0074BD]/15 text-[#0074BD] hover:bg-[#0074BD]/25 transition mx-0.5"
                        >
                          [{seg.value}]
                        </button>
                      )
                    )}
                  </>
                )
              }
              return (
                <div key={item.id} className="relative">
                  <div className={`absolute -left-4 w-2 h-2 rounded-full mt-1.5 ${isSystem ? 'bg-[#0074BD]' : 'bg-gray-400'}`} />
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs text-gray-500">{formatTime(a.created_at)}</div>
                    {a.created_by_name && <div className="text-xs text-gray-400 truncate">{a.created_by_name}</div>}
                  </div>
                  <div className="text-sm mt-1">
                    {isSystem && stepLine ? (
                      <>
                        <div className="font-medium text-[#0074BD]">{renderContentWithTags(stepLine)}</div>
                        {noteLines && (
                          <div className="text-gray-700 mt-1 whitespace-pre-wrap">{renderContentWithTags(noteLines)}</div>
                        )}
                      </>
                    ) : (
                      <div className="text-gray-900">{renderContentWithTags(a.content || '')}</div>
                    )}
                  </div>
                </div>
              )
            }

            const att = item.data
            return (
              <div key={item.id} className="relative">
                <div className="absolute -left-4 w-2 h-2 rounded-full bg-emerald-500 mt-1.5" />
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs text-gray-500">{formatTime(att.created_at)}</div>
                  {att.uploaded_by_name && <div className="text-xs text-gray-400 truncate">{att.uploaded_by_name}</div>}
                </div>
                <div className="mt-1 flex items-start gap-2 text-sm">
                  <div className="mt-0.5">{fileIcon(att.file_name)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="text-gray-900">
                      <span className="text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 rounded px-1.5 py-0.5 mr-2">
                        Tài liệu
                      </span>
                      {att.doc_type && (
                        <span className="text-xs font-medium bg-gray-50 text-gray-700 border border-gray-200 rounded px-1.5 py-0.5 mr-2">
                          {att.doc_type}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          if (isPreviewable(att.file_name)) setPreviewAttachment(att)
                          else handleDownload(att.id, att.file_name)
                        }}
                        className="text-[#0074BD] hover:underline truncate"
                        title={isPreviewable(att.file_name) ? 'Xem nhanh' : 'Tải xuống'}
                      >
                        {att.file_name}
                      </button>
                      {att.stage && <span className="text-xs text-gray-400 ml-2">({STAGE_LABELS[att.stage] || att.stage})</span>}
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-gray-500">
                      {isPreviewable(att.file_name) && (
                        <button
                          type="button"
                          onClick={() => setPreviewAttachment(att)}
                          className="p-1 rounded hover:bg-gray-100 hover:text-[#0074BD]"
                          title="Xem nhanh"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDownload(att.id, att.file_name)}
                        className="p-1 rounded hover:bg-gray-100 hover:text-[#0074BD]"
                        title="Tải xuống"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReplaceClick(att)}
                        disabled={replacingId !== null}
                        className="p-1 rounded hover:bg-gray-100 hover:text-[#0074BD] disabled:opacity-50"
                        title="Thay file"
                      >
                        {replacingId === att.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(att)}
                        disabled={deletingId !== null}
                        className="p-1 rounded hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                        title="Xóa"
                      >
                        {deletingId === att.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Modal xem nhanh tài liệu (ảnh / PDF) */}
      {previewAttachment && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <span className="text-sm font-medium text-gray-700 truncate max-w-[70%]">{previewAttachment.file_name}</span>
              <div className="flex items-center gap-2">
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    handleDownload(previewAttachment.id, previewAttachment.file_name)
                  }}
                  className="text-sm text-[#0074BD] hover:underline flex items-center gap-1"
                >
                  <Download className="w-4 h-4" />
                  Tải xuống
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setPreviewAttachment(null)
                    setPreviewUrl(null)
                    setPreviewError(null)
                  }}
                  className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 flex items-center justify-center p-4 bg-gray-100">
              {previewLoading && (
                <div className="flex flex-col items-center gap-2 text-gray-600">
                  <Loader2 className="w-10 h-10 animate-spin text-[#0074BD]" />
                  <span className="text-sm">Đang tải...</span>
                </div>
              )}
              {!previewLoading && previewError && (
                <div className="text-center text-red-600">
                  <p className="font-medium">{previewError}</p>
                  <button
                    type="button"
                    onClick={() => handleDownload(previewAttachment.id, previewAttachment.file_name)}
                    className="mt-2 text-sm text-[#0074BD] hover:underline"
                  >
                    Tải xuống file
                  </button>
                </div>
              )}
              {!previewLoading && previewUrl && !previewError && (() => {
                const ext = (previewAttachment.file_name || '').split('.').pop()?.toLowerCase()
                const isPdf = ext === 'pdf'
                return isPdf ? (
                  <iframe
                    key={previewUrl}
                    src={previewUrl}
                    title={previewAttachment.file_name}
                    className="w-full h-[70vh] min-h-[400px] border-0 rounded bg-white"
                  />
                ) : (
                  <img
                    key={previewUrl}
                    src={previewUrl}
                    alt={previewAttachment.file_name}
                    className="max-w-full max-h-[70vh] object-contain rounded"
                  />
                )
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Modal chi tiết Task (khi click mã [TSK-xxx] trên timeline) */}
      {viewingTask && (
        <TaskDetailModal
          task={viewingTask}
          onClose={() => setViewingTask(null)}
          onOpenDeal={() => setViewingTask(null)}
        />
      )}
    </div>
  )
}
