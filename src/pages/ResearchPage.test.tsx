import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { createResearchProject, listResearchProjects } from '../api/research'
import type { ResearchListResponse, ResearchProject } from '../api/types'
import { ResearchPage } from './ResearchPage'

vi.mock('../api/research', async () => {
  const actual = await vi.importActual<typeof import('../api/research')>('../api/research')
  return {
    ...actual,
    createResearchProject: vi.fn(),
    listResearchProjects: vi.fn(),
  }
})

const olderProject: ResearchProject = {
  id: 1,
  name: '估值研究',
  description: '记录估值判断。',
  created_at: '2026-09-18T01:00:00Z',
  updated_at: '2026-09-18T02:00:00Z',
}

const recentProject: ResearchProject = {
  id: 2,
  name: '行业研究',
  description: null,
  created_at: '2026-09-19T01:00:00Z',
  updated_at: '2026-09-20T02:00:00Z',
}

const listResponse: ResearchListResponse = {
  data: [recentProject, olderProject],
  pagination: { page: 1, page_size: 20, total: 2, total_pages: 1 },
}

const createResearchProjectMock = vi.mocked(createResearchProject)
const listResearchProjectsMock = vi.mocked(listResearchProjects)

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/research']}>
      <Routes><Route path="/research" element={<ResearchPage />} /></Routes>
    </MemoryRouter>,
  )
}

describe('ResearchPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listResearchProjectsMock.mockResolvedValue(listResponse)
    createResearchProjectMock.mockResolvedValue({
      ...recentProject,
      id: 8,
      name: '新建研究',
      description: '新的研究描述',
    })
  })

  it('renders server projects in received order without a fake continuation link', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: '行业研究' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '估值研究' })).toBeInTheDocument()
    expect(screen.getByText('按更新时间倒序')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /继续研究|打开研究/ })).not.toBeInTheDocument()
    expect(listResearchProjectsMock).toHaveBeenCalledWith(1, 20, expect.any(AbortSignal))
  })

  it('shows the real empty state separately from a list error', async () => {
    listResearchProjectsMock.mockResolvedValueOnce({
      data: [],
      pagination: { page: 1, page_size: 20, total: 0, total_pages: 0 },
    })
    renderPage()

    expect(await screen.findByText('尚无研究项目；可以从左侧新建第一个研究。')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps list failures visible and retries without falling back to empty', async () => {
    listResearchProjectsMock
      .mockRejectedValueOnce(new ApiError('backend', '后端返回统一 API 错误', { status: 503, payload: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Research 数据暂不可用' } }))
      .mockResolvedValueOnce(listResponse)
    const user = userEvent.setup()
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('最近研究暂不可用')
    expect(screen.queryByText('尚无研究项目')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重试加载' }))
    expect(await screen.findByRole('heading', { name: '行业研究' })).toBeInTheDocument()
    expect(listResearchProjectsMock).toHaveBeenCalledTimes(2)
  })

  it('validates the name before submitting and preserves the form on create failure', async () => {
    const user = userEvent.setup()
    createResearchProjectMock.mockRejectedValue(new ApiError('backend', '后端返回统一 API 错误', { status: 400, payload: { code: 'VALIDATION_ERROR', message: 'Research 项目参数无效' } }))
    renderPage()

    const name = screen.getByRole('textbox', { name: '名称' })
    const description = screen.getByRole('textbox', { name: '描述（可选）' })
    await user.click(screen.getByRole('button', { name: '创建研究' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('请输入研究项目名称')
    expect(createResearchProjectMock).not.toHaveBeenCalled()

    await user.type(name, '  新建研究  ')
    await user.type(description, '新的研究描述')
    await user.click(screen.getByRole('button', { name: '创建研究' }))

    await waitFor(() => expect(createResearchProjectMock).toHaveBeenCalledWith({ name: '新建研究', description: '新的研究描述' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('创建失败')
    expect(name).toHaveValue('  新建研究  ')
    expect(description).toHaveValue('新的研究描述')
  })

  it('refreshes the real list after a successful server create', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { name: '行业研究' })

    await user.type(screen.getByRole('textbox', { name: '名称' }), '新建研究')
    await user.type(screen.getByRole('textbox', { name: '描述（可选）' }), '新的研究描述')
    await user.click(screen.getByRole('button', { name: '创建研究' }))

    expect(await screen.findByRole('status')).toHaveTextContent('已创建研究项目“新建研究”（ID 8）')
    await waitFor(() => expect(listResearchProjectsMock).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('textbox', { name: '名称' })).toHaveValue('')
  })
})
