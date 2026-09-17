import { isCompleteScreenerSpec, type ScreenerSpec } from '../api/screener'

export const defaultScreeningSpec: ScreenerSpec = {
  universe_id: 'cn_a_share_active',
  filters: [],
  ranking: { field_id: 'technical.volume', direction: 'desc' },
  top_n: 20,
}

export const screeningQueryKey = 'screening_spec'
export const screeningQueryMaxLength = 4096

export function serializeScreeningSpec(spec: ScreenerSpec): string {
  return JSON.stringify({
    universe_id: spec.universe_id,
    filters: spec.filters.map((filter) => ({
      field_id: filter.field_id,
      operator: filter.operator,
      value: Array.isArray(filter.value) ? [...filter.value] : filter.value,
    })),
    ranking: { field_id: spec.ranking.field_id, direction: spec.ranking.direction },
    top_n: spec.top_n,
  })
}

export interface ParsedScreeningUrl {
  readonly spec: ScreenerSpec
  readonly invalidReason: string | null
}

export function readScreeningSpec(searchParams: URLSearchParams): ParsedScreeningUrl {
  const raw = searchParams.get(screeningQueryKey)
  if (raw === null) return { spec: defaultScreeningSpec, invalidReason: null }
  if (raw.length > screeningQueryMaxLength) return { spec: defaultScreeningSpec, invalidReason: '选股配置过长，已恢复为默认配置。' }

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isCompleteScreenerSpec(parsed)) return { spec: defaultScreeningSpec, invalidReason: 'URL 中的选股配置不完整或不受支持，已恢复为默认配置。' }
    return { spec: parsed, invalidReason: null }
  } catch {
    return { spec: defaultScreeningSpec, invalidReason: 'URL 中的选股配置无法解析，已恢复为默认配置。' }
  }
}

export function isScreeningSpecComplete(spec: ScreenerSpec): boolean {
  return isCompleteScreenerSpec(spec)
}
