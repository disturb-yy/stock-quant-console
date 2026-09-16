import { fireEvent, render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { fetchStockBars } from '../api/stockBars'
import { fetchStockOverview } from '../api/stockOverview'
import { StockOverviewPage } from './StockOverviewPage'

vi.mock('../api/stockOverview', () => ({
  fetchStockOverview: vi.fn(),
}))
vi.mock('../api/stockBars', () => ({
  chartAdjustments: ['none', 'qfq', 'hfq'],
  chartBenchmarks: ['none', '000300.SH'],
  chartRanges: ['20d', '60d', '120d', 'all'],
  fetchStockBars: vi.fn(),
}))

const fetchStockOverviewMock = vi.mocked(fetchStockOverview)
const fetchStockBarsMock = vi.mocked(fetchStockBars)

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

const stockBars = {
  symbol: '000001.SZ',
  name: '平安银行',
  timeframe: '1d' as const,
  adjust: 'none' as const,
  effective_range: { from: '2024-01-15', to: '2024-06-28' },
  bars: Array.from({ length: 20 }, (_, index) => ({
    trade_date: `2024-06-${String(index + 3).padStart(2, '0')}`,
    open: (10.16 + index * 0.01).toFixed(2),
    high: (10.24 + index * 0.01).toFixed(2),
    low: (10.12 + index * 0.01).toFixed(2),
    close: (10.18 + index * 0.01).toFixed(2),
    volume: 50000000 + index * 100000,
    ma5: index < 4 ? null : (10.18 + (index - 2) * 0.01).toFixed(2),
    ma20: index < 19 ? null : '10.28',
  })),
  benchmark: null,
  source: { mode: 'demo' as const, provider: 'mysql-demo-fixture' as const, seed_version: 'fnd-003-demo-v6' },
}

const stockBarsWithBenchmark = {
  ...stockBars,
  benchmark: {
    code: '000300.SH' as const,
    name: '沪深300',
    points: Array.from({ length: 20 }, (_, index) => ({
      trade_date: `2024-06-${String(index + 3).padStart(2, '0')}`,
      close: (3300 + index * 5).toFixed(2),
      stock_return_pct: (index * 0.4).toFixed(2),
      benchmark_return_pct: (index * 0.2).toFixed(2),
      relative_return_pct: (index * 0.2).toFixed(2),
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
    fetchStockBarsMock.mockImplementation(async (_symbol, request) => {
      const response = request.benchmark === '000300.SH' ? stockBarsWithBenchmark : stockBars
      return { ...response, adjust: request.adjust }
    })
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
    expect(screen.getAllByText('2024-06-03').length).toBeGreaterThan(0)
    expect(screen.getAllByText('2024-06-22').length).toBeGreaterThan(0)
    expect(screen.queryByText(/Coming Soon/i)).not.toBeInTheDocument()
  })

  it('renders the research chart and requests URL-restored range, adjustment, and benchmark state', async () => {
    const user = userEvent.setup()
    renderStockPage('/stocks/000001.SZ?chart_range=60d&chart_adjust=qfq&chart_benchmark=000300.SH')

    expect(await screen.findByRole('heading', { name: '行情' })).toBeInTheDocument()
    expect(screen.getByLabelText('行情时间范围')).toHaveValue('60d')
    expect(screen.getByLabelText('复权方式')).toHaveValue('qfq')
    expect(screen.getByRole('button', { name: '沪深 300' })).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByRole('img', { name: '日 K 线与均线' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '成交量' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '沪深 300 相对表现' })).toBeInTheDocument()
    expect(fetchStockBarsMock).toHaveBeenCalledWith(
      '000001.SZ',
      { range: '60d', adjust: 'qfq', benchmark: '000300.SH' },
      expect.any(AbortSignal),
    )

    await user.selectOptions(screen.getByLabelText('行情时间范围'), '20d')
    await screen.findByText('所选范围：20 日')
    expect(fetchStockBarsMock).toHaveBeenLastCalledWith(
      '000001.SZ',
      { range: '20d', adjust: 'qfq', benchmark: '000300.SH' },
      expect.any(AbortSignal),
    )
    expect(screen.getByTestId('location')).toHaveTextContent('chart_range=20d')

    await user.selectOptions(screen.getByLabelText('复权方式'), 'hfq')
    expect(fetchStockBarsMock).toHaveBeenLastCalledWith(
      '000001.SZ',
      { range: '20d', adjust: 'hfq', benchmark: '000300.SH' },
      expect.any(AbortSignal),
    )
    await user.click(screen.getByRole('button', { name: '沪深 300' }))
    expect(fetchStockBarsMock).toHaveBeenLastCalledWith(
      '000001.SZ',
      { range: '20d', adjust: 'hfq', benchmark: 'none' },
      expect.any(AbortSignal),
    )
  })

  it('keeps stock charts visible when the requested benchmark has no common dates', async () => {
    fetchStockBarsMock.mockResolvedValue({ ...stockBars, benchmark: { ...stockBarsWithBenchmark.benchmark, points: [] } })

    renderStockPage('/stocks/000001.SZ?chart_benchmark=000300.SH')

    expect(await screen.findByRole('img', { name: '日 K 线与均线' })).toBeInTheDocument()
    expect(screen.getByText('沪深 300 暂无共同交易日')).toBeInTheDocument()
    expect(screen.getByText(/股票行情和成交量仍保留/)).toBeInTheDocument()
  })

  it('treats a missing requested benchmark as an invalid API response', async () => {
    fetchStockBarsMock.mockResolvedValueOnce(stockBars)

    renderStockPage('/stocks/000001.SZ?chart_benchmark=000300.SH')

    expect(await screen.findByRole('alert')).toHaveTextContent('行情暂不可用')
    expect(screen.getByRole('alert')).toHaveTextContent('API 响应与行情查询不一致')
  })

  it('shows an independent empty state and a retryable bars error', async () => {
    fetchStockBarsMock.mockRejectedValueOnce(new ApiError('network', '无法连接 API 服务'))
    const user = userEvent.setup()

    renderStockPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('行情暂不可用')
    expect(screen.getByRole('button', { name: '重试加载行情' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '重试加载行情' }))
    expect(await screen.findByRole('img', { name: '日 K 线与均线' })).toBeInTheDocument()
  })

  it('restores invalid URL chart parameters to visible defaults without requesting invalid values', async () => {
    renderStockPage('/stocks/000001.SZ?chart_range=bad&chart_adjust=bad&chart_benchmark=bad')

    expect(await screen.findByText(/URL 中的 chart_range、chart_adjust、chart_benchmark 无效/)).toBeInTheDocument()
    expect(screen.getByLabelText('行情时间范围')).toHaveValue('120d')
    expect(screen.getByLabelText('复权方式')).toHaveValue('none')
    expect(screen.getByRole('button', { name: '沪深 300' })).toHaveAttribute('aria-pressed', 'false')
    expect(fetchStockBarsMock).toHaveBeenCalledWith(
      '000001.SZ',
      { range: '120d', adjust: 'none', benchmark: 'none' },
      expect.any(AbortSignal),
    )
  })

  it('keeps nullable moving averages honest and exposes focusable point details', async () => {
    const user = userEvent.setup()
    renderStockPage()

    await screen.findByRole('img', { name: '日 K 线与均线' })
    expect(screen.getAllByText(/窗口不足/).length).toBeGreaterThan(0)
    const ma5Toggle = screen.getByRole('button', { name: 'MA5' })
    expect(ma5Toggle).toHaveAttribute('aria-pressed', 'true')
    await user.click(ma5Toggle)
    expect(ma5Toggle).toHaveAttribute('aria-pressed', 'false')

    const firstPoint = screen.getByLabelText(/2024-06-03，开/)
    fireEvent.focus(firstPoint)
    expect(firstPoint).toHaveAttribute('tabindex', '0')
    expect(screen.getByText(/2024-06-03 · 收/)).toBeInTheDocument()
  })

  it('renders a recoverable empty bars state without substitute data', async () => {
    fetchStockBarsMock.mockResolvedValueOnce({ ...stockBars, bars: [], effective_range: { from: null, to: null } })
    const user = userEvent.setup()

    renderStockPage()

    expect(await screen.findByText('所选范围暂无行情数据')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: '日 K 线与均线' })).not.toBeInTheDocument()
    expect(screen.getByText(/有效交易日范围为空/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重试加载行情' }))
    expect(await screen.findByRole('img', { name: '日 K 线与均线' })).toBeInTheDocument()
  })

  it('offers default recovery for a backend validation error', async () => {
    fetchStockBarsMock.mockRejectedValueOnce(new ApiError('backend', '后端返回统一 API 错误', {
      status: 400,
      payload: { code: 'VALIDATION_ERROR', message: '股票行情参数无效' },
    }))
    const user = userEvent.setup()

    renderStockPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('行情查询参数无效')
    await user.click(screen.getByRole('button', { name: '恢复默认查询' }))
    expect(fetchStockBarsMock).toHaveBeenLastCalledWith(
      '000001.SZ',
      { range: '120d', adjust: 'none', benchmark: 'none' },
      expect.any(AbortSignal),
    )
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

  it('replaces chart URL updates so Back skips intermediate research states', async () => {
    const user = userEvent.setup()

    renderStockPage('/stocks/000001.SZ?chart_range=120d', [
      '/market?ranking_metric=loss&ranking_page=2&ranking_page_size=10',
      '/stocks/000001.SZ?chart_range=120d',
    ])

    await screen.findByRole('img', { name: '日 K 线与均线' })
    await user.selectOptions(screen.getByLabelText('行情时间范围'), '20d')
    await user.click(screen.getByRole('button', { name: '返回 Markets' }))

    expect(screen.getByTestId('location')).toHaveTextContent('/market?ranking_metric=loss&ranking_page=2&ranking_page_size=10')
  })
})
