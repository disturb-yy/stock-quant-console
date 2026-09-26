import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getSyncApiMode,
  SyncApiError,
  syncTasksApi,
  type SyncTask,
  type SyncTaskSummary,
  type SyncTarget,
} from '../api/syncTasks'

const PAGE_SIZE = 10

const targetLabels: Record<SyncTarget, string> = {
  basic_info: '股票基础资料',
  daily_bars: '历史日线行情',
  all: '全部数据',
}

const statusLabels: Record<SyncTaskSummary['status'], string> = {
  pending: '等待中',
  running: '执行中',
  retrying: '自动重试中',
  succeeded: '已成功',
  failed: '失败',
}

function sourceLabel(source: SyncTaskSummary['source']): string {
  return source.provider === 'mock' ? 'Mock（开发）' : 'Tushare（外部）'
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}

function errorMessage(error: unknown): string {
  if (error instanceof SyncApiError) {
    if (error.category === 'conflict') return error.message || '已有相同目标的任务正在执行'
    if (error.category === 'unavailable') return '当前数据源不可用，请稍后重试'
    if (error.category === 'contract') return '服务响应不符合当前契约，暂时无法展示任务'
    return error.message
  }
  return '同步服务暂时不可用，请稍后重试'
}

function validateDates(target: SyncTarget, startDate: string, endDate: string): string | undefined {
  if (target === 'basic_info') return undefined
  if (!startDate || !endDate) return '请选择历史日线的开始日期和结束日期'
  if (startDate > endDate) return '结束日期不能早于开始日期'
  return undefined
}

type SyncFormProps = {
  target: SyncTarget
  startDate: string
  endDate: string
  submitting: boolean
  error: string | undefined
  onTargetChange: (target: SyncTarget) => void
  onStartDateChange: (value: string) => void
  onEndDateChange: (value: string) => void
  onSubmit: () => void
}

function SyncForm(props: SyncFormProps) {
  const showDates = props.target !== 'basic_info'
  return (
    <section className="panel sync-form-panel" aria-labelledby="manual-sync-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">MANUAL SYNC</p>
          <h2 id="manual-sync-title">手动同步</h2>
        </div>
        <span className="source-readonly">数据源由运行环境决定</span>
      </div>
      <fieldset disabled={props.submitting}>
        <legend>同步目标</legend>
        <div className="target-options">
          {(Object.keys(targetLabels) as SyncTarget[]).map((value) => (
            <label className={`target-option ${props.target === value ? 'is-selected' : ''}`} key={value}>
              <input
                checked={props.target === value}
                name="sync-target"
                onChange={() => props.onTargetChange(value)}
                type="radio"
                value={value}
              />
              <span>{targetLabels[value]}</span>
            </label>
          ))}
        </div>
        {showDates && (
          <div className="date-fields">
            <label>
              开始日期
              <input onChange={(event) => props.onStartDateChange(event.target.value)} type="date" value={props.startDate} />
            </label>
            <label>
              结束日期
              <input onChange={(event) => props.onEndDateChange(event.target.value)} type="date" value={props.endDate} />
            </label>
          </div>
        )}
      </fieldset>
      {props.error && <p className="inline-error" role="alert">{props.error}</p>}
      <div className="form-footer">
        <span className="form-note">同步完成后可在任务详情中查看来源、时间和统计摘要。</span>
        <button className="primary-button" disabled={props.submitting} onClick={props.onSubmit} type="button">
          {props.submitting ? '提交中…' : '开始同步'}
        </button>
      </div>
    </section>
  )
}

type TaskListProps = {
  items: SyncTaskSummary[]
  loading: boolean
  retryingId: string | null
  selectedId: string | null
  onView: (taskId: string) => void
  onRetry: (taskId: string) => void
}

function TaskList(props: TaskListProps) {
  if (props.loading) return <p className="state-message">正在加载同步任务…</p>
  if (props.items.length === 0) return <p className="state-message">暂无同步任务，请先选择目标并开始同步。</p>
  return (
    <div className="task-table-wrap">
      <table className="task-table">
        <caption className="sr-only">当前任务与最近历史</caption>
        <thead><tr><th>目标</th><th>状态</th><th>来源</th><th>更新时间</th><th>操作</th></tr></thead>
        <tbody>
          {props.items.map((task) => (
            <tr className={props.selectedId === task.task_id ? 'is-selected' : ''} key={task.task_id}>
              <td data-label="目标">{targetLabels[task.target]}</td>
              <td data-label="状态"><span className={`status status-${task.status}`}>{statusLabels[task.status]}</span></td>
              <td data-label="来源">{sourceLabel(task.source)}</td>
              <td data-label="更新时间">{formatTimestamp(task.updated_at)}</td>
              <td data-label="操作" className="row-actions">
                <button className="text-button" onClick={() => props.onView(task.task_id)} type="button">查看</button>
                {task.status === 'failed' && (
                  <button className="text-button danger-action" disabled={props.retryingId === task.task_id} onClick={() => props.onRetry(task.task_id)} type="button">
                    {props.retryingId === task.task_id ? '重试中…' : '重试'}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TaskDetail({ task, loading, error }: { task: SyncTask | null; loading: boolean; error?: string }) {
  if (loading) return <section className="panel detail-panel"><p className="state-message">正在加载任务详情…</p></section>
  if (error) return <section className="panel detail-panel"><p className="inline-error" role="alert">{error}</p></section>
  if (!task) return null
  return (
    <section className="panel detail-panel" aria-labelledby="task-detail-title">
      <div className="section-heading"><div><p className="eyebrow">TASK DETAIL</p><h2 id="task-detail-title">任务详情</h2></div><span className={`status status-${task.status}`}>{statusLabels[task.status]}</span></div>
      <dl className="detail-grid">
        <div><dt>任务标识</dt><dd>{task.task_id}</dd></div>
        <div><dt>同步目标</dt><dd>{targetLabels[task.target]}</dd></div>
        <div><dt>数据来源</dt><dd>{sourceLabel(task.source)}</dd></div>
        <div><dt>数据有效日</dt><dd>{task.data_as_of ?? '—'}</dd></div>
        <div><dt>自动重试</dt><dd>{task.retry_count} / {task.max_retries}</dd></div>
        <div><dt>创建时间</dt><dd>{formatTimestamp(task.created_at)}</dd></div>
        <div><dt>更新时间</dt><dd>{formatTimestamp(task.updated_at)}</dd></div>
        <div><dt>完成时间</dt><dd>{formatTimestamp(task.finished_at)}</dd></div>
      </dl>
      {task.failure_reason && <p className="failure-note">失败原因：{task.failure_reason}</p>}
      {task.result && <ResultSummary result={task.result} />}
    </section>
  )
}

function ResultSummary({ result }: { result: NonNullable<SyncTask['result']> }) {
  return <div className="result-summary"><span>处理 {result.processed_count}</span><span>新增 {result.created_count}</span><span>更新 {result.updated_count}</span><span>失败 {result.failed_count}</span></div>
}

function LatestResult({ task }: { task: SyncTaskSummary | null }) {
  return (
    <section className="panel latest-panel" aria-labelledby="latest-result-title">
      <div className="section-heading"><div><p className="eyebrow">LATEST RESULT</p><h2 id="latest-result-title">最近同步结果</h2></div></div>
      {!task ? <p className="state-message">暂无同步结果。</p> : <div className="latest-result"><div><span className={`status status-${task.status}`}>{statusLabels[task.status]}</span><strong>{targetLabels[task.target]}</strong></div><p>来源：{sourceLabel(task.source)}　更新时间：{formatTimestamp(task.updated_at)}　数据有效日：{task.data_as_of ?? '—'}</p>{task.failure_reason && <p className="failure-note">{task.failure_reason}</p>}{task.result && <ResultSummary result={task.result} />}</div>}
    </section>
  )
}

export function App() {
  const [target, setTarget] = useState<SyncTarget>('basic_info')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [items, setItems] = useState<SyncTaskSummary[]>([])
  const [pagination, setPagination] = useState({ page: 1, page_size: PAGE_SIZE, total: 0 })
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState<string>()
  const [formError, setFormError] = useState<string>()
  const [submitting, setSubmitting] = useState(false)
  const [selectedTask, setSelectedTask] = useState<SyncTask | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string>()
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const mode = getSyncApiMode()

  const loadTasks = useCallback(async (page: number) => {
    setListLoading(true)
    setListError(undefined)
    try {
      const response = await syncTasksApi.listTasks(page, PAGE_SIZE)
      setItems(response.items)
      setPagination(response.pagination)
    } catch (error) {
      setListError(errorMessage(error))
    } finally {
      setListLoading(false)
    }
  }, [])

  useEffect(() => { void loadTasks(1) }, [loadTasks])

  const latestTask = useMemo(() => selectedTask ?? items.find((item) => item.status === 'succeeded' || item.status === 'failed') ?? null, [items, selectedTask])

  const viewTask = async (taskId: string) => {
    setDetailLoading(true)
    setDetailError(undefined)
    try { setSelectedTask(await syncTasksApi.getTask(taskId)) } catch (error) { setDetailError(errorMessage(error)) } finally { setDetailLoading(false) }
  }

  const submit = async () => {
    const validationError = validateDates(target, startDate, endDate)
    if (validationError) { setFormError(validationError); return }
    setSubmitting(true)
    setFormError(undefined)
    try {
      const task = await syncTasksApi.createTask({ target, ...(target !== 'basic_info' ? { start_date: startDate, end_date: endDate } : {}) })
      setSelectedTask(task)
      await loadTasks(pagination.page)
    } catch (error) { setFormError(errorMessage(error)) } finally { setSubmitting(false) }
  }

  const retry = async (taskId: string) => {
    setRetryingId(taskId)
    setFormError(undefined)
    try { const result = await syncTasksApi.retryTask(taskId); await loadTasks(pagination.page); await viewTask(result.task_id) } catch (error) { setFormError(errorMessage(error)) } finally { setRetryingId(null) }
  }

  return (
    <main className="app-shell">
      <header className="page-header"><div><p className="eyebrow">A-SHARE RESEARCH DATA</p><h1>A 股数据同步</h1><p>批量同步基础资料与历史日线，完成后追踪任务状态和数据来源。</p></div>{mode === 'mock' && <div className="mode-banner" role="status">开发 Mock 模式<br /><small>仅用于页面开发与测试</small></div>}</header>
      <SyncForm target={target} startDate={startDate} endDate={endDate} submitting={submitting} error={formError} onTargetChange={(value) => { setTarget(value); if (value === 'basic_info') { setStartDate(''); setEndDate('') } }} onStartDateChange={setStartDate} onEndDateChange={setEndDate} onSubmit={() => void submit()} />
      {listError && <div className="error-banner" role="alert"><span>{listError}</span><button className="text-button" onClick={() => void loadTasks(pagination.page)} type="button">重新加载</button></div>}
      <section className="panel tasks-panel" aria-labelledby="tasks-title"><div className="section-heading"><div><p className="eyebrow">TASK MONITOR</p><h2 id="tasks-title">当前任务与最近历史</h2></div><span className="muted-text">共 {pagination.total} 条</span></div><TaskList items={items} loading={listLoading} retryingId={retryingId} selectedId={selectedTask?.task_id ?? null} onView={(taskId) => void viewTask(taskId)} onRetry={(taskId) => void retry(taskId)} /><div className="pagination"><button disabled={pagination.page <= 1 || listLoading} onClick={() => void loadTasks(pagination.page - 1)} type="button">上一页</button><span>第 {pagination.page} 页</span><button disabled={pagination.page * pagination.page_size >= pagination.total || listLoading} onClick={() => void loadTasks(pagination.page + 1)} type="button">下一页</button></div></section>
      <TaskDetail task={selectedTask} loading={detailLoading} error={detailError} />
      <LatestResult task={latestTask} />
    </main>
  )
}
