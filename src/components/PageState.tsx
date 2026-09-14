import { describeApiError, formatBackendApiError } from '../api/client'
import { Alert, Button, Empty, Loading } from 'tdesign-react'

export function LoadingState({ label = '正在加载' }: { label?: string }) {
  return (
    <div className="page-state" role="status" aria-live="polite">
      <Loading size="medium" text={label} />
    </div>
  )
}

export function EmptyState({ description = '当前工作区还没有可展示的内容。' }: { description?: string }) {
  return (
    <div className="page-state">
      <Empty title="暂无内容" description={description} />
    </div>
  )
}

export function ErrorState({ error, description, onRetry }: { error?: unknown; description?: string; onRetry?: () => void }) {
  const display = error === undefined
    ? { message: description ?? '请求失败', diagnostic: '' }
    : describeApiError(error, formatBackendApiError)
  return (
    <div className="page-state page-state--error" role="alert">
      <Alert theme="error" message={<span><strong>服务暂不可用</strong> · {display.message}</span>} />
      {display.diagnostic ? <code className="page-state__diagnostic">{display.diagnostic}</code> : null}
      {onRetry ? (
        <Button theme="primary" onClick={onRetry}>
          重新检查
        </Button>
      ) : null}
    </div>
  )
}
