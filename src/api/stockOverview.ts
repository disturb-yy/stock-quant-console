import { apiRequest, isApiErrorResponse, type PayloadValidator } from './client'
import type {
  StockMetric,
  StockMetrics,
  StockOverview,
  StockQuote,
  StockSparkline,
  StockSparklinePoint,
} from './types'

export type { StockMetric, StockMetrics, StockOverview, StockQuote, StockSparkline, StockSparklinePoint } from './types'

const metricBases = ['latest_daily_basic', 'ttm', 'latest_report'] as const
type StockMetricBasis = (typeof metricBases)[number]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isStockMetric(value: unknown): value is StockMetric {
  if (!isRecord(value)) return false
  return isNullableString(value.value)
    && isNullableString(value.as_of)
    && (value.basis === null || metricBases.includes(value.basis as StockMetricBasis))
}

function isStockMetrics(value: unknown): value is StockMetrics {
  if (!isRecord(value)) return false
  return isStockMetric(value.market_cap)
    && isStockMetric(value.pe_ttm)
    && isStockMetric(value.pb)
    && isStockMetric(value.roe)
}

function isStockQuote(value: unknown): value is StockQuote {
  if (!isRecord(value)) return false
  return typeof value.last === 'string'
    && typeof value.change === 'string'
    && typeof value.change_pct === 'string'
    && typeof value.as_of === 'string'
}

function isStockSparklinePoint(value: unknown): value is StockSparklinePoint {
  if (!isRecord(value)) return false
  return typeof value.trade_date === 'string'
    && typeof value.open === 'string'
    && typeof value.high === 'string'
    && typeof value.low === 'string'
    && typeof value.close === 'string'
}

function isStockSparkline(value: unknown): value is StockSparkline {
  if (!isRecord(value)) return false
  return value.period === '20d'
    && Array.isArray(value.points)
    && value.points.every(isStockSparklinePoint)
}

export const isStockOverview: PayloadValidator<StockOverview> = (value): value is StockOverview => {
  if (!isRecord(value)) return false
  return typeof value.symbol === 'string'
    && typeof value.name === 'string'
    && typeof value.industry === 'string'
    && isStockQuote(value.quote)
    && isStockMetrics(value.metrics)
    && isStockSparkline(value.sparkline)
}

export async function fetchStockOverview(symbol: string, signal?: AbortSignal): Promise<StockOverview> {
  return apiRequest<StockOverview>(`/api/v1/stocks/${encodeURIComponent(symbol)}`, {
    method: 'GET',
    signal,
    validateResponse: isStockOverview,
    parseError: isApiErrorResponse,
  })
}
