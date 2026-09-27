import type { StockDailyBar } from '../api/stockData'

type StockKLineChartProps = { bars: StockDailyBar[] }
type ChartPoint = { x: number; y: number }

const chartWidth = 960
const priceTop = 24
const priceBottom = 292
const volumeTop = 326
const volumeBottom = 388
const plotLeft = 56
const plotRight = 896
const plotWidth = plotRight - plotLeft

function movingAverage(bars: StockDailyBar[], period: number, yPrice: (value: number) => number, slotWidth: number): ChartPoint[] {
  return bars.flatMap((bar, index) => {
    if (index + 1 < period) return []
    const window = bars.slice(index - period + 1, index + 1)
    const average = window.reduce((total, item) => total + item.close, 0) / period
    return [{ x: plotLeft + slotWidth * (index + 0.5), y: yPrice(average) }]
  })
}

function linePath(points: ChartPoint[]): string {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ')
}

function priceLabel(value: number): string {
  return value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

function volumeLabel(value: number): string {
  if (value >= 100000000) return `${(value / 100000000).toFixed(1)}亿`
  if (value >= 10000) return `${(value / 10000).toFixed(1)}万`
  return value.toLocaleString('zh-CN', { maximumFractionDigits: 0 })
}

function dateLabel(value: string): string {
  return value.slice(5)
}

export function StockKLineChart({ bars }: StockKLineChartProps) {
  const chartBars = [...bars].sort((left, right) => left.trade_date.localeCompare(right.trade_date))
  const rawLow = Math.min(...chartBars.map((bar) => bar.low))
  const rawHigh = Math.max(...chartBars.map((bar) => bar.high))
  const spread = rawHigh - rawLow
  const padding = spread === 0 ? Math.max(rawHigh * 0.05, 1) : spread * 0.05
  const minPrice = rawLow - padding
  const maxPrice = rawHigh + padding
  const priceRange = maxPrice - minPrice
  const maxVolume = Math.max(...chartBars.map((bar) => bar.volume), 1)
  const slotWidth = plotWidth / chartBars.length
  const candleWidth = Math.max(3, Math.min(18, slotWidth * 0.58))
  const yPrice = (value: number) => priceTop + ((maxPrice - value) / priceRange) * (priceBottom - priceTop)
  const yVolume = (value: number) => volumeBottom - (value / maxVolume) * (volumeBottom - volumeTop)
  const gridLines = Array.from({ length: 5 }, (_, index) => {
    const value = maxPrice - (priceRange * index) / 4
    return { value, y: yPrice(value) }
  })
  const dateIndexes = Array.from(new Set([0, Math.floor((chartBars.length - 1) / 2), chartBars.length - 1]))
  const movingAverages = [
    { period: 5, className: 'kline-ma5', label: 'MA5' },
    { period: 10, className: 'kline-ma10', label: 'MA10' },
    { period: 20, className: 'kline-ma20', label: 'MA20' },
  ].map((line) => ({ ...line, points: movingAverage(chartBars, line.period, yPrice, slotWidth) }))

  return (
    <div className="kline-chart-wrap">
      <div className="kline-chart-toolbar">
        <strong>K线图</strong>
        <div className="kline-legend" aria-label="均线图例">
          {movingAverages.map((line) => <span className={line.className} key={line.label}>{line.label}</span>)}
          <span className="kline-volume-legend">成交量</span>
        </div>
      </div>
      <div className="kline-chart-scroll">
        <svg className="kline-chart-svg" data-testid="kline-chart" role="img" aria-label={`历史日线 K 线图，共 ${chartBars.length} 个交易日`} viewBox={`0 0 ${chartWidth} 416`}>
          <rect className="kline-chart-background" height="364" width="840" x={plotLeft} y={priceTop} />
          {gridLines.map((line) => <g key={line.y}><line className="kline-grid" x1={plotLeft} x2={plotRight} y1={line.y} y2={line.y} /><text className="kline-axis-label" x={plotRight + 12} y={line.y + 4}>{priceLabel(line.value)}</text></g>)}
          <line className="kline-divider" x1={plotLeft} x2={plotRight} y1={volumeTop - 10} y2={volumeTop - 10} />
          <text className="kline-axis-label" x={plotRight + 12} y={volumeTop + 4}>{volumeLabel(maxVolume)}</text>
          <text className="kline-axis-label" x={plotRight + 12} y={volumeBottom}>{volumeLabel(0)}</text>
          {chartBars.map((bar, index) => {
            const x = plotLeft + slotWidth * (index + 0.5)
            const up = bar.close >= bar.open
            const bodyTop = yPrice(Math.max(bar.open, bar.close))
            const bodyHeight = Math.max(2, Math.abs(yPrice(bar.open) - yPrice(bar.close)))
            const volumeY = yVolume(bar.volume)
            const tone = up ? 'kline-candle-up' : 'kline-candle-down'
            return (
              <g key={bar.trade_date}>
                <line className={tone} strokeWidth="1" x1={x} x2={x} y1={yPrice(bar.high)} y2={yPrice(bar.low)} />
                <rect className={tone} height={bodyHeight} width={candleWidth} x={x - candleWidth / 2} y={bodyTop} />
                <rect className={`kline-volume ${tone}`} height={Math.max(1, volumeBottom - volumeY)} width={candleWidth} x={x - candleWidth / 2} y={volumeY} />
              </g>
            )
          })}
          {movingAverages.map((line) => line.points.length > 1 && <path className={`kline-ma ${line.className}`} d={linePath(line.points)} key={line.label} />)}
          {dateIndexes.map((index) => {
            const x = plotLeft + slotWidth * (index + 0.5)
            return <text className="kline-axis-label kline-date-label" key={chartBars[index].trade_date} textAnchor="middle" x={x} y="408">{dateLabel(chartBars[index].trade_date)}</text>
          })}
        </svg>
      </div>
    </div>
  )
}
