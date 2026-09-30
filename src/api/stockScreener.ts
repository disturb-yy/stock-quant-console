import { SyncApiError } from './syncTasks'

export const STOCK_SCREENER_PERIODS = [5, 20, 60] as const
export type StockScreenerPeriod = (typeof STOCK_SCREENER_PERIODS)[number]
export const STOCK_SCREENER_CATEGORY_TYPES = ['industry'] as const
export type StockScreenerCategoryType = (typeof STOCK_SCREENER_CATEGORY_TYPES)[number]

export interface StockScreenerQuery {
  category_code?: string
  price_min?: number
  price_max?: number
  return_period?: StockScreenerPeriod
  return_min?: number
  return_max?: number
  volume_period?: StockScreenerPeriod
  average_volume_min?: number
  average_volume_max?: number
  page?: number
  page_size?: number
}

export interface StockScreenerCategory {
  provider: 'tushare'
  source: 'sw'
  type: StockScreenerCategoryType
  code: string
  name: string
  member_count: number
  category_data_as_of: string | null
}

export interface StockScreenerCategoryQuery {
  type?: StockScreenerCategoryType
  keyword?: string
  page?: number
  page_size?: number
}

export interface StockScreenerCategoryResponse {
  provider: 'tushare'
  source: 'sw'
  category_data_as_of: string | null
  items: StockScreenerCategory[]
  pagination: { page: number; page_size: number; total: number }
}

export interface StockScreenerItem {
  symbol: string
  name: string
  close: number
  return: { period: StockScreenerPeriod; value_percent: number } | null
  average_volume: { period: StockScreenerPeriod; value: number } | null
  data_as_of: string | null
}

export interface StockScreenerResponse {
  data_as_of: string | null
  category: StockScreenerCategory | null
  universe: { total: number; category_members: number | null; evaluable: number }
  items: StockScreenerItem[]
  pagination: { page: number; page_size: number; total: number }
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

function requiredNumber(value: Record<string, unknown>, key: string): number {
  if (typeof value[key] !== 'number' || !Number.isFinite(value[key])) throw contractError(`服务返回的 ${key} 字段无效`)
  return value[key] as number
}

function integerValue(value: Record<string, unknown>, key: string, minimum = 0): number {
  const result = requiredNumber(value, key)
  if (!Number.isInteger(result) || result < minimum) throw contractError(`服务返回的 ${key} 字段无效`)
  return result
}

function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function dateValue(value: Record<string, unknown>, key: string): string {
  const result = requiredString(value, key)
  if (!isDate(result)) throw contractError(`服务返回的 ${key} 字段无效`)
  return result
}

function nullableDate(value: Record<string, unknown>, key: string): string | null {
  if (value[key] === null) return null
  return dateValue(value, key)
}

function periodValue(value: Record<string, unknown>, key: string): StockScreenerPeriod {
  const result = integerValue(value, key, 1)
  if (!STOCK_SCREENER_PERIODS.includes(result as StockScreenerPeriod)) throw contractError(`服务返回的 ${key} 字段无效`)
  return result as StockScreenerPeriod
}

function categoryTypeValue(value: Record<string, unknown>, key: string): StockScreenerCategoryType {
  const result = requiredString(value, key)
  if (!STOCK_SCREENER_CATEGORY_TYPES.includes(result as StockScreenerCategoryType)) throw contractError(`服务返回的 ${key} 字段无效`)
  return result as StockScreenerCategoryType
}

function parseCategory(value: unknown): StockScreenerCategory {
  const category = record(value, '服务返回的分类无效')
  if (category.provider !== 'tushare' || category.source !== 'sw') throw contractError('服务返回的分类来源无效')
  const memberCount = category.member_count
  if (typeof memberCount !== 'number' || !Number.isInteger(memberCount) || memberCount < 0) throw contractError('服务返回的 member_count 字段无效')
  return {
    provider: 'tushare',
    source: 'sw',
    type: categoryTypeValue(category, 'type'),
    code: requiredString(category, 'code'),
    name: requiredString(category, 'name'),
    member_count: memberCount,
    category_data_as_of: nullableDate(category, 'category_data_as_of'),
  }
}

function metric(value: unknown, key: string, valueKey: string): { period: StockScreenerPeriod; [valueKey: string]: number } | null {
  if (value === null) return null
  const result = record(value, `服务返回的 ${key} 指标无效`)
  return { period: periodValue(result, 'period'), [valueKey]: requiredNumber(result, valueKey) }
}

function parseItem(value: unknown): StockScreenerItem {
  const item = record(value, '服务返回的选股候选项无效')
  const parsedReturn = metric(item.return, 'return', 'value_percent') as StockScreenerItem['return']
  const parsedAverageVolume = metric(item.average_volume, 'average_volume', 'value') as StockScreenerItem['average_volume']
  return {
    symbol: requiredString(item, 'symbol'),
    name: requiredString(item, 'name'),
    close: requiredNumber(item, 'close'),
    return: parsedReturn,
    average_volume: parsedAverageVolume,
    data_as_of: nullableDate(item, 'data_as_of'),
  }
}

function parseResponse(value: unknown): StockScreenerResponse {
  const response = record(value, '服务返回的选股结果无效')
  const universe = record(response.universe, '服务返回的选股范围摘要无效')
  const pagination = record(response.pagination, '服务返回的分页信息无效')
  if (!Array.isArray(response.items)) throw contractError('服务返回的选股候选列表无效')
  const pageSize = integerValue(pagination, 'page_size', 1)
  if (pageSize > 50) throw contractError('服务返回的分页信息无效')
  return {
    data_as_of: nullableDate(response, 'data_as_of'),
    category: response.category === null ? null : parseCategory(response.category),
    universe: {
      total: integerValue(universe, 'total'),
      category_members: universe.category_members === null ? null : integerValue(universe, 'category_members'),
      evaluable: integerValue(universe, 'evaluable'),
    },
    items: response.items.map(parseItem),
    pagination: { page: integerValue(pagination, 'page', 1), page_size: pageSize, total: integerValue(pagination, 'total') },
  }
}

function validationError(message: string, details?: unknown): SyncApiError {
  return new SyncApiError(message, 'validation', 400, 'INVALID_REQUEST', details)
}

function validateQuery(query: StockScreenerQuery): void {
  const conditionFields = ['price_min', 'price_max', 'return_min', 'return_max', 'average_volume_min', 'average_volume_max'] as const
  if (query.category_code !== undefined && (!query.category_code.trim() || query.category_code.length > 32)) throw validationError('分类无效', { field: 'category_code' })
  if (!query.category_code && !conditionFields.some((field) => query[field] !== undefined)) throw validationError('至少填写一项筛选条件')
  for (const field of ['price_min', 'price_max', 'average_volume_min', 'average_volume_max'] as const) {
    const value = query[field]
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) throw validationError('筛选范围无效', { field })
  }
  for (const field of ['return_min', 'return_max'] as const) {
    const value = query[field]
    if (value !== undefined && !Number.isFinite(value)) throw validationError('筛选范围无效', { field })
  }
  if (query.price_min !== undefined && query.price_max !== undefined && query.price_min > query.price_max) throw validationError('收盘价下限不能高于上限', { field: 'price_min' })
  if (query.return_min !== undefined && query.return_max !== undefined && query.return_min > query.return_max) throw validationError('涨跌幅下限不能高于上限', { field: 'return_min' })
  if (query.average_volume_min !== undefined && query.average_volume_max !== undefined && query.average_volume_min > query.average_volume_max) throw validationError('平均成交量下限不能高于上限', { field: 'average_volume_min' })
  if (query.return_period !== undefined && !STOCK_SCREENER_PERIODS.includes(query.return_period)) throw validationError('涨跌幅周期无效', { field: 'return_period' })
  if (query.volume_period !== undefined && !STOCK_SCREENER_PERIODS.includes(query.volume_period)) throw validationError('平均成交量周期无效', { field: 'volume_period' })
  if (query.page !== undefined && (!Number.isInteger(query.page) || query.page < 1)) throw validationError('页码无效', { field: 'page' })
  if (query.page_size !== undefined && (!Number.isInteger(query.page_size) || query.page_size < 1 || query.page_size > 50)) throw validationError('每页条数无效', { field: 'page_size' })
}

function queryString(query: StockScreenerQuery): string {
  const params = new URLSearchParams()
  const fields: Array<keyof StockScreenerQuery> = ['category_code', 'price_min', 'price_max', 'return_period', 'return_min', 'return_max', 'volume_period', 'average_volume_min', 'average_volume_max', 'page', 'page_size']
  fields.forEach((field) => {
    const value = query[field]
    if (value !== undefined) params.set(field, String(value))
  })
  return params.toString()
}

async function jsonPayload(response: Response): Promise<unknown> {
  try { return await response.json() } catch { return undefined }
}

function httpError(status: number, payload: unknown): SyncApiError {
  const body = record(payload, '服务错误响应无效')
  const code = requiredString(body, 'code')
  const message = requiredString(body, 'message')
  const category = status === 400 ? 'validation' : status === 503 || code === 'DATA_SOURCE_UNAVAILABLE' || code === 'CATEGORY_DATA_UNAVAILABLE' ? 'unavailable' : 'server'
  return new SyncApiError(message, category, status, code, body.details)
}

async function request(query: StockScreenerQuery): Promise<StockScreenerResponse> {
  validateQuery(query)
  const params = { ...query, page: query.page ?? 1, page_size: query.page_size ?? 20 }
  let response: Response
  try {
    response = await fetch(`/api/v1/stocks/screener?${queryString(params)}`)
  } catch {
    throw new SyncApiError('无法连接条件选股服务', 'network')
  }
  const payload = await jsonPayload(response)
  if (!response.ok) throw httpError(response.status, payload)
  return parseResponse(payload)
}

function categoryQueryString(query: StockScreenerCategoryQuery): string {
  const params = new URLSearchParams()
  const fields: Array<keyof StockScreenerCategoryQuery> = ['type', 'keyword', 'page', 'page_size']
  fields.forEach((field) => {
    const value = query[field]
    if (value !== undefined && value !== '') params.set(field, String(value))
  })
  return params.toString()
}

function parseCategoryResponse(value: unknown): StockScreenerCategoryResponse {
  const response = record(value, '服务返回的分类目录无效')
  const pagination = record(response.pagination, '服务返回的分类目录分页信息无效')
  if (!Array.isArray(response.items)) throw contractError('服务返回的分类目录无效')
  const pageSize = integerValue(pagination, 'page_size', 1)
  if (pageSize > 50) throw contractError('服务返回的分类目录分页信息无效')
  return {
    provider: response.provider === 'tushare' ? 'tushare' : (() => { throw contractError('服务返回的分类目录来源无效') })(),
    source: response.source === 'sw' ? 'sw' : (() => { throw contractError('服务返回的分类目录来源无效') })(),
    category_data_as_of: nullableDate(response, 'category_data_as_of'),
    items: response.items.map(parseCategory),
    pagination: { page: integerValue(pagination, 'page', 1), page_size: pageSize, total: integerValue(pagination, 'total') },
  }
}

async function requestCategories(query: StockScreenerCategoryQuery = {}): Promise<StockScreenerCategoryResponse> {
  if (query.page !== undefined && (!Number.isInteger(query.page) || query.page < 1)) throw validationError('分类目录页码无效')
  if (query.page_size !== undefined && (!Number.isInteger(query.page_size) || query.page_size < 1 || query.page_size > 50)) throw validationError('分类目录每页条数无效')
  if (query.type !== undefined && !STOCK_SCREENER_CATEGORY_TYPES.includes(query.type)) throw validationError('分类类型无效')
  let response: Response
  try {
    response = await fetch(`/api/v1/stocks/screener/categories?${categoryQueryString({ page: 1, page_size: 50, ...query })}`)
  } catch {
    throw new SyncApiError('无法连接分类目录服务', 'network')
  }
  const payload = await jsonPayload(response)
  if (!response.ok) throw httpError(response.status, payload)
  return parseCategoryResponse(payload)
}

export const stockScreenerApi = {
  listStocks: (query: StockScreenerQuery) => request(query),
  listCategories: (query?: StockScreenerCategoryQuery) => requestCategories(query),
}
