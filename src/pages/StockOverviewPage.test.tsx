import { render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { fetchStockOverview } from '../api/stockOverview'
import { StockOverviewPage } from './StockOverviewPage'

vi.mock('../api/stockOverview', () => ({
  fetchStockOverview: vi.fn(),
}))

const fetchStockOverviewMock = vi.mocked(fetchStockOverview)

const stockOverview = {
  symbol: '000001.SZ',
  name: '平安银行',
  industry: '银行',
  quote: { last: '10.31', change: '0.09', change_pct: '0.88', as_of: '2024-06-28' },
  metrics: {
    market_cap: { value: '203425.00', as_of: '2024-06-28', basis: 'latest_daily_basic' as const },
    pe_ttm: { value: null, as_of: '2024-06-28', basis: 'ttm' as const },
    pb: { value: '0.48', as_of: '2024-06-28', basis: 'latest_daily_basic' as const },
    roe: { value: '10.84', as_of: '2024-06-28', basis: 'latest_report' as const },
  },
  sparkline: {
    period: '20d' as const,
    points: Array.from({ length: 20 }, (_, index) => ({
      trade_date: `2024-06-${String(index + 3).padStart(2, '0')}`,
      open: (10.16 + index * 0.01).toFixed(2),
      high: (10.24 + index * 0.01).toFixed(2),
      low: (10.12 + index * 0.01).toFixed(2),
      close: (10.18 + index * 0.01).toFixed(2),
    })),
  },
}

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}{location.search}</output>
}

function renderStockPage(path = '/stocks/000001.SZ', history?: string[]) {
  return render(
    <MemoryRouter initialEntries={history ?? [path]} initialIndex={history ? history.length - 1 : undefined}>
      <Routes>
        <Route path="/market" element={<h1>市场概览</h1>} />
        <Route path="/stocks/:symbol" element={<StockOverviewPage />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  )
}

describe('StockOverviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchStockOverviewMock.mockResolvedValue(stockOverview)
  })

  it('shows a loading state while requesting the raw route symbol', () => {
    fetchStockOverviewMock.mockReturnValue(new Promise(() => undefined))

    renderStockPage()

    expect(screen.getByRole('heading', { name: '股票详情' })).toBeInTheDocument()
    expect(screen.getByText('正在请求 /api/v1/stocks/000001.SZ')).toBeInTheDocument()
    expect(fetchStockOverviewMock).toHaveBeenCalledWith('000001.SZ', expect.any(AbortSignal))
  })

  it('renders the real overview, metric dates and basis, price movement, and 20-day trend charts', async () => {
    renderStockPage()

    expect(await screen.findByRole('heading', { name: '平安银行' })).toBeInTheDocument()
    expect(screen.getByText('000001.SZ')).toBeInTheDocument()
    expect(screen.getByText('银行')).toBeInTheDocument()
    expect(screen.getByText('10.31')).toBeInTheDocument()
    expect(screen.getByText('+0.09')).toBeInTheDocument()
    expect(screen.getByText('+0.88%')).toBeInTheDocument()
    expect(screen.getAllByText('上涨').length).toBeGreaterThan(0)
    expect(screen.getByText('PE（TTM）')).toBeInTheDocument()
    expect(screen.getByText('滚动十二个月 · ttm')).toBeInTheDocument()
    expect(screen.getByText('最新报告期 · latest_report')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '近 20 个交易日收盘价折线' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '近 20 个交易日 K 线（开盘、最高、最低、收盘）' })).toBeInTheDocument()
    expect(screen.getByText('阳线：收盘高于开盘')).toBeInTheDocument()
    expect(screen.getByText('2024-06-03')).toBeInTheDocument()
    expect(screen.getByText('2024-06-22')).toBeInTheDocument()
    expect(screen.queryByText(/Coming Soon/i)).not.toBeInTheDocument()
  })

  it('shows nullable metrics and an independent empty sparkline state', async () => {
    fetchStockOverviewMock.mockResolvedValue({ ...stockOverview, sparkline: { period: '20d', points: [] } })

    renderStockPage()

    expect(await screen.findByText('暂无数据')).toBeInTheDocument()
    expect(screen.getByText('接口已响应，但暂无可用的 20 日 OHLC 走势。')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: '近 20 个交易日收盘价折线' })).not.toBeInTheDocument()
    expect(screen.getAllByText('2024-06-28').length).toBeGreaterThan(0)
    expect(screen.getByText('滚动十二个月 · ttm')).toBeInTheDocument()
  })

  it('maps invalid symbols to a recoverable 400 state', async () => {
    fetchStockOverviewMock.mockRejectedValue(new ApiError('backend', '后端返回统一 API 错误', {
      status: 400,
      payload: { code: 'VALIDATION_ERROR', message: '股票代码参数无效' },
    }))

    renderStockPage('/stocks/bad')

    expect(await screen.findByRole('alert')).toHaveTextContent('股票标识无效')
    expect(screen.getByRole('alert')).toHaveTextContent('股票代码参数无效')
    expect(within(screen.getByRole('alert')).getByRole('button', { name: '返回 Markets' })).toBeInTheDocument()
  })

  it('maps missing stocks to a Markets return entry', async () => {
    fetchStockOverviewMock.mockRejectedValue(new ApiError('backend', '后端返回统一 API 错误', {
      status: 404,
      payload: { code: 'NOT_FOUND', message: '股票不存在' },
    }))
    const user = userEvent.setup()

    renderStockPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('股票不存在')
    await user.click(within(screen.getByRole('alert')).getByRole('button', { name: '返回 Markets' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/market')
  })

  it('retries service or network errors without displaying substitute data', async () => {
    fetchStockOverviewMock
      .mockRejectedValueOnce(new ApiError('network', '无法连接 API 服务'))
      .mockResolvedValueOnce(stockOverview)
    const user = userEvent.setup()

    renderStockPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('股票详情暂不可用')
    expect(screen.getByRole('alert')).toHaveTextContent('页面不会使用替代数据')
    await user.click(screen.getByRole('button', { name: '重试加载' }))
    expect(await screen.findByRole('heading', { name: '平安银行' })).toBeInTheDocument()
    expect(fetchStockOverviewMock).toHaveBeenCalledTimes(2)
  })

  it('treats a backend 503 dependency error as retryable', async () => {
    fetchStockOverviewMock.mockRejectedValue(new ApiError('backend', '后端返回统一 API 错误', {
      status: 503,
      payload: { code: 'DEPENDENCY_UNAVAILABLE', message: '股票详情数据不可用' },
    }))

    renderStockPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('股票详情暂不可用')
    expect(screen.getByRole('alert')).toHaveTextContent('DEPENDENCY_UNAVAILABLE · HTTP 503')
    expect(screen.getByRole('button', { name: '重试加载' })).toBeInTheDocument()
  })

  it('uses browser history to restore the original Markets query', async () => {
    const user = userEvent.setup()

    renderStockPage('/stocks/000001.SZ', [
      '/market?ranking_metric=loss&ranking_page=2&ranking_page_size=10',
      '/stocks/000001.SZ',
    ])

    await screen.findByRole('heading', { name: '平安银行' })
    await user.click(screen.getByRole('button', { name: '返回 Markets' }))

    expect(screen.getByTestId('location')).toHaveTextContent('/market?ranking_metric=loss&ranking_page=2&ranking_page_size=10')
  })
})
