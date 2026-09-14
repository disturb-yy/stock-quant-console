import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { DashboardPage } from '../pages/DashboardPage'
import { MarketOverviewPage } from '../pages/MarketOverviewPage'
import { WorkspacePage } from '../pages/WorkspacePage'

export function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/market" element={<MarketOverviewPage />} />
          <Route path="/screening" element={<WorkspacePage workspace="选股" />} />
          <Route path="/watchlist" element={<WorkspacePage workspace="自选" />} />
          <Route path="/research" element={<WorkspacePage workspace="研究" />} />
          <Route path="/strategy" element={<WorkspacePage workspace="策略" />} />
          <Route path="/backtest" element={<WorkspacePage workspace="回测" />} />
          <Route path="/data" element={<WorkspacePage workspace="数据" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  )
}
