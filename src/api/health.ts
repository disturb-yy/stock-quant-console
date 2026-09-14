export interface HealthResponse {
  status: string
}

export class HealthRequestError extends Error {
  readonly kind: 'network' | 'http' | 'payload'

  constructor(message: string, kind: HealthRequestError['kind']) {
    super(message)
    this.name = 'HealthRequestError'
    this.kind = kind
  }
}

function isHealthResponse(value: unknown): value is HealthResponse {
  return typeof value === 'object' && value !== null && 'status' in value && typeof value.status === 'string'
}

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  let response: Response

  try {
    response = await fetch('/api/v1/health', {
      headers: { Accept: 'application/json' },
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }
    throw new HealthRequestError('无法连接健康检查接口', 'network')
  }

  if (!response.ok) {
    throw new HealthRequestError(`健康检查接口返回 HTTP ${response.status}`, 'http')
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new HealthRequestError('健康检查响应不是有效 JSON', 'payload')
  }

  if (!isHealthResponse(payload)) {
    throw new HealthRequestError('健康检查响应缺少有效 status 字段', 'payload')
  }

  return payload
}
