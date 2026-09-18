import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Button } from 'tdesign-react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { describeApiError, formatBackendApiError, isApiAbortError } from '../api/client'
import {
  addStockPoolMember,
  createStockPool,
  deleteStockPoolMember,
  getStockPool,
  listStockPoolMembers,
  listStockPools,
} from '../api/stockPools'
import type {
  StockPool,
  StockPoolCreateRequest,
  StockPoolListResponse,
  StockPoolMember,
  StockPoolMemberListResponse,
} from '../api/types'
import { ErrorState, EmptyState, LoadingState } from '../components/PageState'

export const stockPoolListPath = '/research/stock-pools'

type ListState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly data: StockPoolListResponse }
  | { readonly status: 'error'; readonly error: unknown }

type CreateState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly error: unknown }

type DetailState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly data: StockPool }
  | { readonly status: 'error'; readonly error: unknown }

type MemberListState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly data: StockPoolMemberListResponse }
  | { readonly status: 'error'; readonly error: unknown }

type MemberFeedback =
  | { readonly tone: 'success'; readonly message: string }
  | { readonly tone: 'error'; readonly message: string }

type BatchMemberResult =
  | { readonly symbol: string; readonly status: 'success' }
  | { readonly symbol: string; readonly status: 'error'; readonly error: unknown }

type BatchState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading'; readonly symbols: ReadonlyArray<string> }
  | { readonly status: 'complete'; readonly results: ReadonlyArray<BatchMemberResult> }

function parsePage(raw: string | null) {
  if (raw === null || raw === '') return { page: 1, invalidReason: null }
  const page = Number(raw)
  if (!Number.isInteger(page) || page < 1) return { page: 1, invalidReason: 'URL 中的页码无效，请恢复默认查询。' }
  return { page, invalidReason: null }
}

function formatPoolTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function sourceLabel(source: StockPool['source']) {
  return source === 'manual' ? '手工创建' : source
}

function createErrorMessage(error: unknown) {
  const display = describeApiError(error, formatBackendApiError)
  return `${display.message} · ${display.diagnostic}`
}

function StockPoolCreatePanel({ onCreated, onCancel }: { readonly onCreated: (pool: StockPool) => void; readonly onCancel: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [validationMessage, setValidationMessage] = useState('')
  const [state, setState] = useState<CreateState>({ status: 'idle' })

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedName = name.trim()
    if (!normalizedName) {
      setValidationMessage('请输入股票池名称。')
      return
    }
    setValidationMessage('')
    setState({ status: 'loading' })
    const request: StockPoolCreateRequest = { name: normalizedName, description: description.trim() || null }
    try {
      const pool = await createStockPool(request)
      onCreated(pool)
    } catch (error) {
      if (!isApiAbortError(error)) setState({ status: 'error', error })
    }
  }

  return (
    <section className="stock-pools-create" aria-labelledby="stock-pool-create-heading">
      <div className="stock-pools-panel-heading">
        <div>
          <p className="stock-pools-section-kicker">CREATE / MANUAL</p>
          <h2 id="stock-pool-create-heading">创建股票池</h2>
        </div>
        <button type="button" className="stock-pools-text-button" onClick={onCancel}>取消</button>
      </div>
      <p className="stock-pools-panel-description">只提交名称和可空描述，来源、ID、成员数与时间由服务端生成。</p>
      <form className="stock-pools-form" onSubmit={submit}>
        <label>
          <span>名称</span>
          <input aria-label="股票池名称" value={name} maxLength={100} onChange={(event) => setName(event.target.value)} autoFocus />
        </label>
        <label>
          <span>描述（可选）</span>
          <textarea aria-label="股票池描述" value={description} maxLength={500} rows={3} onChange={(event) => setDescription(event.target.value)} />
        </label>
        {validationMessage ? <p className="stock-pools-inline-error" role="alert">{validationMessage}</p> : null}
        {state.status === 'error' ? <p className="stock-pools-inline-error" role="alert">创建失败：{createErrorMessage(state.error)}</p> : null}
        <div className="stock-pools-form-actions">
          <Button theme="primary" type="submit" loading={state.status === 'loading'} disabled={state.status === 'loading'}>
            {state.status === 'loading' ? '创建中…' : '创建股票池'}
          </Button>
        </div>
      </form>
    </section>
  )
}

function StockPoolTable({ pools, from }: { readonly pools: ReadonlyArray<StockPool>; readonly from: string }) {
  return (
    <div className="stock-pools-table-wrap">
      <table className="stock-pools-table" aria-label="股票池列表">
        <thead>
          <tr><th scope="col">名称</th><th scope="col">描述</th><th scope="col">来源</th><th scope="col">成员数</th><th scope="col">更新时间</th><th scope="col"><span className="sr-only">操作</span></th></tr>
        </thead>
        <tbody>
          {pools.map((pool) => (
            <tr key={pool.id}>
              <th scope="row"><Link className="stock-pools-name-link" to={`${stockPoolListPath}/${pool.id}`} state={{ from }}>{pool.name}</Link><code>ID {pool.id}</code></th>
              <td>{pool.description || '未填写描述'}</td>
              <td><span className="stock-pools-source">{sourceLabel(pool.source)}</span></td>
              <td className="stock-pools-number">{pool.member_count}</td>
              <td className="stock-pools-time">{formatPoolTime(pool.updated_at)}</td>
              <td><Link className="stock-pools-open-link" to={`${stockPoolListPath}/${pool.id}`} state={{ from }}>打开详情</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StockPoolPagination({ data, onPageChange }: { readonly data: StockPoolListResponse; readonly onPageChange: (page: number) => void }) {
  const { page, total, total_pages: totalPages } = data.pagination
  if (totalPages < 1) return null
  return (
    <div className="stock-pools-pagination" aria-label="股票池列表分页">
      <span>第 {page} / {totalPages} 页 · 共 {total} 个股票池</span>
      <div>
        <button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>上一页</button>
        <button type="button" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>下一页</button>
      </div>
    </div>
  )
}

function StockPoolListPanel({ state, query, onRetry, onPageChange, from }: { readonly state: ListState; readonly query: string; readonly onRetry: () => void; readonly onPageChange: (page: number) => void; readonly from: string }) {
  return (
    <section className="stock-pools-panel" aria-labelledby="stock-pool-list-heading">
      <div className="stock-pools-panel-heading">
        <div>
          <p className="stock-pools-section-kicker">OBJECT / STOCK POOL</p>
          <h2 id="stock-pool-list-heading">股票池列表</h2>
        </div>
        <span className="stock-pools-sort-note">按更新时间倒序</span>
      </div>
      <p className="stock-pools-panel-description">搜索只匹配服务端名称；列表不会使用浏览器缓存或替代数据。</p>
      {state.status === 'loading' ? <LoadingState label="正在请求 /api/v1/stock-pools" /> : null}
      {state.status === 'error' ? <ErrorState error={state.error} title="股票池列表暂不可用" hint={query ? '搜索结果没有回退为空列表，请检查服务后重试。' : '列表没有回退数据，请检查服务后重试。'} actionLabel="重试加载" onRetry={onRetry} /> : null}
      {state.status === 'success' && state.data.data.length === 0 ? <EmptyState description={query ? `没有找到名称包含“${query}”的股票池。` : '还没有股票池；可使用上方创建入口建立第一个。'} onRetry={query ? onRetry : undefined} /> : null}
      {state.status === 'success' && state.data.data.length > 0 ? <><StockPoolTable pools={state.data.data} from={from} /><StockPoolPagination data={state.data} onPageChange={onPageChange} /></> : null}
    </section>
  )
}

export function StockPoolsPage() {
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const parsedPage = useMemo(() => parsePage(searchParams.get('page')), [searchParams])
  const [searchText, setSearchText] = useState(query)
  const [listState, setListState] = useState<ListState>({ status: 'loading' })
  const [showCreate, setShowCreate] = useState(false)
  const [createdPool, setCreatedPool] = useState<StockPool | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)

  useEffect(() => setSearchText(query), [query])
  useEffect(() => {
    if (parsedPage.invalidReason) {
      setListState({ status: 'error', error: new Error(parsedPage.invalidReason) })
      return
    }
    const controller = new AbortController()
    setListState({ status: 'loading' })
    listStockPools(query, parsedPage.page, 20, controller.signal)
      .then((data) => setListState({ status: 'success', data }))
      .catch((error) => { if (!isApiAbortError(error)) setListState({ status: 'error', error }) })
    return () => controller.abort()
  }, [parsedPage.invalidReason, parsedPage.page, query, refreshToken])

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const next = new URLSearchParams(searchParams)
    const nextQuery = searchText.trim()
    if (nextQuery) next.set('q', nextQuery)
    else next.delete('q')
    next.delete('page')
    setCreatedPool(null)
    setSearchParams(next)
  }

  function changePage(page: number) {
    const next = new URLSearchParams(searchParams)
    next.set('page', String(page))
    setCreatedPool(null)
    setSearchParams(next)
  }

  function handleCreated(pool: StockPool) {
    setShowCreate(false)
    setCreatedPool(pool)
    setRefreshToken((current) => current + 1)
  }

  const from = `${location.pathname}${location.search}`
  return (
    <main className="page-container stock-pools-page">
      <section className="page-heading stock-pools-heading">
        <div>
          <p className="page-kicker">RESEARCH / STOCK POOLS</p>
          <h1>股票池</h1>
          <p className="page-description">创建并重新打开可复核的手工股票池。列表与详情元数据均来自服务端。</p>
        </div>
        {!showCreate ? <Button theme="primary" onClick={() => setShowCreate(true)}>新建股票池</Button> : null}
      </section>
      {createdPool ? <div className="stock-pools-success" role="status">已创建股票池“{createdPool.name}”（ID {createdPool.id}），来源：{sourceLabel(createdPool.source)}。<Link to={`${stockPoolListPath}/${createdPool.id}`} state={{ from }}>打开详情</Link></div> : null}
      <form className="stock-pools-search" onSubmit={submitSearch} role="search">
        <label htmlFor="stock-pool-search">搜索股票池</label>
        <input id="stock-pool-search" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="按名称搜索" />
        <Button theme="primary" type="submit">搜索</Button>
        {query ? <button type="button" className="stock-pools-text-button" onClick={() => { setSearchText(''); setSearchParams({}) }}>清除搜索</button> : null}
      </form>
      <div className="stock-pools-layout">
        {showCreate ? <StockPoolCreatePanel onCreated={handleCreated} onCancel={() => setShowCreate(false)} /> : <aside className="stock-pools-entry-note"><p className="stock-pools-section-kicker">RESEARCH ENTRY</p><h2>从研究工作区管理股票池</h2><p>新建入口只开放服务端已批准的名称和描述字段。</p><button type="button" onClick={() => setShowCreate(true)}>开始创建</button></aside>}
        <StockPoolListPanel state={listState} query={query} onRetry={() => setRefreshToken((current) => current + 1)} onPageChange={changePage} from={from} />
      </div>
    </main>
  )
}

function readReturnPath(state: unknown) {
  if (typeof state === 'object' && state !== null && 'from' in state && typeof state.from === 'string' && state.from.startsWith(stockPoolListPath)) return state.from
  return stockPoolListPath
}

export function StockPoolDetailPage() {
  const { id: rawId } = useParams()
  const location = useLocation()
  const [state, setState] = useState<DetailState>({ status: 'loading' })
  const parsedId = rawId && /^[1-9]\d*$/.test(rawId) ? Number(rawId) : null
  const returnPath = readReturnPath(location.state)

  const load = useCallback(() => {
    if (parsedId === null) {
      setState({ status: 'error', error: new Error('URL 中的股票池 ID 无效。') })
      return () => undefined
    }
    const controller = new AbortController()
    setState({ status: 'loading' })
    getStockPool(parsedId, controller.signal)
      .then((data) => setState({ status: 'success', data }))
      .catch((error) => { if (!isApiAbortError(error)) setState({ status: 'error', error }) })
    return () => controller.abort()
  }, [parsedId])

  useEffect(() => load(), [load])

  return (
    <main className="page-container stock-pool-detail-page">
      <Link className="stock-pool-back-link" to={returnPath}>← 返回股票池列表</Link>
      {state.status === 'loading' ? <LoadingState label="正在请求股票池详情" /> : null}
      {state.status === 'error' ? <ErrorState error={state.error} title="股票池详情暂不可用" hint="详情不会使用名称、成员数或本地列表替代服务端 ID。" actionLabel="重新加载" onRetry={load} /> : null}
      {state.status === 'success' ? <StockPoolDetail data={state.data} onRefresh={load} /> : null}
    </main>
  )
}

function StockPoolMemberPagination({ data, onPageChange }: { readonly data: StockPoolMemberListResponse; readonly onPageChange: (page: number) => void }) {
  const { page, total, total_pages: totalPages } = data.pagination
  if (totalPages < 1) return null
  return (
    <div className="stock-pool-members-pagination" aria-label="股票池成员分页">
      <span>第 {page} / {totalPages} 页 · 共 {total} 个成员</span>
      <div>
        <button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>上一页</button>
        <button type="button" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>下一页</button>
      </div>
    </div>
  )
}

function StockPoolMemberTable({
  members,
  selectedSymbols,
  onToggle,
  onToggleAll,
  onDelete,
  deletingSymbols,
  batchRunning,
}: {
  readonly members: ReadonlyArray<StockPoolMember>
  readonly selectedSymbols: ReadonlyArray<string>
  readonly onToggle: (symbol: string, checked: boolean) => void
  readonly onToggleAll: (checked: boolean) => void
  readonly onDelete: (symbol: string) => void
  readonly deletingSymbols: Readonly<Record<string, boolean>>
  readonly batchRunning: boolean
}) {
  const allSelected = members.length > 0 && members.every((member) => selectedSymbols.includes(member.symbol))
  return (
    <div className="stock-pool-members-table-wrap">
      <table className="stock-pool-members-table" aria-label="股票池成员表">
        <thead>
          <tr>
            <th scope="col" className="stock-pool-members-select-column">
              <input type="checkbox" aria-label="选择当前页全部成员" checked={allSelected} onChange={(event) => onToggleAll(event.target.checked)} />
            </th>
            <th scope="col">股票代码</th><th scope="col">股票名称</th><th scope="col"><span className="sr-only">操作</span></th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => {
            const deleting = deletingSymbols[member.symbol] || batchRunning
            return (
              <tr key={member.symbol}>
                <td className="stock-pool-members-select-column">
                  <input type="checkbox" aria-label={`选择 ${member.symbol}`} checked={selectedSymbols.includes(member.symbol)} disabled={deleting} onChange={(event) => onToggle(member.symbol, event.target.checked)} />
                </td>
                <th scope="row"><Link className="stock-pool-member-symbol-link" to={`/stocks/${encodeURIComponent(member.symbol)}`}>{member.symbol}</Link></th>
                <td>{member.name}</td>
                <td><button type="button" className="stock-pool-member-delete" disabled={deleting} onClick={() => onDelete(member.symbol)}>{deleting ? '删除中…' : '删除'}</button></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function StockPoolBatchResult({ state }: { readonly state: BatchState }) {
  if (state.status !== 'complete') return null
  const successCount = state.results.filter((result) => result.status === 'success').length
  const failureCount = state.results.length - successCount
  return (
    <div className={`stock-pool-batch-result ${failureCount > 0 ? 'stock-pool-batch-result--partial' : ''}`} role={failureCount > 0 ? 'alert' : 'status'}>
      <p>{successCount} 项删除成功，{failureCount} 项失败；成员表已从服务端重新同步。</p>
      <ul>
        {state.results.map((result) => (
          <li key={result.symbol}>
            <code>{result.symbol}</code>：{result.status === 'success' ? '已删除' : `删除失败：${createErrorMessage(result.error)}`}
          </li>
        ))}
      </ul>
    </div>
  )
}

function StockPoolMembersPanel({ data, onRefresh }: { readonly data: StockPool; readonly onRefresh: () => void }) {
  const [memberPage, setMemberPage] = useState(1)
  const [memberRefreshToken, setMemberRefreshToken] = useState(0)
  const [state, setState] = useState<MemberListState>({ status: 'loading' })
  const [symbol, setSymbol] = useState('')
  const [addValidationMessage, setAddValidationMessage] = useState('')
  const [addState, setAddState] = useState<MemberFeedback | { readonly tone: 'idle' } | { readonly tone: 'loading' }>({ tone: 'idle' })
  const [memberFeedback, setMemberFeedback] = useState<MemberFeedback | null>(null)
  const [selectedSymbols, setSelectedSymbols] = useState<ReadonlyArray<string>>([])
  const [deletingSymbols, setDeletingSymbols] = useState<Record<string, boolean>>({})
  const [batchState, setBatchState] = useState<BatchState>({ status: 'idle' })

  useEffect(() => {
    const controller = new AbortController()
    setState({ status: 'loading' })
    listStockPoolMembers(data.id, memberPage, 20, controller.signal)
      .then((response) => setState({ status: 'success', data: response }))
      .catch((error) => { if (!isApiAbortError(error)) setState({ status: 'error', error }) })
    return () => controller.abort()
  }, [data.id, memberPage, memberRefreshToken])

  function refreshMembers() {
    setSelectedSymbols([])
    setMemberRefreshToken((current) => current + 1)
  }

  async function submitMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedSymbol = symbol.trim()
    if (!normalizedSymbol) {
      setAddValidationMessage('请输入 Markets 返回的原始股票代码。')
      return
    }
    setAddValidationMessage('')
    setMemberFeedback(null)
    setAddState({ tone: 'loading' })
    try {
      const response = await addStockPoolMember(data.id, { symbol: normalizedSymbol })
      setSymbol('')
      setAddState({ tone: 'success', message: `已添加 ${response.member.symbol}，服务端成员数为 ${response.member_count}。` })
      onRefresh()
      refreshMembers()
    } catch (error) {
      if (!isApiAbortError(error)) setAddState({ tone: 'error', message: `添加失败：${createErrorMessage(error)}` })
    }
  }

  async function deleteMember(symbolToDelete: string) {
    setBatchState({ status: 'idle' })
    setMemberFeedback(null)
    setDeletingSymbols((current) => ({ ...current, [symbolToDelete]: true }))
    try {
      const response = await deleteStockPoolMember(data.id, symbolToDelete)
      setMemberFeedback({ tone: 'success', message: `已删除 ${response.symbol}，服务端成员数为 ${response.member_count}。` })
      onRefresh()
      refreshMembers()
    } catch (error) {
      if (!isApiAbortError(error)) setMemberFeedback({ tone: 'error', message: `删除失败：${createErrorMessage(error)}` })
    } finally {
      setDeletingSymbols((current) => {
        const next = { ...current }
        delete next[symbolToDelete]
        return next
      })
    }
  }

  async function deleteSelectedMembers() {
    const symbols = [...selectedSymbols]
    if (symbols.length === 0) return
    setMemberFeedback(null)
    setBatchState({ status: 'loading', symbols })
    const results: BatchMemberResult[] = []
    for (const symbolToDelete of symbols) {
      try {
        await deleteStockPoolMember(data.id, symbolToDelete)
        results.push({ symbol: symbolToDelete, status: 'success' })
      } catch (error) {
        if (!isApiAbortError(error)) results.push({ symbol: symbolToDelete, status: 'error', error })
      }
    }
    setBatchState({ status: 'complete', results })
    setSelectedSymbols([])
    onRefresh()
    refreshMembers()
  }

  function toggleMember(symbolToToggle: string, checked: boolean) {
    setSelectedSymbols((current) => checked
      ? current.includes(symbolToToggle) ? current : [...current, symbolToToggle]
      : current.filter((item) => item !== symbolToToggle))
  }

  function toggleAllMembers(checked: boolean) {
    if (state.status !== 'success') return
    setSelectedSymbols(checked ? state.data.data.map((member) => member.symbol) : [])
  }

  const selectedCount = selectedSymbols.length
  const batchRunning = batchState.status === 'loading'
  return (
    <section className="stock-pool-members-panel" aria-labelledby="stock-pool-members-heading">
      <div className="stock-pools-panel-heading">
        <div><p className="stock-pools-section-kicker">MEMBERS / SERVER SET</p><h2 id="stock-pool-members-heading">股票池成员</h2></div>
        <span className="stock-pools-source">按 symbol 升序</span>
      </div>
      <p className="stock-pools-panel-description">成员、名称和成员数均来自服务端；股票详情使用原始 symbol 打开。</p>
      <form className="stock-pool-member-add-form" onSubmit={submitMember}>
        <label htmlFor="stock-pool-member-symbol">添加股票</label>
        <div className="stock-pool-member-add-controls">
          <input id="stock-pool-member-symbol" value={symbol} onChange={(event) => setSymbol(event.target.value)} placeholder="例如 000001.SZ" autoComplete="off" />
          <Button theme="primary" type="submit" loading={addState.tone === 'loading'} disabled={addState.tone === 'loading' || batchRunning}>添加成员</Button>
        </div>
        <p className="stock-pool-member-input-hint">仅提交 Markets API 返回的原始 code，不按名称或排名转换。</p>
      </form>
      {addValidationMessage ? <p className="stock-pools-inline-error" role="alert">{addValidationMessage}</p> : null}
      {addState.tone === 'success' || addState.tone === 'error' ? <p className={`stock-pool-member-feedback stock-pool-member-feedback--${addState.tone}`} role={addState.tone === 'error' ? 'alert' : 'status'}>{addState.message}</p> : null}
      {memberFeedback ? <p className={`stock-pool-member-feedback stock-pool-member-feedback--${memberFeedback.tone}`} role={memberFeedback.tone === 'error' ? 'alert' : 'status'}>{memberFeedback.message}</p> : null}
      <StockPoolBatchResult state={batchState} />
      {state.status === 'loading' ? <LoadingState label="正在请求股票池成员" /> : null}
      {state.status === 'error' ? <ErrorState error={state.error} title="股票池成员暂不可用" hint="成员表没有回退数据，请检查服务后重试。" actionLabel="重试读取成员" onRetry={refreshMembers} /> : null}
      {state.status === 'success' && state.data.data.length === 0 ? <EmptyState description="当前股票池没有服务端成员。可使用上方输入框添加真实股票。" /> : null}
      {state.status === 'success' && state.data.data.length > 0 ? (
        <>
          <div className="stock-pool-members-toolbar">
            <span>当前页已选择 {selectedCount} 项</span>
            <button type="button" className="stock-pool-member-batch-delete" disabled={selectedCount === 0 || batchRunning} onClick={deleteSelectedMembers}>{batchRunning ? '逐项删除中…' : '移除所选成员'}</button>
          </div>
          <StockPoolMemberTable members={state.data.data} selectedSymbols={selectedSymbols} onToggle={toggleMember} onToggleAll={toggleAllMembers} onDelete={deleteMember} deletingSymbols={deletingSymbols} batchRunning={batchRunning} />
          <StockPoolMemberPagination data={state.data} onPageChange={(page) => { setSelectedSymbols([]); setMemberPage(page) }} />
        </>
      ) : null}
    </section>
  )
}

function StockPoolDetail({ data, onRefresh }: { readonly data: StockPool; readonly onRefresh: () => void }) {
  return (
    <>
      <section className="stock-pool-detail-heading">
        <div><p className="page-kicker">OBJECT / STOCK POOL / ID {data.id}</p><h1>{data.name}</h1><p className="page-description">股票池概览</p></div>
        <Button variant="outline" onClick={onRefresh}>刷新详情</Button>
      </section>
      <section className="stock-pool-detail-panel" aria-labelledby="stock-pool-detail-meta-heading">
        <div className="stock-pools-panel-heading"><div><p className="stock-pools-section-kicker">SERVER METADATA</p><h2 id="stock-pool-detail-meta-heading">服务端元数据</h2></div><span className="stock-pools-source">{sourceLabel(data.source)}</span></div>
        <dl className="stock-pool-detail-meta">
          <div><dt>名称</dt><dd>{data.name}</dd></div>
          <div><dt>描述</dt><dd>{data.description || '未填写描述'}</dd></div>
          <div><dt>来源</dt><dd>{sourceLabel(data.source)}</dd></div>
          <div><dt>成员数</dt><dd>{data.member_count}</dd></div>
          <div><dt>更新时间</dt><dd>{formatPoolTime(data.updated_at)}</dd></div>
          <div><dt>创建时间</dt><dd>{formatPoolTime(data.created_at)}</dd></div>
        </dl>
      </section>
      <StockPoolMembersPanel data={data} onRefresh={onRefresh} />
    </>
  )
}
