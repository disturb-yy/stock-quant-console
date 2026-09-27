import { useEffect, useState } from 'react'
import {
  STOCK_SORT_FIELDS,
  STOCK_SORT_ORDERS,
  stockCatalogApi,
  type StockCatalogItem,
  type StockCatalogQuery,
  type StockSortField,
  type StockSortOrder,
} from '../api/stockCatalog'
import { SyncApiError } from '../api/syncTasks'
import { useRuntimeConfig } from './RuntimeConfigContext'

const PAGE_SIZE_OPTIONS = [20, 30, 50] as const
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number]
type CatalogQuery = Required<StockCatalogQuery> & { page_size: PageSize }
const DEFAULT_QUERY: CatalogQuery = { keyword: '', page: 1, page_size: PAGE_SIZE_OPTIONS[0], sort_by: 'symbol', sort_order: 'asc' }

const statusLabels: Record<string, string> = {
  normal: '正常',
  active: '正常',
  L: '正常',
  suspended: '暂停',
  P: '暂停',
  delisted: '已退市',
  D: '已退市',
}

const aShareMarkets = new Set(['A', 'SH', 'SZ', 'BJ'])

function readQuery(): CatalogQuery {
  const params = new URLSearchParams(window.location.search)
  const page = Number(params.get('page'))
  const sortBy = params.get('sort_by') as StockSortField
  const sortOrder = params.get('sort_order') as StockSortOrder
  const parsedPageSize = Number(params.get('page_size'))
  return {
    keyword: params.get('keyword') ?? '',
    page: Number.isInteger(page) && page > 0 ? page : DEFAULT_QUERY.page,
    page_size: PAGE_SIZE_OPTIONS.includes(parsedPageSize as PageSize) ? (parsedPageSize as PageSize) : DEFAULT_QUERY.page_size,
    sort_by: STOCK_SORT_FIELDS.includes(sortBy) ? sortBy : DEFAULT_QUERY.sort_by,
    sort_order: STOCK_SORT_ORDERS.includes(sortOrder) ? sortOrder : DEFAULT_QUERY.sort_order,
  }
}

function writeQuery(query: CatalogQuery): void {
  const params = new URLSearchParams()
  if (query.keyword) params.set('keyword', query.keyword)
  params.set('page', String(query.page))
  params.set('page_size', String(query.page_size))
  params.set('sort_by', query.sort_by)
  params.set('sort_order', query.sort_order)
  window.history.replaceState({}, '', `/stocks?${params.toString()}`)
}

function errorMessage(error: unknown): string {
  if (error instanceof SyncApiError) {
    if (error.category === 'validation') return '查询条件无效，请检查后重试'
    if (error.category === 'unavailable') return '股票目录服务暂时不可用，请稍后重试'
    if (error.category === 'contract') return '服务响应不符合当前契约，暂时无法展示股票目录'
    return '股票目录服务暂时不可用，请稍后重试'
  }
  return '股票目录服务暂时不可用，请稍后重试'
}

function statusLabel(status: string): string {
  return statusLabels[status] ?? status
}

function marketLabel(market: string): string {
  return aShareMarkets.has(market) ? 'A 股' : market
}

function availabilityLabel(value: StockCatalogItem['availability']['daily_bars']): string {
  return value === 'available' ? '有数据' : '暂无数据'
}

function PageHeader({ mockMode }: { mockMode: boolean }) {
  return (
    <header className="page-header">
      <div>
        <h1>已同步股票</h1>
        <p>查看已同步基础资料的 A 股股票，按名称或标识定位并进入单只股票数据验证。</p>
      </div>
      {mockMode && <div className="mode-banner" role="status">开发 Mock 模式<br /><small>仅用于页面开发与测试</small></div>}
    </header>
  )
}

type ToolbarProps = {
  keyword: string
  loading: boolean
  onKeywordChange: (value: string) => void
  onSearch: () => void
}

function CatalogToolbar(props: ToolbarProps) {
  return (
    <form className="catalog-toolbar" onSubmit={(event) => { event.preventDefault(); props.onSearch() }}>
      <label className="catalog-search-field">
        <input aria-label="名称或标识" onChange={(event) => props.onKeywordChange(event.target.value)} placeholder="名称或标识" value={props.keyword} />
      </label>
      <button className="primary-button" disabled={props.loading} type="submit">{props.loading ? '查询中…' : '搜索'}</button>
    </form>
  )
}

type SortControlProps = {
  field: StockSortField
  label: string
  query: CatalogQuery
  loading: boolean
  onSortChange: (field: StockSortField, order: StockSortOrder) => void
  onReset: () => void
}

function SortControl({ field, label, query, loading, onSortChange, onReset }: SortControlProps) {
  const isDefault = query.sort_by === 'symbol' && query.sort_order === 'asc'
  const isAscending = query.sort_by === field && query.sort_order === 'asc' && !isDefault
  const isDescending = query.sort_by === field && query.sort_order === 'desc'
  const changeSort = (order: StockSortOrder) => {
    if (query.sort_by === field && query.sort_order === order) {
      onReset()
      return
    }
    onSortChange(field, order)
  }
  return (
    <span className="sort-control" aria-label={`${label}排序`}>
      <button aria-label={`${label}升序`} className={isAscending ? 'is-active' : ''} disabled={loading} onClick={() => changeSort('asc')} title={isAscending ? '恢复默认排序' : '升序'} type="button"><span aria-hidden="true" className="sort-triangle sort-triangle-up" /></button>
      <button aria-label={`${label}降序`} className={isDescending ? 'is-active' : ''} disabled={loading} onClick={() => changeSort('desc')} title={isDescending ? '恢复默认排序' : '降序'} type="button"><span aria-hidden="true" className="sort-triangle sort-triangle-down" /></button>
    </span>
  )
}

type StockCatalogTableProps = {
  items: StockCatalogItem[]
  query: CatalogQuery
  loading: boolean
  loadingMessage: string
  onSortChange: (field: StockSortField, order: StockSortOrder) => void
  onResetSort: () => void
}

function StockCatalogTable({ items, query, loading, loadingMessage, onSortChange, onResetSort }: StockCatalogTableProps) {
  return (
    <div className="stock-catalog-table-wrap">
      <table className="stock-catalog-table">
        <caption className="sr-only">已同步股票目录</caption>
        <colgroup><col className="stock-symbol-column" /><col className="stock-name-column" /><col /><col /><col /><col /><col /></colgroup>
        <thead><tr>
          <th className="sortable-header"><span className="sortable-header-content"><span>股票标识</span><SortControl field="symbol" label="股票标识" loading={loading} onReset={onResetSort} onSortChange={onSortChange} query={query} /></span></th>
          <th className="sortable-header"><span className="sortable-header-content"><span>股票名称</span><SortControl field="name" label="股票名称" loading={loading} onReset={onResetSort} onSortChange={onSortChange} query={query} /></span></th>
          <th>市场</th><th>股票状态</th><th>基础资料</th><th>历史日线</th><th>数据有效日</th>
        </tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={7}><span className="table-loading-state" role="status">{loadingMessage}</span></td></tr> : items.map((item) => (
            <tr key={item.symbol}>
              <th scope="row">{item.symbol}</th>
              <td><a className="stock-name-link" href={`/stocks/${encodeURIComponent(item.symbol)}/data${window.location.search}`}>{item.name}</a></td>
              <td>{marketLabel(item.market)}</td>
              <td><span className="catalog-status">{statusLabel(item.status)}</span></td>
              <td><span className="availability availability-available">已同步</span></td>
              <td><span className={`availability availability-${item.availability.daily_bars}`}>{availabilityLabel(item.availability.daily_bars)}</span></td>
              <td>{item.data_as_of ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Pagination({ query, total, loading, onPageChange, onPageSizeChange }: { query: CatalogQuery; total: number; loading: boolean; onPageChange: (page: number) => void; onPageSizeChange: (pageSize: PageSize) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / query.page_size))
  return (
    <div className="pagination catalog-pagination">
      <span>共 {total} 条</span>
      <label><span>每页</span><select aria-label="每页条数" disabled={loading} onChange={(event) => onPageSizeChange(Number(event.target.value) as PageSize)} value={query.page_size}>{PAGE_SIZE_OPTIONS.map((pageSize) => <option key={pageSize} value={pageSize}>{pageSize} 条</option>)}</select></label>
      <button disabled={query.page <= 1 || loading} onClick={() => onPageChange(query.page - 1)} type="button">上一页</button>
      <label><select aria-label="页码" disabled={loading} onChange={(event) => onPageChange(Number(event.target.value))} value={query.page}>{Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => <option key={page} value={page}>第 {page} 页</option>)}</select><span aria-live="polite">/ {totalPages} 页</span></label>
      <button disabled={query.page >= totalPages || loading} onClick={() => onPageChange(query.page + 1)} type="button">下一页</button>
    </div>
  )
}

function EmptyState({ searching, onClear }: { searching: boolean; onClear: () => void }) {
  return (
    <div className="catalog-state" role="status">
      <h3>{searching ? '没有匹配的股票' : '暂无已同步股票'}</h3>
      <p>{searching ? '请调整名称或标识后重试。' : '请先完成股票基础资料同步，再返回目录查看。'}</p>
      {searching ? <button className="text-button" onClick={onClear} type="button">清空搜索条件</button> : <a className="text-button" href="/">进入同步页面</a>}
    </div>
  )
}

export function StockCatalogPage() {
  const { config } = useRuntimeConfig()
  const [query, setQuery] = useState<CatalogQuery>(readQuery)
  const [keyword, setKeyword] = useState(query.keyword)
  const [items, setItems] = useState<StockCatalogItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [error, setError] = useState<string>()
  const [retryToken, setRetryToken] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(undefined)
    void stockCatalogApi.listStocks(query)
      .then((response) => { if (active) { setItems(response.items); setTotal(response.pagination.total) } })
      .catch((reason: unknown) => { if (active) { setItems([]); setTotal(0); setError(errorMessage(reason)) } })
      .finally(() => { if (active) { setHasLoaded(true); setLoading(false) } })
    return () => { active = false }
  }, [query, retryToken])

  const updateQuery = (changes: Partial<CatalogQuery>) => {
    const next = { ...query, ...changes }
    writeQuery(next)
    setQuery(next)
  }
  const search = () => updateQuery({ keyword: keyword.trim(), page: 1 })
  const clearSearch = () => { setKeyword(''); updateQuery({ keyword: '', page: 1 }) }

  return (
    <main className="app-shell">
      <PageHeader mockMode={config?.data_source.mode === 'mock'} />
      <section className="panel catalog-panel" aria-labelledby="catalog-title">
        <div className="section-heading catalog-section-heading"><h2 id="catalog-title">股票目录</h2><CatalogToolbar keyword={keyword} loading={loading} onKeywordChange={setKeyword} onSearch={search} /></div>
        {error && <div className="error-banner" role="alert"><span>{error}</span><button className="text-button" onClick={() => setRetryToken((value) => value + 1)} type="button">重新加载</button></div>}
        {loading && items.length === 0 && <p className="state-message" role="status">{hasLoaded ? '正在查询股票目录…' : '正在加载股票目录…'}</p>}
        {!loading && !error && items.length === 0 && <EmptyState searching={Boolean(query.keyword)} onClear={clearSearch} />}
        {!error && items.length > 0 && <><StockCatalogTable items={items} loading={loading} loadingMessage={hasLoaded ? '正在更新股票目录…' : '正在加载股票目录…'} onResetSort={() => updateQuery({ sort_by: 'symbol', sort_order: 'asc', page: 1 })} onSortChange={(sort_by, sort_order) => updateQuery({ sort_by, sort_order, page: 1 })} query={query} /><Pagination loading={loading} onPageChange={(page) => updateQuery({ page })} onPageSizeChange={(page_size) => updateQuery({ page: 1, page_size })} query={query} total={total} /></>}
      </section>
    </main>
  )
}
