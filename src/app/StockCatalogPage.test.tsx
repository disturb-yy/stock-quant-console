import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SyncApiError } from '../api/syncTasks'
import { stockCatalogApi, type StockCatalogResponse } from '../api/stockCatalog'
import { App } from './App'
import { StockCatalogPage } from './StockCatalogPage'

const readyResponse: StockCatalogResponse = {
  items: [
    {
      symbol: '600519.SH', name: '贵州茅台', market: 'A', status: 'normal',
      availability: { basic_info: 'available', daily_bars: 'available' }, data_as_of: '2026-09-26',
    },
    {
      symbol: '000858.SZ', name: '五粮液', market: 'A', status: 'normal',
      availability: { basic_info: 'available', daily_bars: 'empty' }, data_as_of: null,
    },
  ],
  pagination: { page: 1, page_size: 20, total: 2 },
}

function response(overrides: Partial<StockCatalogResponse> = {}): StockCatalogResponse {
  return { ...readyResponse, ...overrides }
}

beforeEach(() => {
  window.history.replaceState({}, '', '/stocks')
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  window.history.replaceState({}, '', '/')
})

describe('StockCatalogPage', () => {
  it('renders ready rows and keeps a partial daily-bar row visible', async () => {
    vi.spyOn(stockCatalogApi, 'listStocks').mockResolvedValue(response())

    render(<StockCatalogPage />)

    expect(await screen.findByRole('heading', { name: '已同步股票' })).toBeInTheDocument()
    expect(screen.getByText('贵州茅台')).toBeInTheDocument()
    expect(screen.getByText('暂无数据')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.queryByText('搜索股票')).not.toBeInTheDocument()
    expect(screen.queryByText('只展示基础资料已同步的 A 股')).not.toBeInTheDocument()
    expect(screen.queryByText('STOCK CATALOG')).not.toBeInTheDocument()
  })

  it('renders real A-share market and listing status values as user-facing labels', async () => {
    vi.spyOn(stockCatalogApi, 'listStocks').mockResolvedValue(response({
      items: [{
        ...readyResponse.items[0], market: 'SZ', status: 'L',
      }],
      pagination: { page: 1, page_size: 20, total: 1 },
    }))

    render(<StockCatalogPage />)

    expect(await screen.findByText('A 股')).toBeInTheDocument()
    expect(screen.getByText('正常')).toBeInTheDocument()
  })

  it('uses the stock name as the detail link and preserves query state', async () => {
    vi.spyOn(stockCatalogApi, 'listStocks').mockResolvedValue(response())

    render(<App />)
    await screen.findByText('贵州茅台')
    fireEvent.change(screen.getByLabelText('名称或标识'), { target: { value: '茅台' } })
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))

    await waitFor(() => expect(stockCatalogApi.listStocks).toHaveBeenLastCalledWith({ keyword: '茅台', page: 1, page_size: 20, sort_by: 'symbol', sort_order: 'asc' }))
    expect(screen.getByRole('link', { name: '贵州茅台' })).toHaveAttribute('href', '/stocks/600519.SH/data?keyword=%E8%8C%85%E5%8F%B0&page=1&page_size=20&sort_by=symbol&sort_order=asc')
    expect(screen.queryByRole('columnheader', { name: '操作' })).not.toBeInTheDocument()
  })

  it('shows no-results and clears the search condition', async () => {
    vi.spyOn(stockCatalogApi, 'listStocks').mockResolvedValueOnce(response()).mockResolvedValueOnce(response({ items: [], pagination: { page: 1, page_size: 20, total: 0 } })).mockResolvedValueOnce(response())

    render(<StockCatalogPage />)
    await screen.findByText('贵州茅台')
    fireEvent.change(screen.getByLabelText('名称或标识'), { target: { value: '不存在' } })
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    expect(await screen.findByText('没有匹配的股票')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '清空搜索条件' }))
    expect(await screen.findByText('贵州茅台')).toBeInTheDocument()
    expect(screen.getByLabelText('名称或标识')).toHaveValue('')
  })

  it('shows empty state, errors, and retries without changing the query contract', async () => {
    const api = vi.spyOn(stockCatalogApi, 'listStocks')
      .mockResolvedValueOnce(response({ items: [], pagination: { page: 1, page_size: 20, total: 0 } }))
      .mockRejectedValueOnce(new SyncApiError('目录不可用', 'unavailable', 503, 'DATA_SOURCE_UNAVAILABLE'))
      .mockResolvedValueOnce(response())

    render(<StockCatalogPage />)
    expect(await screen.findByText('暂无已同步股票')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '进入同步页面' })).toHaveAttribute('href', '/')

    fireEvent.change(screen.getByLabelText('名称或标识'), { target: { value: '失败' } })
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('股票目录服务暂时不可用')
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }))
    expect(await screen.findByText('贵州茅台')).toBeInTheDocument()
    expect(api).toHaveBeenCalledTimes(3)
  })

  it('shows querying state and requests the next page', async () => {
    let resolveFirst: ((value: StockCatalogResponse) => void) | undefined
    const first = new Promise<StockCatalogResponse>((resolve) => { resolveFirst = resolve })
    const api = vi.spyOn(stockCatalogApi, 'listStocks').mockReturnValueOnce(first).mockResolvedValueOnce(response({ pagination: { page: 2, page_size: 20, total: 21 } }))

    render(<StockCatalogPage />)
    expect(screen.getByRole('status')).toHaveTextContent('正在加载股票目录')
    resolveFirst?.(response({ pagination: { page: 1, page_size: 20, total: 21 } }))
    await screen.findByText('贵州茅台')
    fireEvent.click(screen.getByRole('button', { name: '下一页' }))
    expect(await screen.findByRole('status')).toHaveTextContent('正在更新股票目录')
    expect(screen.getByRole('heading', { name: '股票目录' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /股票标识/ })).toBeInTheDocument()
    await waitFor(() => expect(api).toHaveBeenLastCalledWith({ keyword: '', page: 2, page_size: 20, sort_by: 'symbol', sort_order: 'asc' }))
  })

  it('supports page size, page selection, and table-header sorting controls', async () => {
    const api = vi.spyOn(stockCatalogApi, 'listStocks').mockResolvedValue(response({ pagination: { page: 1, page_size: 20, total: 41 } }))

    render(<StockCatalogPage />)
    await screen.findByText('贵州茅台')

    const pageSizeSelect = screen.getByLabelText('每页条数') as HTMLSelectElement
    expect(pageSizeSelect).toHaveValue('20')
    expect(Array.from(pageSizeSelect.options).map((option) => option.value)).toEqual(['20', '30', '50'])

    fireEvent.change(pageSizeSelect, { target: { value: '30' } })
    await waitFor(() => expect(api).toHaveBeenLastCalledWith({ keyword: '', page: 1, page_size: 30, sort_by: 'symbol', sort_order: 'asc' }))
    fireEvent.change(screen.getByLabelText('页码'), { target: { value: '2' } })
    await waitFor(() => expect(api).toHaveBeenLastCalledWith({ keyword: '', page: 2, page_size: 30, sort_by: 'symbol', sort_order: 'asc' }))

    fireEvent.click(screen.getByRole('button', { name: '股票名称降序' }))
    await waitFor(() => expect(api).toHaveBeenLastCalledWith({ keyword: '', page: 1, page_size: 30, sort_by: 'name', sort_order: 'desc' }))
    fireEvent.click(screen.getByRole('button', { name: '股票名称升序' }))
    await waitFor(() => expect(api).toHaveBeenLastCalledWith({ keyword: '', page: 1, page_size: 30, sort_by: 'name', sort_order: 'asc' }))
    expect(screen.queryByRole('button', { name: '股票名称默认排序' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '股票名称升序' }))
    await waitFor(() => expect(api).toHaveBeenLastCalledWith({ keyword: '', page: 1, page_size: 30, sort_by: 'symbol', sort_order: 'asc' }))
    expect(window.location.search).toContain('page_size=30')
    expect(window.location.search).toContain('sort_by=symbol')
    expect(window.location.search).toContain('sort_order=asc')
  })
})
