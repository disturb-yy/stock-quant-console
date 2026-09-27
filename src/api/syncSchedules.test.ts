import { afterEach, describe, expect, it, vi } from 'vitest'
import { getScheduleApiMode, scheduleApi, ScheduleApiError, type SyncSchedule } from './syncSchedules'

const fixture: SyncSchedule = {
  schedule_id: 'schedule-1',
  target: 'daily_bars',
  frequency: 'daily',
  run_at: '02:30',
  timezone: 'Asia/Shanghai',
  enabled: true,
  next_run_at: '2026-09-27T18:30:00Z',
  last_run_at: null,
  last_run_status: null,
  last_run_reason: null,
  last_task_id: null,
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('scheduleApi', () => {
  it('uses explicit mock mode and classifies same-target conflicts', async () => {
    vi.stubEnv('VITE_STOCK_DATA_API_MODE', 'mock')
    expect(getScheduleApiMode()).toBe('mock')
    const schedules = await scheduleApi.listSchedules()
    expect(schedules.items.length).toBeGreaterThan(0)
    await expect(scheduleApi.createSchedule({ target: schedules.items[0]!.target, frequency: 'daily', run_at: '03:00', timezone: 'Asia/Shanghai', enabled: true }))
      .rejects.toMatchObject({ category: 'conflict', code: 'SYNC_SCHEDULE_CONFLICT' })
  })

  it('uses relative paths for CRUD in real mode', async () => {
    vi.stubEnv('VITE_STOCK_DATA_API_MODE', 'real')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ items: [fixture], pagination: { page: 1, page_size: 10, total: 1 } }))
      .mockResolvedValueOnce(response(fixture, 201))
      .mockResolvedValueOnce(response(fixture))
      .mockResolvedValueOnce(response(fixture))
      .mockResolvedValueOnce(response(undefined, 204))
    vi.stubGlobal('fetch', fetchMock)

    await scheduleApi.listSchedules()
    await scheduleApi.createSchedule({ target: 'daily_bars', frequency: 'daily', run_at: '02:30', timezone: 'Asia/Shanghai', enabled: true })
    await scheduleApi.getSchedule('schedule/1')
    await scheduleApi.updateSchedule('schedule/1', { enabled: false })
    await scheduleApi.deleteSchedule('schedule/1')

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/stock/data/sync-schedules?page=1&page_size=10',
      '/api/v1/stock/data/sync-schedules',
      '/api/v1/stock/data/sync-schedules/schedule%2F1',
      '/api/v1/stock/data/sync-schedules/schedule%2F1',
      '/api/v1/stock/data/sync-schedules/schedule%2F1',
    ])
  })

  it('rejects invalid schedule response as a contract error', async () => {
    vi.stubEnv('VITE_STOCK_DATA_API_MODE', 'real')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ items: [] })))
    const error = await scheduleApi.listSchedules().catch((value: unknown) => value)
    expect(error).toBeInstanceOf(ScheduleApiError)
    expect(error).toMatchObject({ category: 'contract' })
  })
})
