import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { fetchHealth } from '../api/health'
import { DashboardPage } from './DashboardPage'

vi.mock('../api/health', () => ({
  fetchHealth: vi.fn(),
}))

const fetchHealthMock = vi.mocked(fetchHealth)

describe('DashboardPage health states', () => {
  beforeEach(() => vi.clearAllMocks())

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
