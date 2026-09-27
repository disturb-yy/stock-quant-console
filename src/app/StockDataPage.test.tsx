import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stockDataApi, type StockDataResponse } from '../api/stockData'
import { SyncApiError } from '../api/syncTasks'
import { App } from './App'

const available: StockDataResponse = {
  symbol: '600519.SH',
  basic_info: { symbol: '600519.SH', name: '贵州茅台', market: 'SH', status: 'L' },
  daily_bars: [{ trade_date: '2026-09-24', open: 1500, high: 1510, low: 1490, close: 1505, volume: 12345 }],
  availability: { basic_info: 'available', daily_bars: 'available' },
  source: { provider: 'tushare', mode: 'external' },
  updated_at: '2026-09-26T05:57:57Z',
  data_as_of: '2026-09-24',
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.history.replaceState({}, '', '/')
})

beforeEach(() => window.history.replaceState({}, '', '/stocks/600519.SH/data'))

describe('StockDataPage', () => {
  it('显示名称卡片中的来源、有效日、日线和K线图', async () => {
    vi.spyOn(stockDataApi, 'getStockData').mockResolvedValue(available)

    render(<App />)

    expect(screen.queryByRole('heading', { name: '单只股票数据查询' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('股票查询')).not.toBeInTheDocument()
    expect((await screen.findAllByText('贵州茅台')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('A 股').length).toBeGreaterThan(0)
    expect(screen.getAllByText('正常').length).toBeGreaterThan(0)
    expect(screen.getByText('数据来源')).toBeInTheDocument()
    expect(screen.getByText('Tushare（外部）')).toBeInTheDocument()
    expect(screen.getAllByText('2026-09-24').length).toBeGreaterThan(0)
    expect(screen.getByText('1505')).toHaveClass('price-rise')
    expect(screen.getByRole('img', { name: '历史日线 K 线图，共 1 个交易日' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '基础资料' })).not.toBeInTheDocument()
  })

  it('下跌日线的价格使用绿色', async () => {
    vi.spyOn(stockDataApi, 'getStockData').mockResolvedValue({
      ...available,
      daily_bars: [{ trade_date: '2026-09-24', open: 1505, high: 1510, low: 1490, close: 1500, volume: 12345 }],
    })

    render(<App />)

    expect(await screen.findByText('1500')).toHaveClass('price-fall')
  })

  it('历史日线表按交易日倒序展示最新日期', async () => {
    vi.spyOn(stockDataApi, 'getStockData').mockResolvedValue({
      ...available,
      daily_bars: [
        { trade_date: '2026-09-23', open: 1490, high: 1500, low: 1480, close: 1495, volume: 10000 },
        { trade_date: '2026-09-24', open: 1500, high: 1510, low: 1490, close: 1505, volume: 12345 },
      ],
    })

    render(<App />)

    const table = await screen.findByRole('table', { name: '历史日线数据' })
    const tradeDates = within(table).getAllByRole('cell', { name: /2026-/ }).map((cell) => cell.textContent)
    expect(tradeDates).toEqual(['2026-09-24', '2026-09-23'])
  })

  it('显示部分可用和日线空状态，不生成占位数据', async () => {
    vi.spyOn(stockDataApi, 'getStockData').mockResolvedValue({ ...available, daily_bars: [], availability: { basic_info: 'available', daily_bars: 'empty' } })

    render(<App />)

    expect(await screen.findByText('部分可用')).toBeInTheDocument()
    expect(screen.getByText('暂无历史日线数据，请先完成历史日线同步。')).toBeInTheDocument()
    expect(screen.queryByText('1505')).not.toBeInTheDocument()
  })

  it('校验日期并展示未找到错误', async () => {
    const getStockData = vi.spyOn(stockDataApi, 'getStockData').mockRejectedValue(new SyncApiError('股票不存在', 'not_found', 404, 'STOCK_NOT_FOUND'))
    render(<App />)
    expect((await screen.findAllByText('未找到该股票，请检查股票标识后重试')).length).toBeGreaterThan(0)

    fireEvent.change(screen.getByLabelText('开始日期'), { target: { value: '2026-09-25' } })
    fireEvent.click(screen.getByRole('button', { name: '查询' }))
    expect(screen.getByText('开始日期和结束日期需要同时填写')).toBeInTheDocument()
    expect(getStockData).toHaveBeenCalledTimes(1)
  })

  it('显示空数据并提供返回股票目录链接', async () => {
    vi.spyOn(stockDataApi, 'getStockData').mockResolvedValue({ ...available, basic_info: null, daily_bars: [], availability: { basic_info: 'empty', daily_bars: 'empty' }, source: null, updated_at: null, data_as_of: null })

    render(<App />)

    expect(await screen.findByText('暂无同步数据')).toBeInTheDocument()
    expect(screen.queryByText('暂无基础资料，请先完成基础资料同步。')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '返回股票目录' })).toHaveAttribute('href', '/stocks')
  })

  it('显示初始加载状态并允许错误后重新查询', async () => {
    let resolveRequest: (value: StockDataResponse) => void = () => undefined
    const pending = new Promise<StockDataResponse>((resolve) => { resolveRequest = resolve })
    const getStockData = vi.spyOn(stockDataApi, 'getStockData').mockReturnValueOnce(pending).mockResolvedValue(available)
    render(<App />)

    expect(screen.getByRole('status')).toHaveTextContent('正在查询股票数据')
    expect(screen.getByRole('button', { name: '查询中…' })).toBeDisabled()
    resolveRequest(available)
    expect((await screen.findAllByText('贵州茅台')).length).toBeGreaterThan(0)

    getStockData.mockRejectedValueOnce(new SyncApiError('数据源不可用', 'unavailable', 503, 'DATA_SOURCE_UNAVAILABLE'))
    fireEvent.click(screen.getByRole('button', { name: '查询' }))
    expect(await screen.findByText('当前数据源不可用，请稍后重试')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '查询' }))
    expect((await screen.findAllByText('贵州茅台')).length).toBeGreaterThan(0)
  })

  it('从详情路径加载指定股票并移除单股搜索入口', async () => {
    const getStockData = vi.spyOn(stockDataApi, 'getStockData').mockResolvedValue(available)
    render(<App />)
    await screen.findAllByText('贵州茅台')

    expect(getStockData).toHaveBeenCalledWith('600519.SH', {})
    expect(screen.queryByLabelText('股票查询')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '返回股票目录' })).toHaveAttribute('href', '/stocks')
  })
})
