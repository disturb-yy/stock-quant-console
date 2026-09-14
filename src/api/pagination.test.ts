import { describe, expect, it } from 'vitest'
import type {
  OpenAPIPaginationRequest,
  PaginatedResponse,
  PaginationMeta,
  PaginationRequest,
  PaginationResponse,
  PaginationTypes,
} from './pagination'

type BackendRequest = { cursor: string }
type BackendResponse = { rows: readonly string[]; total: number }

const request: PaginationRequest<BackendRequest> = { cursor: 'next' }
const response: PaginationResponse<BackendResponse> = { rows: ['run-1'], total: 1 }
const contract: PaginationTypes<BackendRequest, BackendResponse, string> = {
  request,
  response,
  item: 'run-1',
}

const openAPIRequest: OpenAPIPaginationRequest = { page: 1, page_size: 20 }
const openAPIResponse: PaginatedResponse = {
  data: [],
  pagination: { page: 1, page_size: 20, total: 0, total_pages: 0 } satisfies PaginationMeta,
}

describe('pagination type boundary', () => {
  it('keeps the wire contract generic until OpenAPI types are available', () => {
    expect(contract).toEqual({
      request: { cursor: 'next' },
      response: { rows: ['run-1'], total: 1 },
      item: 'run-1',
    })
    expect(openAPIRequest).toEqual({ page: 1, page_size: 20 })
    expect(openAPIResponse.pagination.total).toBe(0)
  })
})
