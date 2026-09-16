import { LogoQqIcon } from 'tdesign-icons-react'
import { Layout, Menu } from 'tdesign-react'
import type { ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'

const navItems = [
  { path: '/market', label: '市场' },
  { path: '/screening', label: '选股' },
  { path: '/watchlist', label: '自选' },
  { path: '/research', label: '研究' },
  { path: '/strategy', label: '策略' },
  { path: '/backtest', label: '回测' },
  { path: '/data', label: '数据' },
]

function getActivePath(pathname: string) {
  if (pathname === '/') return '/'
  if (pathname.startsWith('/stocks/')) return '/market'
  return navItems.find((item) => pathname.startsWith(item.path))?.path ?? '/'
}

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const activePath = getActivePath(location.pathname)

  return (
    <Layout className="app-layout">
      <header className="app-header" aria-label="应用主导航">
        <div className="app-header__inner">
          <NavLink className="brand-lockup" to="/" aria-label="量策 Dashboard">
            <span className="brand-lockup__mark" aria-hidden="true">
              <LogoQqIcon size="20px" />
            </span>
            <span className="brand-lockup__text">
              <span className="brand-lockup__name">量策</span>
              <span className="brand-lockup__sub">RESEARCH CONSOLE</span>
            </span>
          </NavLink>
          <nav className="app-nav" aria-label="一级工作区">
            <Menu.HeadMenu
              theme="dark"
              value={activePath}
              onChange={(value) => navigate(String(value))}
              className="app-nav__menu"
            >
              <Menu.MenuItem value="/" className="app-nav__dashboard">
                Dashboard
              </Menu.MenuItem>
              {navItems.map((item) => (
                <Menu.MenuItem key={item.path} value={item.path}>
                  {item.label}
                </Menu.MenuItem>
              ))}
            </Menu.HeadMenu>
          </nav>
          <div className="app-header__meta" aria-label="运行环境">
            <span className="environment-dot" aria-hidden="true" />
            <span>本地环境</span>
          </div>
        </div>
      </header>
      <Layout.Content className="app-content">{children}</Layout.Content>
    </Layout>
  )
}
