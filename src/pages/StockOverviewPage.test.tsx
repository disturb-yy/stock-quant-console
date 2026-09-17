import { fireEvent, render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { fetchStockBars } from '../api/stockBars'
import { fetchStockFinancials } from '../api/stockFinancials'
import { fetchStockOverview } from '../api/stockOverview'
import { fetchStockValuation } from '../api/stockValuation'
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
vi.mock('../api/stockFinancials', () => ({
  financialPeriods: ['annual', 'quarterly'],
  financialRanges: ['3y', '5y'],
  fetchStockFinancials: vi.fn(),
}))
vi.mock('../api/stockValuation', () => ({
  valuationRanges: ['3y', '5y'],
  fetchStockValuation: vi.fn(),
}))

const fetchStockOverviewMock = vi.mocked(fetchStockOverview)
const fetchStockBarsMock = vi.mocked(fetchStockBars)
const fetchStockFinancialsMock = vi.mocked(fetchStockFinancials)
const fetchStockValuationMock = vi.mocked(fetchStockValuation)

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

const stockFinancials = {
  symbol: '000001.SZ',
  name: '平安银行',
  period: 'annual' as const,
  requested_range: '5y' as const,
  effective_range: { from: '2022-12-31', to: '2023-12-31' },
  reporting_currency: 'CNY' as const,
  amount_unit: 'CNY' as const,
  latest_report_date: '2023-12-31',
  summary: {
    period_end: '2023-12-31', published_at: '2024-04-30', revenue: '1600.00', revenue_yoy_pct: '11.11',
    net_profit: '272.00', net_profit_yoy_pct: '14.48', gross_margin_pct: '41.00', roe_pct: '23.78',
    operating_cash_flow: '345.00', free_cash_flow: '240.00', debt_to_asset_pct: '45.00', current_ratio: '2.53',
  },
  reports: [
    {
      period_end: '2022-12-31', fiscal_year: 2022, fiscal_quarter: null, published_at: '2023-04-30',
      income: { revenue: '1440.00', gross_profit: '583.20', operating_profit: '368.28', net_profit: '237.60' },
      balance: { cash_and_equivalents: '257.25', accounts_receivable: '183.75', inventory: null, current_assets: '735.00', current_liabilities: '305.00', total_assets: '1940.00', total_liabilities: '892.40', total_equity: '1047.60' },
      cash_flow: { operating_cash_flow: '310.00', capital_expenditure: '94.00', investing_cash_flow: '-68.20', financing_cash_flow: '-31.00', net_cash_change: '210.80' },
      indicators: { revenue_yoy_pct: '12.50', net_profit_yoy_pct: '16.02', gross_margin_pct: '40.50', roe_pct: '22.68', free_cash_flow: '216.00', debt_to_asset_pct: '46.00', current_ratio: '2.41' },
    },
    {
      period_end: '2023-12-31', fiscal_year: 2023, fiscal_quarter: null, published_at: '2024-04-30',
      income: { revenue: '1600.00', gross_profit: '656.00', operating_profit: '421.60', net_profit: '272.00' },
      balance: { cash_and_equivalents: '283.50', accounts_receivable: '202.50', inventory: '243.00', current_assets: '810.00', current_liabilities: '320.00', total_assets: '2080.00', total_liabilities: '936.00', total_equity: '1144.00' },
      cash_flow: { operating_cash_flow: '345.00', capital_expenditure: '105.00', investing_cash_flow: '-75.90', financing_cash_flow: '-34.50', net_cash_change: '234.60' },
      indicators: { revenue_yoy_pct: '11.11', net_profit_yoy_pct: '14.48', gross_margin_pct: '41.00', roe_pct: '23.78', free_cash_flow: '240.00', debt_to_asset_pct: '45.00', current_ratio: '2.53' },
    },
  ],
  source: { mode: 'demo' as const, provider: 'mysql-demo-fixture' as const, seed_version: 'fnd-003-demo-v7', as_of: '2024-06-28' },
}

const valuationMetric = (value: string, position: 'low' | 'middle' | 'high' | null, percentile: string | null) => ({
  current: { value, as_of: '2024-06-28', basis: 'ttm' as const },
  history: [{ as_of: '2023-06-28', value }, { as_of: '2024-06-28', value }],
  percentile: { value: percentile, sample_size: percentile === null ? 0 : 2, range_from: percentile === null ? null : '2023-06-28', range_to: percentile === null ? null : '2024-06-28', method: 'inclusive_rank' as const },
  position,
})

const stockValuation = {
  symbol: '000001.SZ',
  name: '平安银行',
  requested_range: '5y' as const,
  effective_range: { from: '2023-06-28', to: '2024-06-28' },
  as_of: '2024-06-28',
  metrics: {
    pe_ttm: valuationMetric('7.40', 'high', '100.00'),
    pb: { ...valuationMetric('0.52', null, null), current: { value: '0.52', as_of: '2024-06-28', basis: 'latest_daily_basic' as const } },
    ps_ttm: valuationMetric('1.40', 'middle', '50.00'),
  },
  industry_comparisons: [{
    industry: { code: 'BANK', name: '银行' },
    as_of: '2024-06-28',
    metrics: {
      pe_ttm: { value: '6.00', sample_size: 3 },
      pb: { value: null, sample_size: 1 },
      ps_ttm: { value: '1.20', sample_size: 3 },
    },
  }],
  source: { mode: 'demo' as const, provider: 'mysql-demo-fixture' as const, seed_version: 'fnd-003-demo-v8', as_of: '2024-06-28' },
}

const emptyValuation = {
  ...stockValuation,
  effective_range: { from: null, to: null },
  as_of: null,
  metrics: {
    pe_ttm: { current: { value: null, as_of: null, basis: null }, history: [], percentile: { value: null, sample_size: 0, range_from: null, range_to: null, method: 'inclusive_rank' as const }, position: null },
    pb: { current: { value: null, as_of: null, basis: null }, history: [], percentile: { value: null, sample_size: 0, range_from: null, range_to: null, method: 'inclusive_rank' as const }, position: null },
    ps_ttm: { current: { value: null, as_of: null, basis: null }, history: [], percentile: { value: null, sample_size: 0, range_from: null, range_to: null, method: 'inclusive_rank' as const }, position: null },
  },
  industry_comparisons: [],
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
    fetchStockFinancialsMock.mockImplementation(async (_symbol, request) => ({
      ...stockFinancials,
      period: request.period,
      requested_range: request.range,
    }))
    fetchStockValuationMock.mockImplementation(async (_symbol, request) => ({
      ...stockValuation,
      requested_range: request.range,
    }))
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
    expect(screen.getAllByText('银行').length).toBeGreaterThan(0)
    expect(screen.getByText('10.31')).toBeInTheDocument()
    expect(screen.getByText('+0.09')).toBeInTheDocument()
    expect(screen.getByText('+0.88%')).toBeInTheDocument()
    expect(screen.getAllByText('上涨').length).toBeGreaterThan(0)
    expect(screen.getAllByText('PE（TTM）').length).toBeGreaterThan(0)
    expect(screen.getAllByText('滚动十二个月 · ttm').length).toBeGreaterThan(0)
    expect(screen.getByText('最新报告期 · latest_report')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '近 20 个交易日收盘价折线' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '近 20 个交易日 K 线（开盘、最高、最低、收盘）' })).toBeInTheDocument()
    expect(screen.getByText('阳线：收盘高于开盘')).toBeInTheDocument()
    expect(screen.getAllByText('2024-06-03').length).toBeGreaterThan(0)
    expect(screen.getAllByText('2024-06-22').length).toBeGreaterThan(0)
    expect(screen.queryByText(/Coming Soon/i)).not.toBeInTheDocument()
  })

  it('renders financial summaries, reported trends, statements, null semantics, and URL-restored controls', async () => {
    const user = userEvent.setup()
    renderStockPage('/stocks/000001.SZ?financial_period=quarterly&financial_range=3y')

    expect(await screen.findByRole('heading', { name: '财务' })).toBeInTheDocument()
    expect(screen.getByLabelText('财务报告口径')).toHaveValue('quarterly')
    expect(screen.getByLabelText('财务观察范围')).toHaveValue('3y')
    expect(screen.getByText('最新财务摘要')).toBeInTheDocument()
    expect(screen.getByText('财务趋势')).toBeInTheDocument()
    expect(screen.getByText('简化利润表')).toBeInTheDocument()
    expect(screen.getByText('简化资产负债表')).toBeInTheDocument()
    expect(screen.getByText('简化现金流量表')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '营业收入趋势，单位 CNY' })).toBeInTheDocument()
    expect(screen.getAllByText('暂无披露').length).toBeGreaterThan(0)
    expect(fetchStockFinancialsMock).toHaveBeenCalledWith(
      '000001.SZ',
      { period: 'quarterly', range: '3y' },
      expect.any(AbortSignal),
    )

    await user.selectOptions(screen.getByLabelText('财务报告口径'), 'annual')
    await screen.findByText('口径：年度')
    expect(fetchStockFinancialsMock).toHaveBeenLastCalledWith(
      '000001.SZ',
      { period: 'annual', range: '3y' },
      expect.any(AbortSignal),
    )
    expect(screen.getByTestId('location')).toHaveTextContent('financial_period=annual')
  })

  it('recovers invalid financial URL values without requesting an invalid combination', async () => {
    renderStockPage('/stocks/000001.SZ?financial_period=monthly&financial_range=10y')

    expect(await screen.findByRole('heading', { name: '财务' })).toBeInTheDocument()
    expect(screen.getByLabelText('财务报告口径')).toHaveValue('annual')
    expect(screen.getByLabelText('财务观察范围')).toHaveValue('5y')
    expect(screen.getByText('URL 中的 financial_period、financial_range 无效，已恢复为默认查询。')).toBeInTheDocument()
    expect(fetchStockFinancialsMock).toHaveBeenLastCalledWith(
      '000001.SZ',
      { period: 'annual', range: '5y' },
      expect.any(AbortSignal),
    )
  })

  it('shows a recoverable empty financial result without synthesizing a summary', async () => {
    fetchStockFinancialsMock.mockResolvedValueOnce({ ...stockFinancials, reports: [], summary: null, effective_range: { from: null, to: null }, latest_report_date: null })

    renderStockPage()

    expect(await screen.findByText('所选口径和范围暂无财务数据，请调整查询范围后重试。')).toBeInTheDocument()
    expect(screen.queryByText('最新财务摘要')).not.toBeInTheDocument()
  })

  it('renders valuation metrics and restores the range from the URL', async () => {
    const user = userEvent.setup()
    renderStockPage('/stocks/000001.SZ?valuation_range=3y')

    const valuationSection = await screen.findByRole('region', { name: '估值' })
    expect(within(valuationSection).getByLabelText('估值历史范围')).toHaveValue('3y')
    expect(within(valuationSection).getByText('7.40x')).toBeInTheDocument()
    expect(within(valuationSection).getByText('相对自身历史偏高')).toBeInTheDocument()
    expect(within(valuationSection).getByText('行业有效同行样本不足（1）')).toBeInTheDocument()
    expect(fetchStockValuationMock).toHaveBeenCalledWith(
      '000001.SZ',
      { range: '3y' },
      expect.any(AbortSignal),
    )

    await user.selectOptions(within(valuationSection).getByLabelText('估值历史范围'), '5y')
    expect(fetchStockValuationMock).toHaveBeenLastCalledWith(
      '000001.SZ',
      { range: '5y' },
      expect.any(AbortSignal),
    )
    expect(screen.getByTestId('location')).toHaveTextContent('valuation_range=5y')
  })

  it('recovers an invalid valuation URL without requesting an invalid range', async () => {
    renderStockPage('/stocks/000001.SZ?valuation_range=10y')

    const valuationSection = await screen.findByRole('region', { name: '估值' })
    expect(within(valuationSection).getByLabelText('估值历史范围')).toHaveValue('5y')
    expect(within(valuationSection).getByText('URL 中的 valuation_range 无效，已恢复为默认范围。')).toBeInTheDocument()
    expect(fetchStockValuationMock).toHaveBeenLastCalledWith(
      '000001.SZ',
      { range: '5y' },
      expect.any(AbortSignal),
    )
  })

  it('shows a recoverable empty valuation result without synthesizing metrics', async () => {
    fetchStockValuationMock.mockResolvedValueOnce(emptyValuation)

    renderStockPage()

    const valuationSection = await screen.findByRole('region', { name: '估值' })
    expect(within(valuationSection).getByText('所选范围暂无可用估值数据')).toBeInTheDocument()
    expect(within(valuationSection).queryByText('7.40x')).not.toBeInTheDocument()
  })

  it('keeps valuation errors isolated and retryable', async () => {
    const user = userEvent.setup()
    fetchStockValuationMock.mockRejectedValueOnce(new ApiError('network', '无法连接 API 服务'))

    renderStockPage()

    const valuationSection = await screen.findByRole('region', { name: '估值' })
    expect(await within(valuationSection).findByRole('alert')).toHaveTextContent('估值数据暂不可用')
    await user.click(within(valuationSection).getByRole('button', { name: '重试加载估值' }))
    expect(await within(valuationSection).findByText('行业同行比较')).toBeInTheDocument()
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
    expect(screen.getAllByText('滚动十二个月 · ttm').length).toBeGreaterThan(0)
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
