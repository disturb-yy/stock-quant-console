import { apiRequest, isApiErrorResponse, type PayloadValidator } from './client'
import type {
  StockEffectiveRange,
  StockIndustry,
  StockIndustryComparison,
  StockIndustryComparisonMetrics,
  StockIndustryMetric,
  StockValuation,
  StockValuationCurrent,
  StockValuationMetric,
  StockValuationMetrics,
  StockValuationPercentile,
  StockValuationPoint,
  StockValuationSource,
} from './types'

export type {
  StockIndustry,
  StockIndustryComparison,
  StockIndustryComparisonMetrics,
  StockIndustryMetric,
  StockValuation,
  StockValuationCurrent,
  StockValuationMetric,
  StockValuationMetrics,
  StockValuationPercentile,
  StockValuationPoint,
  StockValuationSource,
} from './types'

export const valuationRanges = ['3y', '5y'] as const
export type ValuationRange = (typeof valuationRanges)[number]

export interface StockValuationRequest {
  readonly range: ValuationRange
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

function isNullableDate(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && value.trim() !== '')
}

function isEffectiveRange(value: unknown): value is StockEffectiveRange {
  if (!isRecord(value)) return false
  return isNullableDate(value.from) && isNullableDate(value.to)
}

function isValuationSource(value: unknown): value is StockValuationSource {
  if (!isRecord(value)) return false
  return (value.mode === 'demo' || value.mode === 'real' || value.mode === 'fallback')
    && (value.provider === 'mysql-demo-fixture'
      || value.provider === 'external-real-provider'
      || value.provider === 'local-fixture-fallback')
    && typeof value.seed_version === 'string'
    && typeof value.as_of === 'string'
}

function isValuationCurrent(value: unknown): value is StockValuationCurrent {
  if (!isRecord(value)) return false
  return isNullableNumericString(value.value)
    && isNullableDate(value.as_of)
    && (value.basis === null || value.basis === 'ttm' || value.basis === 'latest_daily_basic')
}

function isValuationPoint(value: unknown): value is StockValuationPoint {
  if (!isRecord(value)) return false
  return typeof value.as_of === 'string' && value.as_of.trim() !== '' && isNumericString(value.value)
}

function isValuationPercentile(value: unknown): value is StockValuationPercentile {
  if (!isRecord(value)) return false
  return isNullableNumericString(value.value)
    && typeof value.sample_size === 'number'
    && Number.isInteger(value.sample_size)
    && value.sample_size >= 0
    && isNullableDate(value.range_from)
    && isNullableDate(value.range_to)
    && value.method === 'inclusive_rank'
}

function isValuationMetric(value: unknown): value is StockValuationMetric {
  if (!isRecord(value)) return false
  return isValuationCurrent(value.current)
    && Array.isArray(value.history)
    && value.history.every(isValuationPoint)
    && isValuationPercentile(value.percentile)
    && (value.position === null || value.position === 'low' || value.position === 'middle' || value.position === 'high')
}

function isValuationMetrics(value: unknown): value is StockValuationMetrics {
  if (!isRecord(value)) return false
  return isValuationMetric(value.pe_ttm)
    && isValuationMetric(value.pb)
    && isValuationMetric(value.ps_ttm)
}

function isIndustry(value: unknown): value is StockIndustry {
  if (!isRecord(value)) return false
  return typeof value.code === 'string' && value.code.trim() !== ''
    && typeof value.name === 'string' && value.name.trim() !== ''
}

function isIndustryMetric(value: unknown): value is StockIndustryMetric {
  if (!isRecord(value)) return false
  return isNullableNumericString(value.value)
    && typeof value.sample_size === 'number'
    && Number.isInteger(value.sample_size)
    && value.sample_size >= 0
}

function isIndustryComparisonMetrics(value: unknown): value is StockIndustryComparisonMetrics {
  if (!isRecord(value)) return false
  return isIndustryMetric(value.pe_ttm)
    && isIndustryMetric(value.pb)
    && isIndustryMetric(value.ps_ttm)
}

function isIndustryComparison(value: unknown): value is StockIndustryComparison {
  if (!isRecord(value)) return false
  return isIndustry(value.industry)
    && isNullableDate(value.as_of)
    && isIndustryComparisonMetrics(value.metrics)
}

export const isStockValuation: PayloadValidator<StockValuation> = (value): value is StockValuation => {
  if (!isRecord(value)) return false
  return typeof value.symbol === 'string'
    && typeof value.name === 'string'
    && valuationRanges.includes(value.requested_range as ValuationRange)
    && isEffectiveRange(value.effective_range)
    && isNullableDate(value.as_of)
    && isValuationMetrics(value.metrics)
    && Array.isArray(value.industry_comparisons)
    && value.industry_comparisons.every(isIndustryComparison)
    && isValuationSource(value.source)
}

export function buildStockValuationQuery({ range }: StockValuationRequest): string {
  return new URLSearchParams({ range }).toString()
}

export async function fetchStockValuation(
  symbol: string,
  request: StockValuationRequest,
  signal?: AbortSignal,
): Promise<StockValuation> {
  return apiRequest<StockValuation>(
    `/api/v1/stocks/${encodeURIComponent(symbol)}/valuation?${buildStockValuationQuery(request)}`,
    { method: 'GET', signal, validateResponse: isStockValuation, parseError: isApiErrorResponse },
  )
}
