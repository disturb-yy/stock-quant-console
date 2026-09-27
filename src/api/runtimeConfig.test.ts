import { afterEach, describe, expect, it, vi } from 'vitest'
import { SyncApiError } from './syncTasks'
import { runtimeConfigApi } from './runtimeConfig'

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const runtimeConfig = {
  data_source: { provider: 'tushare', mode: 'external' },
  features: { market_quotes: false, stock_catalog: true, sync_tasks: true },
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('runtimeConfigApi', () => {
  it('only uses the explicit local mock adapter in mock mode', async () => {
    vi.stubEnv('VITE_STOCK_DATA_API_MODE', 'mock')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(runtimeConfigApi.get()).resolves.toMatchObject({ data_source: { provider: 'mock', mode: 'mock' } })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reads the runtime config endpoint in real mode', async () => {
    vi.stubEnv('VITE_STOCK_DATA_API_MODE', 'real')
    const fetchMock = vi.fn().mockResolvedValue(response(runtimeConfig))
    vi.stubGlobal('fetch', fetchMock)

    await expect(runtimeConfigApi.get()).resolves.toEqual(runtimeConfig)
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/runtime-config')
  })

  it('rejects invalid responses and does not fall back after a real request fails', async () => {
    vi.stubEnv('VITE_STOCK_DATA_API_MODE', 'real')
    const fetchMock = vi.fn().mockResolvedValue(response({ data_source: runtimeConfig.data_source }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(runtimeConfigApi.get()).rejects.toBeInstanceOf(SyncApiError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
