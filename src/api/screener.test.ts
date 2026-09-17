import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './client'
import {
  isCompleteScreenerSpec,
  isScreenerRunResponse,
  runScreener,
  type ScreenerRunResponse,
} from './screener'
import { defaultScreeningSpec } from '../pages/screeningUrl'

const response: ScreenerRunResponse = {
  spec: defaultScreeningSpec,
  snapshot: { as_of: '2024-06-28', field_as_of: { 'technical.volume': '2024-06-28' }, definition_versions: {} },
  universe: { id: 'cn_a_share_active', name: 'A 股在市股票', eligible_count: 2 },
  matched_count: 1,
  returned_count: 1,
  results: [{
    symbol: '000001.SZ',
    name: '平安银行',
    industries: ['银行'],
    rank: 1,
    ranking: { field_id: 'technical.volume', label: '成交量', value: '100', unit: '股', basis: 'latest_daily_bar', as_of: '2024-06-28', unavailable_reason: null },
    fields: [],
  }],
  source: { mode: 'demo', provider: 'mysql-demo-fixture', seed_version: 'fnd-003-demo-v8', as_of: '2024-06-28' },
}

describe('screener API contract', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('sends the generated ScreenerSpec to the relative run route', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }))

    await expect(runScreener(defaultScreeningSpec)).resolves.toEqual(response)

    expect(fetchSpy).toHaveBeenCalledWith('/api/v1/screeners/run', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ spec: defaultScreeningSpec }),
    }))
  })

  it('rejects incomplete or out-of-bound specs before URL/API use', () => {
    expect(isCompleteScreenerSpec({ ...defaultScreeningSpec, top_n: 101 })).toBe(false)
    expect(isCompleteScreenerSpec({
      ...defaultScreeningSpec,
      filters: [{ field_id: 'technical.close', operator: 'between', value: ['10'] }],
    })).toBe(false)
    expect(isCompleteScreenerSpec({
      ...defaultScreeningSpec,
      filters: [{ field_id: 'technical.close', operator: 'gte', value: '' }],
    })).toBe(false)
  })

  it('accepts nullable field values and rejects a response outside OpenAPI shape', () => {
    expect(isScreenerRunResponse({
      ...response,
      results: [{
        ...response.results[0],
        fields: [{ field_id: 'valuation.pe_ttm', label: '市盈率 TTM', value: null, unit: '倍', basis: null, as_of: null, unavailable_reason: '暂无可用值' }],
      }],
    })).toBe(true)
    expect(isScreenerRunResponse({ ...response, returned_count: '1' })).toBe(false)
  })

  it('preserves real backend errors without a fallback result', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ code: 'VALIDATION_ERROR', message: '选股条件或规格无效' }),
      { status: 400 },
    ))

    await expect(runScreener(defaultScreeningSpec)).rejects.toMatchObject<Partial<ApiError>>({ kind: 'backend', status: 400 })
  })
})
