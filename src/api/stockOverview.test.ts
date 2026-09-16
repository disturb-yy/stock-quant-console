import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './client'
import { fetchStockOverview } from './stockOverview'

const stockOverview = {
  symbol: '000001.SZ',
  name: '平安银行',
  industry: '银行',
  quote: { last: '10.31', change: '0.09', change_pct: '0.88', as_of: '2024-06-28' },
  metrics: {
    market_cap: { value: '203425.00', as_of: '2024-06-28', basis: 'latest_daily_basic' as const },
    pe_ttm: { value: null, as_of: '2024-06-28', basis: 'ttm' as const },
    pb: { value: '0.48', as_of: '2024-06-28', basis: 'latest_daily_basic' as const },
    roe: { value: '10.84', as_of: '2024-06-28', basis: 'latest_report' as const },
  },
  sparkline: { period: '20d' as const, points: [] },
}

describe('fetchStockOverview', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('requests the raw symbol as the URL-encoded detail path', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(stockOverview), { status: 200 }),
    )

    await expect(fetchStockOverview('A/B.SZ')).resolves.toEqual(stockOverview)
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/v1/stocks/A%2FB.SZ')
  })

  it('accepts nullable metrics and an empty sparkline from the generated contract', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(stockOverview), { status: 200 }),
    )

    await expect(fetchStockOverview(stockOverview.symbol)).resolves.toMatchObject({
      metrics: { pe_ttm: { value: null } },
      sparkline: { period: '20d', points: [] },
    })
  })

  it('accepts OHLC points from the generated contract', async () => {
    const response = {
      ...stockOverview,
      sparkline: {
        period: '20d' as const,
        points: [{ trade_date: '2024-06-28', open: '10.22', high: '10.36', low: '10.18', close: '10.31' }],
      },
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }))

    await expect(fetchStockOverview(response.symbol)).resolves.toMatchObject({
      sparkline: { points: [{ open: '10.22', high: '10.36', low: '10.18', close: '10.31' }] },
    })
  })

  it('rejects a successful response that does not match StockOverview', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ...stockOverview, sparkline: { period: '30d', points: [] } }), { status: 200 }),
    )

    await expect(fetchStockOverview(stockOverview.symbol)).rejects.toMatchObject<Partial<ApiError>>({
      kind: 'invalid-payload',
    })
  })

  it('preserves the unified backend error for missing stocks', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: 'NOT_FOUND', message: '股票不存在' }), { status: 404 }),
    )

    await expect(fetchStockOverview(stockOverview.symbol)).rejects.toMatchObject<Partial<ApiError>>({
      kind: 'backend',
      status: 404,
      payload: { code: 'NOT_FOUND', message: '股票不存在' },
    })
  })
})
