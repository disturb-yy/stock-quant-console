import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchHealth, HealthRequestError } from './health'

describe('fetchHealth', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('requests the real health endpoint and parses its stable status', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok' }), { status: 200 }),
    )

    await expect(fetchHealth()).resolves.toEqual({ status: 'ok' })
    expect(fetchSpy).toHaveBeenCalledWith('/api/v1/health', {
      headers: { Accept: 'application/json' },
      signal: undefined,
    })
  })

  it('surfaces an HTTP failure without a mock fallback', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 503 }))

    await expect(fetchHealth()).rejects.toMatchObject<Partial<HealthRequestError>>({
      kind: 'http',
      message: '健康检查接口返回 HTTP 503',
    })
  })

  it('rejects an invalid success payload', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ready: true }), { status: 200 }))

    await expect(fetchHealth()).rejects.toMatchObject<Partial<HealthRequestError>>({ kind: 'payload' })
  })
})
