import { apiRequest, isApiErrorResponse, type PayloadValidator } from './client'
import type { PaginationMeta, ResearchCreateRequest, ResearchListResponse, ResearchProject } from './types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isPaginationMeta(value: unknown): value is PaginationMeta {
  if (!isRecord(value)) return false
  return ['page', 'page_size', 'total', 'total_pages'].every((key) => typeof value[key] === 'number' && Number.isInteger(value[key]))
}

export const isResearchProject: PayloadValidator<ResearchProject> = (value): value is ResearchProject => {
  if (!isRecord(value)) return false
  return typeof value.id === 'number'
    && Number.isInteger(value.id)
    && value.id > 0
    && typeof value.name === 'string'
    && (typeof value.description === 'string' || value.description === null)
    && typeof value.created_at === 'string'
    && typeof value.updated_at === 'string'
}

export const isResearchListResponse: PayloadValidator<ResearchListResponse> = (value): value is ResearchListResponse => {
  if (!isRecord(value) || !Array.isArray(value.data) || !isPaginationMeta(value.pagination)) return false
  return value.data.every(isResearchProject)
}

export async function createResearchProject(request: ResearchCreateRequest, signal?: AbortSignal): Promise<ResearchProject> {
  return apiRequest<ResearchProject>('/api/v1/research', {
    method: 'POST',
    signal,
    json: request,
    validateResponse: isResearchProject,
    parseError: isApiErrorResponse,
  })
}

export async function listResearchProjects(page = 1, pageSize = 20, signal?: AbortSignal): Promise<ResearchListResponse> {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
  return apiRequest<ResearchListResponse>(`/api/v1/research?${params.toString()}`, {
    method: 'GET',
    signal,
    validateResponse: isResearchListResponse,
    parseError: isApiErrorResponse,
  })
}

export async function getResearchProject(id: number, signal?: AbortSignal): Promise<ResearchProject> {
  return apiRequest<ResearchProject>(`/api/v1/research/${encodeURIComponent(String(id))}`, {
    method: 'GET',
    signal,
    validateResponse: isResearchProject,
    parseError: isApiErrorResponse,
  })
}
