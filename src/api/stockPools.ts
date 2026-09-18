import { apiRequest, isApiErrorResponse, type PayloadValidator } from './client'
import type {
  PaginationMeta,
  StockPool,
  StockPoolCreateRequest,
  StockPoolListResponse,
  StockPoolMember,
  StockPoolMemberAddRequest,
  StockPoolMemberAddResponse,
  StockPoolMemberDeleteResponse,
  StockPoolMemberListResponse,
} from './types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isPaginationMeta(value: unknown): value is PaginationMeta {
  if (!isRecord(value)) return false
  return ['page', 'page_size', 'total', 'total_pages'].every((key) => typeof value[key] === 'number' && Number.isInteger(value[key]))
}

const stockPoolMemberSymbolPattern = /^[A-Za-z0-9]{1,16}\.[A-Za-z]{2,8}$/

export const isStockPool: PayloadValidator<StockPool> = (value): value is StockPool => {
  if (!isRecord(value)) return false
  return typeof value.id === 'number'
    && Number.isInteger(value.id)
    && value.id > 0
    && typeof value.name === 'string'
    && (typeof value.description === 'string' || value.description === null)
    && value.source === 'manual'
    && typeof value.member_count === 'number'
    && Number.isInteger(value.member_count)
    && value.member_count >= 0
    && typeof value.created_at === 'string'
    && typeof value.updated_at === 'string'
}

export const isStockPoolListResponse: PayloadValidator<StockPoolListResponse> = (value): value is StockPoolListResponse => {
  if (!isRecord(value) || !Array.isArray(value.data) || !isPaginationMeta(value.pagination)) return false
  return value.data.every(isStockPool)
}

export const isStockPoolMember: PayloadValidator<StockPoolMember> = (value): value is StockPoolMember => {
  if (!isRecord(value)) return false
  return typeof value.symbol === 'string' && stockPoolMemberSymbolPattern.test(value.symbol) && typeof value.name === 'string'
}

export const isStockPoolMemberListResponse: PayloadValidator<StockPoolMemberListResponse> = (value): value is StockPoolMemberListResponse => {
  if (!isRecord(value) || !Array.isArray(value.data) || !isPaginationMeta(value.pagination)) return false
  return value.data.every(isStockPoolMember)
}

export const isStockPoolMemberAddResponse: PayloadValidator<StockPoolMemberAddResponse> = (value): value is StockPoolMemberAddResponse => {
  if (!isRecord(value)) return false
  return isStockPoolMember(value.member)
    && typeof value.member_count === 'number'
    && Number.isInteger(value.member_count)
    && value.member_count >= 0
}

export const isStockPoolMemberDeleteResponse: PayloadValidator<StockPoolMemberDeleteResponse> = (value): value is StockPoolMemberDeleteResponse => {
  if (!isRecord(value)) return false
  return typeof value.symbol === 'string'
    && stockPoolMemberSymbolPattern.test(value.symbol)
    && typeof value.member_count === 'number'
    && Number.isInteger(value.member_count)
    && value.member_count >= 0
}

export async function createStockPool(request: StockPoolCreateRequest, signal?: AbortSignal): Promise<StockPool> {
  return apiRequest<StockPool>('/api/v1/stock-pools', {
    method: 'POST',
    signal,
    json: request,
    validateResponse: isStockPool,
    parseError: isApiErrorResponse,
  })
}

export async function listStockPools(query = '', page = 1, pageSize = 20, signal?: AbortSignal): Promise<StockPoolListResponse> {
  const params = new URLSearchParams({ q: query, page: String(page), page_size: String(pageSize) })
  if (!query) params.delete('q')
  return apiRequest<StockPoolListResponse>(`/api/v1/stock-pools?${params.toString()}`, {
    method: 'GET',
    signal,
    validateResponse: isStockPoolListResponse,
    parseError: isApiErrorResponse,
  })
}

export async function getStockPool(id: number, signal?: AbortSignal): Promise<StockPool> {
  return apiRequest<StockPool>(`/api/v1/stock-pools/${encodeURIComponent(String(id))}`, {
    method: 'GET',
    signal,
    validateResponse: isStockPool,
    parseError: isApiErrorResponse,
  })
}

export async function listStockPoolMembers(id: number, page = 1, pageSize = 20, signal?: AbortSignal): Promise<StockPoolMemberListResponse> {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
  return apiRequest<StockPoolMemberListResponse>(`/api/v1/stock-pools/${encodeURIComponent(String(id))}/members?${params.toString()}`, {
    method: 'GET',
    signal,
    validateResponse: isStockPoolMemberListResponse,
    parseError: isApiErrorResponse,
  })
}

export async function addStockPoolMember(id: number, request: StockPoolMemberAddRequest, signal?: AbortSignal): Promise<StockPoolMemberAddResponse> {
  return apiRequest<StockPoolMemberAddResponse>(`/api/v1/stock-pools/${encodeURIComponent(String(id))}/members`, {
    method: 'POST',
    signal,
    json: request,
    validateResponse: isStockPoolMemberAddResponse,
    parseError: isApiErrorResponse,
  })
}

export async function deleteStockPoolMember(id: number, symbol: string, signal?: AbortSignal): Promise<StockPoolMemberDeleteResponse> {
  return apiRequest<StockPoolMemberDeleteResponse>(`/api/v1/stock-pools/${encodeURIComponent(String(id))}/members/${encodeURIComponent(symbol)}`, {
    method: 'DELETE',
    signal,
    validateResponse: isStockPoolMemberDeleteResponse,
    parseError: isApiErrorResponse,
  })
}
