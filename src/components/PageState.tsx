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

export function ErrorState({ description, onRetry }: { description: string; onRetry?: () => void }) {
  return (
    <div className="page-state page-state--error" role="alert">
      <Alert theme="error" message={<span><strong>服务暂不可用</strong> · {description}</span>} />
      {onRetry ? (
        <Button theme="primary" onClick={onRetry}>
          重新检查
        </Button>
      ) : null}
    </div>
  )
}
