import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiRequest, describeApiError } from './client'

describe('apiRequest', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('sends relative JSON requests with centralized headers', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'run-1' }), { status: 200 }),
    )

    await expect(apiRequest<{ id: string }>('/api/v1/runs', {
      method: 'POST',
      json: { name: 'demo' },
    })).resolves.toEqual({ id: 'run-1' })

    const [, init] = fetchSpy.mock.calls[0]
    expect(init?.method).toBe('POST')
    expect(init?.body).toBe(JSON.stringify({ name: 'demo' }))
    expect(new Headers(init?.headers).get('Accept')).toBe('application/json')
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json')
  })

  it('classifies network failures without a fallback value', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))

    await expect(apiRequest('/api/v1/health')).rejects.toMatchObject({
      kind: 'network',
      message: '无法连接 API 服务',
    })
  })

  it('classifies cancellation as an API error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new DOMException('cancelled', 'AbortError'))

    await expect(apiRequest('/api/v1/health')).rejects.toMatchObject<Partial<ApiError>>({
      kind: 'aborted',
    })
  })

  it('preserves HTTP status and JSON payload', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ unexpected: true }), { status: 404 }),
    )

    await expect(apiRequest('/api/v1/missing')).rejects.toMatchObject<Partial<ApiError>>({
      kind: 'http',
      status: 404,
      payload: { unexpected: true },
    })
  })

  it('classifies the generated backend error shape by default', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: 'NOT_FOUND', message: '请求的资源不存在' }), { status: 404 }),
    )

    await expect(apiRequest('/api/v1/missing')).rejects.toMatchObject({
      kind: 'backend',
      status: 404,
      payload: { code: 'NOT_FOUND', message: '请求的资源不存在' },
    })
  })

  it('classifies a backend payload only through its contract parser', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: 'RUN_NOT_FOUND', message: '任务不存在' }), { status: 404 }),
    )

    const isBackendError = (value: unknown): value is { code: string; message: string } => {
      return typeof value === 'object' && value !== null && 'code' in value && typeof value.code === 'string'
    }

    await expect(apiRequest('/api/v1/runs/run-1', { parseError: isBackendError })).rejects.toMatchObject({
      kind: 'backend',
      status: 404,
      payload: { code: 'RUN_NOT_FOUND', message: '任务不存在' },
    })
  })

  it('lets the OpenAPI-bound formatter expose backend diagnostics without guessing fields', () => {
    const error = new ApiError('backend', '后端返回统一 API 错误', {
      status: 422,
      payload: { code: 'INVALID_RUN', message: '任务参数无效', details: { field: 'name' } },
    })

    expect(describeApiError(error, (payload, status) => {
      const value = payload as { code: string; message: string; details: unknown }
      return {
        message: value.message,
        diagnostic: `${value.code} · HTTP ${status} · ${JSON.stringify(value.details)}`,
      }
    })).toEqual({
      message: '任务参数无效',
      diagnostic: 'INVALID_RUN · HTTP 422 · {"field":"name"}',
    })
  })

  it('distinguishes invalid JSON from a valid HTTP error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('not-json', { status: 200 }))

    await expect(apiRequest('/api/v1/health')).rejects.toMatchObject({ kind: 'invalid-json' })
  })

  it('keeps invalid JSON distinct even when the server returns an error status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('upstream failure', { status: 502 }))

    await expect(apiRequest('/api/v1/health')).rejects.toMatchObject({
      kind: 'invalid-json',
      status: 502,
    })
  })

  it('rejects an invalid success payload', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ready: true }), { status: 200 }),
    )

    const isHealth = (value: unknown): value is { status: string } => {
      return typeof value === 'object' && value !== null && 'status' in value && typeof value.status === 'string'
    }

    await expect(apiRequest('/api/v1/health', { validateResponse: isHealth })).rejects.toMatchObject({
      kind: 'invalid-payload',
    })
  })

  it('rejects absolute paths so callers stay on the configured relative API boundary', async () => {
    await expect(apiRequest('https://example.test/api/v1/health')).rejects.toThrow('必须是相对路径')
  })
})
