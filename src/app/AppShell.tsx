import type { ReactNode } from 'react'
import { RuntimeConfigProvider, useRuntimeConfig } from './RuntimeConfigContext'

type WorkspacePage = 'overview' | 'stocks' | 'tasks' | 'schedules'

const pageLinks: Array<{ key: WorkspacePage; label: string; href: string }> = [
  { key: 'overview', label: '概览', href: '/overview' },
  { key: 'stocks', label: '股票', href: '/stocks' },
  { key: 'tasks', label: '任务', href: '/' },
  { key: 'schedules', label: '计划', href: '/sync-schedules' },
]

function currentPage(pathname: string): WorkspacePage {
  if (pathname === '/overview') return 'overview'
  if (pathname === '/stocks' || pathname.startsWith('/stocks/')) return 'stocks'
  if (pathname === '/sync-schedules') return 'schedules'
  return 'tasks'
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <RuntimeConfigProvider>
      <AppShellContent>{children}</AppShellContent>
    </RuntimeConfigProvider>
  )
}

function AppShellContent({ children }: { children: ReactNode }) {
  const activePage = currentPage(window.location.pathname)
  const { error } = useRuntimeConfig()
  return (
    <>
      <header className="topbar">
        <a className="brand" href="/overview" aria-label="量策首页">
          <span className="brand-mark">量</span>
          <span>量策 <span className="brand-caption">QUANT LAB</span></span>
        </a>
        <nav className="global-nav" aria-label="一级导航">
          <a className="global-nav-link active" href="/overview" aria-current="page">市场</a>
        </nav>
        <div className="header-actions">
          <button className="icon-button" type="button" aria-label="通知">◌</button>
          <span className="avatar" aria-label="演示用户">研</span>
        </div>
      </header>
      <nav className="page-tabs" aria-label="工作台页面">
        <span className="current-section">市场</span>
        <span className="section-divider" aria-hidden="true">|</span>
        {pageLinks.map((page) => (
          <a className={`page-tab ${activePage === page.key ? 'active' : ''}`} href={page.href} key={page.key} aria-current={activePage === page.key ? 'page' : undefined}>
            {page.label}
          </a>
        ))}
        <div className="tab-actions"><span className="tab-context">A 股研究工作台</span></div>
      </nav>
      {error && <div className="runtime-config-alert" role="alert">运行配置读取失败，当前未确认数据源状态，请检查服务后刷新页面。</div>}
      {children}
    </>
  )
}
