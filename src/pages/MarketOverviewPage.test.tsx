import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { fetchMarketOverview } from '../api/marketOverview'
import { MarketOverviewPage } from './MarketOverviewPage'

vi.mock('../api/marketOverview', () => ({
  fetchMarketOverview: vi.fn(),
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

const fetchMarketOverviewMock = vi.mocked(fetchMarketOverview)

describe('MarketOverviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading while the real market endpoint is pending', () => {
    fetchMarketOverviewMock.mockReturnValue(new Promise(() => undefined))

    render(<MarketOverviewPage />)

    expect(screen.getByText('正在请求 /api/v1/markets/overview')).toBeInTheDocument()
  })

  it('shows the four indices, breadth, turnover, timestamp and source', async () => {
    fetchMarketOverviewMock.mockResolvedValue(overview)

    render(<MarketOverviewPage />)

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

    render(<MarketOverviewPage />)

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

    render(<MarketOverviewPage />)

    expect(await screen.findByText(/后端服务和 Vite 代理可用/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重新检查' }))

    expect(await screen.findByText('沪深300')).toBeInTheDocument()
    expect(fetchMarketOverviewMock).toHaveBeenCalledTimes(2)
  })

  it('requests fresh data after a remount, matching a page refresh', async () => {
    fetchMarketOverviewMock.mockResolvedValue(overview)
    const view = render(<MarketOverviewPage />)

    expect(await screen.findByText('上证指数')).toBeInTheDocument()
    view.unmount()
    render(<MarketOverviewPage />)

    expect(await screen.findByText('上证指数')).toBeInTheDocument()
    expect(fetchMarketOverviewMock).toHaveBeenCalledTimes(2)
  })
})
