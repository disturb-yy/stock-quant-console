import { apiRequest, isApiErrorResponse, type PayloadValidator } from './client'
import type {
  ScreenerFieldResult,
  ScreenerFilter,
  ScreenerRanking,
  ScreenerRankingResult,
  ScreenerResult,
  ScreenerRunResponse,
  ScreenerSpec,
  ScreenerSnapshot,
  ScreenerSource,
  ScreenerUniverse,
} from './types'

export type {
  ScreenerFieldResult,
  ScreenerFilter,
  ScreenerRanking,
  ScreenerRankingResult,
  ScreenerResult,
  ScreenerRunResponse,
  ScreenerSpec,
  ScreenerSnapshot,
  ScreenerSource,
  ScreenerUniverse,
} from './types'

export type ScreenerFieldId = ScreenerFilter['field_id']
export type ScreenerOperator = ScreenerFilter['operator']

export interface ScreenerFieldDefinition {
  readonly id: ScreenerFieldId
  readonly category: 'Market' | 'Valuation' | 'Fundamental' | 'Technical'
  readonly label: string
  readonly unit: string
}

export const screenerFieldDefinitions: ReadonlyArray<ScreenerFieldDefinition> = [
  { id: 'market.market_cap', category: 'Market', label: '总市值', unit: 'CNY' },
  { id: 'market.turnover_rate', category: 'Market', label: '换手率', unit: '%' },
  { id: 'technical.close', category: 'Technical', label: '收盘价', unit: 'CNY' },
  { id: 'technical.volume', category: 'Technical', label: '成交量', unit: '股' },
  { id: 'technical.turnover_amount', category: 'Technical', label: '成交额', unit: 'CNY' },
  { id: 'valuation.pe_ttm', category: 'Valuation', label: '市盈率 TTM', unit: '倍' },
  { id: 'valuation.pb', category: 'Valuation', label: '市净率', unit: '倍' },
  { id: 'valuation.ps_ttm', category: 'Valuation', label: '市销率 TTM', unit: '倍' },
  { id: 'fundamental.revenue', category: 'Fundamental', label: '营业收入', unit: 'CNY' },
  { id: 'fundamental.net_profit', category: 'Fundamental', label: '净利润', unit: 'CNY' },
  { id: 'fundamental.total_assets', category: 'Fundamental', label: '总资产', unit: 'CNY' },
  { id: 'fundamental.total_liabilities', category: 'Fundamental', label: '总负债', unit: 'CNY' },
  { id: 'fundamental.total_equity', category: 'Fundamental', label: '股东权益', unit: 'CNY' },
  { id: 'fundamental.operating_cash_flow', category: 'Fundamental', label: '经营现金流', unit: 'CNY' },
  { id: 'fundamental.roe_pct', category: 'Fundamental', label: 'ROE', unit: '%' },
]

export const screenerOperators: ReadonlyArray<ScreenerOperator> = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between']
export const screenerMaxTopN = 100
export const screenerMaxFilters = 20

export const screenerOperatorLabels: Record<ScreenerOperator, string> = {
  eq: '等于',
  neq: '不等于',
  gt: '大于',
  gte: '大于等于',
  lt: '小于',
  lte: '小于等于',
  between: '介于',
}

export const screenerCategoryLabels: Record<ScreenerFieldDefinition['category'], string> = {
  Market: '市场',
  Valuation: '估值',
  Fundamental: '基本面',
  Technical: '技术',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isFieldId(value: unknown): value is ScreenerFieldId {
  return typeof value === 'string' && screenerFieldDefinitions.some((field) => field.id === value)
}

function isOperator(value: unknown): value is ScreenerOperator {
  return typeof value === 'string' && screenerOperators.includes(value as ScreenerOperator)
}

function isDecimalString(value: unknown): value is string {
  if (typeof value !== 'string' || !/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) return false
  return Number.isFinite(Number(value))
}

function hasExactKeys(value: Record<string, unknown>, keys: ReadonlyArray<string>) {
  const actual = Object.keys(value).sort()
  return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index])
}

function isFilterValue(value: unknown, operator: ScreenerOperator): value is ScreenerFilter['value'] {
  if (operator === 'between') {
    return Array.isArray(value) && value.length === 2 && value.every(isDecimalString)
  }
  return isDecimalString(value)
}

export function isCompleteScreenerSpec(value: unknown): value is ScreenerSpec {
  if (!isRecord(value) || !hasExactKeys(value, ['universe_id', 'filters', 'ranking', 'top_n'])) return false
  const topN = value.top_n
  if (value.universe_id !== 'cn_a_share_active' || typeof topN !== 'number' || !Number.isInteger(topN) || topN < 1 || topN > screenerMaxTopN) return false
  if (!Array.isArray(value.filters) || value.filters.length > screenerMaxFilters) return false
  if (!isRecord(value.ranking) || !hasExactKeys(value.ranking, ['field_id', 'direction']) || !isFieldId(value.ranking.field_id)) return false
  if (value.ranking.direction !== 'asc' && value.ranking.direction !== 'desc') return false
  return value.filters.every((filter) => {
    if (!isRecord(filter) || !hasExactKeys(filter, ['field_id', 'operator', 'value'])) return false
    return isFieldId(filter.field_id) && isOperator(filter.operator) && isFilterValue(filter.value, filter.operator)
  })
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isScreenerFieldResult(value: unknown): value is ScreenerFieldResult {
  if (!isRecord(value)) return false
  return isFieldId(value.field_id)
    && typeof value.label === 'string'
    && typeof value.unit === 'string'
    && isNullableString(value.value)
    && isNullableString(value.basis)
    && isNullableString(value.as_of)
    && isNullableString(value.unavailable_reason)
}

function isScreenerRankingResult(value: unknown): value is ScreenerRankingResult {
  return isScreenerFieldResult(value)
}

function isScreenerResult(value: unknown): value is ScreenerResult {
  if (!isRecord(value)) return false
  return Array.isArray(value.industries)
    && value.industries.every((industry) => typeof industry === 'string')
    && typeof value.name === 'string'
    && typeof value.rank === 'number'
    && Number.isInteger(value.rank)
    && isNonEmptyString(value.symbol)
    && isScreenerRankingResult(value.ranking)
    && Array.isArray(value.fields)
    && value.fields.every(isScreenerFieldResult)
}

function isScreenerSnapshot(value: unknown): value is ScreenerSnapshot {
  if (!isRecord(value) || typeof value.as_of !== 'string' || !isRecord(value.field_as_of) || !isRecord(value.definition_versions)) return false
  return Object.values(value.field_as_of).every((item) => typeof item === 'string')
    && Object.values(value.definition_versions).every((item) => typeof item === 'string')
}

function isScreenerSource(value: unknown): value is ScreenerSource {
  if (!isRecord(value)) return false
  return (value.mode === 'demo' || value.mode === 'real' || value.mode === 'fallback')
    && typeof value.provider === 'string'
    && typeof value.seed_version === 'string'
    && typeof value.as_of === 'string'
}

function isScreenerUniverse(value: unknown): value is ScreenerUniverse {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.name === 'string'
    && typeof value.eligible_count === 'number'
    && Number.isInteger(value.eligible_count)
    && value.eligible_count >= 0
}

export const isScreenerRunResponse: PayloadValidator<ScreenerRunResponse> = (value): value is ScreenerRunResponse => {
  if (!isRecord(value) || !isCompleteScreenerSpec(value.spec) || !isScreenerSnapshot(value.snapshot)) return false
  return typeof value.matched_count === 'number'
    && Number.isInteger(value.matched_count)
    && value.matched_count >= 0
    && typeof value.returned_count === 'number'
    && Number.isInteger(value.returned_count)
    && value.returned_count >= 0
    && Array.isArray(value.results)
    && value.results.every(isScreenerResult)
    && isScreenerSource(value.source)
    && isScreenerUniverse(value.universe)
}

export async function runScreener(spec: ScreenerSpec, signal?: AbortSignal): Promise<ScreenerRunResponse> {
  return apiRequest<ScreenerRunResponse>('/api/v1/screeners/run', {
    method: 'POST',
    signal,
    json: { spec },
    validateResponse: isScreenerRunResponse,
    parseError: isApiErrorResponse,
  })
}
