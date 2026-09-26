import { useCallback, useEffect, useState } from 'react'

type HealthStatus = 'loading' | 'ready' | 'error'

interface HealthResponse {
  status: string
}

function isHealthResponse(value: unknown): value is HealthResponse {
  return typeof value === 'object' && value !== null && 'status' in value && typeof value.status === 'string'
}

export function useHealth() {
  const [status, setStatus] = useState<HealthStatus>('loading')
  const [error, setError] = useState<string>()

  const refresh = useCallback(() => {
    const controller = new AbortController()
    setStatus('loading')
    setError(undefined)

    fetch('/api/v1/health', { signal: controller.signal })
      .then(async (response) => {
        const payload: unknown = await response.json()
        if (!response.ok || !isHealthResponse(payload) || payload.status !== 'ok') {
          throw new Error('健康检查响应无效')
        }
        setStatus('ready')
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') {
          return
        }
        setStatus('error')
        setError('无法连接后端服务')
      })

    return () => controller.abort()
  }, [])

  useEffect(() => refresh(), [refresh])

  return { error, refresh, status }
}
