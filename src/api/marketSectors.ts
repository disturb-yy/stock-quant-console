import { apiRequest, isApiErrorResponse, type PayloadValidator } from './client'
import { isMarketDataSource } from './marketOverview'
import type { MarketSector, MarketSectors, SectorLeader } from './types'

export type { MarketSector, MarketSectors, SectorLeader } from './types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function isSectorLeader(value: unknown): value is SectorLeader {
  if (!isRecord(value)) return false
  return typeof value.code === 'string'
    && typeof value.name === 'string'
    && typeof value.change_percent === 'string'
}

function isMarketSector(value: unknown): value is MarketSector {
  if (!isRecord(value)) return false
  return typeof value.code === 'string'
    && typeof value.name === 'string'
    && typeof value.change_percent === 'string'
    && isPositiveInteger(value.component_count)
    && isSectorLeader(value.leader)
}

export const isMarketSectors: PayloadValidator<MarketSectors> = (value): value is MarketSectors => {
  if (!isRecord(value)) return false
  return typeof value.as_of === 'string'
    && isMarketDataSource(value.source)
    && Array.isArray(value.sectors)
    && value.sectors.every(isMarketSector)
}

export async function fetchMarketSectors(signal?: AbortSignal): Promise<MarketSectors> {
  return apiRequest<MarketSectors>('/api/v1/markets/sectors', {
    signal,
    validateResponse: isMarketSectors,
    parseError: isApiErrorResponse,
  })
}
