import type { ErrorResponse } from './types'

export type ApiErrorKind =
  | 'network'
  | 'http'
  | 'backend'
  | 'invalid-json'
  | 'invalid-payload'
  | 'aborted'

export interface ApiErrorInit<TPayload> {
  readonly status?: number
  readonly payload?: TPayload
  readonly cause?: unknown
}

export class ApiError<TPayload = unknown> extends Error {
  readonly kind: ApiErrorKind
  readonly status?: number
  readonly payload?: TPayload

  constructor(kind: ApiErrorKind, message: string, init: ApiErrorInit<TPayload> = {}) {
    super(message, { cause: init.cause })
    this.name = 'ApiError'
    this.kind = kind
    this.status = init.status
    this.payload = init.payload
  }
}

export type PayloadValidator<TPayload> = (value: unknown) => value is TPayload

export interface ApiRequestOptions<TResponse, TError = ErrorResponse> extends Omit<RequestInit, 'body'> {
  readonly json?: unknown
  readonly body?: BodyInit | null
  readonly validateResponse?: PayloadValidator<TResponse>
  readonly parseError?: PayloadValidator<TError>
}

export interface ApiErrorDisplay {
  readonly message: string
  readonly diagnostic: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export const isApiErrorResponse: PayloadValidator<ErrorResponse> = (value): value is ErrorResponse => {
  if (!isRecord(value) || typeof value.code !== 'string' || typeof value.message !== 'string') return false
  return value.details === undefined || isRecord(value.details)
}

export function formatBackendApiError(payload: unknown, status?: number): ApiErrorDisplay {
  if (!isApiErrorResponse(payload)) {
    return {
      message: '服务返回了无法识别的错误',
      diagnostic: status === undefined ? '后端错误结构无效' : `后端错误结构无效 · HTTP ${status}`,
    }
  }

  const statusText = status === undefined ? '' : ` · HTTP ${status}`
  return {
    message: payload.message,
    diagnostic: `${payload.code}${statusText}`,
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError'
}

function buildRequestInit<TResponse, TError>(options: ApiRequestOptions<TResponse, TError>) {
  const { json, validateResponse: _validateResponse, parseError: _parseError, ...requestInit } = options
  if (json !== undefined && requestInit.body !== undefined) {
    throw new TypeError('json 和 body 不能同时提供')
  }

  const headers = new Headers(requestInit.headers)
  if (!headers.has('Accept')) headers.set('Accept', 'application/json')
  if (json !== undefined) {
    headers.set('Content-Type', 'application/json')
    return { ...requestInit, headers, body: JSON.stringify(json) }
  }
  return { ...requestInit, headers }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch (cause) {
    throw new ApiError('invalid-json', 'API 响应不是有效 JSON', {
      status: response.status,
      cause,
    })
  }
}

function assertApiPath(path: string): void {
  if (!path.startsWith('/api/')) {
    throw new TypeError(`API 路径必须是相对路径: ${path}`)
  }
}

export async function apiRequest<TResponse, TError = unknown>(
  path: string,
  options: ApiRequestOptions<TResponse, TError> = {},
): Promise<TResponse> {
  assertApiPath(path)
  const { validateResponse, parseError } = options
  const parseBackendError = parseError ?? (isApiErrorResponse as PayloadValidator<TError>)
  let response: Response
  try {
    response = await fetch(path, buildRequestInit(options))
  } catch (cause) {
    if (isAbortError(cause)) {
      throw new ApiError('aborted', 'API 请求已取消', { cause })
    }
    throw new ApiError('network', '无法连接 API 服务', { cause })
  }

  const payload = await readJson(response)
  if (!response.ok) {
    if (parseBackendError(payload)) {
      throw new ApiError<TError>('backend', '后端返回统一 API 错误', {
        status: response.status,
        payload,
      })
    }
    throw new ApiError('http', `API 请求返回 HTTP ${response.status}`, {
      status: response.status,
      payload,
    })
  }

  if (validateResponse && !validateResponse(payload)) {
    throw new ApiError('invalid-payload', 'API 响应结构不符合契约', {
      status: response.status,
      payload,
    })
  }
  return payload as TResponse
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

export function isApiAbortError(error: unknown): error is ApiError {
  return isApiError(error) && error.kind === 'aborted'
}

export function describeApiError(
  error: unknown,
  formatBackendError?: (payload: unknown, status?: number) => ApiErrorDisplay,
): ApiErrorDisplay {
  if (!(error instanceof ApiError)) {
    return {
      message: error instanceof Error ? error.message : '请求失败',
      diagnostic: '未分类请求错误',
    }
  }
  if (error.kind === 'backend' && formatBackendError) {
    return formatBackendError(error.payload, error.status)
  }
  const status = error.status === undefined ? '' : ` · HTTP ${error.status}`
  const labels: Record<ApiErrorKind, string> = {
    network: '网络连接失败',
    http: '服务请求失败',
    backend: '服务返回业务错误',
    'invalid-json': '服务响应无法解析',
    'invalid-payload': '服务响应不符合契约',
    aborted: '请求已取消',
  }
  return {
    message: error.message,
    diagnostic: `${labels[error.kind]}${status}`,
  }
}
