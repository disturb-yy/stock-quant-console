import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Button } from 'tdesign-react'
import { describeApiError, formatBackendApiError, isApiAbortError } from '../api/client'
import { createResearchProject, listResearchProjects } from '../api/research'
import type { ResearchCreateRequest, ResearchListResponse, ResearchProject } from '../api/types'
import { EmptyState, ErrorState, LoadingState } from '../components/PageState'

type ListState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly data: ResearchListResponse }
  | { readonly status: 'error'; readonly error: unknown }

type CreateState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly error: unknown }

function formatResearchTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function createErrorMessage(error: unknown) {
  const display = describeApiError(error, formatBackendApiError)
  return `${display.message} · ${display.diagnostic}`
}

function ResearchCreatePanel({ onCreated }: { readonly onCreated: (project: ResearchProject) => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [validationMessage, setValidationMessage] = useState('')
  const [state, setState] = useState<CreateState>({ status: 'idle' })

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedName = name.trim()
    if (!normalizedName) {
      setValidationMessage('请输入研究项目名称。')
      return
    }
    setValidationMessage('')
    setState({ status: 'loading' })
    const request: ResearchCreateRequest = {
      name: normalizedName,
      description: description.trim() || null,
    }
    try {
      const project = await createResearchProject(request)
      setState({ status: 'idle' })
      setName('')
      setDescription('')
      onCreated(project)
    } catch (error) {
      if (!isApiAbortError(error)) setState({ status: 'error', error })
    }
  }

  return (
    <section className="research-create" aria-labelledby="research-create-heading">
      <div className="research-panel-heading">
        <div>
          <p className="research-section-kicker">CREATE / RESEARCH</p>
          <h2 id="research-create-heading">新建研究</h2>
        </div>
        <span className="research-panel-note">服务端保存</span>
      </div>
      <p className="research-panel-description">只提交名称和可选描述，项目 ID 与时间由服务端生成。</p>
      <form className="research-form" onSubmit={submit}>
        <label htmlFor="research-name">
          <span>名称</span>
          <input
            id="research-name"
            value={name}
            maxLength={100}
            autoComplete="off"
            aria-invalid={validationMessage ? 'true' : undefined}
            aria-describedby={validationMessage ? 'research-name-error' : undefined}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label htmlFor="research-description">
          <span>描述（可选）</span>
          <textarea
            id="research-description"
            value={description}
            maxLength={500}
            rows={4}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <p className="research-form-hint">名称最多 100 个字符，描述最多 500 个字符。</p>
        {validationMessage ? <p id="research-name-error" className="research-inline-error" role="alert">{validationMessage}</p> : null}
        {state.status === 'error' ? <p className="research-inline-error" role="alert">创建失败：{createErrorMessage(state.error)}</p> : null}
        <div className="research-form-actions">
          <Button theme="primary" type="submit" loading={state.status === 'loading'} disabled={state.status === 'loading'}>
            {state.status === 'loading' ? '创建中…' : '创建研究'}
          </Button>
        </div>
      </form>
    </section>
  )
}

function ResearchProjectCard({ project }: { readonly project: ResearchProject }) {
  return (
    <article className="research-project-card">
      <div className="research-project-card__heading">
        <div>
          <h3>{project.name}</h3>
          <code>ID {project.id}</code>
        </div>
        <time dateTime={project.updated_at}>{formatResearchTime(project.updated_at)}</time>
      </div>
      <p>{project.description || '未填写描述'}</p>
      <div className="research-project-card__meta">
        <span>最近更新时间</span>
        <span>服务端记录</span>
      </div>
    </article>
  )
}

function ResearchListPanel({ state, onRetry }: { readonly state: ListState; readonly onRetry: () => void }) {
  return (
    <section className="research-list" aria-labelledby="research-list-heading">
      <div className="research-panel-heading">
        <div>
          <p className="research-section-kicker">RECENT / SERVER ORDER</p>
          <h2 id="research-list-heading">最近研究</h2>
        </div>
        <span className="research-panel-note">按更新时间倒序</span>
      </div>
      <p className="research-panel-description">列表来自服务端最近更新时间，不使用浏览器缓存或临时输入。</p>
      {state.status === 'loading' ? <LoadingState label="正在请求 /api/v1/research" /> : null}
      {state.status === 'error' ? <ErrorState error={state.error} title="最近研究暂不可用" hint="列表没有回退数据，请检查服务后重试。" actionLabel="重试加载" onRetry={onRetry} /> : null}
      {state.status === 'success' && state.data.data.length === 0 ? <EmptyState description="尚无研究项目；可以从左侧新建第一个研究。" /> : null}
      {state.status === 'success' && state.data.data.length > 0 ? (
        <div className="research-project-list" aria-label="最近研究项目">
          {state.data.data.map((project) => <ResearchProjectCard key={project.id} project={project} />)}
        </div>
      ) : null}
    </section>
  )
}

export function ResearchPage() {
  const [listState, setListState] = useState<ListState>({ status: 'loading' })
  const [refreshToken, setRefreshToken] = useState(0)
  const [feedback, setFeedback] = useState<ResearchProject | null>(null)

  const loadProjects = useCallback((signal: AbortSignal) => {
    setListState({ status: 'loading' })
    listResearchProjects(1, 20, signal)
      .then((data) => setListState({ status: 'success', data }))
      .catch((error) => { if (!isApiAbortError(error)) setListState({ status: 'error', error }) })
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    loadProjects(controller.signal)
    return () => controller.abort()
  }, [loadProjects, refreshToken])

  function handleCreated(project: ResearchProject) {
    setFeedback(project)
    setRefreshToken((current) => current + 1)
  }

  return (
    <main className="page-container research-page">
      <section className="page-heading">
        <div>
          <p className="page-kicker">WORKSPACE / RESEARCH</p>
          <h1>研究</h1>
          <p className="page-description">创建可持久化的研究项目，并按服务端顺序查看最近研究。</p>
        </div>
      </section>
      {feedback ? <div className="research-success" role="status">已创建研究项目“{feedback.name}”（ID {feedback.id}）。最近列表已重新请求服务端数据。</div> : null}
      <div className="research-layout">
        <ResearchCreatePanel onCreated={handleCreated} />
        <ResearchListPanel state={listState} onRetry={() => setRefreshToken((current) => current + 1)} />
      </div>
    </main>
  )
}
