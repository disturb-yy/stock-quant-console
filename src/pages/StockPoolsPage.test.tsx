import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import {
  addStockPoolMember,
  createStockPool,
  deleteStockPoolMember,
  getStockPool,
  listStockPoolMembers,
  listStockPools,
} from '../api/stockPools'
import type { StockPool, StockPoolListResponse, StockPoolMemberListResponse } from '../api/types'
import { StockPoolDetailPage, StockPoolsPage } from './StockPoolsPage'

vi.mock('../api/stockPools', async () => {
  const actual = await vi.importActual<typeof import('../api/stockPools')>('../api/stockPools')
  return {
    ...actual,
    addStockPoolMember: vi.fn(),
    createStockPool: vi.fn(),
    deleteStockPoolMember: vi.fn(),
    getStockPool: vi.fn(),
    listStockPoolMembers: vi.fn(),
    listStockPools: vi.fn(),
  }
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

const memberListResponse: StockPoolMemberListResponse = {
  data: [],
  pagination: { page: 1, page_size: 20, total: 0, total_pages: 0 },
}

const membersResponse: StockPoolMemberListResponse = {
  data: [
    { symbol: '000001.SZ', name: '平安银行' },
    { symbol: '600000.SH', name: '浦发银行' },
  ],
  pagination: { page: 1, page_size: 20, total: 2, total_pages: 1 },
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
const addStockPoolMemberMock = vi.mocked(addStockPoolMember)
const deleteStockPoolMemberMock = vi.mocked(deleteStockPoolMember)
const getStockPoolMock = vi.mocked(getStockPool)
const listStockPoolMembersMock = vi.mocked(listStockPoolMembers)
const listStockPoolsMock = vi.mocked(listStockPools)

describe('StockPoolsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listStockPoolsMock.mockResolvedValue(listResponse)
    createStockPoolMock.mockResolvedValue(pool)
    getStockPoolMock.mockResolvedValue(pool)
    listStockPoolMembersMock.mockResolvedValue(memberListResponse)
    addStockPoolMemberMock.mockResolvedValue({ member: { symbol: '000001.SZ', name: '平安银行' }, member_count: 1 })
    deleteStockPoolMemberMock.mockResolvedValue({ symbol: '000001.SZ', member_count: 0 })
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
    listStockPoolMembersMock.mockResolvedValue(memberListResponse)
    addStockPoolMemberMock.mockResolvedValue({ member: { symbol: '000001.SZ', name: '平安银行' }, member_count: 1 })
    deleteStockPoolMemberMock.mockResolvedValue({ symbol: '000001.SZ', member_count: 0 })
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

  it('reads members from the server and opens Stock Detail with the raw symbol', async () => {
    listStockPoolMembersMock.mockResolvedValue(membersResponse)
    renderDetail()

    expect(await screen.findByRole('link', { name: '000001.SZ' })).toHaveAttribute('href', '/stocks/000001.SZ')
    expect(screen.getByText('平安银行')).toBeInTheDocument()
    expect(listStockPoolMembersMock).toHaveBeenCalledWith(7, 1, 20, expect.any(AbortSignal))
  })

  it('adds a member and refreshes the detail and member collection', async () => {
    const user = userEvent.setup()
    listStockPoolMembersMock.mockResolvedValue(membersResponse)
    renderDetail()

    await screen.findByRole('link', { name: '000001.SZ' })
    const input = screen.getByRole('textbox', { name: '添加股票' })
    await user.type(input, '000001.SZ')
    await user.click(screen.getByRole('button', { name: '添加成员' }))

    await waitFor(() => expect(addStockPoolMemberMock).toHaveBeenCalledWith(7, { symbol: '000001.SZ' }))
    expect(await screen.findByRole('status')).toHaveTextContent('已添加 000001.SZ')
    await waitFor(() => expect(getStockPoolMock).toHaveBeenCalledTimes(2))
    expect(listStockPoolMembersMock).toHaveBeenCalledTimes(2)
  })

  it('shows the backend conflict when adding a duplicate member', async () => {
    const user = userEvent.setup()
    addStockPoolMemberMock.mockRejectedValue(new ApiError('backend', '后端返回统一 API 错误', { status: 409, payload: { code: 'CONFLICT', message: '股票已在股票池中' } }))
    renderDetail()

    await user.type(await screen.findByRole('textbox', { name: '添加股票' }), '000001.SZ')
    await user.click(screen.getByRole('button', { name: '添加成员' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('添加失败')
    expect(alert).toHaveTextContent('CONFLICT')
  })

  it('deletes one member through the approved command and refreshes server state', async () => {
    const user = userEvent.setup()
    listStockPoolMembersMock.mockResolvedValue(membersResponse)
    renderDetail()

    await screen.findByRole('link', { name: '000001.SZ' })
    await user.click(screen.getAllByRole('button', { name: '删除' })[0])

    await waitFor(() => expect(deleteStockPoolMemberMock).toHaveBeenCalledWith(7, '000001.SZ'))
    expect(await screen.findByRole('status')).toHaveTextContent('已删除 000001.SZ')
    expect(listStockPoolMembersMock).toHaveBeenCalledTimes(2)
  })

  it('removes selected members one by one and reports partial failures', async () => {
    const user = userEvent.setup()
    listStockPoolMembersMock.mockResolvedValue(membersResponse)
    deleteStockPoolMemberMock.mockImplementation(async (_id, symbol) => {
      if (symbol === '600000.SH') throw new ApiError('backend', '后端返回统一 API 错误', { status: 404, payload: { code: 'NOT_FOUND', message: '股票池成员不存在' } })
      return { symbol, member_count: 1 }
    })
    renderDetail()

    await screen.findByRole('link', { name: '000001.SZ' })
    await user.click(screen.getByRole('checkbox', { name: '选择 000001.SZ' }))
    await user.click(screen.getByRole('checkbox', { name: '选择 600000.SH' }))
    await user.click(screen.getByRole('button', { name: '移除所选成员' }))

    await waitFor(() => expect(deleteStockPoolMemberMock).toHaveBeenNthCalledWith(1, 7, '000001.SZ'))
    expect(deleteStockPoolMemberMock).toHaveBeenNthCalledWith(2, 7, '600000.SH')
    const result = await screen.findByRole('alert')
    expect(result).toHaveTextContent('1 项删除成功，1 项失败')
    expect(result).toHaveTextContent('NOT_FOUND')
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
