import { apiRequest, isApiErrorResponse, type PayloadValidator } from './client'
import { isMarketDataSource } from './marketOverview'
import type {
  StockBar,
  StockBars,
  StockBenchmark,
  StockBenchmarkPoint,
  StockEffectiveRange,
} from './types'

export type { StockBar, StockBars, StockBenchmark, StockBenchmarkPoint, StockEffectiveRange } from './types'

export const chartRanges = ['20d', '60d', '120d', 'all'] as const
export type ChartRange = (typeof chartRanges)[number]

export const chartAdjustments = ['none', 'qfq', 'hfq'] as const
export type ChartAdjustment = (typeof chartAdjustments)[number]

export const chartBenchmarks = ['none', '000300.SH'] as const
export type ChartBenchmark = (typeof chartBenchmarks)[number]

export interface StockBarsRequest {
  readonly range: ChartRange
  readonly adjust: ChartAdjustment
  readonly benchmark: ChartBenchmark
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNumericString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))
}

function isNullableNumericString(value: unknown): value is string | null {
  return value === null || isNumericString(value)
}

function isStockBar(value: unknown): value is StockBar {
  if (!isRecord(value)) return false
  return typeof value.trade_date === 'string'
    && isNumericString(value.open)
    && isNumericString(value.high)
    && isNumericString(value.low)
    && isNumericString(value.close)
    && typeof value.volume === 'number'
    && Number.isInteger(value.volume)
    && value.volume >= 0
    && isNullableNumericString(value.ma5)
    && isNullableNumericString(value.ma20)
}

function isStockEffectiveRange(value: unknown): value is StockEffectiveRange {
  if (!isRecord(value)) return false
  return (value.from === null || typeof value.from === 'string')
    && (value.to === null || typeof value.to === 'string')
}

function isStockBenchmarkPoint(value: unknown): value is StockBenchmarkPoint {
  if (!isRecord(value)) return false
  return typeof value.trade_date === 'string'
    && isNumericString(value.close)
    && isNumericString(value.stock_return_pct)
    && isNumericString(value.benchmark_return_pct)
    && isNumericString(value.relative_return_pct)
}

function isStockBenchmark(value: unknown): value is StockBenchmark {
  if (!isRecord(value)) return false
  return value.code === '000300.SH'
    && typeof value.name === 'string'
    && Array.isArray(value.points)
    && value.points.every(isStockBenchmarkPoint)
}

export const isStockBars: PayloadValidator<StockBars> = (value): value is StockBars => {
  if (!isRecord(value)) return false
  return typeof value.symbol === 'string'
    && typeof value.name === 'string'
    && value.timeframe === '1d'
    && chartAdjustments.includes(value.adjust as ChartAdjustment)
    && isStockEffectiveRange(value.effective_range)
    && Array.isArray(value.bars)
    && value.bars.every(isStockBar)
    && (value.benchmark === null || isStockBenchmark(value.benchmark))
    && isMarketDataSource(value.source)
}

export function buildStockBarsQuery({ range, adjust, benchmark }: StockBarsRequest): string {
  const query = new URLSearchParams({ timeframe: '1d', range, adjust })
  if (benchmark !== 'none') query.set('benchmark', benchmark)
  return query.toString()
}

export async function fetchStockBars(
  symbol: string,
  request: StockBarsRequest,
  signal?: AbortSignal,
): Promise<StockBars> {
  return apiRequest<StockBars>(`/api/v1/stocks/${encodeURIComponent(symbol)}/bars?${buildStockBarsQuery(request)}`, {
    method: 'GET',
    signal,
    validateResponse: isStockBars,
    parseError: isApiErrorResponse,
  })
}
