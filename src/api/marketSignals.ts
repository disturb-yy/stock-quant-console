import { apiRequest, isApiErrorResponse, type PayloadValidator } from './client'
import { isMarketDataSource } from './marketOverview'
import type { MarketSignals, SignalParameters, SignalResult } from './types'

export type { MarketSignals, SignalParameters, SignalResult } from './types'

export const signalTypes = ['volume_surge', 'breakout', 'new_high', 'strong'] as const
export type SignalType = (typeof signalTypes)[number]

export const signalWindows = [20, 60, 120] as const
export type SignalWindow = (typeof signalWindows)[number]

export const signalMultiples = [1.5, 2] as const
export type SignalMultiple = (typeof signalMultiples)[number]

export const signalTopPercents = [10, 20] as const
export type SignalTopPercent = (typeof signalTopPercents)[number]

export interface MarketSignalsRequest {
  readonly type: SignalType
  readonly params: SignalParameters
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isSignalType(value: unknown): value is SignalType {
  return typeof value === 'string' && signalTypes.includes(value as SignalType)
}

function isSignalWindow(value: unknown): value is SignalWindow {
  return typeof value === 'number' && signalWindows.includes(value as SignalWindow)
}

function isSignalMultiple(value: unknown): value is SignalMultiple {
  return typeof value === 'number' && signalMultiples.includes(value as SignalMultiple)
}

function isSignalTopPercent(value: unknown): value is SignalTopPercent {
  return typeof value === 'number' && signalTopPercents.includes(value as SignalTopPercent)
}

function isSignalParameters(value: unknown): value is SignalParameters {
  if (!isRecord(value)) return false
  return (value.window === undefined || isSignalWindow(value.window))
    && (value.multiple === undefined || isSignalMultiple(value.multiple))
    && (value.top_percent === undefined || isSignalTopPercent(value.top_percent))
}

function isSignalResult(value: unknown): value is SignalResult {
  if (!isRecord(value)) return false
  return typeof value.code === 'string'
    && typeof value.name === 'string'
    && isSignalType(value.signal)
}

export const isMarketSignals: PayloadValidator<MarketSignals> = (value): value is MarketSignals => {
  if (!isRecord(value)) return false
  return isSignalType(value.type)
    && isSignalParameters(value.params)
    && typeof value.as_of === 'string'
    && isMarketDataSource(value.source)
    && Array.isArray(value.signals)
    && value.signals.every(isSignalResult)
}

export function buildSignalQuery({ type, params }: MarketSignalsRequest): string {
  const query = new URLSearchParams()
  query.set('type', type)
  query.set('params', JSON.stringify(params))
  return query.toString()
}

export async function fetchMarketSignals(
  request: MarketSignalsRequest,
  signal?: AbortSignal,
): Promise<MarketSignals> {
  return apiRequest<MarketSignals>(`/api/v1/markets/signals?${buildSignalQuery(request)}`, {
    method: 'GET',
    signal,
    validateResponse: isMarketSignals,
    parseError: isApiErrorResponse,
  })
}
