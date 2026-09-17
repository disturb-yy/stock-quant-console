import { useEffect, useMemo, useState } from 'react'
import { Button, Card } from 'tdesign-react'
import { Link, useSearchParams } from 'react-router-dom'
import { isApiAbortError, isApiError, isApiErrorResponse } from '../api/client'
import {
  isCompleteScreenerSpec,
  runScreener,
  screenerCategoryLabels,
  screenerFieldDefinitions,
  screenerMaxFilters,
  screenerMaxTopN,
  screenerOperatorLabels,
  screenerOperators,
  type ScreenerFieldDefinition,
  type ScreenerFieldId,
  type ScreenerFilter,
  type ScreenerOperator,
  type ScreenerRunResponse,
  type ScreenerSpec,
} from '../api/screener'
import { ErrorState, EmptyState, LoadingState } from '../components/PageState'
import {
  defaultScreeningSpec,
  readScreeningSpec,
  screeningQueryKey,
  serializeScreeningSpec,
  isScreeningSpecComplete,
} from './screeningUrl'

type RunState =
  | { readonly status: 'idle'; readonly message: string }
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly data: ScreenerRunResponse }
  | { readonly status: 'error'; readonly error: unknown }

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
  const searchString = searchParams.toString()
  const parsedUrl = useMemo(() => readScreeningSpec(searchParams), [searchString, searchParams])

  useEffect(() => {
    setDraftSpec(parsedUrl.spec)
    if (parsedUrl.invalidReason !== null) setUrlIssue(parsedUrl.invalidReason)
  }, [parsedUrl])

  const serializedSpec = isScreeningSpecComplete(draftSpec) ? serializeScreeningSpec(draftSpec) : null
  useEffect(() => {
    if (serializedSpec === null || searchParams.get(screeningQueryKey) === serializedSpec) return
    const nextParams = new URLSearchParams()
    nextParams.set(screeningQueryKey, serializedSpec)
    setSearchParams(nextParams, { replace: true })
  }, [searchParams, serializedSpec, setSearchParams])

  useEffect(() => {
    const controller = new AbortController()
    let active = true
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
  }, [draftSpec, runNonce])

  const updateSpec = (nextSpec: ScreenerSpec) => {
    setUrlIssue(null)
    setDraftSpec(nextSpec)
  }
  const rerun = () => setRunNonce((value) => value + 1)

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
      <div className="screening-layout">
        <BuilderPanel spec={draftSpec} runState={runState} onChange={updateSpec} onRun={rerun} />
        <ResultPanel state={runState} onRetry={rerun} />
      </div>
    </main>
  )
}
