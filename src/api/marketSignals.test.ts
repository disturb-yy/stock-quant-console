import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './client'
import { buildSignalQuery, fetchMarketSignals, isMarketSignals } from './marketSignals'

const signals = {
  type: 'volume_surge' as const,
  params: { window: 20 as const, multiple: 1.5 as const },
  as_of: '2024-06-28',
  source: { mode: 'demo' as const, provider: 'mysql-demo-fixture' as const, seed_version: 'fnd-003-demo-v4' },
  signals: [
    { code: '000001.SZ', name: '平安银行', signal: 'volume_surge' as const },
  ],
}

describe('fetchMarketSignals', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('requests the real relative endpoint with OpenAPI query parameters', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(signals), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchMarketSignals({ type: signals.type, params: signals.params })).resolves.toEqual(signals)

    const [path] = fetchMock.mock.calls[0]
    const url = new URL(String(path), 'http://localhost')
    expect(url.pathname).toBe('/api/v1/markets/signals')
    expect(fetchMock.mock.calls[0][1]?.method).toBe('GET')
    expect(url.searchParams.get('type')).toBe('volume_surge')
    expect(JSON.parse(url.searchParams.get('params') ?? '')).toEqual({ window: 20, multiple: 1.5 })
  })

  it('keeps signal query serialization explicit and URL-safe', () => {
    const query = buildSignalQuery({ type: 'strong', params: { window: 60, top_percent: 20 } })
    expect(query).toContain('type=strong')
    expect(query).toContain('params=%7B%22window%22%3A60%2C%22top_percent%22%3A20%7D')
  })

  it('rejects a successful response that does not match the OpenAPI payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...signals, params: null }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchMarketSignals({ type: signals.type, params: signals.params })).rejects.toMatchObject<Partial<ApiError>>({
      kind: 'invalid-payload',
    })
    expect(isMarketSignals({ ...signals, params: null })).toBe(false)
  })

  it('preserves the backend error contract for insufficient history', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 'INSUFFICIENT_HISTORY', message: '历史行情不足' }), { status: 422 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchMarketSignals({ type: 'new_high', params: { window: 120 } })).rejects.toMatchObject<Partial<ApiError>>({
      kind: 'backend',
      status: 422,
      payload: { code: 'INSUFFICIENT_HISTORY', message: '历史行情不足' },
    })
  })
})
