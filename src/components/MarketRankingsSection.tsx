import { useEffect, useState } from 'react'
import { Card, Pagination } from 'tdesign-react'
import { Link, useSearchParams } from 'react-router-dom'
import { isApiAbortError } from '../api/client'
import {
  fetchMarketRankings,
  rankingMetrics,
  type MarketRanking,
  type MarketRankings,
  type RankingMetric,
} from '../api/marketRankings'
import type { MarketDataSource } from '../api/marketOverview'
import { EmptyState, ErrorState, LoadingState } from './PageState'

const defaultMetric: RankingMetric = 'gain'
const defaultPage = 1
const defaultPageSize = 5
const pageSizeOptions = [
  { label: '5 条/页', value: 5 },
  { label: '10 条/页', value: 10 },
  { label: '20 条/页', value: 20 },
  { label: '50 条/页', value: 50 },
]
const pageSizeValues = pageSizeOptions.map(({ value }) => value)

const metricLabels: Record<RankingMetric, string> = {
  gain: '涨幅',
  loss: '跌幅',
  turnover_amount: '成交额',
  turnover_rate: '换手率',
}

type RankingsState =
  | { status: 'loading' }
  | { status: 'success'; data: MarketRankings }
  | { status: 'empty' }
  | { status: 'error'; error: unknown }

type RankingsQuery = {
  metric: RankingMetric
  page: number
  pageSize: number
  invalid: ReadonlyArray<string>
}

function isRankingMetric(value: string | null): value is RankingMetric {
  return value !== null && rankingMetrics.includes(value as RankingMetric)
}

function readPositiveInteger(value: string | null, fallback: number, key: string, invalid: string[]) {
  if (value === null) return fallback
  const parsed = Number(value)
  if (Number.isInteger(parsed) && parsed > 0) return parsed
  invalid.push(key)
  return fallback
}

function readPageSize(value: string | null, invalid: string[]) {
  const pageSize = readPositiveInteger(value, defaultPageSize, 'ranking_page_size', invalid)
  if (pageSizeValues.includes(pageSize)) return pageSize
  invalid.push('ranking_page_size')
  return defaultPageSize
}

function readRankingsQuery(searchParams: URLSearchParams): RankingsQuery {
  const invalid: string[] = []
  const rawMetric = searchParams.get('ranking_metric')
  const metric = isRankingMetric(rawMetric) ? rawMetric : defaultMetric
  if (rawMetric !== null && !isRankingMetric(rawMetric)) invalid.push('ranking_metric')
  return {
    metric,
    page: readPositiveInteger(searchParams.get('ranking_page'), defaultPage, 'ranking_page', invalid),
    pageSize: readPageSize(searchParams.get('ranking_page_size'), invalid),
    invalid,
  }
}

function useMarketRankings(query: RankingsQuery) {
  const [reloadKey, setReloadKey] = useState(0)
  const [state, setState] = useState<RankingsState>({ status: 'loading' })

  useEffect(() => {
    if (query.invalid.length > 0) return
    const controller = new AbortController()
    setState({ status: 'loading' })
    fetchMarketRankings({ metric: query.metric, page: query.page, pageSize: query.pageSize }, controller.signal)
      .then((data) => setState(data.data.length === 0 ? { status: 'empty' } : { status: 'success', data }))
      .catch((error: unknown) => {
        if (!isApiAbortError(error)) setState({ status: 'error', error })
      })
    return () => controller.abort()
  }, [query.invalid.length, query.metric, query.page, query.pageSize, reloadKey])

  return { state, retry: () => setReloadKey((value) => value + 1) }
}

function formatNumber(value: string, suffix = '') {
  const number = Number(value)
  if (!Number.isFinite(number)) return `${value}${suffix}`
  return `${number.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${suffix}`
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

function formatMetric(metric: RankingMetric, value: string) {
  if (metric === 'turnover_amount') return `¥${formatNumber(value)}`
  if (metric === 'turnover_rate') return formatNumber(value, '%')
  return formatSignedNumber(value, '%')
}

function getSourceLabel(source: MarketDataSource) {
  if (source.mode === 'real') return '真实 Provider'
  if (source.mode === 'fallback') return '本地回退数据'
  return 'Seed 数据'
}

function RankingValue({ metric, value }: { metric: RankingMetric; value: string }) {
  if (metric === 'turnover_amount' || metric === 'turnover_rate') {
    return <span className="market-ranking-value">{formatMetric(metric, value)}</span>
  }
  const trend = getTrend(value)
  const symbol = trend === 'up' ? '▲' : trend === 'down' ? '▼' : '—'
  return (
    <span className={`market-ranking-movement market-ranking-movement--${trend}`}>
      <span aria-hidden="true">{symbol}</span>
      <span>{formatMetric(metric, value)}</span>
      <span className="market-ranking-movement__label">{getTrendLabel(value)}</span>
    </span>
  )
}

function RankingsTable({ data }: { data: MarketRankings }) {
  const source = `${getSourceLabel(data.source)} · ${data.source.provider} · ${data.source.seed_version}`
  return (
    <div className="market-ranking-table-wrap">
      <table className="market-ranking-table">
        <caption className="sr-only">股票排行榜，包含排名、股票、指标值、观测日期和数据来源</caption>
        <thead>
          <tr>
            <th scope="col">排名</th>
            <th scope="col">股票代码</th>
            <th scope="col">股票名称</th>
            <th scope="col">{metricLabels[data.metric]}</th>
            <th scope="col">最新价</th>
            <th scope="col">观测日期</th>
            <th scope="col">数据来源</th>
          </tr>
        </thead>
        <tbody>
          {data.data.map((ranking) => <RankingRow key={`${data.metric}-${ranking.code}`} ranking={ranking} data={data} source={source} />)}
        </tbody>
      </table>
    </div>
  )
}

function RankingRow({ ranking, data, source }: { ranking: MarketRanking; data: MarketRankings; source: string }) {
  const stockPath = `/stocks/${encodeURIComponent(ranking.code)}`
  return (
    <tr>
      <td className="market-ranking-table__rank">{ranking.rank}</td>
      <th scope="row"><Link className="market-ranking-table__link" to={stockPath}><code>{ranking.code}</code></Link></th>
      <td className="market-ranking-table__name"><Link className="market-ranking-table__link" to={stockPath}>{ranking.name}</Link></td>
      <td><RankingValue metric={data.metric} value={ranking.value} /></td>
      <td className="market-ranking-table__number">{formatNumber(ranking.close)}</td>
      <td><time dateTime={data.as_of}>{data.as_of}</time></td>
      <td className="market-ranking-table__source">{source}</td>
    </tr>
  )
}

function RankingsPagination({ data, onQueryChange }: {
  data: MarketRankings
  onQueryChange: (next: Pick<RankingsQuery, 'page' | 'pageSize'>) => void
}) {
  return (
    <div className="market-ranking-pagination" aria-label="排行榜分页">
      <span>本页 {data.data.length} 条，共 {data.pagination.total} 条</span>
      <Pagination
        className="market-ranking-pagination__control"
        current={data.pagination.page}
        pageSize={data.pagination.page_size}
        total={data.pagination.total}
        pageSizeOptions={pageSizeOptions}
        selectProps={{ autoWidth: false }}
        totalContent={false}
        showJumper={false}
        onCurrentChange={(page) => onQueryChange({ page, pageSize: data.pagination.page_size })}
        onPageSizeChange={(pageSize) => onQueryChange({ page: defaultPage, pageSize })}
      />
    </div>
  )
}

function RankingsTabs({ metric, onMetricChange }: {
  metric: RankingMetric
  onMetricChange: (metric: RankingMetric) => void
}) {
  return (
    <div className="market-ranking-tabs" role="tablist" aria-label="股票排行榜指标">
      {rankingMetrics.map((tabMetric) => (
        <button
          key={tabMetric}
          type="button"
          role="tab"
          aria-selected={metric === tabMetric}
          className={metric === tabMetric ? 'market-ranking-tab market-ranking-tab--active' : 'market-ranking-tab'}
          onClick={() => onMetricChange(tabMetric)}
        >
          {metricLabels[tabMetric]}
        </button>
      ))}
    </div>
  )
}

function RankingsHeading({ data }: { data?: MarketRankings }) {
  return (
    <div className="market-section-heading market-ranking-heading">
      <div>
        <p className="market-section-kicker">STOCK RANKINGS</p>
        <h2 id="market-rankings-title">股票排行榜</h2>
      </div>
      {data ? (
        <div className="market-ranking-heading__meta">
          <span className="market-section-meta">观测日期 <time dateTime={data.as_of}>{data.as_of}</time></span>
          <span className="market-ranking-source">{getSourceLabel(data.source)} · {data.source.provider} · {data.source.seed_version}</span>
        </div>
      ) : null}
    </div>
  )
}

function RankingsBody({ query, state, retry, onQueryChange, onResetInvalidQuery }: {
  query: RankingsQuery
  state: RankingsState
  retry: () => void
  onQueryChange: (next: Partial<Pick<RankingsQuery, 'metric' | 'page' | 'pageSize'>>) => void
  onResetInvalidQuery: () => void
}) {
  return (
    <Card className="market-card market-ranking-card" bordered>
      <RankingsTabs metric={query.metric} onMetricChange={(metric) => onQueryChange({ metric, page: defaultPage })} />
      {query.invalid.length > 0 ? <ErrorState description="URL 中的股票排行榜参数无效" hint={`请检查参数：${query.invalid.join('、')}。恢复默认参数后会重新请求真实接口。`} actionLabel="恢复默认参数" onRetry={onResetInvalidQuery} /> : null}
      {query.invalid.length === 0 && state.status === 'loading' ? <LoadingState label="正在请求 /api/v1/markets/rankings" /> : null}
      {query.invalid.length === 0 && state.status === 'empty' ? <EmptyState description="接口已返回，但当前分页下没有可展示的股票排行。" onRetry={retry} /> : null}
      {query.invalid.length === 0 && state.status === 'error' ? <ErrorState error={state.error} hint="股票排行榜暂时无法加载，请检查后端服务和 Vite 代理后重试。" onRetry={retry} /> : null}
      {query.invalid.length === 0 && state.status === 'success' ? (
        <>
          <RankingsTable data={state.data} />
          <RankingsPagination data={state.data} onQueryChange={({ page, pageSize }) => onQueryChange({ page, pageSize })} />
        </>
      ) : null}
    </Card>
  )
}

export function MarketRankingsSection() {
  const [searchParams, setSearchParams] = useSearchParams()
  const query = readRankingsQuery(searchParams)
  const { state, retry } = useMarketRankings(query)

  function updateQuery(next: Partial<Pick<RankingsQuery, 'metric' | 'page' | 'pageSize'>>) {
    const nextQuery = { ...query, ...next }
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('ranking_metric', nextQuery.metric)
    nextParams.set('ranking_page', String(nextQuery.page))
    nextParams.set('ranking_page_size', String(nextQuery.pageSize))
    setSearchParams(nextParams)
  }

  function resetInvalidQuery() {
    const nextParams = new URLSearchParams(searchParams)
    for (const key of ['ranking_metric', 'ranking_page', 'ranking_page_size']) nextParams.delete(key)
    setSearchParams(nextParams, { replace: true })
  }

  return (
    <section className="market-section market-ranking-section" aria-labelledby="market-rankings-title">
      <RankingsHeading data={state.status === 'success' ? state.data : undefined} />
      <RankingsBody query={query} state={state} retry={retry} onQueryChange={updateQuery} onResetInvalidQuery={resetInvalidQuery} />
    </section>
  )
}
