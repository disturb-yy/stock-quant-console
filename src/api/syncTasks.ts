export const SYNC_TARGETS = ['basic_info', 'daily_bars', 'all'] as const
export type SyncTarget = (typeof SYNC_TARGETS)[number]

export const SYNC_TASK_STATUSES = ['pending', 'running', 'retrying', 'succeeded', 'failed'] as const
export type SyncTaskStatus = (typeof SYNC_TASK_STATUSES)[number]

export type SyncTrigger = 'manual' | 'scheduled'
export type SyncApiMode = 'real' | 'mock'
export type SyncErrorCategory =
  | 'validation'
  | 'conflict'
  | 'not_found'
  | 'unavailable'
  | 'contract'
  | 'network'
  | 'server'

export interface DataSource {
  provider: 'tushare' | 'mock'
  mode: 'external' | 'mock'
}

export interface SyncTaskResult {
  processed_count: number
  created_count: number
  updated_count: number
  failed_count: number
}

export interface SyncTaskSummary {
  task_id: string
  target: SyncTarget
  trigger: SyncTrigger
  status: SyncTaskStatus
  source: DataSource
  updated_at: string | null
  failure_reason: string | null
  data_as_of?: string | null
  result?: SyncTaskResult | null
}

export interface SyncTask extends SyncTaskSummary {
  start_date: string | null
  end_date: string | null
  created_at: string
  started_at: string | null
  finished_at: string | null
  retry_count: number
  max_retries: number
  retry_of_task_id?: string | null
  result: SyncTaskResult | null
}

export interface SyncTaskListResponse {
  items: SyncTaskSummary[]
  pagination: {
    page: number
    page_size: number
    total: number
  }
}

export interface CreateSyncTaskRequest {
  target: SyncTarget
  start_date?: string
  end_date?: string
}

export interface RetrySyncTaskResponse {
  task_id: string
  status: SyncTaskStatus
  retry_of_task_id: string
}

export interface SyncApi {
  listTasks(page?: number, pageSize?: number): Promise<SyncTaskListResponse>
  getTask(taskId: string): Promise<SyncTask>
  createTask(request: CreateSyncTaskRequest): Promise<SyncTask>
  retryTask(taskId: string): Promise<RetrySyncTaskResponse>
}

export class SyncApiError extends Error {
  constructor(
    message: string,
    readonly category: SyncErrorCategory,
    readonly status?: number,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'SyncApiError'
  }
}

function contractError(message: string): SyncApiError {
  return new SyncApiError(message, 'contract')
}

function record(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw contractError(message)
  }
  return value as Record<string, unknown>
}

function requiredString(value: Record<string, unknown>, key: string): string {
  if (typeof value[key] !== 'string' || value[key] === '') {
    throw contractError(`服务返回的 ${key} 字段无效`)
  }
  return value[key] as string
}

function nullableString(value: Record<string, unknown>, key: string): string | null {
  if (value[key] === null) return null
  if (typeof value[key] !== 'string') {
    throw contractError(`服务返回的 ${key} 字段无效`)
  }
  return value[key] as string
}

function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
}

function isDateTime(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value))
  )
}

function nullableDate(value: Record<string, unknown>, key: string): string | null {
  const result = nullableString(value, key)
  if (result !== null && !isDate(result)) throw contractError(`服务返回的 ${key} 字段无效`)
  return result
}

function requiredDateTime(value: Record<string, unknown>, key: string): string {
  const result = requiredString(value, key)
  if (!isDateTime(result)) throw contractError(`服务返回的 ${key} 字段无效`)
  return result
}

function nullableDateTime(value: Record<string, unknown>, key: string): string | null {
  const result = nullableString(value, key)
  if (result !== null && !isDateTime(result)) throw contractError(`服务返回的 ${key} 字段无效`)
  return result
}

function enumValue<T extends string>(value: Record<string, unknown>, key: string, options: readonly T[]): T {
  if (typeof value[key] !== 'string' || !options.includes(value[key] as T)) {
    throw contractError(`服务返回的 ${key} 字段无效`)
  }
  return value[key] as T
}

function integerValue(value: Record<string, unknown>, key: string, minimum = 0): number {
  if (typeof value[key] !== 'number' || !Number.isInteger(value[key]) || value[key] < minimum) {
    throw contractError(`服务返回的 ${key} 字段无效`)
  }
  return value[key] as number
}

function parseSource(value: unknown): DataSource {
  const source = record(value, '服务返回的数据来源无效')
  const provider = enumValue(source, 'provider', ['tushare', 'mock'])
  const mode = enumValue(source, 'mode', ['external', 'mock'])
  if ((provider === 'mock') !== (mode === 'mock')) throw contractError('服务返回的数据来源组合无效')
  return { provider, mode }
}

function parseResult(value: unknown): SyncTaskResult {
  const result = record(value, '服务返回的结果摘要无效')
  return {
    processed_count: integerValue(result, 'processed_count'),
    created_count: integerValue(result, 'created_count'),
    updated_count: integerValue(result, 'updated_count'),
    failed_count: integerValue(result, 'failed_count'),
  }
}

function parseOptionalResult(value: Record<string, unknown>): SyncTaskResult | null | undefined {
  if (!('result' in value)) return undefined
  return value.result === null ? null : parseResult(value.result)
}

function parseSummary(value: unknown): SyncTaskSummary {
  const task = record(value, '服务返回的任务摘要无效')
  return {
    task_id: requiredString(task, 'task_id'),
    target: enumValue(task, 'target', SYNC_TARGETS),
    trigger: enumValue(task, 'trigger', ['manual', 'scheduled']),
    status: enumValue(task, 'status', SYNC_TASK_STATUSES),
    source: parseSource(task.source),
    updated_at: nullableDateTime(task, 'updated_at'),
    failure_reason: nullableString(task, 'failure_reason'),
    data_as_of: 'data_as_of' in task ? nullableDate(task, 'data_as_of') : undefined,
    result: parseOptionalResult(task),
  }
}

function parseTask(value: unknown): SyncTask {
  const task = record(value, '服务返回的同步任务无效')
  const summary = parseSummary(task)
  if (!('result' in task)) throw contractError('服务返回的同步任务缺少 result 字段')
  return {
    ...summary,
    start_date: nullableDate(task, 'start_date'),
    end_date: nullableDate(task, 'end_date'),
    created_at: requiredDateTime(task, 'created_at'),
    started_at: nullableDateTime(task, 'started_at'),
    finished_at: nullableDateTime(task, 'finished_at'),
    retry_count: integerValue(task, 'retry_count'),
    max_retries: integerValue(task, 'max_retries'),
    retry_of_task_id: 'retry_of_task_id' in task ? nullableString(task, 'retry_of_task_id') : undefined,
    result: task.result === null ? null : parseResult(task.result),
  }
}

function parseList(value: unknown): SyncTaskListResponse {
  const response = record(value, '服务返回的任务列表无效')
  if (!Array.isArray(response.items)) throw contractError('服务返回的任务列表无效')
  const pagination = record(response.pagination, '服务返回的分页信息无效')
  const page = integerValue(pagination, 'page', 1)
  const pageSize = integerValue(pagination, 'page_size', 1)
  const total = integerValue(pagination, 'total')
  if (pageSize > 50) throw contractError('服务返回的分页信息无效')
  return { items: response.items.map(parseSummary), pagination: { page, page_size: pageSize, total } }
}

function parseRetry(value: unknown): RetrySyncTaskResponse {
  const response = record(value, '服务返回的重试任务无效')
  return {
    task_id: requiredString(response, 'task_id'),
    status: enumValue(response, 'status', SYNC_TASK_STATUSES),
    retry_of_task_id: requiredString(response, 'retry_of_task_id'),
  }
}

function errorCategory(status: number, code?: string): SyncErrorCategory {
  if (status === 400) return 'validation'
  if (status === 404) return 'not_found'
  if (status === 409 || code === 'SYNC_TASK_CONFLICT' || code === 'SYNC_TASK_NOT_RETRYABLE') return 'conflict'
  if (status === 503 || code === 'DATA_SOURCE_UNAVAILABLE') return 'unavailable'
  return 'server'
}

function parseHttpError(status: number, payload: unknown): SyncApiError {
  const body = record(payload, '服务错误响应无效')
  const code = requiredString(body, 'code')
  const message = requiredString(body, 'message')
  return new SyncApiError(message, errorCategory(status, code), status, code, body.details)
}

async function jsonPayload(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

async function request<T>(url: string, init: RequestInit, parse: (value: unknown) => T): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init.headers } })
  } catch {
    throw new SyncApiError('无法连接同步服务', 'network')
  }
  const payload = await jsonPayload(response)
  if (!response.ok) throw parseHttpError(response.status, payload)
  return parse(payload)
}

function requestError(message: string, details?: unknown): never {
  throw new SyncApiError(message, 'validation', 400, 'INVALID_REQUEST', details)
}

function isSyncTarget(value: unknown): value is SyncTarget {
  return typeof value === 'string' && SYNC_TARGETS.includes(value as SyncTarget)
}

function validateCreateRequest(request: CreateSyncTaskRequest): void {
  if (typeof request !== 'object' || request === null || !isSyncTarget(request.target)) {
    requestError('同步目标无效', { field: 'target' })
  }
  const hasStart = request.start_date !== undefined
  const hasEnd = request.end_date !== undefined
  if (request.target === 'basic_info' && (hasStart || hasEnd)) {
    requestError('基础资料同步不适用日期范围')
  }
  if (request.target !== 'basic_info' && (!isDate(request.start_date) || !isDate(request.end_date))) {
    requestError('历史日线同步必须提供有效日期范围')
  }
  if (request.start_date && request.end_date && request.start_date > request.end_date) {
    requestError('同步日期范围无效', { field: 'end_date', reason: 'must_not_be_before_start_date' })
  }
}

function validatePagination(page: number, pageSize: number): void {
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    throw new SyncApiError('分页参数无效', 'validation', 400, 'INVALID_PAGINATION')
  }
}

function taskPath(taskId: string): string {
  if (typeof taskId !== 'string' || taskId.trim() === '') requestError('任务标识无效', { field: 'task_id' })
  return encodeURIComponent(taskId)
}

function createBody(request: CreateSyncTaskRequest): string {
  validateCreateRequest(request)
  return JSON.stringify({
    target: request.target,
    ...(request.target !== 'basic_info' ? { start_date: request.start_date, end_date: request.end_date } : {}),
  })
}

const realApi: SyncApi = {
  listTasks: (page = 1, pageSize = 10) => {
    validatePagination(page, pageSize)
    const query = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
    return request(`/api/v1/stock/data/sync-tasks?${query}`, {}, parseList)
  },
  getTask: (taskId) => request(`/api/v1/stock/data/sync-tasks/${taskPath(taskId)}`, {}, parseTask),
  createTask: (requestData) => request('/api/v1/stock/data/sync-tasks', { method: 'POST', body: createBody(requestData) }, parseTask),
  retryTask: (taskId) =>
    request(`/api/v1/stock/data/sync-tasks/${taskPath(taskId)}/retry`, { method: 'POST' }, parseRetry),
}

const MOCK_SOURCE: DataSource = { provider: 'mock', mode: 'mock' }
const MOCK_DATE = '2026-09-26T08:00:00Z'
let mockSequence = 0

function mockTask(overrides: Partial<SyncTask> & Pick<SyncTask, 'task_id' | 'target' | 'status'>): SyncTask {
  return {
    task_id: overrides.task_id,
    target: overrides.target,
    trigger: overrides.trigger ?? 'manual',
    status: overrides.status,
    source: MOCK_SOURCE,
    updated_at: overrides.updated_at ?? MOCK_DATE,
    failure_reason: overrides.failure_reason ?? null,
    data_as_of: overrides.data_as_of ?? '2026-09-25',
    start_date: overrides.start_date ?? '2026-01-01',
    end_date: overrides.end_date ?? '2026-09-25',
    created_at: overrides.created_at ?? MOCK_DATE,
    started_at: overrides.started_at ?? MOCK_DATE,
    finished_at: overrides.finished_at ?? (overrides.status === 'succeeded' ? MOCK_DATE : null),
    retry_count: overrides.retry_count ?? 0,
    max_retries: overrides.max_retries ?? 3,
    result: overrides.result ?? null,
    ...(overrides.retry_of_task_id ? { retry_of_task_id: overrides.retry_of_task_id } : {}),
  }
}

let mockTasks: SyncTask[] = [
  mockTask({ task_id: 'mock-running', target: 'daily_bars', status: 'running' }),
  mockTask({
    task_id: 'mock-succeeded',
    target: 'basic_info',
    status: 'succeeded',
    result: { processed_count: 5200, created_count: 16, updated_count: 5184, failed_count: 0 },
  }),
  mockTask({
    task_id: 'mock-failed',
    target: 'all',
    status: 'failed',
    failure_reason: '开发 Mock 模拟数据源暂不可用',
    retry_count: 3,
    result: { processed_count: 5200, created_count: 0, updated_count: 0, failed_count: 5200 },
  }),
]

function runningStatus(status: SyncTaskStatus): boolean {
  return status === 'pending' || status === 'running' || status === 'retrying'
}

function sortedMockTasks(): SyncTask[] {
  return [...mockTasks].sort((left, right) => {
    if (runningStatus(left.status) !== runningStatus(right.status)) return runningStatus(left.status) ? -1 : 1
    return (right.updated_at ?? right.created_at).localeCompare(left.updated_at ?? left.created_at)
  })
}

function mockConflict(target: SyncTarget): SyncApiError | undefined {
  const task = mockTasks.find((item) => item.target === target && runningStatus(item.status))
  return task
    ? new SyncApiError('已有同一同步目标的任务正在执行，请查看任务列表', 'conflict', 409, 'SYNC_TASK_CONFLICT', {
        task_id: task.task_id,
      })
    : undefined
}

function newMockTask(request: CreateSyncTaskRequest, retryOfTaskId?: string): SyncTask {
  const now = new Date().toISOString()
  return mockTask({
    task_id: `mock-${Date.now()}-${++mockSequence}`,
    target: request.target,
    status: 'pending',
    start_date: request.start_date ?? null,
    end_date: request.end_date ?? null,
    created_at: now,
    updated_at: null,
    data_as_of: null,
    started_at: null,
    finished_at: null,
    ...(retryOfTaskId ? { retry_of_task_id: retryOfTaskId } : {}),
  })
}

const mockApi: SyncApi = {
  listTasks: async (page = 1, pageSize = 10) => {
    validatePagination(page, pageSize)
    const tasks = sortedMockTasks()
    const value = {
      items: tasks.slice((page - 1) * pageSize, page * pageSize),
      pagination: { page, page_size: pageSize, total: tasks.length },
    }
    return parseList(value)
  },
  getTask: async (taskId) => {
    const task = mockTasks.find((item) => item.task_id === taskId)
    if (!task) throw new SyncApiError('同步任务不存在', 'not_found', 404, 'SYNC_TASK_NOT_FOUND')
    return parseTask(task)
  },
  createTask: async (requestData) => {
    validateCreateRequest(requestData)
    const conflict = mockConflict(requestData.target)
    if (conflict) throw conflict
    const task = newMockTask(requestData)
    mockTasks = [task, ...mockTasks]
    return parseTask(task)
  },
  retryTask: async (taskId) => {
    const sourceTask = mockTasks.find((item) => item.task_id === taskId)
    if (!sourceTask) throw new SyncApiError('同步任务不存在', 'not_found', 404, 'SYNC_TASK_NOT_FOUND')
    if (sourceTask.status !== 'failed') {
      throw new SyncApiError('当前任务不可重试', 'conflict', 409, 'SYNC_TASK_NOT_RETRYABLE')
    }
    const conflict = mockConflict(sourceTask.target)
    if (conflict) throw conflict
    const task = newMockTask(
      {
        target: sourceTask.target,
        ...(sourceTask.start_date ? { start_date: sourceTask.start_date } : {}),
        ...(sourceTask.end_date ? { end_date: sourceTask.end_date } : {}),
      },
      sourceTask.task_id,
    )
    mockTasks = [task, ...mockTasks]
    return parseRetry({ task_id: task.task_id, status: task.status, retry_of_task_id: sourceTask.task_id })
  },
}

export function getSyncApiMode(): SyncApiMode {
  // 只有显式 mock 才进入内存适配器，真实请求失败时不改变选择结果。
  return import.meta.env.VITE_STOCK_DATA_API_MODE === 'mock' ? 'mock' : 'real'
}

function selectedApi(): SyncApi {
  return getSyncApiMode() === 'mock' ? mockApi : realApi
}

export const syncTasksApi: SyncApi = {
  listTasks: (page, pageSize) => selectedApi().listTasks(page, pageSize),
  getTask: (taskId) => selectedApi().getTask(taskId),
  createTask: (request) => selectedApi().createTask(request),
  retryTask: (taskId) => selectedApi().retryTask(taskId),
}

export const syncApi = syncTasksApi
