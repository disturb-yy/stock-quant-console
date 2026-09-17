import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type ScreenerRunResponse, runScreener } from '../api/screener'
import { defaultScreeningSpec } from './screeningUrl'
import { ScreeningPage } from './ScreeningPage'

vi.mock('../api/screener', async () => {
  const actual = await vi.importActual<typeof import('../api/screener')>('../api/screener')
  return { ...actual, runScreener: vi.fn() }
})

const runScreenerMock = vi.mocked(runScreener)

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
  })

  it('runs a real-shaped spec, renders snapshot metadata, and encodes the stock detail link', async () => {
    renderScreening()

    expect(await screen.findByRole('heading', { name: '量化选股' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /示例股票/ })).toHaveAttribute('href', '/stocks/A%2FB.SZ')
    expect(screen.getByLabelText('执行快照和来源')).toHaveTextContent('2024-06-28')
    expect(screen.getByLabelText('执行快照和来源')).toHaveTextContent('mysql-demo-fixture')
    expect(runScreenerMock).toHaveBeenCalledWith(defaultScreeningSpec, expect.any(AbortSignal))
    expect(screen.queryByText(/保存方案|股票池|Coming Soon/i)).not.toBeInTheDocument()
  })

  it('restores an invalid URL to the approved default and still makes only the default request', async () => {
    renderScreening('/screening?screening_spec=%7B%22universe_id%22%3A%22other%22%7D')

    expect(await screen.findByRole('alert')).toHaveTextContent('已恢复为默认配置')
    await waitFor(() => expect(runScreenerMock).toHaveBeenCalled())
    expect(runScreenerMock).toHaveBeenLastCalledWith(defaultScreeningSpec, expect.any(AbortSignal))
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
})
