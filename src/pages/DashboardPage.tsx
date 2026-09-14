import { CheckCircleFilledIcon, RefreshIcon, ServerIcon } from 'tdesign-icons-react'
import { Button, Card, Tag } from 'tdesign-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { isApiAbortError, isApiError } from '../api/client'
import { fetchDemoStatus, type DemoStatus } from '../api/demoStatus'
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

type DemoStatusState =
  | { status: 'loading' }
  | { status: 'success'; data: DemoStatus }
  | { status: 'error'; error: unknown }

function useDemoStatus() {
  const [state, setState] = useState<DemoStatusState>({ status: 'loading' })
  const controllerRef = useRef<AbortController | null>(null)

  const check = useCallback(() => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setState({ status: 'loading' })
    fetchDemoStatus(controller.signal)
      .then((data) => {
        if (controllerRef.current === controller) setState({ status: 'success', data })
      })
      .catch((error: unknown) => {
        if (isApiAbortError(error)) return
        if (controllerRef.current === controller) setState({ status: 'error', error })
      })
  }, [])

  useEffect(() => {
    check()
    return () => controllerRef.current?.abort()
  }, [check])

  return { state, check }
}

const modePresentation = {
  demo: {
    label: '演示数据',
    description: '当前使用 MySQL 中的版本化 Seed fixture，不是实时/真实行情。',
    theme: 'warning',
  },
  real: {
    label: '真实 Provider',
    description: '后端已确认当前数据来自真实 Provider。',
    theme: 'success',
  },
  fallback: {
    label: '本地回退数据',
    description: '当前 Provider 不可用，已回退到本地 Seed 数据，不是实时/真实 Provider。',
    theme: 'warning',
  },
} satisfies Record<DemoStatus['mode'], { label: string; description: string; theme: 'warning' | 'success' }>

const countItems: ReadonlyArray<{ key: keyof DemoStatus['counts']; label: string }> = [
  { key: 'instruments', label: '股票标的' },
  { key: 'daily_bars', label: '日 K 线' },
  { key: 'financial_metrics', label: '财务指标' },
]

function demoStatusErrorHint(error: unknown) {
  if (isApiError(error) && error.kind === 'network') {
    return '后端服务尚未启动或 Vite 代理不可达，请按一键启动命令启动后重试。'
  }
  if (isApiError(error) && error.kind === 'invalid-payload') {
    return '后端响应与已同步的 OpenAPI 不一致，请检查后端契约后重试。'
  }
  return '请检查后端日志与代理目标，确认服务可用后重试。'
}

function DemoStatusMeta({ data }: { data: DemoStatus }) {
  const presentation = modePresentation[data.mode]
  return (
    <>
      <div className="demo-status__headline">
        <div>
          <span className="demo-status__eyebrow">数据模式</span>
          <strong>{presentation.label}</strong>
        </div>
        <Tag theme={presentation.theme} variant="light-outline">{data.mode}</Tag>
      </div>
      <p className="demo-status__mode-note">{presentation.description}</p>
      <dl className="demo-status__meta">
        <div><dt>Provider</dt><dd>{data.provider}</dd></div>
        <div><dt>seed_version</dt><dd>{data.seed_version}</dd></div>
        <div><dt>as_of</dt><dd><time dateTime={data.as_of}>{data.as_of}</time></dd></div>
      </dl>
    </>
  )
}

function DemoStatusDetails({ data, onRetry }: { data: DemoStatus; onRetry: () => void }) {
  const isEmpty = data.sample_stocks.length === 0 || countItems.every(({ key }) => data.counts[key] === 0)
  return (
    <div className="demo-status">
      <DemoStatusMeta data={data} />
      <div className="demo-status__counts" aria-label="演示数据计数">
        {countItems.map(({ key, label }) => (
          <div className="demo-status__count" key={key}>
            <span>{label}</span>
            <strong>{data.counts[key]}</strong>
          </div>
        ))}
      </div>
      {isEmpty ? (
        <EmptyState description="接口已响应，但当前没有可展示的 Seed 数据；请在后端工作区执行 go run ./cmd/seed 后重新获取。" onRetry={onRetry} />
      ) : <SampleStocks samples={data.sample_stocks} />}
    </div>
  )
}

function SampleStocks({ samples }: { samples: DemoStatus['sample_stocks'] }) {
  return (
    <div className="demo-status__samples">
      <h3>样本股票</h3>
      <div className="demo-status__table-wrap">
        <table>
          <thead><tr><th scope="col">代码</th><th scope="col">名称</th><th scope="col">交易所</th><th scope="col">状态</th></tr></thead>
          <tbody>{samples.map((sample) => (
            <tr key={sample.code}>
              <th scope="row">{sample.code}</th><td>{sample.name}</td><td>{sample.exchange}</td><td>{sample.status}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  )
}

function DemoStatusPanel({ state, onRetry }: { state: DemoStatusState; onRetry: () => void }) {
  if (state.status === 'loading') return <LoadingState label="正在请求 /api/v1/dev/demo-status" />
  if (state.status === 'error') {
    return <ErrorState error={state.error} hint={demoStatusErrorHint(state.error)} onRetry={onRetry} />
  }
  return <DemoStatusDetails data={state.data} onRetry={onRetry} />
}

export function DashboardPage() {
  const { state, check } = useHealth()
  const demoStatus = useDemoStatus()

  return (
    <main className="page-container dashboard-page">
      <section className="page-heading">
        <div>
          <p className="page-kicker">DASHBOARD / APP SHELL</p>
          <h1>研究工作台</h1>
          <p className="page-description">从统一入口进入市场、选股和研究流程，服务与数据来源始终可核验。</p>
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

      <section className="dashboard-demo-section" aria-label="开发环境数据来源">
        <Card className="dashboard-card dashboard-demo-card" title="开发环境数据来源" bordered>
          <DemoStatusPanel state={demoStatus.state} onRetry={demoStatus.check} />
        </Card>
      </section>

      <section className="dashboard-note" aria-label="运行说明">
        <span className="dashboard-note__index">01</span>
        <div>
          <h2>从服务状态开始</h2>
          <p>健康与演示状态均来自后端真实接口，不使用前端模拟值。接口异常时可在此重新检查。</p>
        </div>
      </section>
    </main>
  )
}
