import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './client'
import { buildStockValuationQuery, fetchStockValuation, isStockValuation } from './stockValuation'

const emptyMetric = {
  current: { value: null, as_of: null, basis: null },
  history: [],
  percentile: { value: null, sample_size: 0, range_from: null, range_to: null, method: 'inclusive_rank' as const },
  position: null,
}

const emptyValuation = {
  symbol: '000001.SZ',
  name: '平安银行',
  requested_range: '5y' as const,
  effective_range: { from: null, to: null },
  as_of: null,
  metrics: { pe_ttm: emptyMetric, pb: emptyMetric, ps_ttm: emptyMetric },
  industry_comparisons: [],
  source: { mode: 'demo' as const, provider: 'mysql-demo-fixture' as const, seed_version: 'fnd-003-demo-v8', as_of: '2024-06-28' },
}

describe('fetchStockValuation', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('requests the encoded symbol and OpenAPI valuation range', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(emptyValuation), { status: 200 }),
    )

    await expect(fetchStockValuation('A/B.SZ', { range: '3y' })).resolves.toEqual(emptyValuation)

    const requestUrl = new URL(String(fetchSpy.mock.calls[0][0]), 'http://localhost')
    expect(requestUrl.pathname).toBe('/api/v1/stocks/A%2FB.SZ/valuation')
    expect(requestUrl.search).toBe(`?${buildStockValuationQuery({ range: '3y' })}`)
  })

  it('accepts nullable empty metrics and same-day industry comparisons', () => {
    expect(isStockValuation(emptyValuation)).toBe(true)
    expect(isStockValuation({
      ...emptyValuation,
      metrics: {
        ...emptyValuation.metrics,
        pe_ttm: {
          current: { value: '7.40', as_of: '2024-06-28', basis: 'ttm' as const },
          history: [{ as_of: '2024-06-28', value: '7.40' }],
          percentile: { value: '100.00', sample_size: 1, range_from: '2024-06-28', range_to: '2024-06-28', method: 'inclusive_rank' as const },
          position: 'high' as const,
        },
      },
      industry_comparisons: [{
        industry: { code: 'BANK', name: '银行' },
        as_of: '2024-06-28',
        metrics: {
          pe_ttm: { value: null, sample_size: 1 },
          pb: { value: '0.70', sample_size: 3 },
          ps_ttm: { value: '1.20', sample_size: 3 },
        },
      }],
    })).toBe(true)
  })

  it('rejects payloads outside the generated nullable contract', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ...emptyValuation, metrics: { ...emptyValuation.metrics, pe_ttm: { ...emptyMetric, position: 'invalid' } } }), { status: 200 }),
    )

    await expect(fetchStockValuation(emptyValuation.symbol, { range: '5y' })).rejects.toMatchObject<Partial<ApiError>>({
      kind: 'invalid-payload',
    })
  })

  it('preserves unified backend errors for unavailable valuation data', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: 'DEPENDENCY_UNAVAILABLE', message: '股票估值数据暂不可用' }), { status: 503 }),
    )

    await expect(fetchStockValuation(emptyValuation.symbol, { range: '5y' })).rejects.toMatchObject<Partial<ApiError>>({
      kind: 'backend', status: 503,
    })
  })
})
