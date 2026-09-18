import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './client'
import { fetchMarketOverview, isMarketOverview } from './marketOverview'

const overview = {
  as_of: '2024-06-28',
  observed_at: '2024-06-28T07:00:00Z',
  source: { mode: 'demo' as const, provider: 'mysql-demo-fixture' as const, seed_version: 'fnd-003-demo-v2' },
  indices: [
    { code: '000001.SH', name: '上证指数', close: '2994.73', change: '-3.89', change_percent: '-0.13' },
  ],
  breadth: { advancing: 2, declining: 1, unchanged: 0 },
  turnover: { amount: '12002494200.00', currency: 'CNY' as const },
}

describe('fetchMarketOverview', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('requests the real relative market overview endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(overview), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchMarketOverview()).resolves.toEqual(overview)
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/markets/overview', expect.any(Object))
  })

  it('rejects a successful response that does not match the OpenAPI payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...overview, breadth: null }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchMarketOverview()).rejects.toMatchObject<Partial<ApiError>>({ kind: 'invalid-payload' })
    expect(isMarketOverview({ ...overview, breadth: null })).toBe(false)
  })

  it('accepts the live Tushare source metadata', () => {
    const tushareOverview = {
      ...overview,
      source: { ...overview.source, mode: 'real' as const, provider: 'tushare' as const, seed_version: 'tushare-20260917' },
    }

    expect(isMarketOverview(tushareOverview)).toBe(true)
  })
})
