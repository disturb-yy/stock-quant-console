import { render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { fetchMarketOverview } from '../api/marketOverview'
import { fetchMarketSectors } from '../api/marketSectors'
import { MarketOverviewPage } from './MarketOverviewPage'

vi.mock('../api/marketOverview', () => ({
  fetchMarketOverview: vi.fn(),
}))

vi.mock('../api/marketSectors', () => ({
  fetchMarketSectors: vi.fn(),
}))

const overview = {
  as_of: '2024-06-28',
  observed_at: '2024-06-28T07:00:00Z',
  source: { mode: 'demo' as const, provider: 'mysql-demo-fixture' as const, seed_version: 'fnd-003-demo-v2' },
  indices: [
    { code: '000001.SH', name: '上证指数', close: '2994.73', change: '-3.89', change_percent: '-0.13' },
    { code: '399001.SZ', name: '深证成指', close: '8848.42', change: '-25.67', change_percent: '-0.29' },
    { code: '399006.SZ', name: '创业板指', close: '1683.34', change: '-8.12', change_percent: '-0.48' },
    { code: '000300.SH', name: '沪深300', close: '3401.76', change: '-5.87', change_percent: '-0.17' },
  ],
  breadth: { advancing: 2, declining: 1, unchanged: 0 },
  turnover: { amount: '12002494200.00', currency: 'CNY' as const },
}

const sectors = {
  as_of: '2024-06-28',
  source: { mode: 'demo' as const, provider: 'mysql-demo-fixture' as const, seed_version: 'mkt-002-demo-v1' },
  sectors: [
    {
      code: 'BANK',
      name: '银行',
      change_percent: '0.88',
      component_count: 1,
      leader: { code: '000001.SZ', name: '平安银行', change_percent: '0.88' },
    },
    {
      code: 'EQUIPMENT',
      name: '电力设备',
      change_percent: '1.42',
      component_count: 1,
      leader: { code: '300750.SZ', name: '宁德时代', change_percent: '1.42' },
    },
    {
      code: 'FOOD_BEVERAGE',
      name: '食品饮料',
      change_percent: '-0.17',
      component_count: 1,
      leader: { code: '600519.SH', name: '贵州茅台', change_percent: '-0.17' },
    },
    {
      code: 'UTILITIES',
      name: '公用事业',
      change_percent: '0',
      component_count: 1,
      leader: { code: '000001.SZ', name: '平盘样本', change_percent: '0' },
    },
  ],
}

const fetchMarketOverviewMock = vi.mocked(fetchMarketOverview)
const fetchMarketSectorsMock = vi.mocked(fetchMarketSectors)

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location-search">{location.search}</output>
}

function renderPage(path = '/market') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <MarketOverviewPage />
      <LocationProbe />
    </MemoryRouter>,
  )
}

describe('MarketOverviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchMarketSectorsMock.mockReturnValue(new Promise(() => undefined))
  })

  it('shows loading while the real market endpoint is pending', () => {
    fetchMarketOverviewMock.mockReturnValue(new Promise(() => undefined))

    renderPage()

    expect(screen.getByText('正在请求 /api/v1/markets/overview')).toBeInTheDocument()
  })

  it('shows the four indices, breadth, turnover, timestamp and source', async () => {
    fetchMarketOverviewMock.mockResolvedValue(overview)

    renderPage()

    expect(await screen.findByText('上证指数')).toBeInTheDocument()
    expect(screen.getByText('深证成指')).toBeInTheDocument()
    expect(screen.getByText('创业板指')).toBeInTheDocument()
    expect(screen.getByText('沪深300')).toBeInTheDocument()
    expect(screen.getByText('上涨家数')).toBeInTheDocument()
    expect(screen.getByText('下跌家数')).toBeInTheDocument()
    expect(screen.getByText('成交额')).toBeInTheDocument()
    expect(screen.getByText('2024-06-28T07:00:00Z')).toBeInTheDocument()
    expect(screen.getByText('mysql-demo-fixture')).toBeInTheDocument()
    expect(screen.getByText('fnd-003-demo-v2')).toBeInTheDocument()
  })

  it('shows empty state and retries through the same API client', async () => {
    const user = userEvent.setup()
    fetchMarketOverviewMock.mockResolvedValueOnce({ ...overview, indices: [] }).mockResolvedValueOnce(overview)

    renderPage()

    expect(await screen.findByText('暂无内容')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重新获取' }))

    expect(await screen.findByText('创业板指')).toBeInTheDocument()
    expect(fetchMarketOverviewMock).toHaveBeenCalledTimes(2)
  })

  it('shows a comprehensible error and retries to success', async () => {
    const user = userEvent.setup()
    fetchMarketOverviewMock
      .mockRejectedValueOnce(new ApiError('network', '无法连接 API 服务'))
      .mockResolvedValueOnce(overview)

    renderPage()

    expect(await screen.findByText(/后端服务和 Vite 代理可用/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重新检查' }))

    expect(await screen.findByText('沪深300')).toBeInTheDocument()
    expect(fetchMarketOverviewMock).toHaveBeenCalledTimes(2)
  })

  it('requests fresh data after a remount, matching a page refresh', async () => {
    fetchMarketOverviewMock.mockResolvedValue(overview)
    const view = renderPage()

    expect(await screen.findByText('上证指数')).toBeInTheDocument()
    view.unmount()
    renderPage()

    expect(await screen.findByText('上证指数')).toBeInTheDocument()
    expect(fetchMarketOverviewMock).toHaveBeenCalledTimes(2)
  })

  it('shows the real industry performance table with the leader as display-only content', async () => {
    fetchMarketOverviewMock.mockResolvedValue(overview)
    fetchMarketSectorsMock.mockResolvedValue(sectors)

    renderPage()

    expect(await screen.findByText('行业表现')).toBeInTheDocument()
    expect(screen.getByText('银行')).toBeInTheDocument()
    expect(screen.getByText('电力设备')).toBeInTheDocument()
    expect(screen.getByText('食品饮料')).toBeInTheDocument()
    expect(screen.getByText('平安银行')).toBeInTheDocument()
    expect(screen.getByText('300750.SZ')).toBeInTheDocument()
    expect(screen.getByText('Seed 数据 · mkt-002-demo-v1')).toBeInTheDocument()
    expect(screen.getAllByText('+1.42%')).toHaveLength(2)
    expect(screen.getAllByText('上涨').length).toBeGreaterThan(0)
    expect(screen.getAllByText('下跌').length).toBeGreaterThan(0)
    expect(screen.getByText('食品饮料').closest('a')).toBeNull()
    expect(screen.getByText('平安银行').closest('a')).toBeNull()
    const marketCards = Array.from(document.querySelectorAll('.market-overview-page .t-card'))
    expect(marketCards.length).toBeGreaterThan(0)
    expect(marketCards.every((card) => card.classList.contains('market-card'))).toBe(true)
  })

  it('keeps industry loading separate from the market overview', async () => {
    fetchMarketOverviewMock.mockResolvedValue(overview)
    fetchMarketSectorsMock.mockReturnValue(new Promise(() => undefined))

    renderPage()

    expect(await screen.findByText('上证指数')).toBeInTheDocument()
    expect(screen.getByText('正在请求 /api/v1/markets/sectors')).toBeInTheDocument()
  })

  it('shows an industry empty state and retries only the industry request', async () => {
    const user = userEvent.setup()
    fetchMarketOverviewMock.mockResolvedValue(overview)
    fetchMarketSectorsMock.mockResolvedValueOnce({ ...sectors, sectors: [] }).mockResolvedValueOnce(sectors)

    renderPage()

    expect(await screen.findByText('接口已返回，但当前没有可展示的行业表现。')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重新获取' }))

    expect(await screen.findByText('平安银行')).toBeInTheDocument()
    expect(fetchMarketOverviewMock).toHaveBeenCalledTimes(1)
    expect(fetchMarketSectorsMock).toHaveBeenCalledTimes(2)
  })

  it('keeps the overview visible when industry loading fails and retries to success', async () => {
    const user = userEvent.setup()
    fetchMarketOverviewMock.mockResolvedValue(overview)
    fetchMarketSectorsMock
      .mockRejectedValueOnce(new ApiError('network', '无法连接 API 服务'))
      .mockResolvedValueOnce(sectors)

    renderPage()

    expect(await screen.findByText(/市场概览仍可继续使用/)).toBeInTheDocument()
    expect(screen.getByText('上证指数')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重新检查' }))

    expect(await screen.findByText('电力设备')).toBeInTheDocument()
    expect(fetchMarketOverviewMock).toHaveBeenCalledTimes(1)
    expect(fetchMarketSectorsMock).toHaveBeenCalledTimes(2)
  })

  it('sorts, filters, and writes sector state to the URL while preserving other params', async () => {
    const user = userEvent.setup()
    fetchMarketOverviewMock.mockResolvedValue(overview)
    fetchMarketSectorsMock.mockResolvedValue(sectors)

    renderPage('/market?workspace=research')

    const table = await screen.findByRole('table')
    const rows = () => within(table).getAllByRole('row').slice(1).map((row) => row.textContent)
    expect(rows()[0]).toContain('电力设备')

    await user.selectOptions(screen.getByRole('combobox', { name: '行业排序' }), 'losers')
    expect(rows()[0]).toContain('食品饮料')
    expect(screen.getByTestId('location-search')).toHaveTextContent('workspace=research')
    expect(screen.getByTestId('location-search')).toHaveTextContent('sector_sort=losers')
    expect(screen.getByTestId('location-search')).toHaveTextContent('sector_filter=all')

    await user.selectOptions(screen.getByRole('combobox', { name: '行业涨跌筛选' }), 'up')
    expect(within(table).getAllByRole('row')).toHaveLength(3)
    expect(screen.getByText('银行')).toBeInTheDocument()
    expect(screen.getByText('电力设备')).toBeInTheDocument()
    expect(screen.queryByText('食品饮料')).not.toBeInTheDocument()
    expect(screen.getByTestId('location-search')).toHaveTextContent('sector_filter=up')

    await user.selectOptions(screen.getByRole('combobox', { name: '行业涨跌筛选' }), 'flat')
    expect(within(table).getAllByRole('row')).toHaveLength(2)
    expect(screen.getByText('公用事业')).toBeInTheDocument()
  })

  it('restores sector sort and filter from a direct route with search params', async () => {
    fetchMarketOverviewMock.mockResolvedValue(overview)
    fetchMarketSectorsMock.mockResolvedValue(sectors)

    renderPage('/market?sector_sort=losers&sector_filter=down')

    const table = await screen.findByRole('table')
    const rows = within(table).getAllByRole('row')
    expect(rows).toHaveLength(2)
    expect(rows[1].textContent).toContain('食品饮料')
    expect(screen.getByRole('combobox', { name: '行业排序' })).toHaveValue('losers')
    expect(screen.getByRole('combobox', { name: '行业涨跌筛选' })).toHaveValue('down')
  })
})
