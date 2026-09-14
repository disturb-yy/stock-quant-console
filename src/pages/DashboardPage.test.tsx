import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { fetchDemoStatus } from '../api/demoStatus'
import { fetchHealth } from '../api/health'
import { DashboardPage } from './DashboardPage'

const demoStatus = {
  mode: 'demo' as const,
  provider: 'mysql-demo-fixture' as const,
  seed_version: 'fnd-003-demo-v1',
  as_of: '2024-06-28',
  counts: { instruments: 3, daily_bars: 6, financial_metrics: 6 },
  sample_stocks: [{ code: '000001.SZ', name: '平安银行', exchange: 'SZSE' as const, status: 'active' as const }],
}

vi.mock('../api/health', () => ({
  fetchHealth: vi.fn(),
}))

vi.mock('../api/demoStatus', () => ({
  fetchDemoStatus: vi.fn(),
}))

const fetchHealthMock = vi.mocked(fetchHealth)
const fetchDemoStatusMock = vi.mocked(fetchDemoStatus)

describe('DashboardPage health states', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchDemoStatusMock.mockReturnValue(new Promise(() => undefined))
  })

  it('shows loading while the real request is pending', () => {
    fetchHealthMock.mockReturnValue(new Promise(() => undefined))

    render(<DashboardPage />)

    expect(screen.getByText('正在请求 /api/v1/health')).toBeInTheDocument()
  })

  it('shows service availability after a successful response', async () => {
    fetchHealthMock.mockResolvedValue({ status: 'ok' })

    render(<DashboardPage />)

    expect(await screen.findByText('服务可用')).toBeInTheDocument()
    expect(screen.getByText('GET /api/v1/health 返回成功')).toBeInTheDocument()
  })

  it('shows a retryable error when the request fails', async () => {
    fetchHealthMock.mockRejectedValue(new ApiError('network', '无法连接 API 服务'))

    render(<DashboardPage />)

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByText(/无法连接 API 服务/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新检查' })).toBeInTheDocument()
  })

  it('retries through the same health client and returns to success', async () => {
    const user = userEvent.setup()
    fetchHealthMock
      .mockRejectedValueOnce(new ApiError('http', 'API 请求返回 HTTP 503', { status: 503 }))
      .mockResolvedValueOnce({ status: 'ok' })

    render(<DashboardPage />)

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByText('服务请求失败 · HTTP 503')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '重新检查' }))

    expect(await screen.findByText('服务可用')).toBeInTheDocument()
    expect(fetchHealthMock).toHaveBeenCalledTimes(2)
  })

  it('shows the backend error code and message for a unified API error', async () => {
    fetchHealthMock.mockRejectedValue(new ApiError('backend', '后端返回统一 API 错误', {
      status: 404,
      payload: { code: 'NOT_FOUND', message: '请求的资源不存在' },
    }))

    render(<DashboardPage />)

    expect(await screen.findByText(/请求的资源不存在/)).toBeInTheDocument()
    expect(screen.getByText('NOT_FOUND · HTTP 404')).toBeInTheDocument()
  })
})

describe('DashboardPage demo status states', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchHealthMock.mockReturnValue(new Promise(() => undefined))
  })

  it('shows loading while the demo status request is pending', () => {
    fetchDemoStatusMock.mockReturnValue(new Promise(() => undefined))

    render(<DashboardPage />)

    expect(screen.getByText('正在请求 /api/v1/dev/demo-status')).toBeInTheDocument()
  })

  it('shows the backend mode, counts, provider, time and sample stock', async () => {
    fetchDemoStatusMock.mockResolvedValue(demoStatus)

    render(<DashboardPage />)

    expect(await screen.findByText('演示数据')).toBeInTheDocument()
    expect(screen.getByText('当前使用 MySQL 中的版本化 Seed fixture，不是实时/真实行情。')).toBeInTheDocument()
    expect(screen.getByText('mysql-demo-fixture')).toBeInTheDocument()
    expect(screen.getByText('fnd-003-demo-v1')).toBeInTheDocument()
    expect(screen.getByText('2024-06-28')).toBeInTheDocument()
    expect(screen.getByText('平安银行')).toBeInTheDocument()
    expect(screen.getByText(/不是实时\/真实行情/)).toBeInTheDocument()
  })

  it('labels provider fallback as local and never presents it as real data', async () => {
    fetchDemoStatusMock.mockResolvedValue({
      ...demoStatus,
      mode: 'fallback',
      provider: 'local-fixture-fallback',
    })

    render(<DashboardPage />)

    expect(await screen.findByText('本地回退数据')).toBeInTheDocument()
    expect(screen.getByText('当前 Provider 不可用，已回退到本地 Seed 数据，不是实时/真实 Provider。')).toBeInTheDocument()
    expect(screen.getByText('local-fixture-fallback')).toBeInTheDocument()
  })

  it('only calls the source real when the backend mode is real', async () => {
    fetchDemoStatusMock.mockResolvedValue({
      ...demoStatus,
      mode: 'real',
      provider: 'external-real-provider',
    })

    render(<DashboardPage />)

    expect(await screen.findByText('真实 Provider')).toBeInTheDocument()
    expect(screen.getByText('后端已确认当前数据来自真实 Provider。')).toBeInTheDocument()
    expect(screen.getByText('external-real-provider')).toBeInTheDocument()
  })

  it('keeps an empty backend response explicit and retries through the same client', async () => {
    const user = userEvent.setup()
    fetchDemoStatusMock
      .mockResolvedValueOnce({ ...demoStatus, counts: { instruments: 0, daily_bars: 0, financial_metrics: 0 }, sample_stocks: [] })
      .mockResolvedValueOnce(demoStatus)

    render(<DashboardPage />)

    expect(await screen.findByText('暂无内容')).toBeInTheDocument()
    expect(screen.getByText(/当前没有可展示的 Seed 数据/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重新获取' }))

    expect(await screen.findByText('平安银行')).toBeInTheDocument()
    expect(fetchDemoStatusMock).toHaveBeenCalledTimes(2)
  })

  it('explains service-not-started and invalid-payload failures with retry', async () => {
    const user = userEvent.setup()
    fetchDemoStatusMock
      .mockRejectedValueOnce(new ApiError('network', '无法连接 API 服务'))
      .mockRejectedValueOnce(new ApiError('invalid-payload', 'API 响应结构不符合契约'))

    render(<DashboardPage />)

    expect(await screen.findByText(/后端服务尚未启动或 Vite 代理不可达/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重新检查' }))

    expect(await screen.findByText(/后端响应与已同步的 OpenAPI 不一致/)).toBeInTheDocument()
    expect(fetchDemoStatusMock).toHaveBeenCalledTimes(2)
  })

  it('requests the real data status again after a page refresh/remount', async () => {
    fetchDemoStatusMock.mockResolvedValue(demoStatus)
    const view = render(<DashboardPage />)

    expect(await screen.findByText('平安银行')).toBeInTheDocument()
    view.unmount()
    render(<DashboardPage />)

    expect(await screen.findByText('平安银行')).toBeInTheDocument()
    expect(fetchDemoStatusMock).toHaveBeenCalledTimes(2)
  })
})
