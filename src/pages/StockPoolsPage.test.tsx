import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { createStockPool, getStockPool, listStockPools } from '../api/stockPools'
import type { StockPool, StockPoolListResponse } from '../api/types'
import { StockPoolDetailPage, StockPoolsPage } from './StockPoolsPage'

vi.mock('../api/stockPools', async () => {
  const actual = await vi.importActual<typeof import('../api/stockPools')>('../api/stockPools')
  return { ...actual, createStockPool: vi.fn(), getStockPool: vi.fn(), listStockPools: vi.fn() }
})

const pool: StockPool = {
  id: 7,
  name: '红利观察',
  description: '仅供长期观察。',
  source: 'manual',
  member_count: 0,
  created_at: '2026-09-18T05:00:00Z',
  updated_at: '2026-09-18T05:00:00Z',
}

const listResponse: StockPoolListResponse = {
  data: [pool],
  pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 },
}

function renderList(path = '/research/stock-pools') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/research/stock-pools" element={<StockPoolsPage />} /></Routes>
    </MemoryRouter>,
  )
}

function renderDetail(path = '/research/stock-pools/7') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/research/stock-pools/:id" element={<StockPoolDetailPage />} />
        <Route path="/research/stock-pools" element={<h1>股票池列表</h1>} />
      </Routes>
    </MemoryRouter>,
  )
}

const createStockPoolMock = vi.mocked(createStockPool)
const getStockPoolMock = vi.mocked(getStockPool)
const listStockPoolsMock = vi.mocked(listStockPools)

describe('StockPoolsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listStockPoolsMock.mockResolvedValue(listResponse)
    createStockPoolMock.mockResolvedValue(pool)
    getStockPoolMock.mockResolvedValue(pool)
  })

  it('loads server data with URL search and keeps the raw pool id in detail links', async () => {
    renderList('/research/stock-pools?q=红利&page=2')

    expect(await screen.findByRole('heading', { name: '股票池列表' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: '红利观察' })).toHaveAttribute('href', '/research/stock-pools/7')
    expect(screen.getByRole('cell', { name: '手工创建' })).toBeInTheDocument()
    expect(listStockPoolsMock).toHaveBeenCalledWith('红利', 2, 20, expect.any(AbortSignal))
  })

  it('submits search through URL state and requests the server search', async () => {
    const user = userEvent.setup()
    renderList()

    await screen.findByRole('link', { name: '红利观察' })
    const input = screen.getByRole('textbox', { name: '搜索股票池' })
    await user.type(input, '红利')
    await user.click(screen.getByRole('button', { name: '搜索' }))

    await waitFor(() => expect(listStockPoolsMock).toHaveBeenLastCalledWith('红利', 1, 20, expect.any(AbortSignal)))
  })

  it('creates only approved metadata and shows the returned server identity', async () => {
    const user = userEvent.setup()
    renderList()

    await user.click(screen.getByRole('button', { name: '新建股票池' }))
    await user.type(screen.getByRole('textbox', { name: '股票池名称' }), '红利观察')
    await user.type(screen.getByRole('textbox', { name: '股票池描述' }), '仅供长期观察。')
    await user.click(screen.getByRole('button', { name: '创建股票池' }))

    await waitFor(() => expect(createStockPoolMock).toHaveBeenCalledWith({ name: '红利观察', description: '仅供长期观察。' }))
    expect(await screen.findByRole('status')).toHaveTextContent('ID 7')
    expect(screen.getAllByRole('link', { name: '打开详情' })[0]).toHaveAttribute('href', '/research/stock-pools/7')
  })

  it('keeps backend errors distinct from an empty list', async () => {
    listStockPoolsMock.mockRejectedValue(new ApiError('backend', '后端返回统一 API 错误', { status: 503, payload: { code: 'DEPENDENCY_UNAVAILABLE', message: '股票池数据暂不可用' } }))
    renderList()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('股票池列表暂不可用')
    expect(alert).toHaveTextContent('DEPENDENCY_UNAVAILABLE')
    expect(screen.queryByText('暂无内容')).not.toBeInTheDocument()
  })
})

describe('StockPoolDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getStockPoolMock.mockResolvedValue(pool)
  })

  it('reads detail metadata from the server and can refresh it', async () => {
    const user = userEvent.setup()
    renderDetail()

    expect(await screen.findByRole('heading', { name: '红利观察' })).toBeInTheDocument()
    expect(screen.getAllByText('手工创建')).toHaveLength(2)
    expect(screen.getByText('0', { selector: 'dd' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '刷新详情' }))
    await waitFor(() => expect(getStockPoolMock).toHaveBeenCalledTimes(2))
    expect(getStockPoolMock).toHaveBeenLastCalledWith(7, expect.any(AbortSignal))
  })

  it('shows not found or dependency errors without substituting list data', async () => {
    getStockPoolMock.mockRejectedValue(new ApiError('backend', '后端返回统一 API 错误', { status: 404, payload: { code: 'NOT_FOUND', message: '股票池不存在' } }))
    renderDetail('/research/stock-pools/999')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('股票池详情暂不可用')
    expect(alert).toHaveTextContent('NOT_FOUND')
    expect(screen.queryByRole('heading', { name: '红利观察' })).not.toBeInTheDocument()
  })
})
