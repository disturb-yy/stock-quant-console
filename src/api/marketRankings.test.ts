import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './client'
import { buildMarketRankingsQuery, fetchMarketRankings, isMarketRankings } from './marketRankings'

const rankings = {
  metric: 'gain' as const,
  as_of: '2024-06-28',
  source: { mode: 'demo' as const, provider: 'mysql-demo-fixture' as const, seed_version: 'fnd-003-demo-v4' },
  data: [
    {
      rank: 1,
      code: '300750.SZ',
      name: '宁德时代',
      value: '1.42',
      close: '190.120000',
      change: '2.67',
      change_percent: '1.42',
      turnover_amount: '7633021600.000000',
      turnover_rate: '3.540000',
    },
  ],
  pagination: { page: 1, page_size: 5, total: 10, total_pages: 2 },
}

describe('fetchMarketRankings', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('serializes the generated API contract with the backend page_size parameter', () => {
    expect(buildMarketRankingsQuery({ metric: 'turnover_rate', page: 2, pageSize: 20 })).toBe(
      'metric=turnover_rate&page=2&page_size=20',
    )
  })

  it('requests the real relative rankings endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(rankings), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchMarketRankings({ metric: 'gain', page: 1, pageSize: 5 })).resolves.toEqual(rankings)
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/markets/rankings?metric=gain&page=1&page_size=5', expect.any(Object))
  })

  it('rejects a successful response that does not match the generated Rankings schema', async () => {
    const invalid = { ...rankings, data: [{ ...rankings.data[0], rank: 0 }] }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(invalid), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchMarketRankings({ metric: 'gain', page: 1, pageSize: 5 })).rejects.toMatchObject<Partial<ApiError>>({
      kind: 'invalid-payload',
    })
    expect(isMarketRankings(invalid)).toBe(false)
  })

  it('preserves the backend pagination error boundary', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 'INVALID_PAGINATION', message: '分页参数无效' }), { status: 400 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchMarketRankings({ metric: 'gain', page: 1, pageSize: 5 })).rejects.toMatchObject<Partial<ApiError>>({
      kind: 'backend',
      status: 400,
      payload: { code: 'INVALID_PAGINATION', message: '分页参数无效' },
    })
  })
})
