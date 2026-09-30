import { getSyncApiMode, SyncApiError, type SyncApiMode, type SyncErrorCategory, type SyncTarget } from './syncTasks'

export const SCHEDULE_FREQUENCIES = ['daily'] as const
export const SCHEDULE_RUN_STATUSES = ['pending', 'running', 'retrying', 'succeeded', 'failed', 'skipped'] as const
export type ScheduleFrequency = (typeof SCHEDULE_FREQUENCIES)[number]
export type ScheduleRunStatus = (typeof SCHEDULE_RUN_STATUSES)[number]

export interface SyncSchedule {
  schedule_id: string
  target: SyncTarget
  frequency: ScheduleFrequency
  run_at: string
  timezone: 'Asia/Shanghai'
  enabled: boolean
  next_run_at: string | null
  last_run_at: string | null
  last_run_status: ScheduleRunStatus | null
  last_run_reason: string | null
  last_task_id: string | null
}

export interface SyncScheduleListResponse {
  items: SyncSchedule[]
  pagination: { page: number; page_size: number; total: number }
}

export interface CreateSyncScheduleRequest {
  target: SyncTarget
  frequency: ScheduleFrequency
  run_at: string
  timezone: 'Asia/Shanghai'
  enabled: boolean
}

export type UpdateSyncScheduleRequest = Partial<CreateSyncScheduleRequest>

export type ScheduleErrorCategory = SyncErrorCategory

export class ScheduleApiError extends SyncApiError {
  constructor(message: string, category: ScheduleErrorCategory, status?: number, code?: string, details?: unknown) {
    super(message, category, status, code, details)
    this.name = 'ScheduleApiError'
  }
}

export interface ScheduleApi {
  listSchedules(page?: number, pageSize?: number): Promise<SyncScheduleListResponse>
  getSchedule(scheduleId: string): Promise<SyncSchedule>
  createSchedule(request: CreateSyncScheduleRequest): Promise<SyncSchedule>
  updateSchedule(scheduleId: string, request: UpdateSyncScheduleRequest): Promise<SyncSchedule>
  deleteSchedule(scheduleId: string): Promise<void>
}

export function getScheduleApiMode(): SyncApiMode {
  return getSyncApiMode()
}

function contractError(message: string): ScheduleApiError {
  return new ScheduleApiError(message, 'contract')
}

function record(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw contractError(message)
  return value as Record<string, unknown>
}

function requiredString(value: Record<string, unknown>, key: string): string {
  if (typeof value[key] !== 'string' || value[key] === '') throw contractError(`服务返回的 ${key} 字段无效`)
  return value[key] as string
}

function nullableString(value: Record<string, unknown>, key: string): string | null {
  if (value[key] === null) return null
  if (typeof value[key] !== 'string') throw contractError(`服务返回的 ${key} 字段无效`)
  return value[key] as string
}

function enumValue<T extends string>(value: Record<string, unknown>, key: string, options: readonly T[]): T {
  if (typeof value[key] !== 'string' || !options.includes(value[key] as T)) throw contractError(`服务返回的 ${key} 字段无效`)
  return value[key] as T
}

function nullableDateTime(value: Record<string, unknown>, key: string): string | null {
  const result = nullableString(value, key)
  if (result !== null && (!Number.isFinite(Date.parse(result)) || !result.includes('T'))) throw contractError(`服务返回的 ${key} 字段无效`)
  return result
}

function parseSchedule(value: unknown): SyncSchedule {
  const schedule = record(value, '服务返回的同步计划无效')
  const runAt = requiredString(schedule, 'run_at')
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(runAt)) throw contractError('服务返回的 run_at 字段无效')
  if (typeof schedule.enabled !== 'boolean') throw contractError('服务返回的 enabled 字段无效')
  return {
    schedule_id: requiredString(schedule, 'schedule_id'),
    target: enumValue(schedule, 'target', ['basic_info', 'daily_bars', 'category_members', 'all']),
    frequency: enumValue(schedule, 'frequency', SCHEDULE_FREQUENCIES),
    run_at: runAt,
    timezone: enumValue(schedule, 'timezone', ['Asia/Shanghai']),
    enabled: schedule.enabled,
    next_run_at: nullableDateTime(schedule, 'next_run_at'),
    last_run_at: nullableDateTime(schedule, 'last_run_at'),
    last_run_status: enumValueOrNull(schedule, 'last_run_status', SCHEDULE_RUN_STATUSES),
    last_run_reason: nullableString(schedule, 'last_run_reason'),
    last_task_id: nullableString(schedule, 'last_task_id'),
  }
}

function enumValueOrNull<T extends string>(value: Record<string, unknown>, key: string, options: readonly T[]): T | null {
  if (value[key] === null) return null
  return enumValue(value, key, options)
}

function parseList(value: unknown): SyncScheduleListResponse {
  const response = record(value, '服务返回的同步计划列表无效')
  if (!Array.isArray(response.items)) throw contractError('服务返回的同步计划列表无效')
  const pagination = record(response.pagination, '服务返回的分页信息无效')
  const page = integerValue(pagination, 'page', 1)
  const pageSize = integerValue(pagination, 'page_size', 1)
  const total = integerValue(pagination, 'total')
  if (pageSize > 50) throw contractError('服务返回的分页信息无效')
  return { items: response.items.map(parseSchedule), pagination: { page, page_size: pageSize, total } }
}

function integerValue(value: Record<string, unknown>, key: string, minimum = 0): number {
  if (typeof value[key] !== 'number' || !Number.isInteger(value[key]) || value[key] < minimum) throw contractError(`服务返回的 ${key} 字段无效`)
  return value[key] as number
}

function errorCategory(status: number, code?: string): ScheduleErrorCategory {
  if (status === 400) return 'validation'
  if (status === 404) return 'not_found'
  if (status === 409 || code === 'SYNC_SCHEDULE_CONFLICT') return 'conflict'
  if (status === 503 || code === 'DATA_SOURCE_UNAVAILABLE') return 'unavailable'
  return 'server'
}

function parseHttpError(status: number, payload: unknown): ScheduleApiError {
  const body = record(payload, '服务错误响应无效')
  const code = requiredString(body, 'code')
  const message = requiredString(body, 'message')
  return new ScheduleApiError(message, errorCategory(status, code), status, code, body.details)
}

async function requestPayload(response: Response): Promise<unknown> {
  try { return await response.json() } catch { return undefined }
}

async function request<T>(url: string, init: RequestInit, parse: (value: unknown) => T): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init.headers } })
  } catch {
    throw new ScheduleApiError('无法连接同步计划服务', 'network')
  }
  const payload = await requestPayload(response)
  if (!response.ok) throw parseHttpError(response.status, payload)
  return parse(payload)
}

function validatePagination(page: number, pageSize: number): void {
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    throw new ScheduleApiError('分页参数无效', 'validation', 400, 'INVALID_PAGINATION')
  }
}

function schedulePath(scheduleId: string): string {
  if (!scheduleId.trim()) throw new ScheduleApiError('计划标识无效', 'validation', 400, 'INVALID_REQUEST')
  return encodeURIComponent(scheduleId)
}

const realApi: ScheduleApi = {
  listSchedules: (page = 1, pageSize = 10) => {
    validatePagination(page, pageSize)
    const query = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
    return request(`/api/v1/stock/data/sync-schedules?${query}`, {}, parseList)
  },
  getSchedule: (scheduleId) => request(`/api/v1/stock/data/sync-schedules/${schedulePath(scheduleId)}`, {}, parseSchedule),
  createSchedule: (requestData) => request('/api/v1/stock/data/sync-schedules', { method: 'POST', body: JSON.stringify(requestData) }, parseSchedule),
  updateSchedule: (scheduleId, requestData) => request(`/api/v1/stock/data/sync-schedules/${schedulePath(scheduleId)}`, { method: 'PATCH', body: JSON.stringify(requestData) }, parseSchedule),
  deleteSchedule: async (scheduleId) => {
    const response = await fetch(`/api/v1/stock/data/sync-schedules/${schedulePath(scheduleId)}`, { method: 'DELETE' })
    if (!response.ok) throw parseHttpError(response.status, await requestPayload(response))
  },
}

const mockSchedule: SyncSchedule = {
  schedule_id: 'mock-schedule-1', target: 'basic_info', frequency: 'daily', run_at: '02:00', timezone: 'Asia/Shanghai', enabled: true,
  next_run_at: '2026-09-27T18:00:00Z', last_run_at: '2026-09-26T18:00:00Z', last_run_status: 'succeeded', last_run_reason: null, last_task_id: 'mock-task-1',
}
let mockSchedules: SyncSchedule[] = [mockSchedule]
let mockSequence = 0

function mockConflict(request: CreateSyncScheduleRequest | UpdateSyncScheduleRequest, currentId?: string): ScheduleApiError | undefined {
  if (request.enabled !== true && currentId === undefined) return undefined
  const target = request.target
  if (!target) return undefined
  const conflict = mockSchedules.find((schedule) => schedule.schedule_id !== currentId && schedule.enabled && schedule.target === target)
  return conflict ? new ScheduleApiError('同一目标已有启用的同步计划', 'conflict', 409, 'SYNC_SCHEDULE_CONFLICT', { schedule_id: conflict.schedule_id }) : undefined
}

const mockApi: ScheduleApi = {
  listSchedules: async (page = 1, pageSize = 10) => {
    validatePagination(page, pageSize)
    const start = (page - 1) * pageSize
    return { items: mockSchedules.slice(start, start + pageSize), pagination: { page, page_size: pageSize, total: mockSchedules.length } }
  },
  getSchedule: async (scheduleId) => {
    const schedule = mockSchedules.find((item) => item.schedule_id === scheduleId)
    if (!schedule) throw new ScheduleApiError('同步计划不存在', 'not_found', 404, 'SYNC_SCHEDULE_NOT_FOUND')
    return schedule
  },
  createSchedule: async (requestData) => {
    const conflict = mockConflict(requestData)
    if (conflict) throw conflict
    const schedule: SyncSchedule = { schedule_id: `mock-schedule-${++mockSequence + 1}`, ...requestData, next_run_at: requestData.enabled ? mockSchedule.next_run_at : null, last_run_at: null, last_run_status: null, last_run_reason: null, last_task_id: null }
    mockSchedules = [...mockSchedules, schedule]
    return schedule
  },
  updateSchedule: async (scheduleId, requestData) => {
    const current = await mockApi.getSchedule(scheduleId)
    const conflict = mockConflict({ ...current, ...requestData }, scheduleId)
    if (conflict) throw conflict
    const next = { ...current, ...requestData, next_run_at: requestData.enabled === false ? null : current.next_run_at }
    mockSchedules = mockSchedules.map((item) => item.schedule_id === scheduleId ? next : item)
    return next
  },
  deleteSchedule: async (scheduleId) => {
    await mockApi.getSchedule(scheduleId)
    mockSchedules = mockSchedules.filter((item) => item.schedule_id !== scheduleId)
  },
}

function selectedApi(): ScheduleApi {
  return getScheduleApiMode() === 'mock' ? mockApi : realApi
}

export const scheduleApi: ScheduleApi = {
  listSchedules: (page, pageSize) => selectedApi().listSchedules(page, pageSize),
  getSchedule: (scheduleId) => selectedApi().getSchedule(scheduleId),
  createSchedule: (request) => selectedApi().createSchedule(request),
  updateSchedule: (scheduleId, request) => selectedApi().updateSchedule(scheduleId, request),
  deleteSchedule: (scheduleId) => selectedApi().deleteSchedule(scheduleId),
}
