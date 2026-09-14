import { CheckCircleFilledIcon, RefreshIcon, ServerIcon } from 'tdesign-icons-react'
import { Button, Card, Tag } from 'tdesign-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { isApiAbortError } from '../api/client'
import { fetchHealth, type HealthResponse } from '../api/health'
import { EmptyState, ErrorState, LoadingState } from '../components/PageState'

type HealthState =
  | { status: 'loading' }
  | { status: 'success'; data: HealthResponse; checkedAt: Date }
  | { status: 'error'; error: unknown }

function useHealth() {
  const [state, setState] = useState<HealthState>({ status: 'loading' })
  const controllerRef = useRef<AbortController | null>(null)

  const check = useCallback(() => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setState({ status: 'loading' })
    fetchHealth(controller.signal)
      .then((data) => {
        if (controllerRef.current === controller) setState({ status: 'success', data, checkedAt: new Date() })
      })
      .catch((error: unknown) => {
        if (isApiAbortError(error)) return
        if (controllerRef.current === controller) {
          setState({ status: 'error', error })
        }
      })
  }, [])

  useEffect(() => {
    check()
    return () => controllerRef.current?.abort()
  }, [check])

  return { state, check }
}

function HealthPanel({ state, onRetry }: { state: HealthState; onRetry: () => void }) {
  if (state.status === 'loading') return <LoadingState label="正在请求 /api/v1/health" />
  if (state.status === 'error') return <ErrorState error={state.error} onRetry={onRetry} />

  return (
    <div className="health-result">
      <div className="health-result__headline">
        <CheckCircleFilledIcon className="health-result__icon" size="24px" />
        <div>
          <strong>服务可用</strong>
          <p>GET /api/v1/health 返回成功</p>
        </div>
        <Tag theme="success" variant="light-outline">
          {state.data.status}
        </Tag>
      </div>
      <div className="health-result__meta">
        <span>最近检查</span>
        <time dateTime={state.checkedAt.toISOString()}>{state.checkedAt.toLocaleTimeString('zh-CN')}</time>
      </div>
      <Button variant="text" icon={<RefreshIcon />} onClick={onRetry}>
        重新检查
      </Button>
    </div>
  )
}

export function DashboardPage() {
  const { state, check } = useHealth()

  return (
    <main className="page-container dashboard-page">
      <section className="page-heading">
        <div>
          <p className="page-kicker">DASHBOARD / APP SHELL</p>
          <h1>研究工作台</h1>
          <p className="page-description">从统一入口进入市场、选股和研究流程，服务状态始终可核验。</p>
        </div>
        <div className="page-heading__signal">
          <ServerIcon size="18px" />
          <span>本地 API v1</span>
        </div>
      </section>

      <section className="dashboard-grid" aria-label="服务与工作区概览">
        <Card className="dashboard-card dashboard-card--health" title="服务状态" bordered>
          <HealthPanel state={state} onRetry={check} />
        </Card>
        <Card className="dashboard-card" title="工作区骨架" bordered>
          <EmptyState description="顶部导航已就绪，后续业务 Feature 可在对应工作区继续接入。" />
        </Card>
      </section>

      <section className="dashboard-note" aria-label="运行说明">
        <span className="dashboard-note__index">01</span>
        <div>
          <h2>从服务状态开始</h2>
          <p>健康状态来自后端真实接口，不使用前端模拟值。接口异常时可在此重新检查。</p>
        </div>
      </section>
    </main>
  )
}
