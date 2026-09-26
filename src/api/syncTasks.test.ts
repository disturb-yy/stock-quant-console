import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getSyncApiMode,
  SyncApiError,
  syncTasksApi,
  type SyncTask,
} from './syncTasks'

const taskFixture: SyncTask = {
  task_id: 'task-001',
  target: 'daily_bars',
  trigger: 'manual',
  status: 'pending',
  source: { provider: 'tushare', mode: 'external' },
  start_date: '2026-01-01',
  end_date: '2026-09-26',
  data_as_of: null,
  updated_at: null,
  failure_reason: null,
  created_at: '2026-09-26T08:00:00Z',
  started_at: null,
  finished_at: null,
  retry_count: 0,
  max_retries: 3,
  result: null,
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function errorPayload(code: string, message = '请求失败') {
  return { code, message, details: { field: 'target' } }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('syncTasksApi mock adapter', () => {
  it('uses mock only when the mode is explicitly mock and exposes success states', async () => {
    vi.stubEnv('VITE_STOCK_DATA_API_MODE', 'mock')

    const result = await syncTasksApi.listTasks()

    expect(getSyncApiMode()).toBe('mock')
    expect(result.items.map((item) => item.status)).toEqual(['running', 'succeeded', 'failed'])
    expect(result.items[1]?.source).toEqual({ provider: 'mock', mode: 'mock' })
    await expect(syncTasksApi.getTask('mock-succeeded')).resolves.toMatchObject({
      status: 'succeeded',
      result: { failed_count: 0 },
    })
  })

  it('supports conflict and failed-task retry states in memory', async () => {
    vi.stubEnv('VITE_STOCK_DATA_API_MODE', 'mock')

    await expect(
      syncTasksApi.createTask({ target: 'daily_bars', start_date: '2026-01-01', end_date: '2026-09-26' }),
    ).rejects.toMatchObject({ category: 'conflict', code: 'SYNC_TASK_CONFLICT', status: 409 })

    const retried = await syncTasksApi.retryTask('mock-failed')
    expect(retried).toMatchObject({ status: 'pending', retry_of_task_id: 'mock-failed' })
    await expect(syncTasksApi.getTask(retried.task_id)).resolves.toMatchObject({
      status: 'pending',
      result: null,
      source: { provider: 'mock', mode: 'mock' },
    })
  })
})

describe('syncTasksApi response contract and HTTP errors', () => {
  it('classifies an invalid successful payload as a contract error', async () => {
    vi.stubEnv('VITE_STOCK_DATA_API_MODE', 'real')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ items: [], pagination: { page: 1, page_size: 10 } })))

    await expect(syncTasksApi.listTasks()).rejects.toMatchObject({ category: 'contract' })
  })

  it.each([
    [400, 'INVALID_REQUEST', 'validation'],
    [404, 'SYNC_TASK_NOT_FOUND', 'not_found'],
    [409, 'SYNC_TASK_CONFLICT', 'conflict'],
    [503, 'DATA_SOURCE_UNAVAILABLE', 'unavailable'],
  ] as const)('classifies HTTP %s errors as %s', async (status, code, category) => {
    vi.stubEnv('VITE_STOCK_DATA_API_MODE', 'real')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(errorPayload(code), status)))

    await expect(syncTasksApi.getTask('task-001')).rejects.toMatchObject({ status, code, category })
  })
})

describe('syncTasksApi real adapter', () => {
  it('uses relative paths for list, create, detail, and retry', async () => {
    vi.stubEnv('VITE_STOCK_DATA_API_MODE', 'real')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ items: [], pagination: { page: 2, page_size: 20, total: 0 } }))
      .mockResolvedValueOnce(response(taskFixture, 202))
      .mockResolvedValueOnce(response(taskFixture))
      .mockResolvedValueOnce(response({ task_id: 'task-002', status: 'pending', retry_of_task_id: 'task/001' }, 202))
    vi.stubGlobal('fetch', fetchMock)

    await syncTasksApi.listTasks(2, 20)
    await syncTasksApi.createTask({ target: 'daily_bars', start_date: '2026-01-01', end_date: '2026-09-26' })
    await syncTasksApi.getTask('task/001')
    await syncTasksApi.retryTask('task/001')

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/stock/data/sync-tasks?page=2&page_size=20',
      '/api/v1/stock/data/sync-tasks',
      '/api/v1/stock/data/sync-tasks/task%2F001',
      '/api/v1/stock/data/sync-tasks/task%2F001/retry',
    ])
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: 'POST' })
    expect(fetchMock.mock.calls[3]?.[1]).toMatchObject({ method: 'POST' })
  })

  it('does not fall back to mock when a real request fails', async () => {
    vi.stubEnv('VITE_STOCK_DATA_API_MODE', 'real')
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('network down'))
    vi.stubGlobal('fetch', fetchMock)

    const failure = await syncTasksApi.listTasks().catch((error: unknown) => error)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(failure).toBeInstanceOf(SyncApiError)
    expect(failure).toMatchObject({ category: 'network' })
  })
})
