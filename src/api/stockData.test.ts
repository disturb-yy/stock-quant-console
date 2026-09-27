import { afterEach, describe, expect, it, vi } from 'vitest'
import { stockDataApi } from './stockData'
import { SyncApiError } from './syncTasks'

const responseBody = {
  symbol: '600519.SH',
  basic_info: { symbol: '600519.SH', name: '贵州茅台', market: 'SH', status: 'L' },
  daily_bars: [{ trade_date: '2026-09-24', open: 1500, high: 1510, low: 1490, close: 1505, volume: 12345 }],
  availability: { basic_info: 'available', daily_bars: 'available' },
  source: { provider: 'tushare', mode: 'external' },
  updated_at: '2026-09-26T05:57:57Z',
  data_as_of: '2026-09-24',
}

afterEach(() => vi.restoreAllMocks())

describe('stockDataApi', () => {
  it('请求真实详情接口并编码股票标识与日期范围', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(responseBody), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await stockDataApi.getStockData('600519.SH', { start_date: '2026-09-01', end_date: '2026-09-24' })

    expect(result.basic_info?.name).toBe('贵州茅台')
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/stocks/600519.SH/data?start_date=2026-09-01&end_date=2026-09-24', expect.objectContaining({ headers: { 'Content-Type': 'application/json' } }))
  })

  it('校验日期范围且不会用本地数据替代真实请求', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(stockDataApi.getStockData('600519.SH', { start_date: '2026-09-25' })).rejects.toMatchObject({ category: 'validation' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('将未找到、数据源不可用和网络失败映射为可识别错误', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 'STOCK_NOT_FOUND', message: '股票不存在' }), { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 'DATA_SOURCE_UNAVAILABLE', message: '数据源不可用' }), { status: 503 }))
      .mockRejectedValueOnce(new Error('offline')))

    await expect(stockDataApi.getStockData('missing')).rejects.toMatchObject({ category: 'not_found', status: 404 })
    await expect(stockDataApi.getStockData('offline')).rejects.toMatchObject({ category: 'unavailable', status: 503 })
    await expect(stockDataApi.getStockData('offline')).rejects.toMatchObject({ category: 'network' })
  })

  it('拒绝不符合契约的成功响应', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...responseBody, daily_bars: [{ trade_date: 'bad' }] }), { status: 200 })))

    await expect(stockDataApi.getStockData('600519.SH')).rejects.toBeInstanceOf(SyncApiError)
    await expect(stockDataApi.getStockData('600519.SH')).rejects.toMatchObject({ category: 'contract' })
  })
})
