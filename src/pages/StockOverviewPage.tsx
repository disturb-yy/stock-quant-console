import { ArrowLeftIcon } from 'tdesign-icons-react'
import { Button, Card } from 'tdesign-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { isApiError, isApiErrorResponse } from '../api/client'
import { fetchStockOverview, type StockMetric, type StockOverview, type StockSparklinePoint } from '../api/stockOverview'
import { EmptyState, ErrorState, LoadingState } from '../components/PageState'

type StockOverviewState =
  | { status: 'loading' }
  | { status: 'success'; data: StockOverview }
  | { status: 'error'; error: unknown }

type Movement = 'up' | 'down' | 'flat'

function numericValue(value: string) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function formatNumber(value: string) {
  const number = numericValue(value)
  return number === null
    ? value
    : number.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatSignedNumber(value: string, suffix = '') {
  const number = numericValue(value)
  if (number === null) return `${value}${suffix}`
  return `${number > 0 ? '+' : ''}${number.toFixed(2)}${suffix}`
}

function getMovement(value: string): Movement {
  const number = numericValue(value)
  if (number === null || number === 0) return 'flat'
  return number > 0 ? 'up' : 'down'
}

function movementLabel(movement: Movement) {
  if (movement === 'up') return '上涨'
  if (movement === 'down') return '下跌'
  return '平盘'
}

function movementSymbol(movement: Movement) {
  if (movement === 'up') return '▲'
  if (movement === 'down') return '▼'
  return '—'
}

function StockOverviewHeader({
  symbol,
  data,
  onBack,
}: {
  symbol: string
  data?: StockOverview
  onBack: () => void
}) {
  return (
    <section className="stock-overview-header" aria-label="股票详情头部">
      <Button className="stock-overview-back" variant="text" icon={<ArrowLeftIcon />} onClick={onBack}>
        返回 Markets
      </Button>
      <div className="stock-overview-identity">
        <p className="page-kicker">STOCK / OVERVIEW</p>
        <div className="stock-overview-identity__title">
          <h1 id="stock-overview-title">{data?.name ?? '股票详情'}</h1>
          <code>{data?.symbol ?? symbol}</code>
          {data ? <span className="stock-overview-industry">{data.industry}</span> : null}
        </div>
        <p className="stock-overview-header__meta">
          {data ? <>最新交易日 <time dateTime={data.quote.as_of}>{data.quote.as_of}</time></> : '正在读取真实股票概览数据'}
        </p>
      </div>
    </section>
  )
}

function StockQuoteCard({ data }: { data: StockOverview }) {
  const movement = getMovement(data.quote.change)
  return (
    <Card className="market-card stock-quote-card" bordered>
      <div className="stock-quote-card__main">
        <span className="stock-card-kicker">最新价格</span>
        <strong className={`stock-price stock-price--${movement}`}>{formatNumber(data.quote.last)}</strong>
        <div className={`stock-movement stock-movement--${movement}`} aria-label={`价格${movementLabel(movement)}`}>
          <span aria-hidden="true">{movementSymbol(movement)}</span>
          <span>{formatSignedNumber(data.quote.change)}</span>
          <span>{formatSignedNumber(data.quote.change_pct, '%')}</span>
          <span className="stock-movement__label">{movementLabel(movement)}</span>
        </div>
      </div>
      <dl className="stock-quote-card__meta">
        <div>
          <dt>交易日期</dt>
          <dd><time dateTime={data.quote.as_of}>{data.quote.as_of}</time></dd>
        </div>
        <div>
          <dt>数据来源</dt>
          <dd>详情 API</dd>
        </div>
      </dl>
    </Card>
  )
}

const metricLabels = {
  market_cap: '市值',
  pe_ttm: 'PE（TTM）',
  pb: 'PB',
  roe: 'ROE',
} as const

type MetricKey = keyof typeof metricLabels

const metricBasisLabels: Record<NonNullable<StockMetric['basis']>, string> = {
  latest_daily_basic: '最新日线基础',
  ttm: '滚动十二个月',
  latest_report: '最新报告期',
}

function metricValue(key: MetricKey, value: string) {
  const formatted = formatNumber(value)
  if (key === 'roe') return `${formatted}%`
  if (key === 'pe_ttm' || key === 'pb') return `${formatted}x`
  return formatted
}

function MetricDate({ value }: { value: StockMetric['as_of'] }) {
  return value ? <time dateTime={value}>{value}</time> : <span>暂无数据</span>
}

function StockMetricCard({ metric, metricKey }: { metric: StockMetric; metricKey: MetricKey }) {
  const basis = metric.basis ? `${metricBasisLabels[metric.basis]} · ${metric.basis}` : '暂无数据'
  return (
    <Card className="market-card stock-metric-card" bordered>
      <div className="stock-metric-card__heading">
        <h3>{metricLabels[metricKey]}</h3>
        <code>{metricKey}</code>
      </div>
      <p className={metric.value === null ? 'stock-metric-card__value stock-metric-card__value--empty' : 'stock-metric-card__value'}>
        {metric.value === null ? '暂无数据' : metricValue(metricKey, metric.value)}
      </p>
      <dl className="stock-metric-card__meta">
        <div><dt>日期</dt><dd><MetricDate value={metric.as_of} /></dd></div>
        <div><dt>口径</dt><dd>{basis}</dd></div>
      </dl>
    </Card>
  )
}

type NumericTrendPoint = {
  tradeDate: string
  open: number
  high: number
  low: number
  close: number
}

const trendChart = { width: 560, height: 250, top: 20, right: 50, bottom: 34, left: 10 }

function toNumericTrendPoint(point: StockSparklinePoint): NumericTrendPoint | null {
  const open = numericValue(point.open)
  const high = numericValue(point.high)
  const low = numericValue(point.low)
  const close = numericValue(point.close)
  if (open === null || high === null || low === null || close === null) return null
  if (low > Math.min(open, close) || high < Math.max(open, close) || low > high) return null
  return { tradeDate: point.trade_date, open, high, low, close }
}

function trendRange(values: ReadonlyArray<number>) {
  const minimum = Math.min(...values)
  const maximum = Math.max(...values)
  return { minimum, maximum, range: maximum - minimum || 1 }
}

function trendX(index: number, count: number) {
  const { width, left, right } = trendChart
  return left + (index * (width - left - right)) / Math.max(count - 1, 1)
}

function trendY(value: number, minimum: number, range: number) {
  const { height, top, bottom } = trendChart
  return top + ((minimum + range - value) / range) * (height - top - bottom)
}

function TrendGrid({ minimum, maximum }: { minimum: number; maximum: number }) {
  const values = [maximum, (maximum + minimum) / 2, minimum]
  return (
    <g className="stock-trend-chart__grid" aria-hidden="true">
      {values.map((value, index) => {
        const y = trendY(value, minimum, maximum - minimum || 1)
        return <g key={`${value}-${index}`}><line x1={trendChart.left} x2={trendChart.width - trendChart.right} y1={y} y2={y} /><text x={trendChart.width - trendChart.right + 8} y={y + 4}>{value.toFixed(2)}</text></g>
      })}
    </g>
  )
}

function TrendDateLabels({ points }: { points: ReadonlyArray<NumericTrendPoint> }) {
  const indices = Array.from(new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]))
  return (
    <g className="stock-trend-chart__dates" aria-hidden="true">
      {indices.map((index) => <text key={points[index].tradeDate} x={trendX(index, points.length)} y={trendChart.height - 10}>{points[index].tradeDate.slice(5)}</text>)}
    </g>
  )
}

function TrendChartHeader({ id, title, description }: { id: string; title: string; description: string }) {
  return <div className="stock-trend-chart__header"><h3 id={id}>{title}</h3><span>{description}</span></div>
}

function ClosingLineChart({ points }: { points: ReadonlyArray<NumericTrendPoint> }) {
  const { minimum, maximum, range } = trendRange(points.map((point) => point.close))
  const coordinates = points.map((point, index) => `${trendX(index, points.length)},${trendY(point.close, minimum, range)}`).join(' ')
  const first = points[0]
  const last = points[points.length - 1]
  return (
    <section className="stock-trend-chart" aria-labelledby="stock-closing-line-title">
      <TrendChartHeader id="stock-closing-line-title" title="收盘折线" description="收盘价" />
      <svg className="stock-trend-chart__svg" viewBox={`0 0 ${trendChart.width} ${trendChart.height}`} role="img" aria-label={`近 ${points.length} 个交易日收盘价折线`}>
        <title>近 {points.length} 个交易日收盘价折线</title>
        <TrendGrid minimum={minimum} maximum={maximum} />
        <polyline className="stock-trend-line" points={coordinates} fill="none" vectorEffect="non-scaling-stroke" />
        {points.map((point, index) => <g key={point.tradeDate}><title>{point.tradeDate} 收盘价 {point.close.toFixed(2)}</title><circle className="stock-trend-line__point" cx={trendX(index, points.length)} cy={trendY(point.close, minimum, range)} r="2.5" /></g>)}
        <TrendDateLabels points={points} />
      </svg>
      <div className="stock-trend-chart__legend"><span>收盘价</span><span><time dateTime={first.tradeDate}>{first.tradeDate}</time> 至 <time dateTime={last.tradeDate}>{last.tradeDate}</time></span></div>
    </section>
  )
}

function CandlestickChart({ points }: { points: ReadonlyArray<NumericTrendPoint> }) {
  const { minimum, maximum, range } = trendRange(points.flatMap((point) => [point.low, point.high]))
  const candleWidth = Math.min(16, Math.max(4, ((trendChart.width - trendChart.left - trendChart.right) / points.length) * 0.56))
  return (
    <section className="stock-trend-chart" aria-labelledby="stock-candlestick-title">
      <TrendChartHeader id="stock-candlestick-title" title="日 K 线" description="开 / 高 / 低 / 收" />
      <svg className="stock-trend-chart__svg" viewBox={`0 0 ${trendChart.width} ${trendChart.height}`} role="img" aria-label={`近 ${points.length} 个交易日 K 线（开盘、最高、最低、收盘）`}>
        <title>近 {points.length} 个交易日 K 线（开盘、最高、最低、收盘）</title>
        <TrendGrid minimum={minimum} maximum={maximum} />
        {points.map((point, index) => {
          const x = trendX(index, points.length)
          const openY = trendY(point.open, minimum, range)
          const closeY = trendY(point.close, minimum, range)
          const movement = point.close > point.open ? 'up' : point.close < point.open ? 'down' : 'flat'
          return <g key={point.tradeDate} className={`stock-candle stock-candle--${movement}`}><title>{point.tradeDate} 开 {point.open.toFixed(2)}，高 {point.high.toFixed(2)}，低 {point.low.toFixed(2)}，收 {point.close.toFixed(2)}</title><line className="stock-candle__wick" x1={x} x2={x} y1={trendY(point.high, minimum, range)} y2={trendY(point.low, minimum, range)} /><rect className="stock-candle__body" x={x - candleWidth / 2} y={Math.min(openY, closeY)} width={candleWidth} height={Math.max(Math.abs(closeY - openY), 2)} /></g>
        })}
        <TrendDateLabels points={points} />
      </svg>
      <div className="stock-trend-chart__legend"><span>阳线：收盘高于开盘</span><span>阴线：收盘低于开盘</span><span>平盘：收盘等于开盘</span></div>
    </section>
  )
}

function TrendCharts({ points }: { points: ReadonlyArray<StockSparklinePoint> }) {
  const numericPoints = points.map(toNumericTrendPoint)
  if (points.length === 0 || numericPoints.some((point) => point === null)) {
    return <EmptyState description="接口已响应，但暂无可用的 20 日 OHLC 走势。" />
  }
  return <div className="stock-trend-grid"><ClosingLineChart points={numericPoints as NumericTrendPoint[]} /><CandlestickChart points={numericPoints as NumericTrendPoint[]} /></div>
}

function StockOverviewContent({ data }: { data: StockOverview }) {
  return (
    <div className="stock-overview-content">
      <section aria-labelledby="stock-quote-title">
        <h2 id="stock-quote-title" className="sr-only">最新行情</h2>
        <StockQuoteCard data={data} />
      </section>
      <section className="stock-metrics-section" aria-labelledby="stock-metrics-title">
        <div className="market-section-heading">
          <div>
            <p className="market-section-kicker">CORE METRICS</p>
            <h2 id="stock-metrics-title">核心指标</h2>
          </div>
          <span className="market-section-meta">每项保留 API 日期与口径</span>
        </div>
        <div className="stock-metric-grid">
          {(Object.keys(metricLabels) as MetricKey[]).map((metricKey) => (
            <StockMetricCard key={metricKey} metric={data.metrics[metricKey]} metricKey={metricKey} />
          ))}
        </div>
      </section>
      <section className="stock-sparkline-section" aria-labelledby="stock-sparkline-title">
        <div className="market-section-heading">
          <div>
            <p className="market-section-kicker">PRICE TREND</p>
            <h2 id="stock-sparkline-title">近期走势</h2>
          </div>
          <span className="market-section-meta">周期 {data.sparkline.period}</span>
        </div>
        <Card className="market-card stock-sparkline-card" bordered>
          <TrendCharts points={data.sparkline.points} />
        </Card>
      </section>
    </div>
  )
}

type StockErrorKind = 'invalid' | 'not-found' | 'unavailable'

function stockErrorKind(error: unknown): StockErrorKind {
  if (!isApiError(error)) return 'unavailable'
  const code = isApiErrorResponse(error.payload) ? error.payload.code : undefined
  if (error.status === 400 || code === 'VALIDATION_ERROR') return 'invalid'
  if (error.status === 404 || code === 'NOT_FOUND') return 'not-found'
  return 'unavailable'
}

function StockErrorState({ error, onRetry, onBack }: { error: unknown; onRetry: () => void; onBack: () => void }) {
  const kind = stockErrorKind(error)
  if (kind === 'invalid') {
    return <ErrorState error={error} title="股票标识无效" hint="详情查询必须使用 Markets 返回的 code 原值。" actionLabel="返回 Markets" onRetry={onBack} />
  }
  if (kind === 'not-found') {
    return <ErrorState error={error} title="股票不存在" hint="未找到这个股票标识，请返回 Markets 重新选择。" actionLabel="返回 Markets" onRetry={onBack} />
  }
  return <ErrorState error={error} title="股票详情暂不可用" hint="服务或网络暂时不可用，页面不会使用替代数据；请稍后重试。" actionLabel="重试加载" onRetry={onRetry} />
}

export function StockOverviewPage() {
  const { symbol } = useParams<{ symbol: string }>()
  const navigate = useNavigate()
  const [reloadKey, setReloadKey] = useState(0)
  const [state, setState] = useState<StockOverviewState>({ status: 'loading' })

  useEffect(() => {
    if (!symbol) return
    const controller = new AbortController()
    let current = true
    setState({ status: 'loading' })
    fetchStockOverview(symbol, controller.signal)
      .then((data) => {
        if (current) setState({ status: 'success', data })
      })
      .catch((error: unknown) => {
        if (!current || (isApiError(error) && error.kind === 'aborted')) return
        setState({ status: 'error', error })
      })
    return () => {
      current = false
      controller.abort()
    }
  }, [reloadKey, symbol])

  const goBack = () => navigate(-1)
  const goToMarkets = () => navigate('/market')

  if (!symbol) {
    return (
      <main className="page-container stock-overview-page">
        <StockOverviewHeader symbol="" onBack={goToMarkets} />
        <Card className="market-card stock-state-card" bordered>
          <ErrorState title="股票标识无效" description="详情地址缺少股票标识。" actionLabel="返回 Markets" onRetry={goToMarkets} />
        </Card>
      </main>
    )
  }

  return (
    <main className="page-container stock-overview-page">
      <StockOverviewHeader symbol={symbol} data={state.status === 'success' ? state.data : undefined} onBack={goBack} />
      {state.status === 'loading' ? <Card className="market-card stock-state-card" bordered><LoadingState label={`正在请求 /api/v1/stocks/${encodeURIComponent(symbol)}`} /></Card> : null}
      {state.status === 'error' ? (
        <Card className="market-card stock-state-card" bordered>
          <StockErrorState error={state.error} onRetry={() => setReloadKey((value) => value + 1)} onBack={goToMarkets} />
        </Card>
      ) : null}
      {state.status === 'success' ? <StockOverviewContent data={state.data} /> : null}
    </main>
  )
}
