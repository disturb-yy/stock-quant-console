import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { AppShell } from '../components/AppShell'

vi.mock('../api/marketOverview', () => ({
  fetchMarketOverview: vi.fn(() => new Promise(() => undefined)),
}))

vi.mock('../api/marketSectors', () => ({
  fetchMarketSectors: vi.fn(() => new Promise(() => undefined)),
}))

function renderShell(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppShell>
        <div>当前页面</div>
      </AppShell>
    </MemoryRouter>,
  )
}

describe('AppShell', () => {
  it('renders all primary workspaces without a sidebar', () => {
    renderShell()

    expect(screen.getByRole('link', { name: '量策 Dashboard' })).toHaveAttribute('href', '/')
    for (const label of ['Dashboard', '市场', '选股', '自选', '研究', '策略', '回测', '数据']) {
      expect(screen.getByText(label, { selector: '.t-menu__content' })).toBeInTheDocument()
    }
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  })

  it('navigates through a top-level workspace', async () => {
    const user = userEvent.setup()
    renderShell()

    await user.click(screen.getByText('研究', { selector: '.t-menu__content' }))

    expect(screen.getByText('研究', { selector: '.t-menu__content' }).closest('li')).toHaveClass('t-is-active')
  })

  it('keeps a workspace route addressable after a direct load', () => {
    window.history.pushState({}, '', '/backtest')

    render(<App />)

    expect(screen.getByRole('heading', { name: '回测' })).toBeInTheDocument()
  })

  it('keeps the market overview route addressable after a direct load', () => {
    window.history.pushState({}, '', '/market')

    render(<App />)

    expect(screen.getByRole('heading', { name: '市场概览' })).toBeInTheDocument()
    expect(screen.getByText('正在请求 /api/v1/markets/overview')).toBeInTheDocument()
  })
})
