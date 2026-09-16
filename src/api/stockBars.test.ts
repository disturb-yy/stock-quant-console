import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchStockBars, isStockBars } from './stockBars'

const stockBars = {
  symbol: '000001.SZ',
  name: '平安银行',
  timeframe: '1d' as const,
  adjust: 'qfq' as const,
  effective_range: { from: '2024-06-03', to: '2024-06-28' },
  bars: [
    {
      trade_date: '2024-06-03',
      open: '10.13',
      high: '10.19',
      low: '10.03',
      close: '10.18',
      volume: 50000000,
      ma5: null,
      ma20: null,
    },
  ],
  benchmark: null,
  source: { mode: 'demo' as const, provider: 'mysql-demo-fixture' as const, seed_version: 'fnd-003-demo-v6' },
}

describe('fetchStockBars', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('requests the encoded raw symbol and real chart query parameters', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(stockBars), { status: 200 }),
    )

    await expect(fetchStockBars('A/B.SZ', {
      range: '60d',
      adjust: 'hfq',
      benchmark: '000300.SH',
    })).resolves.toEqual(stockBars)

    const requestUrl = new URL(String(fetchSpy.mock.calls[0][0]), 'http://localhost')
    expect(requestUrl.pathname).toBe('/api/v1/stocks/A%2FB.SZ/bars')
    expect(requestUrl.searchParams.get('timeframe')).toBe('1d')
    expect(requestUrl.searchParams.get('range')).toBe('60d')
    expect(requestUrl.searchParams.get('adjust')).toBe('hfq')
    expect(requestUrl.searchParams.get('benchmark')).toBe('000300.SH')
  })

  it('omits the optional benchmark and accepts nullable MA fields from the generated contract', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ...stockBars, benchmark: null }), { status: 200 }),
    )

    await expect(fetchStockBars(stockBars.symbol, {
      range: '120d',
      adjust: 'none',
      benchmark: 'none',
    })).resolves.toMatchObject({ bars: [{ ma5: null, ma20: null }] })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0][0]), 'http://localhost')
    expect(requestUrl.searchParams.has('benchmark')).toBe(false)
    expect(isStockBars({ ...stockBars, benchmark: null })).toBe(true)
    expect(isStockBars({ ...stockBars, bars: [{ ...stockBars.bars[0], volume: -1 }] })).toBe(false)
  })
})
