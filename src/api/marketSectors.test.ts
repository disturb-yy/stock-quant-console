import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './client'
import { fetchMarketSectors, isMarketSectors } from './marketSectors'

const sectors = {
  as_of: '2024-06-28',
  source: { mode: 'demo' as const, provider: 'mysql-demo-fixture' as const, seed_version: 'mkt-002-demo-v1' },
  sectors: [
    {
      code: 'BANK',
      name: '银行',
      change_percent: '0.88',
      component_count: 1,
      leader: { code: '000001.SZ', name: '平安银行', change_percent: '0.88' },
    },
  ],
}

describe('fetchMarketSectors', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('requests the real relative industry endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(sectors), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchMarketSectors()).resolves.toEqual(sectors)
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/markets/sectors', expect.any(Object))
  })

  it('rejects a successful response that does not match the OpenAPI payload', async () => {
    const invalid = { ...sectors, sectors: [{ ...sectors.sectors[0], leader: null }] }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(invalid), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchMarketSectors()).rejects.toMatchObject<Partial<ApiError>>({ kind: 'invalid-payload' })
    expect(isMarketSectors(invalid)).toBe(false)
  })

  it('preserves the backend error contract for unavailable industry data', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 'DEPENDENCY_UNAVAILABLE', message: '行业数据暂不可用' }), { status: 503 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchMarketSectors()).rejects.toMatchObject<Partial<ApiError>>({
      kind: 'backend',
      status: 503,
      payload: { code: 'DEPENDENCY_UNAVAILABLE', message: '行业数据暂不可用' },
    })
  })
})
