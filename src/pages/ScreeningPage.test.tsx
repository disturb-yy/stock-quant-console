import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type Screener,
  type ScreenerListResponse,
  type ScreenerRunResponse,
  createScreener,
  getScreener,
  listScreeners,
  runScreener,
  updateScreener,
} from '../api/screener'
import { defaultScreeningSpec, serializeScreeningSpec } from './screeningUrl'
import { ScreeningPage } from './ScreeningPage'

vi.mock('../api/screener', async () => {
  const actual = await vi.importActual<typeof import('../api/screener')>('../api/screener')
  return { ...actual, createScreener: vi.fn(), getScreener: vi.fn(), listScreeners: vi.fn(), runScreener: vi.fn(), updateScreener: vi.fn() }
})

const runScreenerMock = vi.mocked(runScreener)
const createScreenerMock = vi.mocked(createScreener)
const getScreenerMock = vi.mocked(getScreener)
const listScreenersMock = vi.mocked(listScreeners)
const updateScreenerMock = vi.mocked(updateScreener)

const resultResponse: ScreenerRunResponse = {
  spec: defaultScreeningSpec,
  snapshot: { as_of: '2024-06-28', field_as_of: { 'technical.volume': '2024-06-28' }, definition_versions: {} },
  universe: { id: 'cn_a_share_active', name: 'A 股在市股票', eligible_count: 1 },
  matched_count: 1,
  returned_count: 1,
  results: [{
    symbol: 'A/B.SZ',
    name: '示例股票',
    industries: ['银行'],
    rank: 1,
    ranking: { field_id: 'technical.volume', label: '成交量', value: '100', unit: '股', basis: 'latest_daily_bar', as_of: '2024-06-28', unavailable_reason: null },
    fields: [],
  }],
  source: { mode: 'demo', provider: 'mysql-demo-fixture', seed_version: 'fnd-003-demo-v8', as_of: '2024-06-28' },
}

const savedScreener: Screener = {
  id: 7,
  name: '低估值方案',
  description: '仅保存条件',
  spec: defaultScreeningSpec,
  version: 1,
  created_at: '2026-09-18T05:00:00Z',
  updated_at: '2026-09-18T05:00:00Z',
}

const emptyList: ScreenerListResponse = {
  data: [],
  pagination: { page: 1, page_size: 20, total: 0, total_pages: 0 },
}

function renderScreening(path = '/screening') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/screening" element={<ScreeningPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ScreeningPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    runScreenerMock.mockResolvedValue(resultResponse)
    createScreenerMock.mockResolvedValue(savedScreener)
    getScreenerMock.mockResolvedValue(savedScreener)
    listScreenersMock.mockResolvedValue(emptyList)
    updateScreenerMock.mockResolvedValue({ ...savedScreener, version: 2 })
  })

  it('runs a real-shaped spec, renders snapshot metadata, and encodes the stock detail link', async () => {
    renderScreening()

    expect(await screen.findByRole('heading', { name: '量化选股' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /示例股票/ })).toHaveAttribute('href', '/stocks/A%2FB.SZ')
    expect(screen.getByLabelText('执行快照和来源')).toHaveTextContent('2024-06-28')
    expect(screen.getByLabelText('执行快照和来源')).toHaveTextContent('mysql-demo-fixture')
    expect(runScreenerMock).toHaveBeenCalledWith(defaultScreeningSpec, expect.any(AbortSignal))
    expect(screen.getByRole('heading', { name: '保存与复用' })).toBeInTheDocument()
    expect(screen.getByText('暂无已保存方案；当前 Builder 仍是临时配置。')).toBeInTheDocument()
  })

  it('blocks execution for invalid URL state instead of silently replacing it', async () => {
    renderScreening('/screening?screening_spec=%7B%22universe_id%22%3A%22other%22%7D')

    expect(await screen.findByRole('alert')).toHaveTextContent('已恢复为默认配置')
    await waitFor(() => expect(runScreenerMock).not.toHaveBeenCalled())
  })

  it('debounces a condition edit and sends the updated canonical field/operator/value', async () => {
    const user = userEvent.setup()
    renderScreening()
    await screen.findByRole('link', { name: /示例股票/ })

    await user.click(screen.getByRole('button', { name: /添加条件/ }))
    const valueInput = screen.getByRole('textbox', { name: '条件 1 数值' })
    await user.clear(valueInput)
    await user.type(valueInput, '15')

    await waitFor(() => expect(runScreenerMock).toHaveBeenLastCalledWith(expect.objectContaining({
      filters: [{ field_id: 'technical.close', operator: 'gte', value: '15' }],
    }), expect.any(AbortSignal)), { timeout: 1500 })
  })

  it('creates a saved plan from the current Builder spec and shows its identity', async () => {
    const user = userEvent.setup()
    renderScreening()
    await screen.findByRole('link', { name: /示例股票/ })

    await user.click(screen.getByRole('button', { name: '保存方案' }))
    await user.type(screen.getByRole('textbox', { name: '方案名称' }), '低估值方案')
    await user.click(screen.getByRole('button', { name: '确认保存' }))

    await waitFor(() => expect(createScreenerMock).toHaveBeenCalledWith({
      name: '低估值方案',
      description: null,
      spec: defaultScreeningSpec,
    }))
    expect(await screen.findByLabelText('当前保存方案')).toHaveTextContent('低估值方案')
    expect(screen.getByLabelText('当前保存方案')).toHaveTextContent('version 1')
  })

  it('loads a saved plan through GET and reruns the returned server spec', async () => {
    const user = userEvent.setup()
    const loadedSpec = { ...defaultScreeningSpec, top_n: 5 }
    listScreenersMock.mockResolvedValue({ data: [{ ...savedScreener, spec: loadedSpec }], pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 } })
    getScreenerMock.mockResolvedValue({ ...savedScreener, spec: loadedSpec })
    renderScreening()

    await user.click(await screen.findByRole('button', { name: '加载' }))
    await waitFor(() => expect(getScreenerMock).toHaveBeenCalledWith(7, expect.any(AbortSignal)))
    await waitFor(() => expect(runScreenerMock).toHaveBeenLastCalledWith(loadedSpec, expect.any(AbortSignal)))
    expect(screen.getByLabelText('当前保存方案')).toHaveTextContent('低估值方案')
  })

  it('marks a loaded plan dirty and updates only after explicit confirmation with its version', async () => {
    const user = userEvent.setup()
    const filterSpec = { ...defaultScreeningSpec, filters: [{ field_id: 'technical.close' as const, operator: 'gte' as const, value: '10' }] }
    getScreenerMock.mockResolvedValue({ ...savedScreener, spec: defaultScreeningSpec })
    renderScreening(`/screening?screener_id=7&screening_spec=${encodeURIComponent(serializeScreeningSpec(defaultScreeningSpec))}`)

    await screen.findByLabelText('当前保存方案')
    await user.click(screen.getByRole('button', { name: /添加条件/ }))
    await waitFor(() => expect(screen.getByLabelText('当前保存方案')).toHaveTextContent('有未保存更改'))
    await user.click(screen.getByRole('button', { name: '更新当前方案' }))
    await user.click(screen.getByRole('button', { name: '确认更新' }))

    await waitFor(() => expect(updateScreenerMock).toHaveBeenCalledWith(7, {
      name: '低估值方案',
      description: '仅保存条件',
      spec: filterSpec,
      version: 1,
    }))
  })
})
