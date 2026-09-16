import { apiRequest, isApiErrorResponse, type PayloadValidator } from './client'
import type { DemoStatus } from './types'

export type { DemoCounts, DemoSampleStock, DemoStatus } from './types'

const modes = ['demo', 'real', 'fallback'] as const
const providers = ['mysql-demo-fixture', 'external-real-provider', 'local-fixture-fallback'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

export const isDemoStatus: PayloadValidator<DemoStatus> = (value): value is DemoStatus => {
  if (!isRecord(value) || !modes.includes(value.mode as DemoStatus['mode'])) return false
  if (!providers.includes(value.provider as DemoStatus['provider'])) return false
  if (typeof value.seed_version !== 'string' || (value.as_of !== null && typeof value.as_of !== 'string')) return false
  const counts = value.counts
  if (!isRecord(counts)) return false
  if (!['instruments', 'daily_bars', 'daily_basics', 'financial_metrics', 'financial_reports', 'index_snapshots'].every((key) => isNonNegativeNumber(counts[key]))) {
    return false
  }
  if (!Array.isArray(value.sample_stocks)) return false
  return value.sample_stocks.every((sample) => {
    if (!isRecord(sample)) return false
    return typeof sample.code === 'string'
      && typeof sample.name === 'string'
      && (sample.exchange === 'SSE' || sample.exchange === 'SZSE')
      && sample.status === 'active'
  })
}

export async function fetchDemoStatus(signal?: AbortSignal): Promise<DemoStatus> {
  return apiRequest<DemoStatus>('/api/v1/dev/demo-status', {
    signal,
    validateResponse: isDemoStatus,
    parseError: isApiErrorResponse,
  })
}
