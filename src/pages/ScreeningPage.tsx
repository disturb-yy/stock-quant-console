import { useEffect, useMemo, useState } from 'react'
import { Button, Card } from 'tdesign-react'
import { Link, useSearchParams } from 'react-router-dom'
import { describeApiError, formatBackendApiError, isApiAbortError, isApiError, isApiErrorResponse } from '../api/client'
import {
  createScreener,
  getScreener,
  isCompleteScreenerSpec,
  listScreeners,
  runScreener,
  screenerCategoryLabels,
  screenerFieldDefinitions,
  screenerMaxFilters,
  screenerMaxTopN,
  screenerOperatorLabels,
  screenerOperators,
  updateScreener,
  type Screener,
  type ScreenerCreateRequest,
  type ScreenerListResponse,
  type ScreenerFieldDefinition,
  type ScreenerFieldId,
  type ScreenerFilter,
  type ScreenerOperator,
  type ScreenerRunResponse,
  type ScreenerSpec,
  type ScreenerUpdateRequest,
} from '../api/screener'
import { ErrorState, EmptyState, LoadingState } from '../components/PageState'
import {
  defaultScreeningSpec,
  readScreenerId,
  readScreeningSpec,
  screenerQueryKey,
  screeningQueryKey,
  serializeScreeningSpec,
  isScreeningSpecComplete,
} from './screeningUrl'

type RunState =
  | { readonly status: 'idle'; readonly message: string }
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly data: ScreenerRunResponse }
  | { readonly status: 'error'; readonly error: unknown }

type PlanListState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly data: ScreenerListResponse }
  | { readonly status: 'error'; readonly error: unknown }

type PlanRequestState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly message: string }
  | { readonly status: 'error'; readonly error: unknown }

type PlanLoadState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading'; readonly id: number }
  | { readonly status: 'success'; readonly id: number }
  | { readonly status: 'error'; readonly id: number | null; readonly error: unknown }

type PlanFormMode = 'create' | 'update' | null

function specsEqual(left: ScreenerSpec, right: ScreenerSpec) {
  return serializeScreeningSpec(left) === serializeScreeningSpec(right)
}

function formatPlanTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function planErrorPresentation(error: unknown) {
  if (isApiError(error)) {
    const code = isApiErrorResponse(error.payload) ? error.payload.code : undefined
    if (error.status === 409 || code === 'CONFLICT') {
      return { title: '方案已更新', hint: '当前版本已过期，未覆盖服务端内容；请重新加载后再比较和编辑。' }
    }
    if (error.status === 400 || code === 'VALIDATION_ERROR' || code === 'INVALID_PAGINATION') {
      return { title: '保存方案参数无效', hint: formatBackendApiError(error.payload, error.status).message }
    }
    if (error.status === 404 || code === 'NOT_FOUND') {
      return { title: '方案不存在', hint: '服务端没有找到该方案；当前 Builder 仍保留为临时编辑态。' }
    }
    if (error.status === 503 || error.kind === 'network') {
      return { title: '保存方案暂不可用', hint: '真实保存服务暂时不可用，请稍后重试。' }
    }
    if (error.kind === 'invalid-payload') {
      return { title: '保存方案响应无效', hint: '服务端返回结构不符合运行中 OpenAPI，请重试或检查后端版本。' }
    }
  }
  return { title: '保存方案请求失败', hint: describeApiError(error, formatBackendApiError).message }
}

const fieldCategories: ReadonlyArray<ScreenerFieldDefinition['category']> = ['Market', 'Valuation', 'Fundamental', 'Technical']

function fieldDefinition(fieldId: ScreenerFieldId) {
  return screenerFieldDefinitions.find((field) => field.id === fieldId) ?? screenerFieldDefinitions[0]
}

function fieldOptions() {
  return fieldCategories.map((category) => (
    <optgroup key={category} label={screenerCategoryLabels[category]}>
      {screenerFieldDefinitions
        .filter((field) => field.category === category)
        .map((field) => <option key={field.id} value={field.id}>{field.label}</option>)}
    </optgroup>
  ))
}

function newFilter(): ScreenerFilter {
  return { field_id: 'technical.close', operator: 'gte', value: '10' }
}

function updateFilterValue(filter: ScreenerFilter, value: string, index = 0): ScreenerFilter['value'] {
  if (filter.operator !== 'between') return value
  const values = Array.isArray(filter.value) ? [...filter.value] : ['', '']
  values[index] = value
  return values
}

function updateFilterOperator(filter: ScreenerFilter, operator: ScreenerOperator): ScreenerFilter {
  if (operator === 'between' && filter.operator !== 'between') {
    return { ...filter, operator, value: [String(filter.value), ''] }
  }
  if (operator !== 'between' && filter.operator === 'between') {
    return { ...filter, operator, value: filter.value[0] ?? '' }
  }
  return { ...filter, operator }
}

function formatSourceMode(mode: ScreenerRunResponse['source']['mode']) {
  if (mode === 'real') return '真实 Provider'
  if (mode === 'fallback') return '本地回退数据'
  return 'Seed 数据'
}

function formatResultValue(value: string | null, unit: string) {
  if (value === null) return '不可用'
  return unit ? `${value} ${unit}` : value
}

function ResultMetric({
  value,
  unit,
  basis,
  asOf,
  unavailableReason,
}: {
  readonly value: string | null
  readonly unit: string
  readonly basis: string | null
  readonly asOf: string | null
  readonly unavailableReason: string | null
}) {
  return (
    <span className={`screening-metric${value === null ? ' screening-metric--unavailable' : ''}`}>
      <strong>{formatResultValue(value, unit)}</strong>
      {unavailableReason ? <small>{unavailableReason}</small> : null}
      {value !== null && (basis || asOf) ? <small>{[basis, asOf].filter(Boolean).join(' · ')}</small> : null}
    </span>
  )
}

function FilterRow({
  filter,
  index,
  onChange,
  onRemove,
}: {
  readonly filter: ScreenerFilter
  readonly index: number
  readonly onChange: (filter: ScreenerFilter) => void
  readonly onRemove: () => void
}) {
  const definition = fieldDefinition(filter.field_id)
  const values = filter.operator === 'between'
    ? Array.isArray(filter.value) ? filter.value : ['', '']
    : [String(filter.value)]

  return (
    <div className="screening-filter-row">
      <div className="screening-filter-row__header">
        <span className="screening-filter-row__number">条件 {index + 1}</span>
        <code>{filter.field_id}</code>
        <button type="button" className="screening-text-button" onClick={onRemove} aria-label={`删除条件 ${index + 1}`}>
          移除
        </button>
      </div>
      <div className="screening-control-grid screening-control-grid--filter">
        <label className="screening-control">
          <span>字段</span>
          <select value={filter.field_id} onChange={(event) => onChange({ ...filter, field_id: event.target.value as ScreenerFieldId })}>
            {fieldOptions()}
          </select>
          <small>{definition.label} · {definition.unit}</small>
        </label>
        <label className="screening-control">
          <span>操作符</span>
          <select value={filter.operator} onChange={(event) => onChange(updateFilterOperator(filter, event.target.value as ScreenerOperator))}>
            {screenerOperators.map((operator) => <option key={operator} value={operator}>{screenerOperatorLabels[operator]}</option>)}
          </select>
        </label>
        <div className="screening-control screening-control--value">
          <span>值</span>
          <div className="screening-value-inputs">
            {values.map((value, valueIndex) => (
              <input
                key={valueIndex}
                aria-label={filter.operator === 'between' ? `条件 ${index + 1} ${valueIndex === 0 ? '下限' : '上限'}` : `条件 ${index + 1} 数值`}
                inputMode="decimal"
                value={value}
                onChange={(event) => onChange({ ...filter, value: updateFilterValue(filter, event.target.value, valueIndex) })}
              />
            ))}
          </div>
          <small>请求保持后端 decimal 字符串精度</small>
        </div>
      </div>
    </div>
  )
}

function BuilderPanel({
  spec,
  runState,
  onChange,
  onRun,
}: {
  readonly spec: ScreenerSpec
  readonly runState: RunState
  readonly onChange: (spec: ScreenerSpec) => void
  readonly onRun: () => void
}) {
  const complete = isCompleteScreenerSpec(spec)
  return (
    <Card className="screening-panel screening-builder" bordered>
      <div className="screening-panel__heading">
        <div>
          <p className="screening-section-kicker">BUILDER / SPEC</p>
          <h2>构建选股条件</h2>
        </div>
        <span className="screening-contract-note">仅提交规范化 AND 条件</span>
      </div>

      <div className="screening-builder-section">
        <h3>Universe</h3>
        <label className="screening-control">
          <span>股票范围</span>
          <select value={spec.universe_id} onChange={(event) => onChange({ ...spec, universe_id: event.target.value as ScreenerSpec['universe_id'] })}>
            <option value="cn_a_share_active">A 股在市股票</option>
          </select>
          <small>cn_a_share_active · 后端唯一已发布 Universe</small>
        </label>
      </div>

      <div className="screening-builder-section">
        <div className="screening-subheading">
          <div>
            <h3>条件</h3>
            <p>所有条件同时满足（AND）</p>
          </div>
          <span className="screening-section-meta">{spec.filters.length}/{screenerMaxFilters}</span>
        </div>
        <div className="screening-filter-list">
          {spec.filters.length === 0 ? <p className="screening-muted">尚未添加条件；可直接运行全 Universe 结果。</p> : null}
          {spec.filters.map((filter, index) => (
            <FilterRow
              key={`${index}-${filter.field_id}`}
              filter={filter}
              index={index}
              onChange={(nextFilter) => onChange({ ...spec, filters: spec.filters.map((item, itemIndex) => itemIndex === index ? nextFilter : item) })}
              onRemove={() => onChange({ ...spec, filters: spec.filters.filter((_item, itemIndex) => itemIndex !== index) })}
            />
          ))}
        </div>
        <button
          type="button"
          className="screening-secondary-button"
          disabled={spec.filters.length >= screenerMaxFilters}
          onClick={() => onChange({ ...spec, filters: [...spec.filters, newFilter()] })}
        >
          + 添加条件
        </button>
      </div>

      <div className="screening-builder-section">
        <h3>Ranking</h3>
        <div className="screening-control-grid">
          <label className="screening-control">
            <span>排序字段</span>
            <select value={spec.ranking.field_id} onChange={(event) => onChange({ ...spec, ranking: { ...spec.ranking, field_id: event.target.value as ScreenerFieldId } })}>
              {fieldOptions()}
            </select>
          </label>
          <label className="screening-control">
            <span>方向</span>
            <select value={spec.ranking.direction} onChange={(event) => onChange({ ...spec, ranking: { ...spec.ranking, direction: event.target.value as ScreenerSpec['ranking']['direction'] } })}>
              <option value="desc">降序</option>
              <option value="asc">升序</option>
            </select>
          </label>
        </div>
      </div>

      <div className="screening-builder-section">
        <h3>Top N</h3>
        <label className="screening-control screening-control--top-n">
          <span>最多返回</span>
          <input
            type="number"
            min={1}
            max={screenerMaxTopN}
            step={1}
            value={spec.top_n || ''}
            onChange={(event) => onChange({ ...spec, top_n: event.target.value === '' ? 0 : Number(event.target.value) })}
          />
          <small>服务端范围：1–{screenerMaxTopN}</small>
        </label>
      </div>

      <div className="screening-builder-actions">
        <Button theme="primary" disabled={!complete} onClick={onRun}>
          {runState.status === 'loading' ? '请求中…' : '运行选股'}
        </Button>
        {!complete ? <span className="screening-validation-hint">请完成字段值并确认 Top N 后运行。</span> : null}
      </div>
    </Card>
  )
}

function CurrentPlanSummary({
  screener,
  dirty,
  onUpdate,
}: {
  readonly screener: Screener
  readonly dirty: boolean
  readonly onUpdate: () => void
}) {
  return (
    <div className="screening-current-plan" aria-label="当前保存方案">
      <div>
        <span className="screening-section-kicker">CURRENT PLAN</span>
        <strong>{screener.name}</strong>
        <span className="screening-current-plan__meta">ID {screener.id} · version {screener.version}</span>
      </div>
      <div className="screening-current-plan__actions">
        <span className={dirty ? 'screening-plan-status screening-plan-status--dirty' : 'screening-plan-status'}>
          {dirty ? '有未保存更改' : '已保存'}
        </span>
        <button type="button" className="screening-secondary-button" onClick={onUpdate}>
          更新当前方案
        </button>
      </div>
    </div>
  )
}

function SavedPlanForm({
  mode,
  name,
  description,
  requestState,
  onNameChange,
  onDescriptionChange,
  onSubmit,
  onCancel,
  onReload,
}: {
  readonly mode: Exclude<PlanFormMode, null>
  readonly name: string
  readonly description: string
  readonly requestState: PlanRequestState
  readonly onNameChange: (value: string) => void
  readonly onDescriptionChange: (value: string) => void
  readonly onSubmit: () => void
  readonly onCancel: () => void
  readonly onReload: () => void
}) {
  const errorPresentation = requestState.status === 'error' ? planErrorPresentation(requestState.error) : null
  const requestError = requestState.status === 'error' ? requestState.error : null
  return (
    <form className="screening-plan-form" onSubmit={(event) => { event.preventDefault(); onSubmit() }}>
      <div className="screening-subheading">
        <div>
          <h3>{mode === 'create' ? '保存当前方案' : '更新当前方案'}</h3>
          <p>{mode === 'create' ? '保存当前合法 Builder spec；结果和快照不会被保存。' : '仅在确认更新后提交当前 spec 和服务端 version。'}</p>
        </div>
      </div>
      <div className="screening-plan-form__fields">
        <label htmlFor="screening-plan-name" className="screening-control">
          <span>方案名称</span>
          <input id="screening-plan-name" aria-label="方案名称" autoFocus maxLength={100} required value={name} onChange={(event) => onNameChange(event.target.value)} />
          <small>1–100 个字符</small>
        </label>
        <label htmlFor="screening-plan-description" className="screening-control">
          <span>描述（可选）</span>
          <textarea id="screening-plan-description" aria-label="描述（可选）" maxLength={500} value={description} onChange={(event) => onDescriptionChange(event.target.value)} />
          <small>最多 500 个字符；不保存执行结果</small>
        </label>
      </div>
      {errorPresentation ? (
        <div className="screening-plan-error" role="alert">
          <strong>{errorPresentation.title}</strong>
          <span>{errorPresentation.hint}</span>
          {requestError && isApiError(requestError) && (requestError.status === 409 || requestError.status === 404) ? <button type="button" className="screening-text-button" onClick={onReload}>重新加载当前方案</button> : null}
        </div>
      ) : null}
      <div className="screening-plan-form__actions">
        <Button type="submit" theme="primary" loading={requestState.status === 'loading'} disabled={requestState.status === 'loading'}>
          {mode === 'create' ? '确认保存' : '确认更新'}
        </Button>
        <button type="button" className="screening-secondary-button" onClick={onCancel} disabled={requestState.status === 'loading'}>取消</button>
      </div>
    </form>
  )
}

function SavedPlanList({
  state,
  loadingId,
  selectedId,
  onRetry,
  onLoad,
}: {
  readonly state: PlanListState
  readonly loadingId: number | null
  readonly selectedId: number | null
  readonly onRetry: () => void
  readonly onLoad: (id: number) => void
}) {
  if (state.status === 'loading') return <div className="screening-plan-list-message" role="status">正在读取最近方案…</div>
  if (state.status === 'error') {
    const error = planErrorPresentation(state.error)
    return <div className="screening-plan-error" role="alert"><strong>{error.title}</strong><span>{error.hint}</span><button type="button" className="screening-text-button" onClick={onRetry}>重试列表</button></div>
  }
  if (state.data.data.length === 0) return <div className="screening-plan-list-message">暂无已保存方案；当前 Builder 仍是临时配置。</div>
  return (
    <ul className="screening-plan-list" aria-label="最近方案列表">
      {state.data.data.map((screener) => (
        <li key={screener.id} className={selectedId === screener.id ? 'screening-plan-list__item screening-plan-list__item--selected' : 'screening-plan-list__item'}>
          <div className="screening-plan-list__identity">
            <strong>{screener.name}</strong>
            <span>ID {screener.id} · v{screener.version} · 更新于 {formatPlanTime(screener.updated_at)}</span>
            {screener.description ? <small>{screener.description}</small> : null}
          </div>
          <button type="button" className="screening-secondary-button" onClick={() => onLoad(screener.id)} disabled={loadingId !== null}>
            {loadingId === screener.id ? '加载中…' : '加载'}
          </button>
        </li>
      ))}
    </ul>
  )
}

function SavedPlansPanel({
  currentScreener,
  dirty,
  listState,
  loadState,
  formMode,
  formName,
  formDescription,
  requestState,
  selectedId,
  onRefresh,
  onLoad,
  onOpenCreate,
  onOpenUpdate,
  onNameChange,
  onDescriptionChange,
  onSubmit,
  onCancel,
  onReload,
  onClearSelection,
}: {
  readonly currentScreener: Screener | null
  readonly dirty: boolean
  readonly listState: PlanListState
  readonly loadState: PlanLoadState
  readonly formMode: PlanFormMode
  readonly formName: string
  readonly formDescription: string
  readonly requestState: PlanRequestState
  readonly selectedId: number | null
  readonly onRefresh: () => void
  readonly onLoad: (id: number) => void
  readonly onOpenCreate: () => void
  readonly onOpenUpdate: () => void
  readonly onNameChange: (value: string) => void
  readonly onDescriptionChange: (value: string) => void
  readonly onSubmit: () => void
  readonly onCancel: () => void
  readonly onReload: () => void
  readonly onClearSelection: () => void
}) {
  const loadError = loadState.status === 'error' ? planErrorPresentation(loadState.error) : null
  return (
    <Card className="screening-panel screening-saved-plans" bordered>
      <div className="screening-panel__heading">
        <div>
          <p className="screening-section-kicker">SAVED SCREENER / CRUD</p>
          <h2>保存与复用</h2>
          <p className="screening-panel__description">保存条件、从最近方案加载，并在确认后更新当前版本。</p>
        </div>
        <div className="screening-plan-toolbar">
          <button type="button" className="screening-secondary-button" onClick={onRefresh}>刷新最近方案</button>
          <Button theme="primary" onClick={onOpenCreate} disabled={formMode === 'create'}>保存方案</Button>
        </div>
      </div>
      {currentScreener ? <CurrentPlanSummary screener={currentScreener} dirty={dirty} onUpdate={onOpenUpdate} /> : null}
      {loadError ? <div className="screening-plan-error" role="alert"><strong>{loadError.title}</strong><span>{loadError.hint}</span>{loadState.status === 'error' && loadState.id !== null ? <button type="button" className="screening-text-button" onClick={onReload}>重新加载当前方案</button> : null}<button type="button" className="screening-text-button" onClick={onClearSelection}>继续编辑临时方案</button></div> : null}
      {requestState.status === 'success' ? <div className="screening-plan-success" role="status">{requestState.message}</div> : null}
      {formMode ? <SavedPlanForm mode={formMode} name={formName} description={formDescription} requestState={requestState} onNameChange={onNameChange} onDescriptionChange={onDescriptionChange} onSubmit={onSubmit} onCancel={onCancel} onReload={onReload} /> : null}
      <div className="screening-plan-list-heading"><h3>最近方案</h3><span>按更新时间排序</span></div>
      <SavedPlanList state={listState} loadingId={loadState.status === 'loading' ? loadState.id : null} selectedId={selectedId} onRetry={onRefresh} onLoad={onLoad} />
    </Card>
  )
}

function ResultMeta({ data }: { readonly data: ScreenerRunResponse }) {
  return (
    <div className="screening-result-meta" aria-label="执行快照和来源">
      <span><strong>{data.matched_count.toLocaleString('zh-CN')}</strong> 匹配</span>
      <span><strong>{data.returned_count.toLocaleString('zh-CN')}</strong> 返回</span>
      <span>Universe {data.universe.name} · 共 {data.universe.eligible_count.toLocaleString('zh-CN')}</span>
      <span>快照 {data.snapshot.as_of}</span>
      <span>{formatSourceMode(data.source.mode)} · {data.source.provider} · {data.source.seed_version}</span>
    </div>
  )
}

function resultFieldColumns(data: ScreenerRunResponse) {
  const fields = new Map<string, { field_id: ScreenerFieldId; label: string; unit: string }>()
  data.results.forEach((result) => result.fields.forEach((field) => {
    if (!fields.has(field.field_id)) fields.set(field.field_id, field)
  }))
  return [...fields.values()]
}

function ResultTable({ data }: { readonly data: ScreenerRunResponse }) {
  const columns = resultFieldColumns(data)
  return (
    <div className="screening-table-wrap">
      <table className="screening-table">
        <caption className="sr-only">量化选股结果，包含排名、股票身份、排序值与展示字段</caption>
        <thead>
          <tr>
            <th scope="col">名次</th>
            <th scope="col">股票</th>
            <th scope="col">行业</th>
            <th scope="col">排序值</th>
            {columns.map((field) => <th scope="col" key={field.field_id}>{field.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {data.results.map((result) => (
            <tr key={result.symbol}>
              <th scope="row" className="screening-rank">{result.rank}</th>
              <td>
                <Link className="screening-stock-link" to={`/stocks/${encodeURIComponent(result.symbol)}`}>
                  <strong>{result.name}</strong>
                  <code>{result.symbol}</code>
                </Link>
              </td>
              <td>{result.industries.length ? result.industries.join('、') : '未提供'}</td>
              <td>
                <ResultMetric
                  value={result.ranking.value}
                  unit={result.ranking.unit}
                  basis={result.ranking.basis}
                  asOf={result.ranking.as_of}
                  unavailableReason={result.ranking.unavailable_reason}
                />
              </td>
              {columns.map((column) => {
                const field = result.fields.find((item) => item.field_id === column.field_id)
                return (
                  <td key={column.field_id}>
                    {field ? <ResultMetric value={field.value} unit={field.unit} basis={field.basis} asOf={field.as_of} unavailableReason={field.unavailable_reason} /> : <span className="screening-metric screening-metric--unavailable">未返回</span>}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function screeningErrorPresentation(error: unknown) {
  if (isApiError(error)) {
    const code = isApiErrorResponse(error.payload) ? error.payload.code : undefined
    if (error.status === 400 || code === 'VALIDATION_ERROR') {
      return { title: '选股条件无效', hint: '请检查条件字段、操作符、数值和 Top N 范围后重新运行。' }
    }
    if (error.status === 404 || code === 'NOT_FOUND') {
      return { title: '选股资源不存在', hint: '当前选股接口未找到请求资源，请确认后端版本和代理配置后重试。' }
    }
    if (error.status === 503) {
      return { title: '选股服务暂不可用', hint: '数据服务暂时不可用，页面不会使用替代结果；请稍后重试。' }
    }
  }
  return { title: '选股请求失败', hint: '当前请求未产生可用结果，请检查后端服务和 Vite 代理后重试。' }
}

function ResultPanel({ state, onRetry }: { readonly state: RunState; readonly onRetry: () => void }) {
  return (
    <Card className="screening-panel screening-results" bordered>
      <div className="screening-panel__heading">
        <div>
          <p className="screening-section-kicker">RESULTS / LIVE SNAPSHOT</p>
          <h2>实时结果</h2>
        </div>
        <span className="screening-result-status" role="status" aria-live="polite">
          {state.status === 'loading' ? '正在执行' : state.status === 'success' ? '已返回' : state.status === 'error' ? '请求失败' : '等待配置'}
        </span>
      </div>

      {state.status === 'idle' ? <div className="screening-inline-message" role="status">{state.message}</div> : null}
      {state.status === 'loading' ? <LoadingState label="正在执行真实选股请求" /> : null}
      {state.status === 'error' ? (
        (() => {
          const presentation = screeningErrorPresentation(state.error)
          return <ErrorState error={state.error} title={presentation.title} hint={presentation.hint} actionLabel="重新运行" onRetry={onRetry} />
        })()
      ) : null}
      {state.status === 'success' ? (
        <>
          <ResultMeta data={state.data} />
          {state.data.results.length === 0 ? (
            <EmptyState description="当前条件下暂无匹配股票，条件已保留，可继续调整。" />
          ) : <ResultTable data={state.data} />}
        </>
      ) : null}
    </Card>
  )
}

export function ScreeningPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [draftSpec, setDraftSpec] = useState<ScreenerSpec>(defaultScreeningSpec)
  const [urlIssue, setUrlIssue] = useState<string | null>(null)
  const [runNonce, setRunNonce] = useState(0)
  const [runState, setRunState] = useState<RunState>({ status: 'loading' })
  const [listNonce, setListNonce] = useState(0)
  const [loadNonce, setLoadNonce] = useState(0)
  const [listState, setListState] = useState<PlanListState>({ status: 'loading' })
  const [loadState, setLoadState] = useState<PlanLoadState>({ status: 'idle' })
  const [currentScreener, setCurrentScreener] = useState<Screener | null>(null)
  const [baselineSpec, setBaselineSpec] = useState<ScreenerSpec | null>(null)
  const [formMode, setFormMode] = useState<PlanFormMode>(null)
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [requestState, setRequestState] = useState<PlanRequestState>({ status: 'idle' })
  const searchString = searchParams.toString()
  const parsedUrl = useMemo(() => readScreeningSpec(searchParams), [searchString, searchParams])
  const parsedScreenerId = useMemo(() => readScreenerId(searchParams), [searchString, searchParams])
  const selectedId = parsedScreenerId.id
  const dirty = currentScreener !== null && !specsEqual(draftSpec, baselineSpec ?? currentScreener.spec)

  const replaceUrlState = (spec: ScreenerSpec, id: number | null) => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set(screeningQueryKey, serializeScreeningSpec(spec))
    if (id === null) nextParams.delete(screenerQueryKey)
    else nextParams.set(screenerQueryKey, String(id))
    setSearchParams(nextParams, { replace: true })
  }

  useEffect(() => {
    setDraftSpec(parsedUrl.spec)
    const issues = [parsedUrl.invalidReason, parsedScreenerId.invalidReason].filter(Boolean)
    setUrlIssue(issues.length > 0 ? issues.join(' ') : null)
  }, [parsedScreenerId, parsedUrl])

  useEffect(() => {
    const controller = new AbortController()
    setListState({ status: 'loading' })
    listScreeners(1, 20, controller.signal)
      .then((data) => setListState({ status: 'success', data }))
      .catch((error: unknown) => {
        if (!isApiAbortError(error)) setListState({ status: 'error', error })
      })
    return () => controller.abort()
  }, [listNonce])

  useEffect(() => {
    const controller = new AbortController()
    if (selectedId === null) {
      setCurrentScreener(null)
      setBaselineSpec(null)
      setLoadState({ status: 'idle' })
      return () => controller.abort()
    }

    setCurrentScreener(null)
    setBaselineSpec(null)
    setLoadState({ status: 'loading', id: selectedId })
    getScreener(selectedId, controller.signal)
      .then((data) => {
        setCurrentScreener(data)
        setBaselineSpec(data.spec)
        setDraftSpec(data.spec)
        setLoadState({ status: 'success', id: data.id })
        replaceUrlState(data.spec, data.id)
        setRunNonce((value) => value + 1)
      })
      .catch((error: unknown) => {
        if (!isApiAbortError(error)) setLoadState({ status: 'error', id: selectedId, error })
      })
    return () => controller.abort()
  }, [loadNonce, parsedScreenerId.invalidReason, selectedId])

  const serializedSpec = isScreeningSpecComplete(draftSpec) ? serializeScreeningSpec(draftSpec) : null
  useEffect(() => {
    if (parsedUrl.invalidReason !== null) return
    if (serializedSpec === null || searchParams.get(screeningQueryKey) === serializedSpec) return
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set(screeningQueryKey, serializedSpec)
    setSearchParams(nextParams, { replace: true })
  }, [searchParams, serializedSpec, setSearchParams])

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    if (urlIssue !== null) {
      setRunState({ status: 'idle', message: 'URL 状态未通过校验，请修正配置后再运行。' })
      return () => controller.abort()
    }
    if (selectedId !== null && loadState.status !== 'success') {
      setRunState({
        status: 'idle',
        message: loadState.status === 'error' ? '方案未成功加载；请重试或继续编辑临时方案。' : '正在读取保存方案，读取完成后将重新运行。',
      })
      return () => controller.abort()
    }
    if (!isScreeningSpecComplete(draftSpec)) {
      setRunState({ status: 'idle', message: '配置尚不完整，请完成字段值和 Top N。' })
      return () => controller.abort()
    }

    setRunState({ status: 'loading' })
    const timeout = window.setTimeout(() => {
      runScreener(draftSpec, controller.signal)
        .then((data) => {
          if (active) setRunState({ status: 'success', data })
        })
        .catch((error: unknown) => {
          if (active && !isApiAbortError(error)) setRunState({ status: 'error', error })
        })
    }, 280)

    return () => {
      active = false
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [draftSpec, loadState.status, runNonce, selectedId, urlIssue])

  const updateSpec = (nextSpec: ScreenerSpec) => {
    setUrlIssue(null)
    setDraftSpec(nextSpec)
    if (isScreeningSpecComplete(nextSpec)) {
      const nextParams = new URLSearchParams(searchParams)
      nextParams.set(screeningQueryKey, serializeScreeningSpec(nextSpec))
      setSearchParams(nextParams, { replace: true })
    }
  }
  const rerun = () => setRunNonce((value) => value + 1)

  const refreshList = () => setListNonce((value) => value + 1)
  const loadPlan = (id: number) => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete(screeningQueryKey)
    nextParams.set(screenerQueryKey, String(id))
    setSearchParams(nextParams)
    setLoadNonce((value) => value + 1)
  }
  const reloadCurrentPlan = () => {
    const id = selectedId ?? currentScreener?.id
    if (id !== undefined && id !== null) loadPlan(id)
  }
  const clearPlanSelection = () => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete(screenerQueryKey)
    setSearchParams(nextParams)
  }
  const openCreateForm = () => {
    setFormMode('create')
    setFormName('')
    setFormDescription('')
    setRequestState({ status: 'idle' })
  }
  const openUpdateForm = () => {
    if (!currentScreener) return
    setFormMode('update')
    setFormName(currentScreener.name)
    setFormDescription(currentScreener.description ?? '')
    setRequestState({ status: 'idle' })
  }
  const submitPlan = () => {
    if (!isScreeningSpecComplete(draftSpec) || formMode === null) return
    const description = formDescription.trim() === '' ? null : formDescription.trim()
    setRequestState({ status: 'loading' })
    const requestPromise = formMode === 'create'
      ? createScreener({ name: formName, description, spec: draftSpec } satisfies ScreenerCreateRequest)
      : currentScreener === null
        ? Promise.reject(new Error('当前没有可更新的保存方案。'))
        : updateScreener(currentScreener.id, { name: formName, description, spec: draftSpec, version: currentScreener.version } satisfies ScreenerUpdateRequest)
    requestPromise
      .then((data) => {
        setCurrentScreener(data)
        setBaselineSpec(data.spec)
        setFormMode(null)
        setRequestState({ status: 'success', message: formMode === 'create' ? '方案已保存' : '方案已更新' })
        replaceUrlState(data.spec, data.id)
        refreshList()
        if (formMode === 'update') setRunNonce((value) => value + 1)
      })
      .catch((error: unknown) => setRequestState({ status: 'error', error }))
  }

  return (
    <main className="page-container screening-page">
      <section className="page-heading">
        <div>
          <p className="page-kicker">WORKSPACE / SCREENING</p>
          <h1>量化选股</h1>
          <p className="page-description">用已交付的真实字段组合条件，读取同一执行快照下的候选股票。</p>
        </div>
        <div className="page-heading__signal"><span aria-hidden="true">●</span> REAL API / POST /api/v1/screeners/run</div>
      </section>

      {urlIssue ? <div className="screening-url-warning" role="alert">{urlIssue} 未信任的 URL 状态不会发送到后端。</div> : null}
      <SavedPlansPanel
        currentScreener={currentScreener}
        dirty={dirty}
        listState={listState}
        loadState={loadState}
        formMode={formMode}
        formName={formName}
        formDescription={formDescription}
        requestState={requestState}
        selectedId={selectedId}
        onRefresh={refreshList}
        onLoad={loadPlan}
        onOpenCreate={openCreateForm}
        onOpenUpdate={openUpdateForm}
        onNameChange={setFormName}
        onDescriptionChange={setFormDescription}
        onSubmit={submitPlan}
        onCancel={() => setFormMode(null)}
        onReload={reloadCurrentPlan}
        onClearSelection={clearPlanSelection}
      />
      <div className="screening-layout">
        <BuilderPanel spec={draftSpec} runState={runState} onChange={updateSpec} onRun={rerun} />
        <ResultPanel state={runState} onRetry={rerun} />
      </div>
    </main>
  )
}
