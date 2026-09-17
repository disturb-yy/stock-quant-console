import { Button, Card } from 'tdesign-react'
import { useEffect, useState } from 'react'
import { ApiError, isApiAbortError, isApiError, isApiErrorResponse } from '../api/client'
import {
  fetchStockValuation,
  valuationRanges,
  type StockValuation,
  type StockValuationMetric,
  type ValuationRange,
} from '../api/stockValuation'
import { ErrorState, LoadingState } from './PageState'

type ValuationState =
  | { status: 'loading' }
  | { status: 'success'; data: StockValuation }
  | { status: 'error'; error: unknown }

export type ValuationQuery = {
  readonly range: ValuationRange
  readonly invalid: ReadonlyArray<string>
}

function useStockValuation(symbol: string, query: ValuationQuery) {
  const [reloadKey, setReloadKey] = useState(0)
  const [state, setState] = useState<ValuationState>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    let current = true
    setState({ status: 'loading' })
    fetchStockValuation(symbol, { range: query.range }, controller.signal)
      .then((data) => {
        if (data.symbol !== symbol || data.requested_range !== query.range) {
          throw new ApiError('invalid-payload', 'API 响应与估值查询不一致')
        }
        if (current) setState({ status: 'success', data })
      })
      .catch((error: unknown) => {
        if (current && !isApiAbortError(error)) setState({ status: 'error', error })
      })

    return () => {
      current = false
      controller.abort()
    }
  }, [query.range, reloadKey, symbol])

  return { state, retry: () => setReloadKey((value) => value + 1) }
}

const valuationLabels = {
  pe_ttm: 'PE（TTM）',
  pb: 'PB',
  ps_ttm: 'PS（TTM）',
} as const

type ValuationMetricKey = keyof typeof valuationLabels

const valuationBasisLabels = {
  ttm: '滚动十二个月',
  latest_daily_basic: '最新日线基础',
} as const

function formatNumericValue(value: string, suffix = '') {
  const number = Number(value)
  if (!Number.isFinite(number)) return `${value}${suffix}`
  return `${number.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${suffix}`
}

function formatDate(value: string | null) {
  return value ?? '暂无数据'
}

function metricPositionLabel(position: StockValuationMetric['position']) {
  if (position === 'low') return '相对自身历史偏低'
  if (position === 'middle') return '相对自身历史居中'
  if (position === 'high') return '相对自身历史偏高'
  return '暂不可计算'
}

function metricBasisLabel(basis: StockValuationMetric['current']['basis']) {
  return basis === null ? '暂无数据' : `${valuationBasisLabels[basis]} · ${basis}`
}

function valuationMetricValue(metric: StockValuationMetric) {
  return metric.current.value === null ? '暂无数据' : formatNumericValue(metric.current.value, 'x')
}

function StockValuationMetricCard({ metric, metricKey }: { metric: StockValuationMetric; metricKey: ValuationMetricKey }) {
  const percentile = metric.percentile
  const historyRange = percentile.range_from && percentile.range_to
    ? `${percentile.range_from} 至 ${percentile.range_to}`
    : '暂无有效观察区间'

  return (
    <article className="valuation-metric-card">
      <div className="valuation-metric-card__heading">
        <div>
          <h3>{valuationLabels[metricKey]}</h3>
          <code>{metricKey}</code>
        </div>
        <span className="valuation-metric-card__position">{metricPositionLabel(metric.position)}</span>
      </div>
      <p className={metric.current.value === null ? 'valuation-metric-card__value valuation-metric-card__value--empty' : 'valuation-metric-card__value'}>
        {valuationMetricValue(metric)}
      </p>
      <dl className="valuation-metric-card__meta">
        <div><dt>当前截至</dt><dd><time dateTime={metric.current.as_of ?? undefined}>{formatDate(metric.current.as_of)}</time></dd></div>
        <div><dt>口径</dt><dd>{metricBasisLabel(metric.current.basis)}</dd></div>
        <div><dt>历史分位</dt><dd>{percentile.value === null ? '暂不可计算' : `${formatNumericValue(percentile.value, '%')}`}</dd></div>
        <div><dt>有效样本</dt><dd>{percentile.sample_size} 个 · {historyRange}</dd></div>
      </dl>
      <p className="valuation-metric-card__method">
        {percentile.method}：仅描述当前值在同口径自身历史分布中的位置，不是低估/高估判断、买卖建议或收益预测。
      </p>
    </article>
  )
}

function IndustryMetricRow({ label, value, sampleSize }: { label: string; value: string | null; sampleSize: number }) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>{value === null ? `行业有效同行样本不足（${sampleSize}）` : formatNumericValue(value, 'x')}</td>
      <td>{sampleSize}</td>
    </tr>
  )
}

function StockIndustryComparisons({ data }: { data: StockValuation }) {
  if (data.industry_comparisons.length === 0) {
    return <div className="valuation-empty" role="status"><strong>暂无可比行业数据</strong><span>当前股票没有可用的行业映射，页面不会使用全市场或其他日期替代。</span></div>
  }

  return (
    <div className="valuation-industry-list">
      {data.industry_comparisons.map((comparison) => (
        <article className="valuation-industry" key={comparison.industry.code}>
          <div className="valuation-industry__heading">
            <h3>{comparison.industry.name}</h3>
            <span>{comparison.industry.code} · 比较日 {formatDate(comparison.as_of)}</span>
          </div>
          <div className="valuation-table-scroll">
            <table className="valuation-table">
              <caption className="sr-only">{comparison.industry.name}行业同行估值比较</caption>
              <thead><tr><th scope="col">指标</th><th scope="col">同行中位数</th><th scope="col">有效同行样本</th></tr></thead>
              <tbody>
                <IndustryMetricRow label="PE（TTM）" value={comparison.metrics.pe_ttm.value} sampleSize={comparison.metrics.pe_ttm.sample_size} />
                <IndustryMetricRow label="PB" value={comparison.metrics.pb.value} sampleSize={comparison.metrics.pb.sample_size} />
                <IndustryMetricRow label="PS（TTM）" value={comparison.metrics.ps_ttm.value} sampleSize={comparison.metrics.ps_ttm.sample_size} />
              </tbody>
            </table>
          </div>
        </article>
      ))}
    </div>
  )
}

type ValuationErrorKind = 'invalid' | 'not-found' | 'unavailable'

function valuationErrorKind(error: unknown): ValuationErrorKind {
  if (!isApiError(error)) return 'unavailable'
  const code = isApiErrorResponse(error.payload) ? error.payload.code : undefined
  if (error.status === 400 || code === 'VALIDATION_ERROR') return 'invalid'
  if (error.status === 404 || code === 'NOT_FOUND') return 'not-found'
  return 'unavailable'
}

function StockValuationErrorState({ error, onRetry, onBack, onReset }: { error: unknown; onRetry: () => void; onBack: () => void; onReset: () => void }) {
  const kind = valuationErrorKind(error)
  if (kind === 'invalid') return <ErrorState error={error} title="估值查询参数无效" hint="请恢复默认范围后重新请求真实估值数据。" actionLabel="恢复默认范围" onRetry={onReset} />
  if (kind === 'not-found') return <ErrorState error={error} title="股票不存在" hint="估值接口未找到这个股票标识，请返回 Markets 重新选择。" actionLabel="返回 Markets" onRetry={onBack} />
  return <ErrorState error={error} title="估值数据暂不可用" hint="服务或网络暂时不可用，页面不会使用替代估值；请稍后重试。" actionLabel="重试加载估值" onRetry={onRetry} />
}

function sourceLabel(mode: StockValuation['source']['mode']) {
  if (mode === 'real') return '真实 Provider'
  if (mode === 'fallback') return '本地回退数据'
  return 'Seed 数据'
}

function hasNoValuationData(data: StockValuation) {
  return data.effective_range.from === null
    && data.effective_range.to === null
    && Object.values(data.metrics).every((metric) => metric.history.length === 0 && metric.current.value === null)
}

export function StockValuationSection({
  symbol,
  query,
  onQueryChange,
  onResetQuery,
  onBack,
}: {
  symbol: string
  query: ValuationQuery
  onQueryChange: (next: Partial<Pick<ValuationQuery, 'range'>>) => void
  onResetQuery: () => void
  onBack: () => void
}) {
  const { state, retry } = useStockValuation(symbol, query)

  return (
    <section className="stock-valuation-section" aria-labelledby="stock-valuation-title">
      <div className="market-section-heading">
        <div>
          <p className="market-section-kicker">VALUATION RESEARCH</p>
          <h2 id="stock-valuation-title">估值</h2>
        </div>
        {state.status === 'success' ? <span className="market-section-meta">截至 {formatDate(state.data.as_of)}</span> : <span className="market-section-meta">自身历史与同行比较</span>}
      </div>
      <Card className="market-card stock-valuation-card" bordered>
        <div className="stock-valuation-card__body">
          {query.invalid.length > 0 ? (
            <div className="valuation-query-notice" role="status">
              URL 中的 {query.invalid.join('、')} 无效，已恢复为默认范围。
              <Button variant="text" onClick={onResetQuery}>确认恢复</Button>
            </div>
          ) : null}
          <div className="valuation-controls" aria-label="估值研究控件">
            <label>
              <span>历史范围</span>
              <select aria-label="估值历史范围" value={query.range} onChange={(event) => onQueryChange({ range: event.target.value as ValuationRange })}>
                {valuationRanges.map((value) => <option key={value} value={value}>{value === '3y' ? '近 3 年' : '近 5 年'}</option>)}
              </select>
            </label>
            <div className="valuation-query-summary">
              <span>API 范围：{query.range}</span>
              <span>查询按最新可用估值观测锚定</span>
            </div>
          </div>
          <p className="valuation-disclaimer">位置只表示当前值在同口径自身历史分布中的位置，不是估值结论、买入/卖出信号、目标价或收益预测。</p>
          {state.status === 'loading' ? <LoadingState label={`正在请求 /api/v1/stocks/${encodeURIComponent(symbol)}/valuation`} /> : null}
          {state.status === 'error' ? <StockValuationErrorState error={state.error} onRetry={retry} onBack={onBack} onReset={onResetQuery} /> : null}
          {state.status === 'success' ? (
            hasNoValuationData(state.data) ? (
              <div className="valuation-empty valuation-empty--section" role="status">
                <strong>所选范围暂无可用估值数据</strong>
                <span>接口已返回真实空估值结构，页面不会以零值、旧值或其他日期补齐。</span>
                <Button variant="text" onClick={retry}>重新获取</Button>
              </div>
            ) : (
              <>
                <div className="valuation-metric-grid">
                  {(Object.keys(valuationLabels) as ValuationMetricKey[]).map((metricKey) => (
                    <StockValuationMetricCard key={metricKey} metric={state.data.metrics[metricKey]} metricKey={metricKey} />
                  ))}
                </div>
                <section className="valuation-industry-section" aria-labelledby="valuation-industry-title">
                  <div className="valuation-subsection-heading">
                    <div><p className="market-section-kicker">SAME-DAY PEERS</p><h3 id="valuation-industry-title">行业同行比较</h3></div>
                    <span>排除本股 · 同一交易日</span>
                  </div>
                  <StockIndustryComparisons data={state.data} />
                </section>
                <div className="valuation-source" aria-label="估值数据来源">
                  <span>数据来源：{sourceLabel(state.data.source.mode)}</span>
                  <span>{state.data.source.provider}</span>
                  <span>Seed {state.data.source.seed_version}</span>
                  <span>有效范围 {state.data.effective_range.from ?? '暂无'} 至 {state.data.effective_range.to ?? '暂无'}</span>
                </div>
              </>
            )
          ) : null}
        </div>
      </Card>
    </section>
  )
}
