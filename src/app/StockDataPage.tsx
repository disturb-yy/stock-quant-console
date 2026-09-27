import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { stockDataApi, type StockDataQuery, type StockDataResponse, type StockDailyBar } from '../api/stockData'
import { SyncApiError } from '../api/syncTasks'
import { StockKLineChart } from './StockKLineChart'

type StockDataPageProps = { symbol: string }

const aShareMarkets = new Set(['A', 'SH', 'SZ', 'BJ'])
const statusLabels: Record<string, string> = { normal: '正常', active: '正常', L: '正常', suspended: '暂停', P: '暂停', delisted: '已退市', D: '已退市' }

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function initialQuery(): StockDataQuery {
  const params = new URLSearchParams(window.location.search)
  const start = params.get('start_date') ?? ''
  const end = params.get('end_date') ?? ''
  return validDate(start) && validDate(end) ? { start_date: start, end_date: end } : {}
}

function sourceLabel(response: StockDataResponse): string {
  if (!response.source) return '暂无来源'
  return response.source.provider === 'mock' ? 'Mock（开发）' : 'Tushare（外部）'
}

function marketLabel(value: string): string {
  return aShareMarkets.has(value.toUpperCase()) ? 'A 股' : value
}

function statusLabel(value: string): string {
  return statusLabels[value] ?? value
}

function formatTimestamp(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}

function errorMessage(error: unknown): string {
  if (!(error instanceof SyncApiError)) return '股票数据服务暂时不可用，请稍后重试'
  if (error.category === 'not_found') return '未找到该股票，请检查股票标识后重试'
  if (error.category === 'unavailable') return '当前数据源不可用，请稍后重试'
  if (error.category === 'contract') return '服务响应不符合当前契约，暂时无法展示股票数据'
  return error.message
}

function queryError(startDate: string, endDate: string): string | undefined {
  if (!startDate && !endDate) return undefined
  if (!startDate || !endDate) return '开始日期和结束日期需要同时填写'
  if (!validDate(startDate) || !validDate(endDate)) return '日期格式无效'
  if (startDate > endDate) return '结束日期不能早于开始日期'
  return undefined
}

function queryFromDates(startDate: string, endDate: string): StockDataQuery {
  return startDate && endDate ? { start_date: startDate, end_date: endDate } : {}
}

type DataQueryFormProps = {
  startDate: string
  endDate: string
  loading: boolean
  error?: string
  onStartChange: (value: string) => void
  onEndChange: (value: string) => void
  onSubmit: () => void
}

function DataQueryForm(props: DataQueryFormProps) {
  return (
    <section className="stock-data-date-toolbar" aria-labelledby="stock-data-date-title">
      <div className="stock-data-date-heading">
        <strong id="stock-data-date-title">历史日线范围</strong>
        <span>不填写日期时，服务返回最近可用的默认范围。</span>
      </div>
      <div className="stock-data-query-fields">
        <label>
          开始日期
          <input aria-label="开始日期" onChange={(event) => props.onStartChange(event.target.value)} type="date" value={props.startDate} />
        </label>
        <label>
          结束日期
          <input aria-label="结束日期" onChange={(event) => props.onEndChange(event.target.value)} type="date" value={props.endDate} />
        </label>
        <button className="primary-button" disabled={props.loading} onClick={props.onSubmit} type="button">
          {props.loading ? '查询中…' : '查询'}
        </button>
      </div>
      {props.error && <p className="inline-error" role="alert">{props.error}</p>}
    </section>
  )
}

const catalogQueryKeys = ['keyword', 'page', 'page_size', 'sort_by', 'sort_order']

function catalogHref(): string {
  const current = new URLSearchParams(window.location.search)
  const params = new URLSearchParams()
  catalogQueryKeys.forEach((key) => {
    const value = current.get(key)
    if (value) params.set(key, value)
  })
  const query = params.toString()
  return query ? `/stocks?${query}` : '/stocks'
}

function priceTone(bar: StockDailyBar): 'price-rise' | 'price-fall' | 'price-flat' {
  if (bar.close > bar.open) return 'price-rise'
  if (bar.close < bar.open) return 'price-fall'
  return 'price-flat'
}

function latestFirst(bars: StockDailyBar[]): StockDailyBar[] {
  return [...bars].sort((left, right) => right.trade_date.localeCompare(left.trade_date))
}

function DataSummary({ response, returnHref }: { response: StockDataResponse; returnHref: string }) {
  const info = response.basic_info
  return (
    <section className="stock-data-summary" aria-labelledby="stock-data-summary-title">
      <div className="stock-data-summary-identity">
        <p className="eyebrow">STOCK PROFILE</p>
        <h2 id="stock-data-summary-title">{info?.name ?? response.symbol}</h2>
        <p className="stock-data-symbol">{response.symbol}</p>
        <div className="stock-data-summary-actions">
          <span className="stock-data-state">{responseState(response)}</span>
          <a className="text-button" href={returnHref}>返回股票目录</a>
        </div>
      </div>
      <dl className="stock-data-summary-grid">
        <div><dt>市场</dt><dd>{info ? marketLabel(info.market) : '—'}</dd></div>
        <div><dt>状态</dt><dd>{info ? statusLabel(info.status) : '—'}</dd></div>
        <div><dt>历史日线</dt><dd>{response.availability.daily_bars === 'available' ? '可用' : '暂无'}</dd></div>
        <div><dt>数据来源</dt><dd>{sourceLabel(response)}</dd></div>
        <div><dt>更新时间</dt><dd>{formatTimestamp(response.updated_at)}</dd></div>
        <div><dt>数据有效日</dt><dd>{response.data_as_of ?? '—'}</dd></div>
      </dl>
    </section>
  )
}

function DailyBars({ bars, available }: { bars: StockDailyBar[]; available: boolean }) {
  const tableBars = latestFirst(bars)
  return (
    <section className="panel stock-data-section" aria-labelledby="stock-data-bars-title">
      <div className="section-heading"><div><p className="eyebrow">DAILY BARS</p><h2 id="stock-data-bars-title">历史日线</h2></div><span className="muted-text">{bars.length} 条</span></div>
      {available && bars.length > 0 ? (
        <div className="stock-data-history-content">
          <div className="stock-data-chart-wrap">
            <StockKLineChart bars={bars} />
          </div>
          <div className="stock-data-table-wrap">
            <table className="data-table stock-data-table">
              <caption className="sr-only">历史日线数据</caption>
              <thead><tr><th>交易日</th><th>开盘</th><th>最高</th><th>最低</th><th>收盘</th><th>成交量</th></tr></thead>
              <tbody>{tableBars.map((bar) => {
                const tone = priceTone(bar)
                return <tr key={bar.trade_date}><td data-label="交易日">{bar.trade_date}</td><td className={`price-cell ${tone}`} data-label="开盘">{bar.open}</td><td className={`price-cell ${tone}`} data-label="最高">{bar.high}</td><td className={`price-cell ${tone}`} data-label="最低">{bar.low}</td><td className={`price-cell ${tone}`} data-label="收盘">{bar.close}</td><td data-label="成交量">{bar.volume}</td></tr>
              })}</tbody>
            </table>
          </div>
        </div>
      ) : <p className="state-message">暂无历史日线数据，请先完成历史日线同步。</p>}
    </section>
  )
}

function responseState(response: StockDataResponse): string {
  const basic = response.availability.basic_info === 'available'
  const bars = response.availability.daily_bars === 'available'
  if (basic && bars) return '数据可用'
  if (basic || bars) return '部分可用'
  return '暂无同步数据'
}

export function StockDataPage({ symbol }: StockDataPageProps) {
  const initial = useMemo(initialQuery, [])
  const [startDate, setStartDate] = useState(initial.start_date ?? '')
  const [endDate, setEndDate] = useState(initial.end_date ?? '')
  const [response, setResponse] = useState<StockDataResponse | null>(null)
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(true)
  const requestId = useRef(0)
  const returnHref = useMemo(catalogHref, [])

  const load = useCallback(async (requestedSymbol: string, query: StockDataQuery) => {
    const currentRequest = ++requestId.current
    setLoading(true)
    setError(undefined)
    try {
      const result = await stockDataApi.getStockData(requestedSymbol, query)
      if (currentRequest === requestId.current) setResponse(result)
    } catch (reason) {
      if (currentRequest === requestId.current) setError(errorMessage(reason))
    } finally {
      if (currentRequest === requestId.current) setLoading(false)
    }
  }, [])

  useEffect(() => { void load(symbol, initial) }, [initial, load, symbol])

  const submit = () => {
    const validationError = queryError(startDate, endDate)
    if (validationError) { setError(validationError); return }
    const query = queryFromDates(startDate, endDate)
    const params = new URLSearchParams(query as Record<string, string>)
    const suffix = params.toString() ? `?${params.toString()}` : ''
    window.history.pushState({}, '', `/stocks/${encodeURIComponent(symbol)}/data${suffix}`)
    void load(symbol, query)
  }

  return (
    <main className="app-shell stock-data-page">
      {response ? <DataSummary response={response} returnHref={returnHref} /> : <a className="stock-data-back-link text-button" href={returnHref}>返回股票目录</a>}
      <DataQueryForm startDate={startDate} endDate={endDate} loading={loading} error={error} onStartChange={setStartDate} onEndChange={setEndDate} onSubmit={submit} />
      {loading && !response && <section className="panel stock-data-state-panel" role="status">正在查询股票数据…</section>}
      {response && <DailyBars bars={response.daily_bars} available={response.availability.daily_bars === 'available'} />}
    </main>
  )
}
