import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './client'
import { fetchHealth } from './health'

describe('fetchHealth', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('requests the real health endpoint and parses its stable status', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok' }), { status: 200 }),
    )

    await expect(fetchHealth()).resolves.toEqual({ status: 'ok' })
    const [, init] = fetchSpy.mock.calls[0]
    expect(new Headers(init?.headers).get('Accept')).toBe('application/json')
    expect(init?.signal).toBeUndefined()
  })

  it('surfaces an HTTP failure without a mock fallback', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ unavailable: true }), { status: 503 }),
    )

    await expect(fetchHealth()).rejects.toMatchObject<Partial<ApiError>>({
      kind: 'http',
      message: 'API 请求返回 HTTP 503',
      status: 503,
    })
  })

  it('rejects an invalid success payload', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ready: true }), { status: 200 }))

    await expect(fetchHealth()).rejects.toMatchObject<Partial<ApiError>>({ kind: 'invalid-payload' })
  })
})
