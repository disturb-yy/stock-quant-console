import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './client'
import { buildStockFinancialsQuery, fetchStockFinancials, isStockFinancials } from './stockFinancials'

const emptyFinancials = {
  symbol: '000001.SZ',
  name: '平安银行',
  period: 'annual' as const,
  requested_range: '5y' as const,
  effective_range: { from: null, to: null },
  reporting_currency: 'CNY' as const,
  amount_unit: 'CNY' as const,
  latest_report_date: null,
  summary: null,
  reports: [],
  source: { mode: 'demo' as const, provider: 'mysql-demo-fixture' as const, seed_version: 'fnd-003-demo-v7', as_of: '2024-06-28' },
}

describe('fetchStockFinancials', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('requests the encoded symbol and OpenAPI financial query parameters', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(emptyFinancials), { status: 200 }),
    )

    await expect(fetchStockFinancials('A/B.SZ', { period: 'quarterly', range: '3y' })).resolves.toEqual(emptyFinancials)

    const requestUrl = new URL(String(fetchSpy.mock.calls[0][0]), 'http://localhost')
    expect(requestUrl.pathname).toBe('/api/v1/stocks/A%2FB.SZ/financials')
    expect(requestUrl.search).toBe(`?${buildStockFinancialsQuery({ period: 'quarterly', range: '3y' })}`)
  })

  it('accepts a real empty result and nullable report fields', () => {
    expect(isStockFinancials(emptyFinancials)).toBe(true)
    expect(isStockFinancials({
      ...emptyFinancials,
      reports: [{
        period_end: '2023-12-31', fiscal_year: 2023, fiscal_quarter: null, published_at: null,
        income: { revenue: '1600.00', gross_profit: null, operating_profit: '421.60', net_profit: '272.00' },
        balance: { cash_and_equivalents: '283.50', accounts_receivable: '202.50', inventory: null, current_assets: '810.00', current_liabilities: '320.00', total_assets: '2080.00', total_liabilities: '936.00', total_equity: '1144.00' },
        cash_flow: { operating_cash_flow: '345.00', capital_expenditure: null, investing_cash_flow: '-75.90', financing_cash_flow: '-34.50', net_cash_change: '234.60' },
        indicators: { revenue_yoy_pct: null, net_profit_yoy_pct: '14.48', gross_margin_pct: null, roe_pct: '23.78', free_cash_flow: null, debt_to_asset_pct: '45.00', current_ratio: '2.53' },
      }],
    })).toBe(true)
  })

  it('rejects payloads that violate the generated financial contract', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ...emptyFinancials, amount_unit: 'USD' }), { status: 200 }),
    )

    await expect(fetchStockFinancials(emptyFinancials.symbol, { period: 'annual', range: '5y' })).rejects.toMatchObject<Partial<ApiError>>({
      kind: 'invalid-payload',
    })
  })

  it('preserves unified backend errors for unavailable financial data', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: 'DEPENDENCY_UNAVAILABLE', message: '股票财务数据暂不可用' }), { status: 503 }),
    )

    await expect(fetchStockFinancials(emptyFinancials.symbol, { period: 'annual', range: '5y' })).rejects.toMatchObject<Partial<ApiError>>({
      kind: 'backend', status: 503,
    })
  })
})
