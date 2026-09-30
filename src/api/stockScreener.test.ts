import { afterEach, describe, expect, it, vi } from 'vitest'
import { SyncApiError } from './syncTasks'
import { stockScreenerApi, type StockScreenerResponse } from './stockScreener'

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function screenerResponse(overrides: Partial<StockScreenerResponse> = {}): StockScreenerResponse {
  return {
    data_as_of: '2026-09-26',
    category: null,
    universe: { total: 2356, category_members: null, evaluable: 2180 },
    items: [{
      symbol: '000001.SZ', name: '平安银行', close: 10.52,
      return: { period: 20, value_percent: 3.21 },
      average_volume: { period: 20, value: 1234000 }, data_as_of: '2026-09-26',
    }],
    pagination: { page: 1, page_size: 20, total: 1 },
    ...overrides,
  }
}

afterEach(() => vi.restoreAllMocks())

describe('stockScreenerApi', () => {
  it('请求确认的条件选股接口并保留可空指标语义', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(screenerResponse({ items: [{
      symbol: '600519.SH', name: '贵州茅台', close: 1505,
      return: null, average_volume: null, data_as_of: '2026-09-26',
    }] })))
    vi.stubGlobal('fetch', fetchMock)

    const result = await stockScreenerApi.listStocks({ price_min: 10, return_min: -5, return_period: 5, page: 2 })

    expect(result.items[0]).toMatchObject({ symbol: '600519.SH', return: null, average_volume: null })
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/stocks/screener?price_min=10&return_period=5&return_min=-5&page=2&page_size=20')
  })

  it('在请求前拒绝未填写条件和非法范围', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(stockScreenerApi.listStocks({ page: 1 })).rejects.toMatchObject({ category: 'validation', code: 'INVALID_REQUEST' })
    await expect(stockScreenerApi.listStocks({ price_min: 20, price_max: 10 })).rejects.toMatchObject({ category: 'validation', code: 'INVALID_REQUEST' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('拒绝不符合契约的响应且不回退静态候选', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ ...screenerResponse(), items: [{ ...screenerResponse().items[0], data_as_of: 'bad' }] })))

    await expect(stockScreenerApi.listStocks({ price_min: 10 })).rejects.toBeInstanceOf(SyncApiError)
    await expect(stockScreenerApi.listStocks({ price_min: 10 })).rejects.toMatchObject({ category: 'contract' })
  })

  it('接受无可用日线时契约允许的空数据日期', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      data_as_of: null,
      category: null,
      universe: { total: 0, category_members: null, evaluable: 0 },
      items: [],
      pagination: { page: 1, page_size: 20, total: 0 },
    })))

    await expect(stockScreenerApi.listStocks({ price_min: 10 })).resolves.toMatchObject({ data_as_of: null, items: [] })
  })

  it('将依赖不可用和网络失败映射为可识别错误', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(response({ code: 'DATA_SOURCE_UNAVAILABLE', message: '数据不可用' }, 503))
      .mockRejectedValueOnce(new Error('offline')))

    await expect(stockScreenerApi.listStocks({ price_min: 10 })).rejects.toMatchObject({ category: 'unavailable', status: 503 })
    await expect(stockScreenerApi.listStocks({ price_min: 10 })).rejects.toMatchObject({ category: 'network' })
  })

  it('读取真实申万行业目录并支持名称搜索', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      provider: 'tushare', source: 'sw', category_data_as_of: '2026-09-28',
      items: [{ provider: 'tushare', source: 'sw', type: 'industry', code: '850811.SI', name: '电子设备', member_count: 92, category_data_as_of: '2026-09-28' }],
      pagination: { page: 1, page_size: 50, total: 1 },
    })))

    await expect(stockScreenerApi.listCategories({ keyword: '电子' })).resolves.toMatchObject({ items: [{ code: '850811.SI', type: 'industry' }] })
    expect(fetch).toHaveBeenCalledWith('/api/v1/stocks/screener/categories?keyword=%E7%94%B5%E5%AD%90&page=1&page_size=50')
  })
})
