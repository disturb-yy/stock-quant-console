import { useEffect, useMemo, useState } from 'react'
import { Card } from 'tdesign-react'
import { useSearchParams } from 'react-router-dom'
import { isApiAbortError } from '../api/client'
import {
  fetchMarketSignals,
  signalMultiples,
  signalTopPercents,
  signalTypes,
  signalWindows,
  type MarketSignals,
  type SignalMultiple,
  type SignalParameters,
  type SignalTopPercent,
  type SignalType,
  type SignalWindow,
} from '../api/marketSignals'
import { fetchMarketOverview, type MarketDataSource, type MarketIndex, type MarketOverview } from '../api/marketOverview'
import { fetchMarketSectors, type MarketSector, type MarketSectors } from '../api/marketSectors'
import { MarketRankingsSection } from '../components/MarketRankingsSection'
import { EmptyState, ErrorState, LoadingState } from '../components/PageState'

type MarketOverviewState =
  | { status: 'loading' }
  | { status: 'success'; data: MarketOverview }
  | { status: 'empty' }
  | { status: 'error'; error: unknown }

const indexOrder = ['000001.SH', '399001.SZ', '399006.SZ', '000300.SH']

function getOrderedIndices(indices: ReadonlyArray<MarketIndex>) {
  const byCode = new Map(indices.map((index) => [index.code, index]))
  const preferred = indexOrder
    .map((code) => byCode.get(code))
    .filter((index): index is MarketIndex => index !== undefined)
  const remaining = indices.filter((index) => !indexOrder.includes(index.code))
  return [...preferred, ...remaining]
}

function useMarketOverview() {
  const [reloadKey, setReloadKey] = useState(0)
  const [state, setState] = useState<MarketOverviewState>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    setState({ status: 'loading' })
    fetchMarketOverview(controller.signal)
      .then((data) => {
        setState(data.indices.length === 0 ? { status: 'empty' } : { status: 'success', data })
      })
      .catch((error: unknown) => {
        if (!isApiAbortError(error)) setState({ status: 'error', error })
      })

    return () => controller.abort()
  }, [reloadKey])

  return { state, retry: () => setReloadKey((value) => value + 1) }
}

function formatNumber(value: string) {
  const number = Number(value)
  return Number.isFinite(number)
    ? number.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : value
}

function formatSignedNumber(value: string, suffix = '') {
  const number = Number(value)
  if (!Number.isFinite(number)) return `${value}${suffix}`
  const sign = number > 0 ? '+' : ''
  return `${sign}${number.toFixed(2)}${suffix}`
}

function getTrend(value: string) {
  const number = Number(value)
  if (number > 0) return 'up'
  if (number < 0) return 'down'
  return 'flat'
}

function getTrendLabel(value: string) {
  const trend = getTrend(value)
  if (trend === 'up') return '上涨'
  if (trend === 'down') return '下跌'
  return '平盘'
}

function formatTurnover(amount: string) {
  const number = Number(amount)
  return Number.isFinite(number)
    ? `¥${number.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : amount
}

function getSourceLabel(source: MarketDataSource) {
  if (source.mode === 'real') return '真实 Provider'
  if (source.mode === 'fallback') return '本地回退数据'
  return 'Seed 数据'
}

const signalLabels: Record<SignalType, string> = {
  volume_surge: '放量',
  breakout: '突破',
  new_high: '新高',
  strong: '强势',
}

const signalDescriptions: Record<SignalType, string> = {
  volume_surge: '成交量达到窗口均值倍数',
  breakout: '收盘价突破窗口高点',
  new_high: '创窗口期内新高',
  strong: '收益率进入排名前列',
}

const defaultSignalType: SignalType = 'volume_surge'
const defaultSignalWindow: SignalWindow = 20
const defaultSignalMultiple: SignalMultiple = 1.5
const defaultSignalTopPercent: SignalTopPercent = 10

type SignalQuery = {
  type: SignalType
  window: SignalWindow
  multiple: SignalMultiple
  topPercent: SignalTopPercent
  invalid: ReadonlyArray<string>
}

function readSignalQuery(searchParams: URLSearchParams): SignalQuery {
  const invalid: string[] = []
  const rawType = searchParams.get('signal_type')
  const type = rawType !== null && signalTypes.includes(rawType as SignalType)
    ? rawType as SignalType
    : defaultSignalType
  if (rawType !== null && type === defaultSignalType && rawType !== defaultSignalType) invalid.push('signal_type')

  function readNumber<T extends number>(key: string, options: readonly T[], fallback: T): T {
    const raw = searchParams.get(key)
    if (raw === null) return fallback
    const value = Number(raw)
    if (options.includes(value as T)) return value as T
    invalid.push(key)
    return fallback
  }

  return {
    type,
    window: readNumber('signal_window', signalWindows, defaultSignalWindow),
    multiple: readNumber('signal_multiple', signalMultiples, defaultSignalMultiple),
    topPercent: readNumber('signal_top_percent', signalTopPercents, defaultSignalTopPercent),
    invalid,
  }
}

function buildSignalParams(query: SignalQuery): SignalParameters {
  const params: SignalParameters = { window: query.window }
  if (query.type === 'volume_surge') return { ...params, multiple: query.multiple }
  if (query.type === 'strong') return { ...params, top_percent: query.topPercent }
  return params
}

function formatSignalParams(type: SignalType, params: SignalParameters) {
  const window = params.window === undefined ? '默认窗口' : `${params.window} 日`
  if (type === 'volume_surge') return `窗口 ${window} · 成交量倍数 ${params.multiple ?? '默认'}x`
  if (type === 'strong') return `窗口 ${window} · 收益率前 ${params.top_percent ?? '默认'}%`
  return `窗口 ${window}`
}

function signalContext(signal: SignalType, params: SignalParameters) {
  if (signal === 'volume_surge') return `窗口 ${params.window ?? '默认'} 日，成交量达到 ${params.multiple ?? '默认'}x`
  if (signal === 'strong') return `窗口 ${params.window ?? '默认'} 日，收益率排名前 ${params.top_percent ?? '默认'}%`
  if (signal === 'breakout') return `收盘价突破 ${params.window ?? '默认'} 日窗口高点`
  return `创 ${params.window ?? '默认'} 日窗口新高`
}

export type SectorSort = 'gainers' | 'losers'
export type SectorFilter = 'all' | 'up' | 'down' | 'flat'

const defaultSectorSort: SectorSort = 'gainers'
const defaultSectorFilter: SectorFilter = 'all'

function isSectorSort(value: string | null): value is SectorSort {
  return value === 'gainers' || value === 'losers'
}

function isSectorFilter(value: string | null): value is SectorFilter {
  return value === 'all' || value === 'up' || value === 'down' || value === 'flat'
}

function readSectorQuery(searchParams: URLSearchParams) {
  return {
    sort: isSectorSort(searchParams.get('sector_sort')) ? searchParams.get('sector_sort') as SectorSort : defaultSectorSort,
    filter: isSectorFilter(searchParams.get('sector_filter')) ? searchParams.get('sector_filter') as SectorFilter : defaultSectorFilter,
  }
}

function changeValue(value: string) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function sectorTrend(value: string): Exclude<SectorFilter, 'all'> {
  const number = changeValue(value)
  if (number === null || number === 0) return 'flat'
  return number > 0 ? 'up' : 'down'
}

function sortSectors(sectors: ReadonlyArray<MarketSector>, sort: SectorSort) {
  return [...sectors].sort((left, right) => {
    const leftValue = changeValue(left.change_percent)
    const rightValue = changeValue(right.change_percent)
    if (leftValue === null && rightValue !== null) return 1
    if (leftValue !== null && rightValue === null) return -1
    if (leftValue !== null && rightValue !== null && leftValue !== rightValue) {
      return sort === 'gainers' ? rightValue - leftValue : leftValue - rightValue
    }
    return left.name.localeCompare(right.name, 'zh-CN')
  })
}

function selectSectors(sectors: ReadonlyArray<MarketSector>, sort: SectorSort, filter: SectorFilter) {
  const filtered = filter === 'all' ? sectors : sectors.filter((sector) => sectorTrend(sector.change_percent) === filter)
  return sortSectors(filtered, sort)
}

type MarketSectorsState =
  | { status: 'loading' }
  | { status: 'success'; data: MarketSectors }
  | { status: 'empty' }
  | { status: 'error'; error: unknown }

function useMarketSectors() {
  const [reloadKey, setReloadKey] = useState(0)
  const [state, setState] = useState<MarketSectorsState>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    setState({ status: 'loading' })
    fetchMarketSectors(controller.signal)
      .then((data) => setState(data.sectors.length === 0 ? { status: 'empty' } : { status: 'success', data }))
      .catch((error: unknown) => {
        if (!isApiAbortError(error)) setState({ status: 'error', error })
      })

    return () => controller.abort()
  }, [reloadKey])

  return { state, retry: () => setReloadKey((value) => value + 1) }
}

function SectorControls({
  sort,
  filter,
  onSortChange,
  onFilterChange,
}: {
  sort: SectorSort
  filter: SectorFilter
  onSortChange: (value: SectorSort) => void
  onFilterChange: (value: SectorFilter) => void
}) {
  return (
    <div className="market-sector-controls" aria-label="行业表现排序与筛选">
      <label className="market-sector-control">
        <span>排序</span>
        <select aria-label="行业排序" value={sort} onChange={(event) => onSortChange(event.target.value as SectorSort)}>
          <option value="gainers">涨幅优先</option>
          <option value="losers">跌幅优先</option>
        </select>
      </label>
      <label className="market-sector-control">
        <span>涨跌筛选</span>
        <select aria-label="行业涨跌筛选" value={filter} onChange={(event) => onFilterChange(event.target.value as SectorFilter)}>
          <option value="all">全部行业</option>
          <option value="up">上涨</option>
          <option value="down">下跌</option>
          <option value="flat">平盘</option>
        </select>
      </label>
    </div>
  )
}

function SectorTrend({ value }: { value: string }) {
  const trend = sectorTrend(value)
  const symbol = trend === 'up' ? '▲' : trend === 'down' ? '▼' : '—'
  return (
    <span className={`market-sector-trend market-sector-trend--${trend}`}>
      <span aria-hidden="true">{symbol}</span>
      <span>{formatSignedNumber(value, '%')}</span>
      <span className="market-sector-trend__label">{getTrendLabel(value)}</span>
    </span>
  )
}

function SectorTable({ sectors }: { sectors: ReadonlyArray<MarketSector> }) {
  return (
    <div className="market-sector-table-wrap">
      <table className="market-sector-table">
        <caption className="sr-only">行业表现，包含等权日收益、成分数量与领涨股票</caption>
        <thead>
          <tr>
            <th scope="col">行业</th>
            <th scope="col">等权日收益</th>
            <th scope="col">成分数量</th>
            <th scope="col">领涨股票</th>
            <th scope="col">领涨股涨跌幅</th>
          </tr>
        </thead>
        <tbody>
          {sectors.map((sector) => (
            <tr key={sector.code}>
              <th scope="row">
                <span className="market-sector-name">{sector.name}</span>
                <code>{sector.code}</code>
              </th>
              <td><SectorTrend value={sector.change_percent} /></td>
              <td className="market-sector-table__number">{sector.component_count.toLocaleString('zh-CN')}</td>
              <td>
                <span className="market-sector-leader__name">{sector.leader.name}</span>
                <code>{sector.leader.code}</code>
              </td>
              <td><SectorTrend value={sector.leader.change_percent} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MarketSectorsSection() {
  const { state, retry } = useMarketSectors()
  const [searchParams, setSearchParams] = useSearchParams()
  const query = readSectorQuery(searchParams)
  const sectors = useMemo(
    () => state.status === 'success' ? selectSectors(state.data.sectors, query.sort, query.filter) : [],
    [query.filter, query.sort, state],
  )

  function updateQuery(next: Partial<typeof query>) {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('sector_sort', next.sort ?? query.sort)
    nextParams.set('sector_filter', next.filter ?? query.filter)
    setSearchParams(nextParams, { replace: true })
  }

  return (
    <section className="market-section market-sector-section" aria-labelledby="market-sectors-title">
      <div className="market-section-heading market-sector-heading">
        <div>
          <p className="market-section-kicker">SECTOR PERFORMANCE</p>
          <h2 id="market-sectors-title">行业表现</h2>
        </div>
        {state.status === 'success' ? (
          <div className="market-sector-heading__meta">
            <span className="market-section-meta">数据日期 <time dateTime={state.data.as_of}>{state.data.as_of}</time></span>
            <span className="market-sector-source">{getSourceLabel(state.data.source)} · {state.data.source.seed_version}</span>
          </div>
        ) : null}
      </div>
      {state.status === 'loading' ? <Card className="market-card market-state-card market-sector-card" bordered><LoadingState label="正在请求 /api/v1/markets/sectors" /></Card> : null}
      {state.status === 'empty' ? <Card className="market-card market-state-card market-sector-card" bordered><EmptyState description="接口已返回，但当前没有可展示的行业表现。" onRetry={retry} /></Card> : null}
      {state.status === 'error' ? (
        <Card className="market-card market-state-card market-sector-card" bordered>
          <ErrorState error={state.error} hint="行业表现暂时无法加载，市场概览仍可继续使用；请确认后端服务和 Vite 代理可用后重试。" onRetry={retry} />
        </Card>
      ) : null}
      {state.status === 'success' ? (
        <Card className="market-card market-sector-card" bordered>
          <SectorControls sort={query.sort} filter={query.filter} onSortChange={(sort) => updateQuery({ sort })} onFilterChange={(filter) => updateQuery({ filter })} />
          {sectors.length === 0 ? <EmptyState description="当前筛选条件下没有行业表现。" /> : <SectorTable sectors={sectors} />}
        </Card>
      ) : null}
    </section>
  )
}

type MarketSignalsState =
  | { status: 'loading' }
  | { status: 'success'; data: MarketSignals }
  | { status: 'empty' }
  | { status: 'error'; error: unknown }

function useMarketSignals(query: SignalQuery) {
  const [reloadKey, setReloadKey] = useState(0)
  const [state, setState] = useState<MarketSignalsState>({ status: 'loading' })

  useEffect(() => {
    if (query.invalid.length > 0) {
      setState({ status: 'loading' })
      return
    }

    const controller = new AbortController()
    setState({ status: 'loading' })
    fetchMarketSignals({ type: query.type, params: buildSignalParams(query) }, controller.signal)
      .then((data) => setState(data.signals.length === 0 ? { status: 'empty' } : { status: 'success', data }))
      .catch((error: unknown) => {
        if (!isApiAbortError(error)) setState({ status: 'error', error })
      })

    return () => controller.abort()
  }, [query.invalid.length, query.multiple, query.topPercent, query.type, query.window, reloadKey])

  return { state, retry: () => setReloadKey((value) => value + 1) }
}

function SignalControls({
  query,
  onTypeChange,
  onWindowChange,
  onMultipleChange,
  onTopPercentChange,
}: {
  query: SignalQuery
  onTypeChange: (value: SignalType) => void
  onWindowChange: (value: SignalWindow) => void
  onMultipleChange: (value: SignalMultiple) => void
  onTopPercentChange: (value: SignalTopPercent) => void
}) {
  return (
    <div className="market-signal-controls">
      <div className="market-signal-tabs" role="tablist" aria-label="市场信号类型">
        {signalTypes.map((type) => (
          <button
            key={type}
            type="button"
            role="tab"
            aria-selected={query.type === type}
            className={query.type === type ? 'market-signal-tab market-signal-tab--active' : 'market-signal-tab'}
            onClick={() => onTypeChange(type)}
          >
            {signalLabels[type]}
          </button>
        ))}
      </div>
      <div className="market-signal-filters" aria-label="市场信号参数">
        <label className="market-signal-control">
          <span>历史窗口</span>
          <select aria-label="信号历史窗口" value={query.window} onChange={(event) => onWindowChange(Number(event.target.value) as SignalWindow)}>
            {signalWindows.map((value) => <option key={value} value={value}>{value} 日</option>)}
          </select>
        </label>
        {query.type === 'volume_surge' ? (
          <label className="market-signal-control">
            <span>成交量倍数</span>
            <select aria-label="成交量倍数" value={query.multiple} onChange={(event) => onMultipleChange(Number(event.target.value) as SignalMultiple)}>
              {signalMultiples.map((value) => <option key={value} value={value}>{value}x</option>)}
            </select>
          </label>
        ) : null}
        {query.type === 'strong' ? (
          <label className="market-signal-control">
            <span>收益率排名</span>
            <select aria-label="收益率排名" value={query.topPercent} onChange={(event) => onTopPercentChange(Number(event.target.value) as SignalTopPercent)}>
              {signalTopPercents.map((value) => <option key={value} value={value}>前 {value}%</option>)}
            </select>
          </label>
        ) : null}
      </div>
    </div>
  )
}

function SignalTable({ data }: { data: MarketSignals }) {
  return (
    <div className="market-signal-table-wrap">
      <table className="market-signal-table">
        <caption className="sr-only">市场信号结果，包含股票代码、名称、信号类型和参数上下文</caption>
        <thead>
          <tr>
            <th scope="col">股票代码</th>
            <th scope="col">股票名称</th>
            <th scope="col">信号</th>
            <th scope="col">信号上下文</th>
          </tr>
        </thead>
        <tbody>
          {data.signals.map((signal) => (
            <tr key={`${signal.code}-${signal.signal}`}>
              <th scope="row"><code>{signal.code}</code></th>
              <td className="market-signal-table__name">{signal.name}</td>
              <td>
                <span className={`market-signal-badge market-signal-badge--${signal.signal}`}>
                  <span aria-hidden="true">◆</span>
                  <span>{signalLabels[signal.signal]}</span>
                </span>
              </td>
              <td>{signalDescriptions[signal.signal]} · {signalContext(signal.signal, data.params)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MarketSignalsSection() {
  const [searchParams, setSearchParams] = useSearchParams()
  const query = readSignalQuery(searchParams)
  const { state, retry } = useMarketSignals(query)

  function updateQuery(next: Partial<Pick<SignalQuery, 'type' | 'window' | 'multiple' | 'topPercent'>>) {
    const nextQuery = { ...query, ...next }
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('signal_type', nextQuery.type)
    nextParams.set('signal_window', String(nextQuery.window))
    nextParams.set('signal_multiple', String(nextQuery.multiple))
    nextParams.set('signal_top_percent', String(nextQuery.topPercent))
    setSearchParams(nextParams, { replace: true })
  }

  function resetInvalidQuery() {
    const nextParams = new URLSearchParams(searchParams)
    for (const key of ['signal_type', 'signal_window', 'signal_multiple', 'signal_top_percent']) nextParams.delete(key)
    setSearchParams(nextParams, { replace: true })
  }

  return (
    <section className="market-section market-signal-section" aria-labelledby="market-signals-title">
      <div className="market-section-heading market-signal-heading">
        <div>
          <p className="market-section-kicker">MARKET SIGNALS</p>
          <h2 id="market-signals-title">市场信号</h2>
        </div>
        {state.status === 'success' ? (
          <div className="market-signal-heading__meta">
            <span className="market-section-meta">数据日期 <time dateTime={state.data.as_of}>{state.data.as_of}</time></span>
            <span className="market-signal-params">实际参数 · {formatSignalParams(state.data.type, state.data.params)}</span>
            <span className="market-signal-source">{getSourceLabel(state.data.source)} · {state.data.source.provider} · {state.data.source.seed_version}</span>
          </div>
        ) : null}
      </div>
      <Card className="market-card market-signal-card" bordered>
        <SignalControls
          query={query}
          onTypeChange={(type) => updateQuery({ type })}
          onWindowChange={(window) => updateQuery({ window })}
          onMultipleChange={(multiple) => updateQuery({ multiple })}
          onTopPercentChange={(topPercent) => updateQuery({ topPercent })}
        />
        {query.invalid.length > 0 ? (
          <ErrorState
            description="URL 中的市场信号参数无效"
            hint={`请检查参数：${query.invalid.join('、')}。恢复默认参数后会重新请求真实接口。`}
            actionLabel="恢复默认参数"
            onRetry={resetInvalidQuery}
          />
        ) : null}
        {query.invalid.length === 0 && state.status === 'loading' ? <LoadingState label="正在请求 /api/v1/markets/signals" /> : null}
        {query.invalid.length === 0 && state.status === 'empty' ? <EmptyState description="接口已返回，但当前参数下没有市场信号。" onRetry={retry} /> : null}
        {query.invalid.length === 0 && state.status === 'error' ? (
          <ErrorState
            error={state.error}
            hint="市场信号暂时无法加载，请检查后端服务和 Vite 代理后重试。"
            onRetry={retry}
          />
        ) : null}
        {query.invalid.length === 0 && state.status === 'success' ? <SignalTable data={state.data} /> : null}
      </Card>
    </section>
  )
}

function IndexCard({ index }: { index: MarketIndex }) {
  const trend = getTrend(index.change_percent)
  return (
    <Card className="market-card market-index-card" bordered>
      <div className="market-index-card__heading">
        <div>
          <h3>{index.name}</h3>
          <span>{index.code}</span>
        </div>
        <span className={`market-index-card__trend market-index-card__trend--${trend}`}>
          {getTrendLabel(index.change_percent)}
        </span>
      </div>
      <strong className="market-index-card__close">{formatNumber(index.close)}</strong>
      <div className="market-index-card__change">
        <span>{formatSignedNumber(index.change)}</span>
        <span>{formatSignedNumber(index.change_percent, '%')}</span>
      </div>
    </Card>
  )
}

function StatCard({ label, value, note, trend }: { label: string; value: string; note?: string; trend?: 'up' | 'down' | 'flat' }) {
  return (
    <Card className="market-card market-stat-card" bordered>
      <span className="market-stat-card__label">{label}</span>
      <strong className={trend ? `market-stat-card__value market-stat-card__value--${trend}` : 'market-stat-card__value'}>{value}</strong>
      {note ? <span className="market-stat-card__note">{note}</span> : null}
    </Card>
  )
}

function MarketOverviewContent({ data }: { data: MarketOverview }) {
  const indices = getOrderedIndices(data.indices)
  return (
    <div className="market-overview-content">
      <section className="market-section" aria-labelledby="market-indices-title">
        <div className="market-section-heading">
          <div>
            <p className="market-section-kicker">INDEX SNAPSHOT</p>
            <h2 id="market-indices-title">主要指数</h2>
          </div>
          <span className="market-section-meta">数据日期 <time dateTime={data.as_of}>{data.as_of}</time></span>
        </div>
        <div className="market-index-grid">
          {indices.map((index) => <IndexCard key={index.code} index={index} />)}
        </div>
      </section>

      <section className="market-section" aria-labelledby="market-summary-title">
        <div className="market-section-heading">
          <div>
            <p className="market-section-kicker">MARKET BREADTH</p>
            <h2 id="market-summary-title">市场宽度与成交</h2>
          </div>
        </div>
        <div className="market-stat-grid">
          <StatCard label="上涨家数" value={data.breadth.advancing.toLocaleString('zh-CN')} trend="up" />
          <StatCard label="下跌家数" value={data.breadth.declining.toLocaleString('zh-CN')} trend="down" />
          <StatCard label="平盘家数" value={data.breadth.unchanged.toLocaleString('zh-CN')} trend="flat" />
          <StatCard label="成交额" value={formatTurnover(data.turnover.amount)} note={data.turnover.currency} />
        </div>
      </section>

      <section className="market-source-section" aria-labelledby="market-source-title">
        <Card className="market-card market-source-card" bordered>
          <div className="market-source-card__heading">
            <div>
              <p className="market-section-kicker">DATA PROVENANCE</p>
              <h2 id="market-source-title">数据说明</h2>
            </div>
            <span className="market-source-card__mode">{getSourceLabel(data.source)}</span>
          </div>
          <dl className="market-source-card__meta">
            <div>
              <dt>观测时间</dt>
              <dd><time dateTime={data.observed_at}>{data.observed_at}</time></dd>
            </div>
            <div>
              <dt>数据来源</dt>
              <dd>{data.source.provider}</dd>
            </div>
            <div>
              <dt>Seed 版本</dt>
              <dd>{data.source.seed_version}</dd>
            </div>
          </dl>
        </Card>
      </section>
    </div>
  )
}

export function MarketOverviewPage() {
  const { state, retry } = useMarketOverview()

  return (
    <main className="page-container market-overview-page">
      <section className="page-heading">
        <div>
          <p className="page-kicker">WORKSPACE / MARKET</p>
          <h1>市场概览</h1>
          <p className="page-description">快速了解今日 A 股主要指数、市场宽度与成交状态。</p>
        </div>
        <div className="page-heading__signal" aria-label="数据范围">
          <span>中国 A 股</span>
          <span aria-hidden="true">·</span>
          <span>日线概览</span>
        </div>
      </section>

      {state.status === 'loading' ? <Card className="market-card market-state-card" bordered><LoadingState label="正在请求 /api/v1/markets/overview" /></Card> : null}
      {state.status === 'empty' ? <Card className="market-card market-state-card" bordered><EmptyState description="接口已返回，但当前没有可展示的指数快照。" onRetry={retry} /></Card> : null}
      {state.status === 'error' ? (
        <Card className="market-card market-state-card" bordered>
          <ErrorState
            error={state.error}
            hint="市场概览暂时无法加载，请确认后端服务和 Vite 代理可用后重试。"
            onRetry={retry}
          />
        </Card>
      ) : null}
      {state.status === 'success' ? <MarketOverviewContent data={state.data} /> : null}
      <MarketRankingsSection />
      <MarketSignalsSection />
      <MarketSectorsSection />
    </main>
  )
}
