import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SyncApiError, syncTasksApi, type SyncTaskSummary } from '../api/syncTasks'
import { App } from './App'

const task: SyncTaskSummary = {
  task_id: 'task-001', target: 'basic_info' as const, trigger: 'manual' as const, status: 'succeeded' as const,
  source: { provider: 'mock' as const, mode: 'mock' as const }, updated_at: '2026-09-26T08:00:00Z',
  failure_reason: null, data_as_of: '2026-09-25', result: { processed_count: 12, created_count: 2, updated_count: 10, failed_count: 0 },
}

const createdAt = '2026-09-26T08:00:00Z'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

function listResponse(items = [task]) {
  return { items, pagination: { page: 1, page_size: 10, total: items.length } }
}

describe('App', () => {
  it('显示同步页面和 Mock 任务列表', async () => {
    vi.stubEnv('VITE_STOCK_DATA_API_MODE', 'mock')
    vi.spyOn(syncTasksApi, 'listTasks').mockResolvedValue(listResponse())

    render(<App />)

    expect(screen.getByRole('heading', { name: 'A 股数据同步' })).toBeInTheDocument()
    expect(screen.getByText('开发 Mock 模式')).toBeInTheDocument()
    expect(await screen.findByText('股票基础资料')).toBeInTheDocument()
    expect(screen.getAllByText('已成功').length).toBeGreaterThan(0)
  })

  it('选择日线时校验日期范围', async () => {
    vi.spyOn(syncTasksApi, 'listTasks').mockResolvedValue(listResponse([]))
    const createTask = vi.spyOn(syncTasksApi, 'createTask')
    render(<App />)

    fireEvent.click(screen.getByLabelText('历史日线行情'))
    fireEvent.click(screen.getByRole('button', { name: '开始同步' }))

    expect(await screen.findByText('请选择历史日线的开始日期和结束日期')).toBeInTheDocument()
    expect(createTask).not.toHaveBeenCalled()
  })

  it('提交成功后刷新列表并展示任务详情', async () => {
    const created = {
      ...task, start_date: null, end_date: null, created_at: createdAt, started_at: createdAt,
      finished_at: createdAt, retry_count: 0, max_retries: 3, result: task.result ?? null,
    }
    vi.spyOn(syncTasksApi, 'listTasks').mockResolvedValue(listResponse([task]))
    vi.spyOn(syncTasksApi, 'createTask').mockResolvedValue(created)
    vi.spyOn(syncTasksApi, 'getTask').mockResolvedValue(created)
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '开始同步' }))

    await waitFor(() => expect(syncTasksApi.createTask).toHaveBeenCalledWith({ target: 'basic_info' }))
    expect(await screen.findByText('任务详情')).toBeInTheDocument()
  })

  it('显示冲突错误并支持查看与重试', async () => {
    const failed: SyncTaskSummary = { ...task, status: 'failed', failure_reason: '数据源不可用' }
    vi.spyOn(syncTasksApi, 'listTasks').mockResolvedValue(listResponse([failed]))
    vi.spyOn(syncTasksApi, 'getTask').mockResolvedValue({ ...failed, start_date: null, end_date: null, created_at: createdAt, started_at: null, finished_at: createdAt, retry_count: 3, max_retries: 3, result: failed.result ?? null })
    vi.spyOn(syncTasksApi, 'retryTask').mockRejectedValue(new SyncApiError('已有同一同步目标的任务正在执行，请查看任务列表', 'conflict', 409, 'SYNC_TASK_CONFLICT'))
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: '查看' }))
    expect(await screen.findByText('任务详情')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('已有同一同步目标的任务正在执行，请查看任务列表')).toBeInTheDocument()
  })
})
