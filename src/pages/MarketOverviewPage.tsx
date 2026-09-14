import { useEffect, useState } from 'react'
import { Card } from 'tdesign-react'
import { isApiAbortError } from '../api/client'
import { fetchMarketOverview, type MarketDataSource, type MarketIndex, type MarketOverview } from '../api/marketOverview'
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

function IndexCard({ index }: { index: MarketIndex }) {
  const trend = getTrend(index.change_percent)
  return (
    <Card className="market-index-card" bordered>
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
    <Card className="market-stat-card" bordered>
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
        <Card className="market-source-card" bordered>
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

      {state.status === 'loading' ? <Card className="market-state-card" bordered><LoadingState label="正在请求 /api/v1/markets/overview" /></Card> : null}
      {state.status === 'empty' ? <Card className="market-state-card" bordered><EmptyState description="接口已返回，但当前没有可展示的指数快照。" onRetry={retry} /></Card> : null}
      {state.status === 'error' ? (
        <Card className="market-state-card" bordered>
          <ErrorState
            error={state.error}
            hint="市场概览暂时无法加载，请确认后端服务和 Vite 代理可用后重试。"
            onRetry={retry}
          />
        </Card>
      ) : null}
      {state.status === 'success' ? <MarketOverviewContent data={state.data} /> : null}
    </main>
  )
}
