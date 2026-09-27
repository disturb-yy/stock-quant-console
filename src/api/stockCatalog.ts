import {
  getSyncApiMode,
  SyncApiError,
  type SyncApiMode,
  type SyncErrorCategory,
} from './syncTasks'

export const STOCK_SORT_FIELDS = ['symbol', 'name'] as const
export type StockSortField = (typeof STOCK_SORT_FIELDS)[number]

export const STOCK_SORT_ORDERS = ['asc', 'desc'] as const
export type StockSortOrder = (typeof STOCK_SORT_ORDERS)[number]

export type StockAvailability = 'available' | 'empty'

export interface StockCatalogItem {
  symbol: string
  name: string
  market: string
  status: string
  availability: {
    basic_info: 'available'
    daily_bars: StockAvailability
  }
  data_as_of: string | null
}

export interface StockCatalogPagination {
  page: number
  page_size: number
  total: number
}

export interface StockCatalogResponse {
  items: StockCatalogItem[]
  pagination: StockCatalogPagination
}

export interface StockCatalogQuery {
  keyword?: string
  page?: number
  page_size?: number
  sort_by?: StockSortField
  sort_order?: StockSortOrder
}

export interface StockCatalogApi {
  listStocks(query?: StockCatalogQuery): Promise<StockCatalogResponse>
}

const DEFAULT_QUERY: Required<Pick<StockCatalogQuery, 'page' | 'page_size' | 'sort_by' | 'sort_order'>> = {
  page: 1,
  page_size: 20,
  sort_by: 'symbol',
  sort_order: 'asc',
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

function nullableDate(value: Record<string, unknown>, key: string): string | null {
  if (value[key] === null) return null
  if (typeof value[key] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value[key])) {
    throw contractError(`服务返回的 ${key} 字段无效`)
  }
  return value[key] as string
}

function enumValue<T extends string>(value: Record<string, unknown>, key: string, options: readonly T[]): T {
  if (typeof value[key] !== 'string' || !options.includes(value[key] as T)) throw contractError(`服务返回的 ${key} 字段无效`)
  return value[key] as T
}

function integerValue(value: Record<string, unknown>, key: string, minimum = 0): number {
  if (typeof value[key] !== 'number' || !Number.isInteger(value[key]) || value[key] < minimum) {
    throw contractError(`服务返回的 ${key} 字段无效`)
  }
  return value[key] as number
}

function parseItem(value: unknown): StockCatalogItem {
  const item = record(value, '服务返回的股票目录项无效')
  const availability = record(item.availability, '服务返回的股票可用性无效')
  return {
    symbol: requiredString(item, 'symbol'),
    name: requiredString(item, 'name'),
    market: requiredString(item, 'market'),
    status: requiredString(item, 'status'),
    availability: {
      basic_info: enumValue(availability, 'basic_info', ['available']),
      daily_bars: enumValue(availability, 'daily_bars', ['available', 'empty']),
    },
    data_as_of: nullableDate(item, 'data_as_of'),
  }
}

function parseList(value: unknown): StockCatalogResponse {
  const response = record(value, '服务返回的股票目录无效')
  if (!Array.isArray(response.items)) throw contractError('服务返回的股票目录无效')
  const pagination = record(response.pagination, '服务返回的分页信息无效')
  const page = integerValue(pagination, 'page', 1)
  const pageSize = integerValue(pagination, 'page_size', 1)
  const total = integerValue(pagination, 'total')
  if (pageSize > 50) throw contractError('服务返回的分页信息无效')
  return {
    items: response.items.map(parseItem),
    pagination: { page, page_size: pageSize, total },
  }
}

function errorCategory(status: number, code?: string): SyncErrorCategory {
  if (status === 400) return 'validation'
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

async function request<T>(url: string, parse: (value: unknown) => T): Promise<T> {
  let response: Response
  try {
    response = await fetch(url)
  } catch {
    throw new SyncApiError('无法连接股票目录服务', 'network')
  }
  const payload = await jsonPayload(response)
  if (!response.ok) throw parseHttpError(response.status, payload)
  return parse(payload)
}

function validateQuery(query: StockCatalogQuery): void {
  if (query.keyword !== undefined && typeof query.keyword !== 'string') {
    throw new SyncApiError('搜索条件无效', 'validation', 400, 'INVALID_REQUEST', { field: 'keyword' })
  }
  if (!Number.isInteger(query.page) || (query.page ?? 1) < 1 || !Number.isInteger(query.page_size) || (query.page_size ?? 20) < 1 || (query.page_size ?? 20) > 50) {
    throw new SyncApiError('分页参数无效', 'validation', 400, 'INVALID_REQUEST')
  }
  if (!STOCK_SORT_FIELDS.includes(query.sort_by ?? 'symbol')) {
    throw new SyncApiError('排序字段无效', 'validation', 400, 'INVALID_REQUEST', { field: 'sort_by' })
  }
  if (!STOCK_SORT_ORDERS.includes(query.sort_order ?? 'asc')) {
    throw new SyncApiError('排序方向无效', 'validation', 400, 'INVALID_REQUEST', { field: 'sort_order' })
  }
}

function normalizeQuery(query: StockCatalogQuery = {}): Required<StockCatalogQuery> {
  const normalized = { ...DEFAULT_QUERY, ...query }
  validateQuery(normalized)
  return { keyword: normalized.keyword ?? '', ...normalized }
}

function queryString(query: Required<StockCatalogQuery>): string {
  const params = new URLSearchParams()
  if (query.keyword) params.set('keyword', query.keyword)
  params.set('page', String(query.page))
  params.set('page_size', String(query.page_size))
  params.set('sort_by', query.sort_by)
  params.set('sort_order', query.sort_order)
  return params.toString()
}

const realApi: StockCatalogApi = {
  listStocks: async (query = {}) => {
    const normalized = normalizeQuery(query)
    return request(`/api/v1/stocks?${queryString(normalized)}`, parseList)
  },
}

const MOCK_ITEMS: StockCatalogItem[] = [
  {
    symbol: '000001.SZ', name: '平安银行', market: 'A', status: 'normal',
    availability: { basic_info: 'available', daily_bars: 'available' }, data_as_of: '2026-09-25',
  },
  {
    symbol: '000858.SZ', name: '五粮液', market: 'A', status: 'normal',
    availability: { basic_info: 'available', daily_bars: 'empty' }, data_as_of: null,
  },
  {
    symbol: '300750.SZ', name: '宁德时代', market: 'A', status: 'normal',
    availability: { basic_info: 'available', daily_bars: 'available' }, data_as_of: '2026-09-26',
  },
  {
    symbol: '600519.SH', name: '贵州茅台', market: 'A', status: 'normal',
    availability: { basic_info: 'available', daily_bars: 'available' }, data_as_of: '2026-09-26',
  },
]

function compareItems(left: StockCatalogItem, right: StockCatalogItem, query: Required<StockCatalogQuery>): number {
  const direction = query.sort_order === 'asc' ? 1 : -1
  const primary = left[query.sort_by].localeCompare(right[query.sort_by], 'zh-CN') * direction
  return primary || left.symbol.localeCompare(right.symbol)
}

const mockApi: StockCatalogApi = {
  listStocks: async (query = {}) => {
    const normalized = normalizeQuery(query)
    const keyword = normalized.keyword.toLocaleLowerCase('zh-CN')
    const filtered = MOCK_ITEMS
      .filter((item) => !keyword || `${item.symbol} ${item.name}`.toLocaleLowerCase('zh-CN').includes(keyword))
      .sort((left, right) => compareItems(left, right, normalized))
    const start = (normalized.page - 1) * normalized.page_size
    return parseList({
      items: filtered.slice(start, start + normalized.page_size),
      pagination: { page: normalized.page, page_size: normalized.page_size, total: filtered.length },
    })
  },
}

export function getStockCatalogApiMode(): SyncApiMode {
  return getSyncApiMode()
}

function selectedApi(): StockCatalogApi {
  return getStockCatalogApiMode() === 'mock' ? mockApi : realApi
}

export const stockCatalogApi: StockCatalogApi = {
  listStocks: (query) => selectedApi().listStocks(query),
}
