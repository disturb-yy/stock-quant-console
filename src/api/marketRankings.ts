import { apiRequest, isApiErrorResponse, type PayloadValidator } from './client'
import { isMarketDataSource } from './marketOverview'
import type { MarketRanking, MarketRankings, PaginationMeta } from './types'

export type { MarketRanking, MarketRankings } from './types'

export const rankingMetrics = ['gain', 'loss', 'turnover_amount', 'turnover_rate'] as const
export type RankingMetric = (typeof rankingMetrics)[number]

export interface MarketRankingsRequest {
  readonly metric: RankingMetric
  readonly page: number
  readonly pageSize: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function isRankingMetric(value: unknown): value is RankingMetric {
  return typeof value === 'string' && rankingMetrics.includes(value as RankingMetric)
}

function isMarketRanking(value: unknown): value is MarketRanking {
  if (!isRecord(value)) return false
  return isPositiveInteger(value.rank)
    && typeof value.code === 'string'
    && typeof value.name === 'string'
    && typeof value.value === 'string'
    && typeof value.close === 'string'
    && typeof value.change === 'string'
    && typeof value.change_percent === 'string'
    && typeof value.turnover_amount === 'string'
    && typeof value.turnover_rate === 'string'
}

function isPaginationMeta(value: unknown): value is PaginationMeta {
  if (!isRecord(value)) return false
  return isPositiveInteger(value.page)
    && isPositiveInteger(value.page_size)
    && typeof value.total === 'number'
    && Number.isInteger(value.total)
    && value.total >= 0
    && typeof value.total_pages === 'number'
    && Number.isInteger(value.total_pages)
    && value.total_pages >= 0
}

export const isMarketRankings: PayloadValidator<MarketRankings> = (value): value is MarketRankings => {
  if (!isRecord(value)) return false
  return isRankingMetric(value.metric)
    && typeof value.as_of === 'string'
    && isMarketDataSource(value.source)
    && Array.isArray(value.data)
    && value.data.every(isMarketRanking)
    && isPaginationMeta(value.pagination)
}

export function buildMarketRankingsQuery({ metric, page, pageSize }: MarketRankingsRequest): string {
  const query = new URLSearchParams({
    metric,
    page: String(page),
    page_size: String(pageSize),
  })
  return query.toString()
}

export async function fetchMarketRankings(
  request: MarketRankingsRequest,
  signal?: AbortSignal,
): Promise<MarketRankings> {
  return apiRequest<MarketRankings>(`/api/v1/markets/rankings?${buildMarketRankingsQuery(request)}`, {
    method: 'GET',
    signal,
    validateResponse: isMarketRankings,
    parseError: isApiErrorResponse,
  })
}
