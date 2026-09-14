import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
    fetchHealthMock.mockRejectedValue(new Error('无法连接健康检查接口'))

    render(<DashboardPage />)

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByText(/无法连接健康检查接口/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新检查' })).toBeInTheDocument()
  })
})
