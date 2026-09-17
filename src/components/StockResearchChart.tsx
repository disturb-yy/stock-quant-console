import { useState } from 'react'
import { Button } from 'tdesign-react'
import type { StockBar, StockBars, StockBenchmarkPoint } from '../api/stockBars'

const minimumChartWidth = 960
const chartPointSpacing = 8
const chartLeft = 76
const chartRight = 20
const chartTop = 24
const chartBottom = 44
const chartHeight = 320
const plotHeight = chartHeight - chartTop - chartBottom
const scrollableChartThreshold = 60

type NumericBar = {
  source: StockBar
  open: number
  high: number
  low: number
  close: number
  volume: number
  ma5: number | null
  ma20: number | null
}

function numericValue(value: string) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function toNumericBar(source: StockBar): NumericBar | null {
  const values = [source.open, source.high, source.low, source.close, source.ma5, source.ma20]
  const [open, high, low, close, ma5, ma20] = values.map((value) => value === null ? null : numericValue(value))
  if (open === null || high === null || low === null || close === null || typeof source.volume !== 'number') return null
  return { source, open, high, low, close, volume: source.volume, ma5, ma20 }
}

function formatValue(value: number, digits = 2) {
  return value.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

function formatVolume(value: number) {
  if (value >= 100000000) return `${formatValue(value / 100000000)} 亿股`
  if (value >= 10000) return `${formatValue(value / 10000)} 万股`
  return `${formatValue(value, 0)} 股`
}

function formatSignedPercent(value: string) {
  const number = numericValue(value)
  if (number === null) return `${value}%`
  return `${number > 0 ? '+' : ''}${formatValue(number)}%`
}

function chartWidthForCount(count: number) {
  return Math.max(minimumChartWidth, chartLeft + chartRight + Math.max(count, 1) * chartPointSpacing)
}

function chartWidthStyle(count: number, width: number) {
  return count > scrollableChartThreshold ? `max(100%, ${width}px)` : '100%'
}

function chartX(index: number, count: number, width: number) {
  const plotWidth = width - chartLeft - chartRight
  return chartLeft + (count <= 1 ? plotWidth / 2 : (plotWidth * index) / (count - 1))
}

function chartDomain(values: ReadonlyArray<number>, includeZero = false) {
  const finiteValues = values.filter(Number.isFinite)
  const minimum = Math.min(...finiteValues, includeZero ? 0 : Number.POSITIVE_INFINITY)
  const maximum = Math.max(...finiteValues, includeZero ? 0 : Number.NEGATIVE_INFINITY)
  const spread = maximum - minimum || Math.max(Math.abs(maximum), 1) * 0.04
  const padding = spread * 0.1
  return { minimum: minimum - padding, maximum: maximum + padding, spread: spread + padding * 2 }
}

function chartY(value: number, domain: ReturnType<typeof chartDomain>) {
  return chartTop + ((domain.maximum - value) / domain.spread) * plotHeight
}

function buildLineSegments<T>(items: ReadonlyArray<T>, getValue: (item: T) => number | null, domain: ReturnType<typeof chartDomain>, width: number) {
  const segments: string[] = []
  let current: string[] = []
  items.forEach((item, index) => {
    const value = getValue(item)
    if (value === null) {
      if (current.length > 1) segments.push(current.join(' '))
      current = []
      return
    }
    current.push(`${chartX(index, items.length, width)},${chartY(value, domain)}`)
  })
  if (current.length > 1) segments.push(current.join(' '))
  return segments
}

function DateLabels({ dates, y, width }: { dates: ReadonlyArray<string>; y: number; width: number }) {
  const indexes = dates.length <= 2 ? dates.map((_, index) => index) : [0, Math.floor((dates.length - 1) / 2), dates.length - 1]
  return (
    <g className="stock-research-chart__dates" aria-hidden="true">
      {indexes.map((index) => {
        const textAnchor = index === 0 ? 'start' : index === dates.length - 1 ? 'end' : 'middle'
        return <text key={`${dates[index]}-${index}`} x={chartX(index, dates.length, width)} y={y} textAnchor={textAnchor}>{dates[index]}</text>
      })}
    </g>
  )
}

function GridLines({ domain, formatTick, width }: { domain: ReturnType<typeof chartDomain>; formatTick: (value: number) => string; width: number }) {
  const ticks = [domain.maximum, domain.minimum + domain.spread / 2, domain.minimum]
  return (
    <g className="stock-research-chart__grid" aria-hidden="true">
      {ticks.map((value) => {
        const y = chartY(value, domain)
        return <g key={value}><line x1={chartLeft} x2={width - chartRight} y1={y} y2={y} /><text x={chartLeft - 10} y={y + 4} textAnchor="end">{formatTick(value)}</text></g>
      })}
    </g>
  )
}

function StockPriceChart({ bars, showMa5, showMa20 }: { bars: ReadonlyArray<NumericBar>; showMa5: boolean; showMa20: boolean }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const dates = bars.map((bar) => bar.source.trade_date)
  const width = chartWidthForCount(bars.length)
  const domain = chartDomain(bars.flatMap((bar) => [bar.low, bar.high, ...(showMa5 && bar.ma5 !== null ? [bar.ma5] : []), ...(showMa20 && bar.ma20 !== null ? [bar.ma20] : [])]))
  const candleWidth = Math.max(3, Math.min(13, ((width - chartLeft - chartRight) / bars.length) * 0.55))
  const closePath = bars.map((bar, index) => `${chartX(index, bars.length, width)},${chartY(bar.close, domain)}`).join(' ')
  const ma5Paths = showMa5 ? buildLineSegments(bars, (bar) => bar.ma5, domain, width) : []
  const ma20Paths = showMa20 ? buildLineSegments(bars, (bar) => bar.ma20, domain, width) : []
  const activeBar = activeIndex === null ? null : bars[activeIndex]
  const missingMa5 = bars.filter((bar) => bar.ma5 === null).length
  const missingMa20 = bars.filter((bar) => bar.ma20 === null).length

  return (
    <section className="stock-research-chart" aria-labelledby="stock-research-price-title">
      <div className="stock-research-chart__header">
        <div><h3 id="stock-research-price-title">价格走势</h3><span>单位：元 · 日 K/Line</span></div>
        <span>均线由 API 返回</span>
      </div>
      <div className="stock-research-chart__scroll">
        <svg className="stock-research-chart__svg" style={{ width: chartWidthStyle(bars.length, width) }} viewBox={`0 0 ${width} ${chartHeight}`} role="img" aria-label="日 K 线与均线">
          <title>日 K 线与均线</title>
          <GridLines domain={domain} formatTick={(value) => formatValue(value)} width={width} />
          <polyline className="stock-research-chart__close" points={closePath} fill="none" vectorEffect="non-scaling-stroke" />
          {ma5Paths.map((points) => <polyline key={`ma5-${points}`} className="stock-research-chart__ma5" points={points} fill="none" vectorEffect="non-scaling-stroke" />)}
          {ma20Paths.map((points) => <polyline key={`ma20-${points}`} className="stock-research-chart__ma20" points={points} fill="none" vectorEffect="non-scaling-stroke" />)}
          {bars.map((bar, index) => {
            const x = chartX(index, bars.length, width)
            const movement = bar.close > bar.open ? 'up' : bar.close < bar.open ? 'down' : 'flat'
            const label = `${bar.source.trade_date}，开 ${formatValue(bar.open)}，高 ${formatValue(bar.high)}，低 ${formatValue(bar.low)}，收 ${formatValue(bar.close)}，MA5 ${bar.source.ma5 === null ? '窗口不足' : formatValue(bar.ma5 ?? 0)}，MA20 ${bar.source.ma20 === null ? '窗口不足' : formatValue(bar.ma20 ?? 0)}`
            return (
              <g
                key={bar.source.trade_date}
                className={`stock-research-candle stock-research-candle--${movement}`}
                tabIndex={0}
                aria-label={label}
                onMouseEnter={() => setActiveIndex(index)}
                onFocus={() => setActiveIndex(index)}
              >
                <title>{label}</title>
                <line className="stock-research-candle__wick" x1={x} x2={x} y1={chartY(bar.high, domain)} y2={chartY(bar.low, domain)} />
                <rect className="stock-research-candle__body" x={x - candleWidth / 2} y={Math.min(chartY(bar.open, domain), chartY(bar.close, domain))} width={candleWidth} height={Math.max(Math.abs(chartY(bar.close, domain) - chartY(bar.open, domain)), 2)} />
              </g>
            )
          })}
          <DateLabels dates={dates} y={chartHeight - 12} width={width} />
        </svg>
      </div>
      <div className="stock-research-chart__legend" aria-label="价格图例">
        <span className="stock-research-key stock-research-key--close">收盘价</span>
        <span className="stock-research-key stock-research-key--ma5">MA5</span>
        <span className="stock-research-key stock-research-key--ma20">MA20</span>
        <span>红涨绿跌，平盘为中性</span>
      </div>
      <p className="stock-research-chart__null-note">MA5 {missingMa5 > 0 ? `前 ${missingMa5} 个交易日窗口不足` : '完整'}；MA20 {missingMa20 > 0 ? `前 ${missingMa20} 个交易日窗口不足` : '完整'}，空值不填充为 0。</p>
      <output className="stock-research-chart__summary" aria-live="polite">
        {activeBar ? `${activeBar.source.trade_date} · 收 ${formatValue(activeBar.close)} · 量 ${formatVolume(activeBar.volume)}` : '悬停或使用 Tab 聚焦 K 线，查看日期与 OHLC、均线数值。'}
      </output>
    </section>
  )
}

function StockVolumeChart({ bars }: { bars: ReadonlyArray<NumericBar> }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const dates = bars.map((bar) => bar.source.trade_date)
  const width = chartWidthForCount(bars.length)
  const maximum = Math.max(...bars.map((bar) => bar.volume), 1)
  const volumeDomain = { minimum: 0, maximum, spread: maximum }
  const barWidth = Math.max(3, Math.min(13, ((width - chartLeft - chartRight) / bars.length) * 0.65))
  const activeBar = activeIndex === null ? null : bars[activeIndex]

  return (
    <section className="stock-research-chart" aria-labelledby="stock-research-volume-title">
      <div className="stock-research-chart__header">
        <div><h3 id="stock-research-volume-title">成交量</h3><span>单位：股 · 与价格共享交易日横轴</span></div>
        <span>非复权字段</span>
      </div>
      <div className="stock-research-chart__scroll">
        <svg className="stock-research-chart__svg" style={{ width: chartWidthStyle(bars.length, width) }} viewBox={`0 0 ${width} ${chartHeight}`} role="img" aria-label="成交量">
          <title>成交量</title>
          <GridLines domain={volumeDomain} formatTick={(value) => formatVolume(value)} width={width} />
          {bars.map((bar, index) => {
            const x = chartX(index, bars.length, width)
            const y = chartY(bar.volume, volumeDomain)
            const movement = bar.close > bar.open ? 'up' : bar.close < bar.open ? 'down' : 'flat'
            const label = `${bar.source.trade_date}，成交量 ${formatVolume(bar.volume)}`
            return (
              <g
                key={bar.source.trade_date}
                className={`stock-research-volume stock-research-volume--${movement}`}
                tabIndex={0}
                aria-label={label}
                onMouseEnter={() => setActiveIndex(index)}
                onFocus={() => setActiveIndex(index)}
              >
                <title>{label}</title>
                <rect x={x - barWidth / 2} y={y} width={barWidth} height={chartTop + plotHeight - y} />
              </g>
            )
          })}
          <DateLabels dates={dates} y={chartHeight - 12} width={width} />
        </svg>
      </div>
      <div className="stock-research-chart__legend" aria-label="成交量图例">
        <span className="stock-research-key stock-research-key--volume">成交量</span>
        <span>颜色仅表示当日收盘相对开盘方向</span>
      </div>
      <output className="stock-research-chart__summary" aria-live="polite">
        {activeBar ? `${activeBar.source.trade_date} · 成交量 ${formatVolume(activeBar.volume)}` : '悬停或使用 Tab 聚焦成交量，查看日期与数值。'}
      </output>
    </section>
  )
}

function BenchmarkChart({ points }: { points: ReadonlyArray<StockBenchmarkPoint> }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const width = chartWidthForCount(points.length)
  const numericPoints = points.map((point) => ({
    source: point,
    stock: numericValue(point.stock_return_pct),
    benchmark: numericValue(point.benchmark_return_pct),
    relative: numericValue(point.relative_return_pct),
  }))
  const domain = chartDomain(numericPoints.flatMap((point) => [point.stock, point.benchmark, point.relative].filter((value): value is number => value !== null)), true)
  const activePoint = activeIndex === null ? null : numericPoints[activeIndex]

  return (
    <section className="stock-research-chart stock-research-chart--benchmark" aria-labelledby="stock-research-benchmark-title">
      <div className="stock-research-chart__header">
        <div><h3 id="stock-research-benchmark-title">沪深 300 相对表现</h3><span>单位：收益率 % · 首个共同交易日归一</span></div>
        <span>共同日期 {points.length}</span>
      </div>
      <div className="stock-research-chart__scroll">
        <svg className="stock-research-chart__svg" style={{ width: chartWidthStyle(points.length, width) }} viewBox={`0 0 ${width} ${chartHeight}`} role="img" aria-label="沪深 300 相对表现">
          <title>沪深 300 相对表现</title>
          <GridLines domain={domain} formatTick={(value) => `${formatValue(value)}%`} width={width} />
          <line className="stock-research-chart__zero" x1={chartLeft} x2={width - chartRight} y1={chartY(0, domain)} y2={chartY(0, domain)} />
          {(['stock', 'benchmark', 'relative'] as const).map((key) => {
            const segments = buildLineSegments(numericPoints, (point) => point[key], domain, width)
            return segments.map((pointsForLine) => <polyline key={`${key}-${pointsForLine}`} className={`stock-research-benchmark-line stock-research-benchmark-line--${key}`} points={pointsForLine} fill="none" vectorEffect="non-scaling-stroke" />)
          })}
          {numericPoints.map((point, index) => {
            const label = `${point.source.trade_date}，股票收益 ${formatSignedPercent(point.source.stock_return_pct)}，沪深 300 收益 ${formatSignedPercent(point.source.benchmark_return_pct)}，相对收益 ${formatSignedPercent(point.source.relative_return_pct)}`
            return (
              <g
                key={point.source.trade_date}
                className="stock-research-benchmark-point"
                tabIndex={0}
                aria-label={label}
                onMouseEnter={() => setActiveIndex(index)}
                onFocus={() => setActiveIndex(index)}
              >
                <title>{label}</title>
                {point.relative === null ? null : <circle cx={chartX(index, numericPoints.length, width)} cy={chartY(point.relative, domain)} r="3" />}
              </g>
            )
          })}
          <DateLabels dates={points.map((point) => point.trade_date)} y={chartHeight - 12} width={width} />
        </svg>
      </div>
      <div className="stock-research-chart__legend" aria-label="基准图例">
        <span className="stock-research-key stock-research-key--stock-return">股票收益</span>
        <span className="stock-research-key stock-research-key--benchmark-return">沪深 300 收益</span>
        <span className="stock-research-key stock-research-key--relative-return">相对收益</span>
        <span>零线表示首个共同交易日</span>
      </div>
      <output className="stock-research-chart__summary" aria-live="polite">
        {activePoint ? `${activePoint.source.trade_date} · 相对收益 ${formatSignedPercent(activePoint.source.relative_return_pct)}` : '悬停或使用 Tab 聚焦数据点，查看三类收益率。'}
      </output>
    </section>
  )
}

function ResearchEmptyState({ title, description, onRetry }: { title: string; description: string; onRetry?: () => void }) {
  return (
    <div className="stock-research-empty" role="status">
      <strong>{title}</strong>
      <p>{description}</p>
      {onRetry ? <Button variant="text" onClick={onRetry}>重试加载行情</Button> : null}
    </div>
  )
}

export function StockResearchChart({ data, showMa5, showMa20, onRetry }: { data: StockBars; showMa5: boolean; showMa20: boolean; onRetry?: () => void }) {
  const bars = data.bars.map(toNumericBar)
  if (bars.length === 0) {
    return <ResearchEmptyState title="所选范围暂无行情数据" description="接口已响应，但有效交易日范围为空；可以调整时间范围或复权方式后重试。" onRetry={onRetry} />
  }
  if (bars.some((bar) => bar === null)) {
    return <ResearchEmptyState title="行情数据暂不可绘制" description="接口返回的价格字段无法用于图表，请稍后重试。" onRetry={onRetry} />
  }
  const normalizedBars = bars as NumericBar[]
  return (
    <div className="stock-research-visuals">
      <div className="stock-research-chart-grid">
        <StockPriceChart bars={normalizedBars} showMa5={showMa5} showMa20={showMa20} />
        <StockVolumeChart bars={normalizedBars} />
      </div>
      {data.benchmark ? (
        data.benchmark.points.length > 0
          ? <BenchmarkChart points={data.benchmark.points} />
          : <ResearchEmptyState title="沪深 300 暂无共同交易日" description="股票行情和成交量仍保留。请调整范围后重试基准比较。" onRetry={onRetry} />
      ) : null}
    </div>
  )
}
