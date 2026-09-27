import {
  getSyncApiMode,
  SyncApiError,
  type DataSource,
  type SyncApiMode,
} from './syncTasks'

export interface RuntimeFeatures {
  market_quotes: boolean
  stock_catalog: boolean
  sync_tasks: boolean
}

export interface RuntimeConfig {
  data_source: DataSource
  features: RuntimeFeatures
}

export interface RuntimeConfigApi {
  get(): Promise<RuntimeConfig>
}

const MOCK_RUNTIME_CONFIG: RuntimeConfig = {
  data_source: { provider: 'mock', mode: 'mock' },
  features: { market_quotes: false, stock_catalog: true, sync_tasks: true },
}

function contractError(message: string): SyncApiError {
  return new SyncApiError(message, 'contract')
}

function record(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw contractError(message)
  return value as Record<string, unknown>
}

function requiredBoolean(value: Record<string, unknown>, key: string): boolean {
  if (typeof value[key] !== 'boolean') throw contractError(`服务返回的 ${key} 字段无效`)
  return value[key] as boolean
}

function parseRuntimeConfig(value: unknown): RuntimeConfig {
  const response = record(value, '服务返回的运行配置无效')
  const source = record(response.data_source, '服务返回的数据来源无效')
  const provider = source.provider
  const mode = source.mode
  if (provider !== 'tushare' && provider !== 'mock') throw contractError('服务返回的数据来源无效')
  if (mode !== 'external' && mode !== 'mock') throw contractError('服务返回的数据源模式无效')
  if ((provider === 'mock') !== (mode === 'mock')) throw contractError('服务返回的数据来源组合无效')
  const features = record(response.features, '服务返回的能力开关无效')
  return {
    data_source: { provider, mode },
    features: {
      market_quotes: requiredBoolean(features, 'market_quotes'),
      stock_catalog: requiredBoolean(features, 'stock_catalog'),
      sync_tasks: requiredBoolean(features, 'sync_tasks'),
    },
  }
}

async function request(): Promise<RuntimeConfig> {
  let response: Response
  try {
    response = await fetch('/api/v1/runtime-config')
  } catch {
    throw new SyncApiError('无法连接运行配置服务', 'network')
  }
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    payload = undefined
  }
  if (!response.ok) throw new SyncApiError('运行配置服务暂时不可用', response.status === 503 ? 'unavailable' : 'server', response.status)
  return parseRuntimeConfig(payload)
}

const realApi: RuntimeConfigApi = { get: request }
const mockApi: RuntimeConfigApi = { get: async () => parseRuntimeConfig(MOCK_RUNTIME_CONFIG) }

export function getRuntimeConfigApiMode(): SyncApiMode {
  return getSyncApiMode()
}

export function getInitialRuntimeConfig(): RuntimeConfig | null {
  return getRuntimeConfigApiMode() === 'mock' ? MOCK_RUNTIME_CONFIG : null
}

export const runtimeConfigApi: RuntimeConfigApi = {
  get: () => (getRuntimeConfigApiMode() === 'mock' ? mockApi : realApi).get(),
}
