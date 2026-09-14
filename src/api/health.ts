import { apiRequest, isApiErrorResponse, type PayloadValidator } from './client'
import type { HealthResponse } from './types'

export type { HealthResponse } from './types'

export const isHealthResponse: PayloadValidator<HealthResponse> = (value): value is HealthResponse => {
  return typeof value === 'object' && value !== null && 'status' in value && typeof value.status === 'string'
}

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return apiRequest<HealthResponse>('/api/v1/health', {
    signal,
    validateResponse: isHealthResponse,
    parseError: isApiErrorResponse,
  })
}
