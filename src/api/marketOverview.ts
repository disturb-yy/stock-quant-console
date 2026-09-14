import { apiRequest, isApiErrorResponse, type PayloadValidator } from './client'
import type {
  MarketBreadth,
  MarketDataSource,
  MarketIndex,
  MarketOverview,
  MarketTurnover,
} from './types'

export type {
  MarketBreadth,
  MarketDataSource,
  MarketIndex,
  MarketOverview,
  MarketTurnover,
} from './types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isMarketDataSource(value: unknown): value is MarketDataSource {
  if (!isRecord(value)) return false
  return (value.mode === 'demo' || value.mode === 'real' || value.mode === 'fallback')
    && (value.provider === 'mysql-demo-fixture'
      || value.provider === 'external-real-provider'
      || value.provider === 'local-fixture-fallback')
    && typeof value.seed_version === 'string'
}

function isMarketIndex(value: unknown): value is MarketIndex {
  if (!isRecord(value)) return false
  return typeof value.code === 'string'
    && typeof value.name === 'string'
    && typeof value.close === 'string'
    && typeof value.change === 'string'
    && typeof value.change_percent === 'string'
}

function isMarketBreadth(value: unknown): value is MarketBreadth {
  if (!isRecord(value)) return false
  return isNonNegativeInteger(value.advancing)
    && isNonNegativeInteger(value.declining)
    && isNonNegativeInteger(value.unchanged)
}

function isMarketTurnover(value: unknown): value is MarketTurnover {
  if (!isRecord(value)) return false
  return typeof value.amount === 'string' && value.currency === 'CNY'
}

export const isMarketOverview: PayloadValidator<MarketOverview> = (value): value is MarketOverview => {
  if (!isRecord(value)) return false
  return typeof value.as_of === 'string'
    && typeof value.observed_at === 'string'
    && isMarketDataSource(value.source)
    && Array.isArray(value.indices)
    && value.indices.every(isMarketIndex)
    && isMarketBreadth(value.breadth)
    && isMarketTurnover(value.turnover)
}

export async function fetchMarketOverview(signal?: AbortSignal): Promise<MarketOverview> {
  return apiRequest<MarketOverview>('/api/v1/markets/overview', {
    signal,
    validateResponse: isMarketOverview,
    parseError: isApiErrorResponse,
  })
}
