import { SyncApiError, type DataSource } from './syncTasks'

export type StockAvailability = 'available' | 'empty'

export interface StockBasicInfo {
  symbol: string
  name: string
  market: string
  status: string
}

export interface StockDailyBar {
  trade_date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface StockDataResponse {
  symbol: string
  basic_info: StockBasicInfo | null
  daily_bars: StockDailyBar[]
  availability: {
    basic_info: StockAvailability
    daily_bars: StockAvailability
  }
  source: DataSource | null
  updated_at: string | null
  data_as_of: string | null
}

export interface StockDataQuery {
  start_date?: string
  end_date?: string
}

function contractError(message: string): SyncApiError {
  return new SyncApiError(message, 'contract')
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

function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function isDateTime(value: unknown): value is string {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value))
}

function nullableDate(value: Record<string, unknown>, key: string): string | null {
  const result = nullableString(value, key)
  if (result !== null && !isDate(result)) throw contractError(`服务返回的 ${key} 字段无效`)
  return result
}

function nullableDateTime(value: Record<string, unknown>, key: string): string | null {
  const result = nullableString(value, key)
  if (result !== null && !isDateTime(result)) throw contractError(`服务返回的 ${key} 字段无效`)
  return result
}

function enumValue<T extends string>(value: Record<string, unknown>, key: string, options: readonly T[]): T {
  if (typeof value[key] !== 'string' || !options.includes(value[key] as T)) throw contractError(`服务返回的 ${key} 字段无效`)
  return value[key] as T
}

function parseBasicInfo(value: unknown): StockBasicInfo | null {
  if (value === null) return null
  const info = record(value, '服务返回的基础资料无效')
  return { symbol: requiredString(info, 'symbol'), name: requiredString(info, 'name'), market: requiredString(info, 'market'), status: requiredString(info, 'status') }
}

function numberValue(value: Record<string, unknown>, key: string): number {
  if (typeof value[key] !== 'number' || !Number.isFinite(value[key])) throw contractError(`服务返回的 ${key} 字段无效`)
  return value[key] as number
}

function parseDailyBar(value: unknown): StockDailyBar {
  const bar = record(value, '服务返回的日线数据无效')
  const tradeDate = requiredString(bar, 'trade_date')
  if (!isDate(tradeDate)) throw contractError('服务返回的 trade_date 字段无效')
  return { trade_date: tradeDate, open: numberValue(bar, 'open'), high: numberValue(bar, 'high'), low: numberValue(bar, 'low'), close: numberValue(bar, 'close'), volume: numberValue(bar, 'volume') }
}

function parseSource(value: unknown): DataSource | null {
  if (value === null) return null
  const source = record(value, '服务返回的数据来源无效')
  const provider = enumValue(source, 'provider', ['tushare', 'mock'])
  const mode = enumValue(source, 'mode', ['external', 'mock'])
  if ((provider === 'mock') !== (mode === 'mock')) throw contractError('服务返回的数据来源组合无效')
  return { provider, mode }
}

function parseResponse(value: unknown): StockDataResponse {
  const response = record(value, '服务返回的股票数据无效')
  const availability = record(response.availability, '服务返回的数据可用性无效')
  if (!Array.isArray(response.daily_bars)) throw contractError('服务返回的日线数据无效')
  return {
    symbol: requiredString(response, 'symbol'),
    basic_info: parseBasicInfo(response.basic_info),
    daily_bars: response.daily_bars.map(parseDailyBar),
    availability: { basic_info: enumValue(availability, 'basic_info', ['available', 'empty']), daily_bars: enumValue(availability, 'daily_bars', ['available', 'empty']) },
    source: parseSource(response.source),
    updated_at: nullableDateTime(response, 'updated_at'),
    data_as_of: nullableDate(response, 'data_as_of'),
  }
}

function validateQuery(symbol: string, query: StockDataQuery): void {
  if (!symbol.trim()) throw new SyncApiError('请输入股票标识', 'validation', 400, 'INVALID_REQUEST', { field: 'symbol' })
  const hasStart = query.start_date !== undefined && query.start_date !== ''
  const hasEnd = query.end_date !== undefined && query.end_date !== ''
  if (hasStart !== hasEnd) throw new SyncApiError('开始日期和结束日期需要同时填写', 'validation', 400, 'INVALID_REQUEST')
  if (hasStart && (!isDate(query.start_date) || !isDate(query.end_date))) throw new SyncApiError('日期格式无效', 'validation', 400, 'INVALID_REQUEST')
  if (hasStart && query.start_date! > query.end_date!) throw new SyncApiError('结束日期不能早于开始日期', 'validation', 400, 'INVALID_REQUEST', { field: 'end_date' })
}

async function jsonPayload(response: Response): Promise<unknown> {
  try { return await response.json() } catch { return undefined }
}

function httpError(status: number, payload: unknown): SyncApiError {
  const body = record(payload, '服务错误响应无效')
  const code = requiredString(body, 'code')
  const message = requiredString(body, 'message')
  const category = status === 400 ? 'validation' : status === 404 ? 'not_found' : status === 503 ? 'unavailable' : 'server'
  return new SyncApiError(message, category, status, code, body.details)
}

async function request(symbol: string, query: StockDataQuery): Promise<StockDataResponse> {
  validateQuery(symbol, query)
  const params = new URLSearchParams()
  if (query.start_date) params.set('start_date', query.start_date)
  if (query.end_date) params.set('end_date', query.end_date)
  const suffix = params.toString() ? `?${params.toString()}` : ''
  let response: Response
  try {
    response = await fetch(`/api/v1/stocks/${encodeURIComponent(symbol)}/data${suffix}`, { headers: { 'Content-Type': 'application/json' } })
  } catch {
    throw new SyncApiError('无法连接股票数据服务', 'network')
  }
  const payload = await jsonPayload(response)
  if (!response.ok) throw httpError(response.status, payload)
  return parseResponse(payload)
}

export const stockDataApi = {
  getStockData: (symbol: string, query: StockDataQuery = {}) => request(symbol, query),
}
