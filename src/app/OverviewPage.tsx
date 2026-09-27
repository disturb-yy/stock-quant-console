import { useEffect, useState } from 'react'
import {
  stockCatalogApi,
  type StockCatalogResponse,
} from '../api/stockCatalog'
import {
  SyncApiError,
  syncTasksApi,
  type SyncTaskListResponse,
  type SyncTaskSummary,
} from '../api/syncTasks'
import { PageHeader } from '../components/ui/PageHeader'
import { useRuntimeConfig } from './RuntimeConfigContext'

const targetLabels: Record<SyncTaskSummary['target'], string> = {
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

type OverviewData = {
  stocks: StockCatalogResponse
  tasks: SyncTaskListResponse
}

function formatCount(value: number): string {
  return value.toLocaleString('zh-CN')
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}

function sourceLabel(task: SyncTaskSummary): string {
  return task.source.provider === 'mock' ? 'Mock（开发）' : 'Tushare（外部）'
}

function errorMessage(error: unknown): string {
  if (error instanceof SyncApiError && error.category === 'unavailable') return '数据服务暂时不可用，请稍后重试'
  if (error instanceof SyncApiError && error.category === 'contract') return '服务响应不符合当前契约，暂时无法展示概览'
  return '无法加载研究概览，请稍后重试'
}

function MetricCard({ label, value, note }: { label: string; value: string; note: string }) {
  return <article className="metric-card"><span className="metric-label">{label}</span><strong>{value}</strong><span className="metric-note">{note}</span></article>
}

function OverviewContent({ data }: { data: OverviewData }) {
  const latestTask = data.tasks.items[0]
  return (
    <>
      <section className="overview-stats" aria-label="数据概览指标">
        <MetricCard label="已同步股票" value={formatCount(data.stocks.pagination.total)} note="基础资料目录" />
        <MetricCard label="任务记录" value={formatCount(data.tasks.pagination.total)} note="当前页及历史任务" />
        <MetricCard label="最近任务" value={latestTask ? statusLabels[latestTask.status] : '暂无'} note={latestTask ? targetLabels[latestTask.target] : '尚未产生任务'} />
        <MetricCard label="数据有效日" value={latestTask?.data_as_of ?? '—'} note={latestTask ? sourceLabel(latestTask) : '等待数据同步'} />
      </section>

      <section className="overview-grid">
        <article className="panel availability-panel" aria-labelledby="market-data-title">
          <div className="section-heading"><div><p className="eyebrow">MARKET DATA</p><h2 id="market-data-title">市场行情</h2></div><span className="muted-text">Unavailable</span></div>
          <div className="unavailable-state" role="status">
            <span className="unavailable-icon" aria-hidden="true">—</span>
            <h3>当前未提供行情序列接口</h3>
            <p>保留原型中的主行情区域，待指数与个股行情契约可用后再接入真实图表。</p>
          </div>
        </article>
        <aside className="panel research-panel" aria-labelledby="research-entry-title">
          <div className="section-heading"><div><p className="eyebrow">RESEARCH ENTRY</p><h2 id="research-entry-title">研究入口</h2></div></div>
          <p className="panel-caption">从数据准备进入后续研究流程。</p>
          <div className="research-links">
            <a className="shortcut-link" href="/stocks"><span>查看已同步股票</span><small>→</small></a>
            <a className="shortcut-link" href="/"><span>进入同步任务</span><small>→</small></a>
          </div>
        </aside>
      </section>

      <section className="panel overview-tasks-panel" aria-labelledby="overview-tasks-title">
        <div className="section-heading"><div><p className="eyebrow">TASK SNAPSHOT</p><h2 id="overview-tasks-title">最近同步任务</h2></div><a className="text-button" href="/">查看全部任务 →</a></div>
        {data.tasks.items.length === 0 ? <p className="state-message">暂无同步任务，请进入任务页发起数据同步。</p> : (
          <div className="task-table-wrap"><table className="data-table task-table"><caption className="sr-only">最近同步任务</caption><thead><tr><th>目标</th><th>状态</th><th>来源</th><th>更新时间</th></tr></thead><tbody>
            {data.tasks.items.map((task) => <tr key={task.task_id}><td data-label="目标">{targetLabels[task.target]}</td><td data-label="状态"><span className={`status status-${task.status}`}>{statusLabels[task.status]}</span></td><td data-label="来源">{sourceLabel(task)}</td><td data-label="更新时间">{formatTimestamp(task.updated_at)}</td></tr>)}
          </tbody></table></div>
        )}
      </section>
    </>
  )
}

export function OverviewPage() {
  const { config } = useRuntimeConfig()
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [retryToken, setRetryToken] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(undefined)
    Promise.all([
      stockCatalogApi.listStocks({ page: 1, page_size: 1, sort_by: 'symbol', sort_order: 'asc' }),
      syncTasksApi.listTasks(1, 5),
    ]).then(([stocks, tasks]) => { if (active) setData({ stocks, tasks }) })
      .catch((reason: unknown) => { if (active) setError(errorMessage(reason)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [retryToken])

  return (
    <main className="app-shell overview-page">
      <PageHeader aside={config?.data_source.mode === 'mock' && <div className="mode-banner" role="status">开发 Mock 模式<br /><small>仅用于页面开发与测试</small></div>} description="从数据覆盖和同步任务进入 A 股研究工作流，当前页面只展示已接入的真实数据。" eyebrow="MARKET / OVERVIEW" title="研究概览" />
      {loading && <section className="panel overview-state-panel"><p className="state-message" role="status">正在加载研究概览…</p></section>}
      {!loading && error && <div className="error-banner" role="alert"><span>{error}</span><button className="text-button" onClick={() => setRetryToken((value) => value + 1)} type="button">重新加载</button></div>}
      {!loading && !error && data && <OverviewContent data={data} />}
    </main>
  )
}
