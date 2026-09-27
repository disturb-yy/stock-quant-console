import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { getInitialRuntimeConfig, runtimeConfigApi, type RuntimeConfig } from '../api/runtimeConfig'
import { SyncApiError } from '../api/syncTasks'

type RuntimeConfigContextValue = {
  config: RuntimeConfig | null
  loading: boolean
  error?: SyncApiError
}

const defaultValue: RuntimeConfigContextValue = { config: null, loading: true }
const RuntimeConfigContext = createContext<RuntimeConfigContextValue>(defaultValue)

export function RuntimeConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<RuntimeConfig | null>(() => getInitialRuntimeConfig())
  const [loading, setLoading] = useState(() => getInitialRuntimeConfig() === null)
  const [error, setError] = useState<SyncApiError>()

  useEffect(() => {
    if (config) return
    let active = true
    void runtimeConfigApi.get()
      .then((value) => { if (active) setConfig(value) })
      .catch((reason: unknown) => { if (active) setError(reason instanceof SyncApiError ? reason : new SyncApiError('无法读取运行配置', 'server')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [config])

  return <RuntimeConfigContext.Provider value={{ config, loading, error }}>{children}</RuntimeConfigContext.Provider>
}

export function useRuntimeConfig(): RuntimeConfigContextValue {
  return useContext(RuntimeConfigContext)
}
