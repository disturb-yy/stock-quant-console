import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ScheduleApiError, scheduleApi, type SyncSchedule } from '../api/syncSchedules'
import { SyncSchedulePage } from './SyncSchedulePage'

const schedule: SyncSchedule = {
  schedule_id: 'schedule-1', target: 'basic_info', frequency: 'daily', run_at: '02:00', timezone: 'Asia/Shanghai', enabled: true,
  next_run_at: '2026-09-27T18:00:00Z', last_run_at: '2026-09-26T18:00:00Z', last_run_status: 'succeeded', last_run_reason: null, last_task_id: 'task-1',
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function listResponse(items: SyncSchedule[] = [schedule]) {
  return { items, pagination: { page: 1, page_size: 10, total: items.length } }
}

describe('SyncSchedulePage', () => {
  it('shows loading and unavailable states', async () => {
    let resolve: ((value: ReturnType<typeof listResponse>) => void) | undefined
    const list = vi.spyOn(scheduleApi, 'listSchedules').mockReturnValue(new Promise((done) => { resolve = done }))
    render(<SyncSchedulePage />)
    expect(screen.getByText('正在加载同步计划…')).toBeInTheDocument()
    resolve?.(listResponse())
    expect((await screen.findAllByText('股票基础资料')).length).toBeGreaterThan(0)

    list.mockRejectedValue(new ScheduleApiError('服务不可用', 'network'))
    cleanup()
    render(<SyncSchedulePage />)
    expect(await screen.findByText('同步计划服务暂时不可用，请稍后重试')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }))
    expect(await screen.findByText('同步计划服务暂时不可用，请稍后重试')).toBeInTheDocument()
  })

  it('shows empty state and creates a daily schedule', async () => {
    vi.spyOn(scheduleApi, 'listSchedules').mockResolvedValue(listResponse([]))
    const create = vi.spyOn(scheduleApi, 'createSchedule').mockResolvedValue(schedule)
    render(<SyncSchedulePage />)

    expect(await screen.findByText(/暂无同步计划/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '新建计划' }))
    fireEvent.change(screen.getByLabelText('每日执行时间'), { target: { value: '03:30' } })
    fireEvent.click(screen.getByRole('button', { name: '保存计划' }))

    await waitFor(() => expect(create).toHaveBeenCalledWith({ target: 'basic_info', frequency: 'daily', run_at: '03:30', timezone: 'Asia/Shanghai', enabled: true }))
  })

  it('shows conflict on disable and confirms deletion', async () => {
    vi.spyOn(scheduleApi, 'listSchedules').mockResolvedValue(listResponse())
    vi.spyOn(scheduleApi, 'updateSchedule').mockRejectedValue(new ScheduleApiError('同一目标已有启用的同步计划', 'conflict', 409, 'SYNC_SCHEDULE_CONFLICT'))
    const remove = vi.spyOn(scheduleApi, 'deleteSchedule').mockResolvedValue()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<SyncSchedulePage />)

    await screen.findAllByText('股票基础资料')
    fireEvent.click(screen.getByRole('button', { name: '停用' }))
    expect(await screen.findByText('同一目标已有启用的同步计划')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    await waitFor(() => expect(remove).toHaveBeenCalledWith('schedule-1'))
  })
})
