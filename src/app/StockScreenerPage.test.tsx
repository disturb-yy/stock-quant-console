import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stockScreenerApi, type StockScreenerResponse } from '../api/stockScreener'
import { SyncApiError } from '../api/syncTasks'
import { App } from './App'

const readyResponse: StockScreenerResponse = {
  data_as_of: '2026-09-26',
  category: null,
  universe: { total: 2356, category_members: null, evaluable: 2180 },
  items: [{
    symbol: '000001.SZ', name: '平安银行', close: 10.52,
    return: { period: 20, value_percent: 3.21 },
    average_volume: { period: 20, value: 1234000 }, data_as_of: '2026-09-26',
  }],
  pagination: { page: 1, page_size: 20, total: 1 },
}

function emptyResponse(): StockScreenerResponse {
  return { ...readyResponse, items: [], pagination: { page: 1, page_size: 20, total: 0 } }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.history.replaceState({}, '', '/')
})

beforeEach(() => {
  window.history.replaceState({}, '', '/screener')
  vi.spyOn(stockScreenerApi, 'listCategories').mockResolvedValue({ provider: 'tushare', source: 'sw', category_data_as_of: '2026-09-28', items: [], pagination: { page: 1, page_size: 50, total: 0 } })
})

describe('StockScreenerPage', () => {
  it('首次进入不自动查询，填写条件后展示结果与动态指标列', async () => {
    const listStocks = vi.spyOn(stockScreenerApi, 'listStocks').mockResolvedValue(readyResponse)
    render(<App />)

    expect(screen.getByRole('heading', { name: '条件选股' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '选股' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('准备开始筛选')).toBeInTheDocument()
    expect(listStocks).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('最小值', { selector: 'input#price_min' }), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText('最小值（%）', { selector: 'input#return_min' }), { target: { value: '-5' } })
    fireEvent.change(screen.getByLabelText('最小值', { selector: 'input#average_volume_min' }), { target: { value: '1000' } })
    fireEvent.click(screen.getByRole('button', { name: '开始筛选' }))

    await waitFor(() => expect(listStocks).toHaveBeenCalledWith({ price_min: 10, return_period: 20, return_min: -5, volume_period: 20, average_volume_min: 1000, page: 1, page_size: 20 }))
    expect(await screen.findByText('平安银行')).toBeInTheDocument()
    expect(screen.getByText('20 日涨跌幅')).toBeInTheDocument()
    expect(screen.getByText('20 日平均成交量')).toBeInTheDocument()
    expect(window.location.search).toContain('price_min=10')
  })

  it('未填写条件或范围非法时不发请求并表达错误', async () => {
    const listStocks = vi.spyOn(stockScreenerApi, 'listStocks').mockResolvedValue(readyResponse)
    render(<App />)

    expect(screen.getByRole('button', { name: '开始筛选' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('最小值', { selector: 'input#price_min' }), { target: { value: '20' } })
    fireEvent.change(screen.getByLabelText('最大值', { selector: 'input#price_max' }), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: '开始筛选' }))

    expect(screen.getByText('最小值不能高于最大值')).toBeInTheDocument()
    expect(listStocks).not.toHaveBeenCalled()
  })

  it('支持无候选、数据不足摘要与进入详情页', async () => {
    vi.spyOn(stockScreenerApi, 'listStocks').mockResolvedValue({ ...emptyResponse(), universe: { total: 10, category_members: null, evaluable: 8 } })
    render(<App />)
    fireEvent.change(screen.getByLabelText('最小值', { selector: 'input#price_min' }), { target: { value: '9999' } })
    fireEvent.click(screen.getByRole('button', { name: '开始筛选' }))

    expect(await screen.findByText('没有符合条件的候选股票')).toBeInTheDocument()
    expect(screen.getByText(/因日线不足未纳入本次可评估范围/)).toBeInTheDocument()

    vi.restoreAllMocks()
    vi.spyOn(stockScreenerApi, 'listStocks').mockResolvedValue(readyResponse)
    fireEvent.click(screen.getByRole('button', { name: '重置条件' }))
    fireEvent.change(screen.getByLabelText('最小值', { selector: 'input#price_min' }), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: '开始筛选' }))
    const detailLink = await screen.findByRole('link', { name: '查看 平安银行（000001.SZ）数据' })
    expect(detailLink).toHaveAttribute('href', expect.stringContaining('/stocks/000001.SZ/data?'))
  })

  it('从带条件和页码的 URL 恢复查询，翻页保留条件', async () => {
    window.history.replaceState({}, '', '/screener?price_min=10&return_period=60&return_min=-5&page=2')
    const listStocks = vi.spyOn(stockScreenerApi, 'listStocks').mockResolvedValue({ ...readyResponse, pagination: { page: 2, page_size: 20, total: 41 } })
    render(<App />)

    await waitFor(() => expect(listStocks).toHaveBeenCalledWith({ price_min: 10, return_period: 60, return_min: -5, page: 2, page_size: 20 }))
    const pagination = screen.getByRole('navigation', { name: '候选股票分页' })
    expect(within(pagination).getByLabelText('页码')).toHaveValue('2')
    fireEvent.change(within(pagination).getByLabelText('页码'), { target: { value: '1' } })
    await waitFor(() => expect(listStocks).toHaveBeenLastCalledWith({ price_min: 10, return_period: 60, return_min: -5, page: 1, page_size: 20 }))
    expect(window.location.search).toContain('return_period=60')
    expect(window.location.search).toContain('page=1')
  })

  it('条件或周期变化后下一次查询回到第 1 页', async () => {
    window.history.replaceState({}, '', '/screener?price_min=10&page=3')
    const listStocks = vi.spyOn(stockScreenerApi, 'listStocks').mockResolvedValue({ ...readyResponse, pagination: { page: 3, page_size: 20, total: 41 } })
    render(<App />)

    await waitFor(() => expect(listStocks).toHaveBeenCalledWith({ price_min: 10, page: 3, page_size: 20 }))
    fireEvent.change(screen.getByLabelText('周期', { selector: 'select#return_period' }), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('最小值（%）', { selector: 'input#return_min' }), { target: { value: '-2' } })
    fireEvent.click(screen.getByRole('button', { name: '开始筛选' }))

    await waitFor(() => expect(listStocks).toHaveBeenLastCalledWith({ price_min: 10, return_period: 5, return_min: -2, page: 1, page_size: 20 }))
    expect(window.location.search).toContain('page=1')
  })

  it('查询失败时保留条件并支持重试', async () => {
    const listStocks = vi.spyOn(stockScreenerApi, 'listStocks')
      .mockRejectedValueOnce(new SyncApiError('数据不可用', 'unavailable', 503, 'DATA_SOURCE_UNAVAILABLE'))
      .mockResolvedValueOnce(readyResponse)
    render(<App />)
    fireEvent.change(screen.getByLabelText('最小值', { selector: 'input#price_min' }), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: '开始筛选' }))

    expect(await screen.findByText('已同步数据查询暂时不可用，请稍后重试')).toBeInTheDocument()
    expect(screen.getByLabelText('最小值', { selector: 'input#price_min' })).toHaveValue(10)
    fireEvent.click(screen.getByRole('button', { name: '重新查询' }))
    expect(await screen.findByText('平安银行')).toBeInTheDocument()
    expect(listStocks).toHaveBeenCalledTimes(2)
  })
})
