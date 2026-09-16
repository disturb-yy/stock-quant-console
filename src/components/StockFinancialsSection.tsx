import { Card } from 'tdesign-react'
import { useEffect, useState } from 'react'
import { ApiError, isApiAbortError, isApiError, isApiErrorResponse } from '../api/client'
import {
  fetchStockFinancials,
  financialPeriods,
  financialRanges,
  type FinancialPeriod,
  type FinancialRange,
  type StockFinancialReport,
  type StockFinancialSummary,
  type StockFinancials,
} from '../api/stockFinancials'
import { EmptyState, ErrorState, LoadingState } from './PageState'

type FinancialsState =
  | { status: 'loading' }
  | { status: 'success'; data: StockFinancials }
  | { status: 'error'; error: unknown }

export type FinancialQuery = {
  readonly period: FinancialPeriod
  readonly range: FinancialRange
  readonly invalid: ReadonlyArray<string>
}

type FinancialMetricKind = 'amount' | 'percent' | 'ratio'
type FinancialMetricKey =
  | 'revenue'
  | 'net_profit'
  | 'gross_margin_pct'
  | 'roe_pct'
  | 'operating_cash_flow'
  | 'free_cash_flow'
  | 'debt_to_asset_pct'
  | 'current_ratio'

type FinancialMetricDefinition = {
  readonly key: FinancialMetricKey
  readonly label: string
  readonly kind: FinancialMetricKind
}

const summaryMetrics: ReadonlyArray<FinancialMetricDefinition> = [
  { key: 'revenue', label: '营业收入', kind: 'amount' },
  { key: 'net_profit', label: '归母净利润', kind: 'amount' },
  { key: 'gross_margin_pct', label: '毛利率', kind: 'percent' },
  { key: 'roe_pct', label: 'ROE', kind: 'percent' },
  { key: 'operating_cash_flow', label: '经营现金流', kind: 'amount' },
  { key: 'free_cash_flow', label: '自由现金流', kind: 'amount' },
  { key: 'debt_to_asset_pct', label: '资产负债率', kind: 'percent' },
  { key: 'current_ratio', label: '流动比率', kind: 'ratio' },
]

const trendGroups: ReadonlyArray<{ label: string; metrics: ReadonlyArray<FinancialMetricDefinition> }> = [
  { label: '成长', metrics: [{ key: 'revenue', label: '营业收入', kind: 'amount' }, { key: 'net_profit', label: '归母净利润', kind: 'amount' }] },
  { label: '盈利', metrics: [{ key: 'gross_margin_pct', label: '毛利率', kind: 'percent' }, { key: 'roe_pct', label: 'ROE', kind: 'percent' }] },
  { label: '现金流', metrics: [{ key: 'operating_cash_flow', label: '经营现金流', kind: 'amount' }, { key: 'free_cash_flow', label: '自由现金流', kind: 'amount' }] },
  { label: '资产质量', metrics: [{ key: 'debt_to_asset_pct', label: '资产负债率', kind: 'percent' }, { key: 'current_ratio', label: '流动比率', kind: 'ratio' }] },
]

type StatementRow = { readonly key: string; readonly label: string; readonly kind: FinancialMetricKind }

const incomeRows: ReadonlyArray<StatementRow> = [
  { key: 'revenue', label: '营业收入', kind: 'amount' },
  { key: 'gross_profit', label: '毛利润', kind: 'amount' },
  { key: 'operating_profit', label: '营业利润', kind: 'amount' },
  { key: 'net_profit', label: '归母净利润', kind: 'amount' },
]

const balanceRows: ReadonlyArray<StatementRow> = [
  { key: 'cash_and_equivalents', label: '现金及现金等价物', kind: 'amount' },
  { key: 'accounts_receivable', label: '应收账款', kind: 'amount' },
  { key: 'inventory', label: '存货', kind: 'amount' },
  { key: 'current_assets', label: '流动资产', kind: 'amount' },
  { key: 'current_liabilities', label: '流动负债', kind: 'amount' },
  { key: 'total_assets', label: '资产总额', kind: 'amount' },
  { key: 'total_liabilities', label: '负债总额', kind: 'amount' },
  { key: 'total_equity', label: '权益总额', kind: 'amount' },
]

const cashFlowRows: ReadonlyArray<StatementRow> = [
  { key: 'operating_cash_flow', label: '经营现金流', kind: 'amount' },
  { key: 'capital_expenditure', label: '资本开支', kind: 'amount' },
  { key: 'investing_cash_flow', label: '投资现金流', kind: 'amount' },
  { key: 'financing_cash_flow', label: '筹资现金流', kind: 'amount' },
  { key: 'net_cash_change', label: '现金净增加额', kind: 'amount' },
]

function useStockFinancials(symbol: string, query: FinancialQuery) {
  const [reloadKey, setReloadKey] = useState(0)
  const [state, setState] = useState<FinancialsState>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    let current = true
    setState({ status: 'loading' })
    fetchStockFinancials(symbol, { period: query.period, range: query.range }, controller.signal)
      .then((data) => {
        if (data.symbol !== symbol || data.period !== query.period || data.requested_range !== query.range) {
          throw new ApiError('invalid-payload', 'API 响应与财务查询不一致')
        }
        if (current) setState({ status: 'success', data })
      })
      .catch((error: unknown) => {
        if (current && !isApiAbortError(error)) setState({ status: 'error', error })
      })

    return () => {
      current = false
      controller.abort()
    }
  }, [query.period, query.range, reloadKey, symbol])

  return { state, retry: () => setReloadKey((value) => value + 1) }
}

function financialErrorKind(error: unknown): 'invalid' | 'not-found' | 'unavailable' {
  if (!isApiError(error)) return 'unavailable'
  const code = isApiErrorResponse(error.payload) ? error.payload.code : undefined
  if (error.status === 400 || code === 'VALIDATION_ERROR') return 'invalid'
  if (error.status === 404 || code === 'NOT_FOUND') return 'not-found'
  return 'unavailable'
}

function FinancialErrorState({ error, onRetry, onBack, onReset }: { error: unknown; onRetry: () => void; onBack: () => void; onReset: () => void }) {
  const kind = financialErrorKind(error)
  if (kind === 'invalid') return <ErrorState error={error} title="财务查询参数无效" hint="请恢复默认查询后重新请求真实财务数据。" actionLabel="恢复默认查询" onRetry={onReset} />
  if (kind === 'not-found') return <ErrorState error={error} title="股票不存在" hint="财务接口未找到这个股票标识，请返回 Markets 重新选择。" actionLabel="返回 Markets" onRetry={onBack} />
  return <ErrorState error={error} title="财务数据暂不可用" hint="服务或网络暂时不可用，页面不会使用替代数据；请稍后重试。" actionLabel="重试加载财务" onRetry={onRetry} />
}

function formatFinancialValue(value: string | null, kind: FinancialMetricKind): string {
  if (value === null) return kind === 'amount' ? '暂无披露' : '暂不可计算'
  const number = Number(value)
  if (!Number.isFinite(number)) return value
  const formatted = number.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (kind === 'percent') return `${formatted}%`
  if (kind === 'ratio') return `${formatted}x`
  return formatted
}

function sourceLabel(mode: StockFinancials['source']['mode']) {
  if (mode === 'real') return '真实 Provider'
  if (mode === 'fallback') return '本地回退数据'
  return 'Seed 数据'
}

function periodLabel(report: StockFinancialReport) {
  return report.fiscal_quarter ? `${report.fiscal_year} ${report.fiscal_quarter}` : `${report.fiscal_year} 年`
}

function summaryValue(summary: StockFinancialSummary, key: FinancialMetricKey): string | null {
  return summary[key]
}

function reportMetric(report: StockFinancialReport, key: FinancialMetricKey): string | null {
  if (key === 'revenue' || key === 'net_profit') return report.income[key]
  if (key === 'operating_cash_flow') return report.cash_flow.operating_cash_flow
  if (key === 'free_cash_flow') return report.indicators.free_cash_flow
  return report.indicators[key]
}

function FinancialSummary({ data }: { data: StockFinancials }) {
  if (data.summary === null) {
    return <div className="financial-summary-empty" role="status"><strong>最新财务摘要暂无可用数据</strong><span>页面不会从报表残片重新计算摘要。</span></div>
  }
  return (
    <section className="financial-subsection" aria-labelledby="financial-summary-title">
      <div className="financial-subsection__heading"><div><p className="market-section-kicker">LATEST REPORT</p><h3 id="financial-summary-title">最新财务摘要</h3></div><span>{data.summary.period_end} · 披露 {data.summary.published_at ?? '暂无'}</span></div>
      <div className="financial-summary-grid">
        {summaryMetrics.map((metric) => <Card className="market-card financial-summary-card" bordered key={metric.key}><span>{metric.label}</span><strong>{formatFinancialValue(summaryValue(data.summary!, metric.key), metric.kind)}</strong><code>{metric.kind === 'amount' ? data.amount_unit : metric.kind === 'percent' ? '%' : '倍数'}</code></Card>)}
      </div>
    </section>
  )
}

function chartValue(value: string | null) {
  if (value === null) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function FinancialTrendChart({ reports, metric }: { reports: ReadonlyArray<StockFinancialReport>; metric: FinancialMetricDefinition }) {
  const values = reports.map((report) => chartValue(reportMetric(report, metric.key)))
  const latestValue = reportMetric(reports[reports.length - 1], metric.key)
  const valid = values.filter((value): value is number => value !== null)
  const width = 520
  const height = 190
  const plot = { left: 12, right: 12, top: 18, bottom: 28 }
  const minimum = valid.length ? Math.min(...valid) : 0
  const maximum = valid.length ? Math.max(...valid) : 1
  const range = maximum - minimum || 1
  const x = (index: number) => plot.left + ((width - plot.left - plot.right) * index) / Math.max(reports.length - 1, 1)
  const y = (value: number) => plot.top + ((maximum - value) / range) * (height - plot.top - plot.bottom)
  const segments: string[] = []
  let segment: string[] = []
  values.forEach((value, index) => {
    if (value === null) {
      if (segment.length > 1) segments.push(segment.join(' '))
      segment = []
      return
    }
    segment.push(`${x(index)},${y(value)}`)
  })
  if (segment.length > 1) segments.push(segment.join(' '))

  return (
    <article className="financial-trend-card">
      <div className="financial-trend-card__heading"><h4>{metric.label}</h4><span>{metric.kind === 'amount' ? 'CNY' : metric.kind === 'percent' ? '%' : '倍数'}</span></div>
      {valid.length === 0 ? <p className="financial-trend-card__empty">暂无可用数据</p> : <svg className="financial-trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${metric.label}趋势，单位 ${metric.kind === 'amount' ? 'CNY' : metric.kind === 'percent' ? '百分比' : '倍数'}`}><title>{metric.label}趋势</title><line className="financial-trend-chart__axis" x1={plot.left} x2={width - plot.right} y1={height - plot.bottom} y2={height - plot.bottom} />{segments.map((points) => <polyline key={points} className="financial-trend-chart__line" points={points} fill="none" vectorEffect="non-scaling-stroke" />)}{values.map((value, index) => value === null ? null : <circle key={reports[index].period_end} className="financial-trend-chart__point" cx={x(index)} cy={y(value)} r="3"><title>{periodLabel(reports[index])}：{formatFinancialValue(String(value), metric.kind)}</title></circle>)}</svg>}
      <div className="financial-trend-card__legend"><span>{reports[0].period_end} 至 {reports[reports.length - 1].period_end}</span><strong>最新期：{formatFinancialValue(latestValue, metric.kind)}</strong></div>
    </article>
  )
}

function FinancialTrends({ reports }: { reports: ReadonlyArray<StockFinancialReport> }) {
  return <section className="financial-subsection" aria-labelledby="financial-trends-title"><div className="financial-subsection__heading"><div><p className="market-section-kicker">REPORTED TRENDS</p><h3 id="financial-trends-title">财务趋势</h3></div><span>指标直接读取 API 返回值</span></div><div className="financial-trend-groups">{trendGroups.map((group) => <section className="financial-trend-group" aria-labelledby={`financial-trend-${group.label}`} key={group.label}><h4 id={`financial-trend-${group.label}`}>{group.label}</h4><div className="financial-trend-grid">{group.metrics.map((metric) => <FinancialTrendChart key={metric.key} reports={reports} metric={metric} />)}</div></section>)}</div></section>
}

function statementValue(report: StockFinancialReport, key: string): string | null {
  if (key in report.income) return report.income[key as keyof typeof report.income]
  if (key in report.balance) return report.balance[key as keyof typeof report.balance]
  return report.cash_flow[key as keyof typeof report.cash_flow]
}

function FinancialStatementTable({ title, rows, reports }: { title: string; rows: ReadonlyArray<StatementRow>; reports: ReadonlyArray<StockFinancialReport> }) {
  return <section className="financial-statement" aria-labelledby={`financial-statement-${title}`}><div className="financial-subsection__heading"><h4 id={`financial-statement-${title}`}>{title}</h4><span>金额单位：CNY</span></div><div className="financial-table-scroll"><table className="financial-table"><caption className="sr-only">{title}，报告期按时间升序排列</caption><thead><tr><th scope="col">字段</th>{reports.map((report) => <th scope="col" key={report.period_end}><time dateTime={report.period_end}>{periodLabel(report)}</time><small>{report.period_end}</small></th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.key}><th scope="row">{row.label}</th>{reports.map((report) => <td key={`${row.key}-${report.period_end}`} data-label={row.label}>{formatFinancialValue(statementValue(report, row.key), row.kind)}</td>)}</tr>)}</tbody></table></div></section>
}

function FinancialStatements({ reports }: { reports: ReadonlyArray<StockFinancialReport> }) {
  return <section className="financial-subsection" aria-labelledby="financial-statements-title"><div className="financial-subsection__heading"><div><p className="market-section-kicker">SIMPLIFIED STATEMENTS</p><h3 id="financial-statements-title">简化三大报表</h3></div><span>同一报告期列 · 按时间升序</span></div><div className="financial-statements-grid"><FinancialStatementTable title="简化利润表" rows={incomeRows} reports={reports} /><FinancialStatementTable title="简化资产负债表" rows={balanceRows} reports={reports} /><FinancialStatementTable title="简化现金流量表" rows={cashFlowRows} reports={reports} /></div></section>
}

function FinancialSource({ data }: { data: StockFinancials }) {
  return <div className="financial-source" aria-label="财务数据来源"><span>数据来源：{sourceLabel(data.source.mode)}</span><span>{data.source.provider}</span><span>Seed {data.source.seed_version}</span><span>截至 {data.source.as_of}</span><span>币种 {data.reporting_currency} · 金额单位 {data.amount_unit}</span></div>
}

export function StockFinancialsSection({ symbol, query, onQueryChange, onResetQuery, onBack }: {
  symbol: string
  query: FinancialQuery
  onQueryChange: (next: Partial<Pick<FinancialQuery, 'period' | 'range'>>) => void
  onResetQuery: () => void
  onBack: () => void
}) {
  const { state, retry } = useStockFinancials(symbol, query)
  const data = state.status === 'success' ? state.data : null
  return (
    <section className="stock-financials-section" aria-labelledby="stock-financials-title">
      <div className="market-section-heading">
        <div><p className="market-section-kicker">FINANCIALS</p><h2 id="stock-financials-title">财务</h2></div>
        <span className="market-section-meta">报告期与来源随 API 返回</span>
      </div>
      <Card className="market-card stock-financials-card" bordered>
        <div className="stock-financials-card__body">
          {query.invalid.length > 0 ? <div className="financial-query-notice" role="status">URL 中的 {query.invalid.join('、')} 无效，已恢复为默认查询。<button type="button" onClick={onResetQuery}>确认恢复</button></div> : null}
          <div className="financial-controls">
            <label><span>报告口径</span><select aria-label="财务报告口径" value={query.period} onChange={(event) => onQueryChange({ period: event.target.value as FinancialPeriod })}>{financialPeriods.map((value) => <option value={value} key={value}>{value === 'annual' ? '年度' : '季度'}</option>)}</select></label>
            <label><span>观察范围</span><select aria-label="财务观察范围" value={query.range} onChange={(event) => onQueryChange({ range: event.target.value as FinancialRange })}>{financialRanges.map((value) => <option value={value} key={value}>{value === '3y' ? '近 3 年' : '近 5 年'}</option>)}</select></label>
          </div>
          <div className="financial-query-summary">
            <span>口径：{query.period === 'annual' ? '年度' : '季度'}</span><span>范围：{query.range === '3y' ? '近 3 年' : '近 5 年'}</span>
            {data !== null ? <span>报告期：{data.effective_range.from ?? '暂无'} 至 {data.effective_range.to ?? '暂无'}</span> : null}
          </div>
          {state.status === 'loading' ? <LoadingState label={`正在请求 /api/v1/stocks/${encodeURIComponent(symbol)}/financials`} /> : null}
          {state.status === 'error' ? <FinancialErrorState error={state.error} onRetry={retry} onBack={onBack} onReset={onResetQuery} /> : null}
          {data !== null && data.reports.length === 0 ? <EmptyState description="所选口径和范围暂无财务数据，请调整查询范围后重试。" onRetry={retry} /> : null}
          {data !== null && data.reports.length > 0 ? <><FinancialSummary data={data} /><FinancialTrends reports={data.reports} /><FinancialStatements reports={data.reports} /><FinancialSource data={data} /></> : null}
        </div>
      </Card>
    </section>
  )
}
