import { describeApiError, formatBackendApiError } from '../api/client'
import { Alert, Button, Empty, Loading } from 'tdesign-react'

export function LoadingState({ label = '正在加载' }: { label?: string }) {
  return (
    <div className="page-state" role="status" aria-live="polite">
      <Loading size="medium" text={label} />
    </div>
  )
}

export function EmptyState({
  description = '当前工作区还没有可展示的内容。',
  onRetry,
}: { description?: string; onRetry?: () => void }) {
  return (
    <div className="page-state">
      <Empty title="暂无内容" description={description} />
      {onRetry ? <Button variant="text" onClick={onRetry}>重新获取</Button> : null}
    </div>
  )
}

export function ErrorState({
  error,
  description,
  hint,
  onRetry,
}: { error?: unknown; description?: string; hint?: string; onRetry?: () => void }) {
  const display = error === undefined
    ? { message: description ?? '请求失败', diagnostic: '' }
    : describeApiError(error, formatBackendApiError)
  return (
    <div className="page-state page-state--error" role="alert">
      <Alert theme="error" message={<span><strong>服务暂不可用</strong> · {display.message}</span>} />
      {display.diagnostic ? <code className="page-state__diagnostic">{display.diagnostic}</code> : null}
      {hint ? <p className="page-state__hint">{hint}</p> : null}
      {onRetry ? (
        <Button theme="primary" onClick={onRetry}>
          重新检查
        </Button>
      ) : null}
    </div>
  )
}
