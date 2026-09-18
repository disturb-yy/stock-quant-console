import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './client'
import { createStockPool, getStockPool, listStockPools } from './stockPools'

const pool = {
  id: 7,
  name: '红利观察',
  description: '仅供长期观察。',
  source: 'manual' as const,
  member_count: 0,
  created_at: '2026-09-18T05:00:00Z',
  updated_at: '2026-09-18T05:00:00Z',
}

const listResponse = {
  data: [pool],
  pagination: { page: 2, page_size: 10, total: 11, total_pages: 2 },
}

describe('stock pool API', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('passes the approved create fields to the real relative endpoint', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(pool), { status: 200 }))

    await expect(createStockPool({ name: '红利观察', description: '仅供长期观察。' })).resolves.toEqual(pool)

    expect(fetchSpy).toHaveBeenCalledWith('/api/v1/stock-pools', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ name: '红利观察', description: '仅供长期观察。' }),
    }))
  })

  it('encodes server search and pagination parameters without client-side sorting', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(listResponse), { status: 200 }))

    await expect(listStockPools('A/B & C', 2, 10)).resolves.toEqual(listResponse)

    expect(fetchSpy.mock.calls[0][0]).toBe('/api/v1/stock-pools?q=A%2FB+%26+C&page=2&page_size=10')
  })

  it('uses the original numeric id for detail identity', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(pool), { status: 200 }))

    await getStockPool(7)

    expect(fetchSpy.mock.calls[0][0]).toBe('/api/v1/stock-pools/7')
  })

  it('does not turn an invalid success payload into a pool', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }))

    await expect(listStockPools()).rejects.toMatchObject<Partial<ApiError>>({ kind: 'invalid-payload' })
  })
})
