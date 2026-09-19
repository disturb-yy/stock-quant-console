import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './client'
import { createResearchProject, getResearchProject, listResearchProjects } from './research'

const project = {
  id: 7,
  name: '银行估值研究',
  description: '记录估值判断。',
  created_at: '2026-09-20T01:00:00Z',
  updated_at: '2026-09-20T02:00:00Z',
}

const listResponse = {
  data: [project],
  pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 },
}

describe('research API', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('creates a project through the approved endpoint with generated response validation', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(project), { status: 200 }))

    await expect(createResearchProject({ name: '银行估值研究', description: '记录估值判断。' })).resolves.toEqual(project)

    expect(fetchSpy).toHaveBeenCalledWith('/api/v1/research', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ name: '银行估值研究', description: '记录估值判断。' }),
    }))
  })

  it('uses server pagination and keeps server ordering unchanged', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(listResponse), { status: 200 }))

    await expect(listResearchProjects(2, 10)).resolves.toEqual(listResponse)

    expect(fetchSpy.mock.calls[0][0]).toBe('/api/v1/research?page=2&page_size=10')
  })

  it('encodes the server project id for detail reads', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(project), { status: 200 }))

    await expect(getResearchProject(7)).resolves.toEqual(project)

    expect(fetchSpy.mock.calls[0][0]).toBe('/api/v1/research/7')
  })

  it('rejects invalid success payloads instead of creating a client-side project', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }))

    await expect(listResearchProjects()).rejects.toMatchObject<Partial<ApiError>>({ kind: 'invalid-payload' })
  })
})
