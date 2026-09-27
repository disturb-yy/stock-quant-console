import { afterEach, describe, expect, it, vi } from 'vitest'
import { SyncApiError } from './syncTasks'
import { stockCatalogApi, type StockCatalogResponse } from './stockCatalog'

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function catalogResponse(overrides: Partial<StockCatalogResponse> = {}): StockCatalogResponse {
  return {
    items: [{
      symbol: '600519.SH', name: '贵州茅台', market: 'A', status: 'normal',
      availability: { basic_info: 'available', daily_bars: 'available' }, data_as_of: '2026-09-26',
    }],
    pagination: { page: 1, page_size: 20, total: 1 },
    ...overrides,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('stockCatalogApi mock adapter', () => {
  it('only uses mock when explicitly selected and keeps rows without daily bars', async () => {
    vi.stubEnv('VITE_STOCK_DATA_API_MODE', 'mock')

    const result = await stockCatalogApi.listStocks()

    expect(result.items.map((item) => item.symbol)).toEqual(['000001.SZ', '000858.SZ', '300750.SZ', '600519.SH'])
    expect(result.items[1]).toMatchObject({ availability: { basic_info: 'available', daily_bars: 'empty' }, data_as_of: null })
  })

  it('supports keyword matching, sorting, and pagination in mock mode', async () => {
    vi.stubEnv('VITE_STOCK_DATA_API_MODE', 'mock')

    const result = await stockCatalogApi.listStocks({ keyword: 'SZ', page: 2, page_size: 1, sort_by: 'symbol', sort_order: 'desc' })

    expect(result.items.map((item) => item.symbol)).toEqual(['000858.SZ'])
    expect(result.pagination).toEqual({ page: 2, page_size: 1, total: 3 })
  })
})

describe('stockCatalogApi real adapter', () => {
  it('uses the confirmed relative path and query contract', async () => {
    vi.stubEnv('VITE_STOCK_DATA_API_MODE', 'real')
    const fetchMock = vi.fn().mockResolvedValue(response(catalogResponse()))
    vi.stubGlobal('fetch', fetchMock)

    await stockCatalogApi.listStocks({ keyword: '贵州', page: 2, page_size: 20, sort_by: 'name', sort_order: 'desc' })

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/stocks?keyword=%E8%B4%B5%E5%B7%9E&page=2&page_size=20&sort_by=name&sort_order=desc')
  })

  it('rejects invalid payloads and never falls back to mock on network errors', async () => {
    vi.stubEnv('VITE_STOCK_DATA_API_MODE', 'real')
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('network down'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(stockCatalogApi.listStocks()).rejects.toMatchObject({ category: 'network' })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ items: [], pagination: { page: 1, page_size: 20 } })))
    await expect(stockCatalogApi.listStocks()).rejects.toBeInstanceOf(SyncApiError)
  })

  it('validates page size before making a request', async () => {
    vi.stubEnv('VITE_STOCK_DATA_API_MODE', 'real')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(stockCatalogApi.listStocks({ page_size: 51 })).rejects.toMatchObject({ code: 'INVALID_REQUEST', category: 'validation' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
