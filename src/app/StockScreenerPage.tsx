import { useEffect, useMemo, useRef, useState } from 'react'
import {
  STOCK_SCREENER_CATEGORY_TYPES,
  STOCK_SCREENER_PERIODS,
  stockScreenerApi,
  type StockScreenerCategory,
  type StockScreenerItem,
  type StockScreenerPeriod,
  type StockScreenerQuery,
  type StockScreenerResponse,
} from '../api/stockScreener'
import { SyncApiError } from '../api/syncTasks'
import { PageHeader } from '../components/ui/PageHeader'
import { PaginationBar } from '../components/ui/PaginationBar'

const PAGE_SIZE = 20
const PAGE_SIZE_OPTIONS = [PAGE_SIZE] as const
const RANGE_FIELDS = ['price_min', 'price_max', 'return_min', 'return_max', 'average_volume_min', 'average_volume_max'] as const
type RangeField = (typeof RANGE_FIELDS)[number]

type Draft = {
  category_code: string
  price_min: string
  price_max: string
  return_period: StockScreenerPeriod
  return_min: string
  return_max: string
  volume_period: StockScreenerPeriod
  average_volume_min: string
  average_volume_max: string
}

type FieldErrors = Partial<Record<RangeField | 'form', string>>

const DEFAULT_DRAFT: Draft = {
	category_code: '',
  price_min: '', price_max: '', return_period: 20, return_min: '', return_max: '', volume_period: 20, average_volume_min: '', average_volume_max: '',
}

function isPeriod(value: string | null): value is `${StockScreenerPeriod}` {
  return value === '5' || value === '20' || value === '60'
}

function readDraft(params: URLSearchParams): Draft {
  return {
    category_code: params.get('category_code') ?? '',
    price_min: params.get('price_min') ?? '',
    price_max: params.get('price_max') ?? '',
    return_period: isPeriod(params.get('return_period')) ? Number(params.get('return_period')) as StockScreenerPeriod : 20,
    return_min: params.get('return_min') ?? '',
    return_max: params.get('return_max') ?? '',
    volume_period: isPeriod(params.get('volume_period')) ? Number(params.get('volume_period')) as StockScreenerPeriod : 20,
    average_volume_min: params.get('average_volume_min') ?? '',
    average_volume_max: params.get('average_volume_max') ?? '',
  }
}

function validNumber(value: string, allowNegative: boolean): number | undefined {
  if (!value.trim()) return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || (!allowNegative && parsed < 0)) return undefined
  return parsed
}

function parseRangeField(draft: Draft, field: RangeField, errors: FieldErrors): number | undefined {
  const value = draft[field]
  if (!value.trim()) return undefined
  const parsed = validNumber(value, field === 'return_min' || field === 'return_max')
  if (parsed === undefined) errors[field] = field.startsWith('return_') ? '请输入有效的百分比' : '请输入不小于 0 的数字'
  return parsed
}

function queryFromDraft(draft: Draft, page = 1): { query?: StockScreenerQuery; errors: FieldErrors } {
  const errors: FieldErrors = {}
  const parsed = Object.fromEntries(RANGE_FIELDS.map((field) => [field, parseRangeField(draft, field, errors)])) as Record<RangeField, number | undefined>
  if (parsed.price_min !== undefined && parsed.price_max !== undefined && parsed.price_min > parsed.price_max) errors.price_min = '最小值不能高于最大值'
  if (parsed.return_min !== undefined && parsed.return_max !== undefined && parsed.return_min > parsed.return_max) errors.return_min = '最小值不能高于最大值'
  if (parsed.average_volume_min !== undefined && parsed.average_volume_max !== undefined && parsed.average_volume_min > parsed.average_volume_max) errors.average_volume_min = '最小值不能高于最大值'
  const hasCategory = draft.category_code.trim() !== ''
  const hasCondition = RANGE_FIELDS.some((field) => draft[field].trim() !== '')
  if (!hasCondition && !hasCategory) errors.form = '至少选择一个分类或填写一项范围条件后才能开始筛选'
  if (Object.keys(errors).length > 0) return { errors }
  return {
    errors,
    query: {
      ...(hasCategory ? { category_code: draft.category_code.trim() } : {}),
      ...(parsed.price_min !== undefined ? { price_min: parsed.price_min } : {}),
      ...(parsed.price_max !== undefined ? { price_max: parsed.price_max } : {}),
      ...(hasReturnCondition(draft) ? { return_period: draft.return_period } : {}),
      ...(parsed.return_min !== undefined ? { return_min: parsed.return_min } : {}),
      ...(parsed.return_max !== undefined ? { return_max: parsed.return_max } : {}),
      ...(hasVolumeCondition(draft) ? { volume_period: draft.volume_period } : {}),
      ...(parsed.average_volume_min !== undefined ? { average_volume_min: parsed.average_volume_min } : {}),
      ...(parsed.average_volume_max !== undefined ? { average_volume_max: parsed.average_volume_max } : {}),
      page,
      page_size: PAGE_SIZE,
    },
  }
}

function hasReturnCondition(draft: Draft): boolean {
  return draft.return_min.trim() !== '' || draft.return_max.trim() !== ''
}

function hasVolumeCondition(draft: Draft): boolean {
  return draft.average_volume_min.trim() !== '' || draft.average_volume_max.trim() !== ''
}

function readInitialState(): { draft: Draft; query?: StockScreenerQuery } {
  const params = new URLSearchParams(window.location.search)
  const draft = readDraft(params)
  const hasReturnPeriodError = hasReturnCondition(draft) && params.has('return_period') && !isPeriod(params.get('return_period'))
  const hasVolumePeriodError = hasVolumeCondition(draft) && params.has('volume_period') && !isPeriod(params.get('volume_period'))
  const pageValue = Number(params.get('page'))
  const page = Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1
  const result = queryFromDraft(draft, page)
  return { draft, query: !hasReturnPeriodError && !hasVolumePeriodError && !result.errors.form && Object.keys(result.errors).length === 0 ? result.query : undefined }
}

function writeUrl(query: StockScreenerQuery): void {
  const params = new URLSearchParams()
  const fields: Array<keyof StockScreenerQuery> = ['category_code', 'price_min', 'price_max', 'return_period', 'return_min', 'return_max', 'volume_period', 'average_volume_min', 'average_volume_max']
  fields.forEach((field) => {
    const value = query[field]
    if (value !== undefined) params.set(field, String(value))
  })
  params.set('page', String(query.page ?? 1))
  window.history.replaceState({}, '', `/screener?${params.toString()}`)
}

function errorMessage(error: unknown): string {
  if (!(error instanceof SyncApiError)) return '条件选股服务暂时不可用，请稍后重试'
  if (error.category === 'unavailable') return '已同步数据查询暂时不可用，请稍后重试'
  if (error.category === 'validation') return '筛选条件无效，请检查后重试'
  if (error.category === 'contract') return '服务响应不符合当前契约，暂时无法展示选股结果'
  return error.message || '条件选股服务暂时不可用，请稍后重试'
}

function categoryErrorMessage(error: unknown): string {
  if (!(error instanceof SyncApiError)) return '分类目录服务暂时不可用，请稍后重试'
  if (error.code === 'CATEGORY_DATA_UNAVAILABLE') return '分类数据尚未同步或暂时不可用'
  if (error.category === 'contract') return '分类目录响应不符合当前契约，暂时无法展示'
  return error.message || '分类目录服务暂时不可用，请稍后重试'
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value)
}

function formatPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${formatNumber(value)}%`
}

function formatRange(min: number | undefined, max: number | undefined, suffix = ''): string {
  if (min !== undefined && max !== undefined) return `${formatNumber(min)}${suffix} ～ ${formatNumber(max)}${suffix}`
  if (min !== undefined) return `不低于 ${formatNumber(min)}${suffix}`
  return `不高于 ${formatNumber(max ?? 0)}${suffix}`
}

function conditionSummary(query: StockScreenerQuery): string[] {
  const summary: string[] = []
  if (query.price_min !== undefined || query.price_max !== undefined) summary.push(`收盘价 ${formatRange(query.price_min, query.price_max)}`)
  if (query.return_min !== undefined || query.return_max !== undefined) summary.push(`${query.return_period} 日涨跌幅 ${formatRange(query.return_min, query.return_max, '%')}`)
  if (query.average_volume_min !== undefined || query.average_volume_max !== undefined) summary.push(`${query.volume_period} 日平均成交量 ${formatRange(query.average_volume_min, query.average_volume_max)}`)
  return summary
}

function categoryLabel(category: StockScreenerCategory | undefined): string {
  if (!category) return ''
  return `行业：${category.name}`
}

function candidateHref(symbol: string): string {
  return `/stocks/${encodeURIComponent(symbol)}/data${window.location.search}`
}

function metricTone(value: number): string {
  if (value > 0) return 'price-rise'
  if (value < 0) return 'price-fall'
  return 'price-flat'
}

type ConditionFormProps = {
  draft: Draft
  errors: FieldErrors
  loading: boolean
  categories: StockScreenerCategory[]
  categoryKeyword: string
  categoryLoading: boolean
  categoryError?: string
  onChange: (field: keyof Draft, value: string | StockScreenerPeriod) => void
  onCategoryKeywordChange: (value: string) => void
  onReset: () => void
  onSubmit: () => void
}

function RangeInput({ field, label, value, error, onChange }: { field: RangeField; label: string; value: string; error?: string; onChange: (value: string) => void }) {
  return (
    <label className="screener-field" htmlFor={field}>
      <span>{label}</span>
      <input aria-describedby={error ? `${field}-error` : undefined} aria-invalid={Boolean(error)} id={field} inputMode="decimal" min={field.startsWith('return_') ? undefined : 0} onChange={(event) => onChange(event.target.value)} step="any" type="number" value={value} />
      {error && <span className="screener-field-error" id={`${field}-error`} role="alert">{error}</span>}
    </label>
  )
}

function PeriodSelect({ field, label, value, onChange }: { field: 'return_period' | 'volume_period'; label: string; value: StockScreenerPeriod; onChange: (value: StockScreenerPeriod) => void }) {
  return (
    <label className="screener-field screener-period-field" htmlFor={field}>
      <span>{label}</span>
      <select id={field} onChange={(event) => onChange(Number(event.target.value) as StockScreenerPeriod)} value={value}>
        {STOCK_SCREENER_PERIODS.map((period) => <option key={period} value={period}>{period} 日</option>)}
      </select>
    </label>
  )
}

function CategorySelect({ draft, categories, categoryKeyword, categoryLoading, categoryError, loading, onChange, onCategoryKeywordChange }: Pick<ConditionFormProps, 'draft' | 'categories' | 'categoryKeyword' | 'categoryLoading' | 'categoryError' | 'loading' | 'onChange' | 'onCategoryKeywordChange'>) {
  const groups = STOCK_SCREENER_CATEGORY_TYPES.map((type) => ({
    type,
    items: categories.filter((category) => category.type === type),
  })).filter((group) => group.items.length > 0)
  return (
    <fieldset className="screener-category-group" disabled={loading}>
      <legend>申万行业分类</legend>
      <div className="screener-category-fields">
        <label className="screener-field" htmlFor="category-keyword"><span>搜索分类</span><input aria-label="搜索分类" id="category-keyword" onChange={(event) => onCategoryKeywordChange(event.target.value)} placeholder="按名称搜索" type="search" value={categoryKeyword} /></label>
        <label className="screener-field" htmlFor="category-code"><span>选择分类</span><select aria-describedby={categoryError ? 'category-error' : undefined} aria-invalid={Boolean(categoryError && draft.category_code)} id="category-code" onChange={(event) => onChange('category_code', event.target.value)} value={draft.category_code}>
          <option value="">不按分类筛选</option>
          {groups.map((group) => <optgroup key={group.type} label="行业">{group.items.map((category) => <option key={category.code} value={category.code}>{category.name} · {category.member_count} 只 · {category.category_data_as_of ?? '暂无日期'}</option>)}</optgroup>)}
        </select></label>
      </div>
      {categoryLoading && <p className="field-hint" role="status">正在加载分类目录…</p>}
      {categoryError && <p className="screener-form-error" id="category-error" role="alert">{categoryError} <a className="text-button inline-link" href="/">前往同步任务</a></p>}
    </fieldset>
  )
}

function ConditionForm({ draft, errors, loading, categories, categoryKeyword, categoryLoading, categoryError, onChange, onCategoryKeywordChange, onReset, onSubmit }: ConditionFormProps) {
  return (
    <section className="panel screener-condition-panel" aria-labelledby="screener-condition-title">
      <div className="section-heading"><div><p className="eyebrow">SCREENING CONDITIONS</p><h2 id="screener-condition-title">筛选条件</h2></div></div>
      <form onSubmit={(event) => { event.preventDefault(); onSubmit() }}>
        <fieldset className="screener-condition-groups" disabled={loading}>
          <legend className="sr-only">条件选股范围</legend>
          <CategorySelect categories={categories} categoryError={categoryError} categoryKeyword={categoryKeyword} categoryLoading={categoryLoading} draft={draft} loading={loading} onCategoryKeywordChange={onCategoryKeywordChange} onChange={onChange} />
          <fieldset className="screener-condition-group">
            <legend>最新收盘价</legend>
            <div className="screener-range-row">
              <RangeInput field="price_min" label="最小值" value={draft.price_min} error={errors.price_min} onChange={(value) => onChange('price_min', value)} />
              <span className="screener-range-separator" aria-hidden="true">～</span>
              <RangeInput field="price_max" label="最大值" value={draft.price_max} error={errors.price_max} onChange={(value) => onChange('price_max', value)} />
            </div>
          </fieldset>
          <fieldset className="screener-condition-group">
            <legend>区间涨跌幅</legend>
            <div className="screener-range-row">
              <PeriodSelect field="return_period" label="周期" value={draft.return_period} onChange={(value) => onChange('return_period', value)} />
              <RangeInput field="return_min" label="最小值（%）" value={draft.return_min} error={errors.return_min} onChange={(value) => onChange('return_min', value)} />
              <span className="screener-range-separator" aria-hidden="true">～</span>
              <RangeInput field="return_max" label="最大值（%）" value={draft.return_max} error={errors.return_max} onChange={(value) => onChange('return_max', value)} />
            </div>
          </fieldset>
          <fieldset className="screener-condition-group">
            <legend>平均成交量</legend>
            <div className="screener-range-row">
              <PeriodSelect field="volume_period" label="周期" value={draft.volume_period} onChange={(value) => onChange('volume_period', value)} />
              <RangeInput field="average_volume_min" label="最小值" value={draft.average_volume_min} error={errors.average_volume_min} onChange={(value) => onChange('average_volume_min', value)} />
              <span className="screener-range-separator" aria-hidden="true">～</span>
              <RangeInput field="average_volume_max" label="最大值" value={draft.average_volume_max} error={errors.average_volume_max} onChange={(value) => onChange('average_volume_max', value)} />
            </div>
          </fieldset>
        </fieldset>
        {errors.form && <p className="screener-form-error" role="alert">{errors.form}</p>}
        <div className="form-footer screener-form-footer">
          <span className="form-note">至少选择一个行业或填写一项范围条件；结果使用已同步日线，不构成投资建议。</span>
          <div className="screener-form-actions">
            <button className="secondary-button" disabled={loading} onClick={onReset} type="button">重置</button>
            <button className="primary-button" disabled={loading || (!draft.category_code.trim() && !RANGE_FIELDS.some((field) => draft[field].trim() !== ''))} type="submit">{loading ? '筛选中…' : '开始筛选'}</button>
          </div>
        </div>
      </form>
    </section>
  )
}

function Summary({ response, query }: { response: StockScreenerResponse; query: StockScreenerQuery }) {
  const insufficient = response.universe.evaluable < response.universe.total
  return (
    <>
      <section className="panel screener-summary-panel" aria-labelledby="screener-summary-title">
        <div className="section-heading"><div><p className="eyebrow">RESULT SUMMARY</p><h2 id="screener-summary-title">筛选结果</h2></div></div>
        <dl className="screener-summary-grid">
          <div><dt>数据截至</dt><dd>{response.data_as_of ?? '暂无可用日线'}</dd></div>
          <div><dt>可评估范围</dt><dd>{formatNumber(response.universe.evaluable)} / {formatNumber(response.universe.total)} 只</dd></div>
          {response.category && <div><dt>分类快照</dt><dd>{categoryLabel(response.category)} · {formatNumber(response.universe.category_members ?? response.category.member_count)} 只 · {response.category.category_data_as_of ?? '暂无日期'}</dd></div>}
          <div><dt>候选数量</dt><dd>{formatNumber(response.pagination.total)} 只</dd></div>
        </dl>
        <div className="screener-condition-summary" aria-label="已提交筛选条件">{[...(response.category ? [categoryLabel(response.category)] : []), ...conditionSummary(query)].map((item) => <span key={item}>{item}</span>)}</div>
      </section>
      {insufficient && <p className="screener-insufficient" role="status">有 {formatNumber(response.universe.total - response.universe.evaluable)} 只股票因日线不足未纳入本次可评估范围。</p>}
    </>
  )
}

function CandidateTable({ items, loading, query }: { items: StockScreenerItem[]; loading: boolean; query: StockScreenerQuery }) {
  const showReturn = query.return_min !== undefined || query.return_max !== undefined
  const showVolume = query.average_volume_min !== undefined || query.average_volume_max !== undefined
  return (
    <div className="screener-table-wrap">
      <table aria-busy={loading} className="data-table screener-table">
        <caption className="sr-only">条件选股候选股票</caption>
        <thead><tr><th scope="col">股票标识</th><th scope="col">名称</th><th scope="col">收盘价</th>{showReturn && <th scope="col">{query.return_period} 日涨跌幅</th>}{showVolume && <th scope="col">{query.volume_period} 日平均成交量</th>}<th scope="col">数据有效日</th><th scope="col">操作</th></tr></thead>
        <tbody>{items.map((item) => (
          <tr key={item.symbol}>
            <th scope="row">{item.symbol}</th>
            <td>{item.name}</td>
            <td className="screener-number-cell">{formatNumber(item.close)}</td>
            {showReturn && <td className={`screener-number-cell ${item.return ? metricTone(item.return.value_percent) : ''}`}>{item.return ? formatPercent(item.return.value_percent) : '—'}</td>}
            {showVolume && <td className="screener-number-cell">{item.average_volume ? formatNumber(item.average_volume.value) : '—'}</td>}
            <td>{item.data_as_of ?? '暂无'}</td>
            <td><a className="text-button" href={candidateHref(item.symbol)} aria-label={`查看 ${item.name}（${item.symbol}）数据`}>查看数据</a></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}

function ResultState({ response, loading, error, onReset }: { response: StockScreenerResponse | null; loading: boolean; error?: string; onReset: () => void }) {
  if (loading && !response) return <section className="screener-state" role="status">正在查询条件选股结果…</section>
  if (error && !response) return null
  if (!response) return <section className="screener-state" role="status"><h3>准备开始筛选</h3><p>填写至少一项收盘价、涨跌幅或平均成交量范围。</p></section>
  if (response.pagination.total === 0) return <section className="screener-state" role="status"><h3>没有符合条件的候选股票</h3><p>可以调整范围后重新筛选，或重置当前条件。</p><button className="text-button" onClick={onReset} type="button">重置条件</button></section>
  return null
}

export function StockScreenerPage() {
  const initial = useMemo(readInitialState, [])
  const [draft, setDraft] = useState<Draft>(initial.draft)
  const [submittedQuery, setSubmittedQuery] = useState<StockScreenerQuery | null>(initial.query ?? null)
  const [response, setResponse] = useState<StockScreenerResponse | null>(null)
  const [loading, setLoading] = useState(Boolean(initial.query))
  const [error, setError] = useState<string>()
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [retryToken, setRetryToken] = useState(0)
  const [categories, setCategories] = useState<StockScreenerCategory[]>([])
  const [categoryKeyword, setCategoryKeyword] = useState('')
  const [categoryLoading, setCategoryLoading] = useState(true)
  const [categoryError, setCategoryError] = useState<string>()
  const requestId = useRef(0)

  useEffect(() => {
    let active = true
    setCategoryLoading(true)
    setCategoryError(undefined)
    void stockScreenerApi.listCategories({ keyword: categoryKeyword || undefined })
      .then((result) => { if (active) setCategories(result.items) })
      .catch((reason: unknown) => { if (active) setCategoryError(categoryErrorMessage(reason)) })
      .finally(() => { if (active) setCategoryLoading(false) })
    return () => { active = false }
  }, [categoryKeyword])

  useEffect(() => {
    if (!submittedQuery) return
    let active = true
    const currentRequest = ++requestId.current
    setLoading(true)
    setError(undefined)
    void stockScreenerApi.listStocks(submittedQuery)
      .then((result) => { if (active && currentRequest === requestId.current) setResponse(result) })
      .catch((reason: unknown) => { if (active && currentRequest === requestId.current) setError(errorMessage(reason)) })
      .finally(() => { if (active && currentRequest === requestId.current) setLoading(false) })
    return () => { active = false }
  }, [retryToken, submittedQuery])

  const updateDraft = (field: keyof Draft, value: string | StockScreenerPeriod) => {
    setDraft((current) => ({ ...current, [field]: value }))
    if (Object.keys(fieldErrors).length > 0) setFieldErrors({})
  }

  const submit = () => {
    const result = queryFromDraft(draft)
    setFieldErrors(result.errors)
    if (!result.query) return
    writeUrl(result.query)
    setSubmittedQuery(result.query)
  }

  const reset = () => {
    window.history.replaceState({}, '', '/screener')
    setDraft(DEFAULT_DRAFT)
    setSubmittedQuery(null)
    setResponse(null)
    setError(undefined)
    setFieldErrors({})
    setRetryToken(0)
    setCategoryKeyword('')
  }

  const changePage = (page: number) => {
    if (!submittedQuery) return
    const next = { ...submittedQuery, page }
    writeUrl(next)
    setSubmittedQuery(next)
  }

  return (
    <main className="app-shell screener-page">
      <PageHeader description="使用已同步申万行业和 A 股日线筛出候选股票；结果用于研究核对，不构成投资建议。" eyebrow="A-SHARE SCREENING" title="条件选股" />
      <ConditionForm categoryError={categoryError} categoryKeyword={categoryKeyword} categoryLoading={categoryLoading} categories={categories} draft={draft} errors={fieldErrors} loading={loading} onCategoryKeywordChange={setCategoryKeyword} onChange={updateDraft} onReset={reset} onSubmit={submit} />
      {error && <div className="error-banner" role="alert"><span>{error}</span><button className="text-button" disabled={loading} onClick={() => setRetryToken((value) => value + 1)} type="button">重新查询</button></div>}
      {submittedQuery && response && <Summary query={submittedQuery} response={response} />}
      {submittedQuery && response && loading && <p className="screener-querying" role="status">正在更新筛选结果…</p>}
      {!submittedQuery && <ResultState error={error} loading={loading} onReset={reset} response={response} />}
      {submittedQuery && !response && <ResultState error={error} loading={loading} onReset={reset} response={response} />}
      {submittedQuery && response && response.pagination.total > 0 && <section className="panel screener-results-panel" aria-labelledby="screener-candidates-title">
        <div className="section-heading"><div><p className="eyebrow">CANDIDATES</p><h2 id="screener-candidates-title">候选股票</h2></div><span className="muted-text">{loading ? '正在更新…' : `${response.items.length} 条`}</span></div>
        <CandidateTable items={response.items} loading={loading} query={submittedQuery} />
        <PaginationBar ariaLabel="候选股票分页" loading={loading} onPageChange={changePage} onPageSizeChange={() => undefined} page={response.pagination.page} pageSize={response.pagination.page_size} pageSizeOptions={PAGE_SIZE_OPTIONS} total={response.pagination.total} />
      </section>}
      {submittedQuery && response && response.pagination.total === 0 && !loading && <ResultState error={error} loading={loading} onReset={reset} response={response} />}
    </main>
  )
}
