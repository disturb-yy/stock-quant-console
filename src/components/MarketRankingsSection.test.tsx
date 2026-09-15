import { render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { fetchMarketRankings } from '../api/marketRankings'
import { MarketRankingsSection } from './MarketRankingsSection'

vi.mock('../api/marketRankings', () => ({
  fetchMarketRankings: vi.fn(),
  rankingMetrics: ['gain', 'loss', 'turnover_amount', 'turnover_rate'],
}))

const fetchMarketRankingsMock = vi.mocked(fetchMarketRankings)

function createRankings(metric = 'gain', page = 1, pageSize = 5) {
  return {
    metric: metric as 'gain' | 'loss' | 'turnover_amount' | 'turnover_rate',
    as_of: '2024-06-28',
    source: { mode: 'demo' as const, provider: 'mysql-demo-fixture' as const, seed_version: 'fnd-003-demo-v4' },
    data: [
      {
        rank: page === 1 ? 1 : 6,
        code: metric === 'loss' ? '600519.SH' : '300750.SZ',
        name: metric === 'loss' ? '贵州茅台' : '宁德时代',
        value: metric === 'loss' ? '-0.17' : metric === 'turnover_amount' ? '7633021600' : metric === 'turnover_rate' ? '3.54' : '1.42',
        close: '190.120000',
        change: '2.67',
        change_percent: '1.42',
        turnover_amount: '7633021600.000000',
        turnover_rate: '3.540000',
      },
      {
        rank: page === 1 ? 2 : 7,
        code: '000001.SZ',
        name: '平安银行',
        value: metric === 'loss' ? '0.19' : metric === 'turnover_amount' ? '840027600' : metric === 'turnover_rate' ? '1.86' : '0.88',
        close: '10.310000',
        change: '0.09',
        change_percent: '0.88',
        turnover_amount: '840027600.000000',
        turnover_rate: '1.860000',
      },
    ],
    pagination: { page, page_size: pageSize, total: 10, total_pages: Math.ceil(10 / pageSize) },
  }
}

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location-search">{location.search}</output>
}

function BrowserBackControl() {
  const navigate = useNavigate()
  return <button type="button" onClick={() => navigate(-1)}>浏览器返回</button>
}

function renderSection(path = '/market', history?: string[]) {
  return render(
    <MemoryRouter initialEntries={history ?? [path]} initialIndex={history ? history.length - 1 : undefined}>
      <MarketRankingsSection />
      <LocationProbe />
      <BrowserBackControl />
    </MemoryRouter>,
  )
}

describe('MarketRankingsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchMarketRankingsMock.mockImplementation(async ({ metric, page, pageSize }) => createRankings(metric, page, pageSize))
  })

  it('shows a loading state while the real rankings request is pending', () => {
    fetchMarketRankingsMock.mockReturnValue(new Promise(() => undefined))

    renderSection()

    expect(screen.getByText('正在请求 /api/v1/markets/rankings')).toBeInTheDocument()
  })

  it('shows ranking, stock fields, metric, observation date, source, and textual price direction', async () => {
    renderSection()

    expect(await screen.findByRole('heading', { name: '股票排行榜' })).toBeInTheDocument()
    for (const label of ['涨幅', '跌幅', '成交额', '换手率']) {
      expect(screen.getByRole('tab', { name: label })).toBeInTheDocument()
    }
    expect(screen.getByRole('tab', { name: '涨幅' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('300750.SZ')).toBeInTheDocument()
    expect(screen.getByText('宁德时代')).toBeInTheDocument()
    expect(screen.getByText('+1.42%')).toBeInTheDocument()
    expect(screen.getAllByText('上涨').length).toBeGreaterThan(0)
    expect(screen.getAllByText('2024-06-28').length).toBeGreaterThan(1)
    expect(screen.getAllByText(/mysql-demo-fixture/).length).toBeGreaterThan(1)
    expect(screen.getByText('本页 2 条，共 10 条')).toBeInTheDocument()
    expect(screen.queryByText(/Coming Soon/i)).not.toBeInTheDocument()
  })

  it('switches tabs, writes namespaced URL state, and requests the selected metric', async () => {
    const user = userEvent.setup()
    renderSection('/market?workspace=research')

    await screen.findByText('宁德时代')
    await user.click(screen.getByRole('tab', { name: '跌幅' }))

    expect(screen.getByTestId('location-search')).toHaveTextContent('workspace=research')
    expect(screen.getByTestId('location-search')).toHaveTextContent('ranking_metric=loss')
    expect(screen.getByTestId('location-search')).toHaveTextContent('ranking_page=1')
    expect(screen.getByTestId('location-search')).toHaveTextContent('ranking_page_size=5')
    expect(await screen.findByText('贵州茅台')).toBeInTheDocument()
    expect(fetchMarketRankingsMock).toHaveBeenLastCalledWith(
      { metric: 'loss', page: 1, pageSize: 5 },
      expect.any(AbortSignal),
    )

    await user.click(screen.getByRole('tab', { name: '成交额' }))
    expect(await screen.findByText('¥7,633,021,600.00')).toBeInTheDocument()
    expect(fetchMarketRankingsMock).toHaveBeenLastCalledWith(
      { metric: 'turnover_amount', page: 1, pageSize: 5 },
      expect.any(AbortSignal),
    )
  })

  it('paginates through the real query state and restores that state on browser return', async () => {
    const user = userEvent.setup()
    const initialView = renderSection('/market?ranking_metric=gain&ranking_page=1&ranking_page_size=5')

    await screen.findByText('宁德时代')
    const pagination = screen.getByLabelText('排行榜分页')
    await user.click(within(pagination).getByText('2'))

    expect(screen.getByTestId('location-search')).toHaveTextContent('ranking_page=2')
    expect(await screen.findByText('6')).toBeInTheDocument()
    expect(fetchMarketRankingsMock).toHaveBeenLastCalledWith(
      { metric: 'gain', page: 2, pageSize: 5 },
      expect.any(AbortSignal),
    )

    initialView.unmount()
    renderSection(
      '/market?ranking_metric=gain&ranking_page=1&ranking_page_size=5',
      [
        '/market?ranking_metric=loss&ranking_page=1&ranking_page_size=5',
        '/market?ranking_metric=gain&ranking_page=2&ranking_page_size=5',
      ],
    )
    expect(await screen.findByText('6')).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: '浏览器返回' }).at(-1)!)

    expect(await screen.findByText('贵州茅台')).toBeInTheDocument()
    expect(screen.getByTestId('location-search')).toHaveTextContent('ranking_metric=loss')
    expect(fetchMarketRankingsMock).toHaveBeenLastCalledWith(
      { metric: 'loss', page: 1, pageSize: 5 },
      expect.any(AbortSignal),
    )
  })

  it('restores all ranking controls from a direct URL including the page-size limit', async () => {
    renderSection('/market?ranking_metric=turnover_rate&ranking_page=2&ranking_page_size=10')

    expect(await screen.findByText('3.54%')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '换手率' })).toHaveAttribute('aria-selected', 'true')
    expect(fetchMarketRankingsMock).toHaveBeenCalledWith(
      { metric: 'turnover_rate', page: 2, pageSize: 10 },
      expect.any(AbortSignal),
    )
  })

  it('shows empty and error states with a retry that only repeats rankings', async () => {
    const user = userEvent.setup()
    fetchMarketRankingsMock.mockResolvedValueOnce({ ...createRankings(), data: [] }).mockResolvedValueOnce(createRankings())
    const emptyView = renderSection()

    expect(await screen.findByText('接口已返回，但当前分页下没有可展示的股票排行。')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重新获取' }))
    expect(await screen.findByText('宁德时代')).toBeInTheDocument()

    emptyView.unmount()
    fetchMarketRankingsMock.mockRejectedValueOnce(new ApiError('network', '无法连接 API 服务')).mockResolvedValueOnce(createRankings())
    renderSection()
    expect(await screen.findByText(/股票排行榜暂时无法加载/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重新检查' }))
    expect(await screen.findByText('宁德时代')).toBeInTheDocument()
  })

  it('rejects illegal URL state before requesting and can restore safe defaults', async () => {
    const user = userEvent.setup()
    fetchMarketRankingsMock.mockReturnValue(new Promise(() => undefined))
    renderSection('/market?ranking_metric=unknown&ranking_page=0&ranking_page_size=99')

    expect(await screen.findByRole('alert')).toHaveTextContent('URL 中的股票排行榜参数无效')
    expect(fetchMarketRankingsMock).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '恢复默认参数' }))
    expect(screen.getByTestId('location-search')).toHaveTextContent('')
    expect(fetchMarketRankingsMock).toHaveBeenCalledWith(
      { metric: 'gain', page: 1, pageSize: 5 },
      expect.any(AbortSignal),
    )
  })
})
