import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { stockCatalogApi } from '../api/stockCatalog'
import { SyncApiError, syncTasksApi } from '../api/syncTasks'
import { OverviewPage } from './OverviewPage'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const stocks = {
  items: [],
  pagination: { page: 1, page_size: 1, total: 4892 },
}

const tasks = {
  items: [{
    task_id: 'task-001', target: 'basic_info' as const, trigger: 'manual' as const, status: 'succeeded' as const,
    source: { provider: 'mock' as const, mode: 'mock' as const }, updated_at: '2026-09-26T08:00:00Z',
    failure_reason: null, data_as_of: '2026-09-25', result: null,
  }],
  pagination: { page: 1, page_size: 5, total: 1 },
}

describe('OverviewPage', () => {
  it('展示真实接口返回的概览指标和研究入口', async () => {
    vi.spyOn(stockCatalogApi, 'listStocks').mockResolvedValue(stocks)
    vi.spyOn(syncTasksApi, 'listTasks').mockResolvedValue(tasks)

    render(<OverviewPage />)

    expect(await screen.findByRole('heading', { name: '研究概览' })).toBeInTheDocument()
    expect(screen.getByText('4,892')).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '股票基础资料' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /查看已同步股票/ })).toHaveAttribute('href', '/stocks')
    expect(screen.getByText('当前未提供行情序列接口')).toBeInTheDocument()
  })

  it('接口失败时展示错误并支持重新加载', async () => {
    const listStocks = vi.spyOn(stockCatalogApi, 'listStocks')
      .mockRejectedValueOnce(new SyncApiError('股票目录服务不可用', 'unavailable'))
      .mockResolvedValue(stocks)
    vi.spyOn(syncTasksApi, 'listTasks').mockResolvedValue(tasks)

    render(<OverviewPage />)

    expect(await screen.findByText('数据服务暂时不可用，请稍后重试')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }))
    await screen.findByText('4,892')
    expect(listStocks).toHaveBeenCalledTimes(2)
  })
})
