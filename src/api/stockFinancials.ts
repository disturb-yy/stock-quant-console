import { apiRequest, isApiErrorResponse, type PayloadValidator } from './client'
import type {
  StockEffectiveRange,
  StockFinancialBalance,
  StockFinancialCashFlow,
  StockFinancialIncome,
  StockFinancialIndicators,
  StockFinancialReport,
  StockFinancialSource,
  StockFinancialSummary,
  StockFinancials,
} from './types'

export type {
  StockFinancialBalance,
  StockFinancialCashFlow,
  StockFinancialIncome,
  StockFinancialIndicators,
  StockFinancialReport,
  StockFinancialSource,
  StockFinancialSummary,
  StockFinancials,
} from './types'

export const financialPeriods = ['annual', 'quarterly'] as const
export type FinancialPeriod = (typeof financialPeriods)[number]

export const financialRanges = ['3y', '5y'] as const
export type FinancialRange = (typeof financialRanges)[number]

export interface StockFinancialsRequest {
  readonly period: FinancialPeriod
  readonly range: FinancialRange
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNullableNumericString(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)))
}

function isNullableDate(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && value.trim() !== '')
}

function isEffectiveRange(value: unknown): value is StockEffectiveRange {
  if (!isRecord(value)) return false
  return isNullableDate(value.from) && isNullableDate(value.to)
}

function isFinancialSource(value: unknown): value is StockFinancialSource {
  if (!isRecord(value)) return false
  return (value.mode === 'demo' || value.mode === 'real' || value.mode === 'fallback')
    && (value.provider === 'mysql-demo-fixture'
      || value.provider === 'tushare'
      || value.provider === 'external-real-provider'
      || value.provider === 'local-fixture-fallback')
    && typeof value.seed_version === 'string'
    && typeof value.as_of === 'string'
}

function isFinancialIncome(value: unknown): value is StockFinancialIncome {
  if (!isRecord(value)) return false
  return isNullableNumericString(value.revenue)
    && isNullableNumericString(value.gross_profit)
    && isNullableNumericString(value.operating_profit)
    && isNullableNumericString(value.net_profit)
}

function isFinancialBalance(value: unknown): value is StockFinancialBalance {
  if (!isRecord(value)) return false
  return isNullableNumericString(value.cash_and_equivalents)
    && isNullableNumericString(value.accounts_receivable)
    && isNullableNumericString(value.inventory)
    && isNullableNumericString(value.current_assets)
    && isNullableNumericString(value.current_liabilities)
    && isNullableNumericString(value.total_assets)
    && isNullableNumericString(value.total_liabilities)
    && isNullableNumericString(value.total_equity)
}

function isFinancialCashFlow(value: unknown): value is StockFinancialCashFlow {
  if (!isRecord(value)) return false
  return isNullableNumericString(value.operating_cash_flow)
    && isNullableNumericString(value.capital_expenditure)
    && isNullableNumericString(value.investing_cash_flow)
    && isNullableNumericString(value.financing_cash_flow)
    && isNullableNumericString(value.net_cash_change)
}

function isFinancialIndicators(value: unknown): value is StockFinancialIndicators {
  if (!isRecord(value)) return false
  return isNullableNumericString(value.revenue_yoy_pct)
    && isNullableNumericString(value.net_profit_yoy_pct)
    && isNullableNumericString(value.gross_margin_pct)
    && isNullableNumericString(value.roe_pct)
    && isNullableNumericString(value.free_cash_flow)
    && isNullableNumericString(value.debt_to_asset_pct)
    && isNullableNumericString(value.current_ratio)
}

function isFinancialReport(value: unknown): value is StockFinancialReport {
  if (!isRecord(value)) return false
  return typeof value.period_end === 'string'
    && Number.isInteger(value.fiscal_year)
    && (value.fiscal_quarter === null || value.fiscal_quarter === 'Q1' || value.fiscal_quarter === 'Q2' || value.fiscal_quarter === 'Q3' || value.fiscal_quarter === 'Q4')
    && isNullableDate(value.published_at)
    && isFinancialIncome(value.income)
    && isFinancialBalance(value.balance)
    && isFinancialCashFlow(value.cash_flow)
    && isFinancialIndicators(value.indicators)
}

function isFinancialSummary(value: unknown): value is StockFinancialSummary {
  if (!isRecord(value)) return false
  return typeof value.period_end === 'string'
    && isNullableDate(value.published_at)
    && isNullableNumericString(value.revenue)
    && isNullableNumericString(value.revenue_yoy_pct)
    && isNullableNumericString(value.net_profit)
    && isNullableNumericString(value.net_profit_yoy_pct)
    && isNullableNumericString(value.gross_margin_pct)
    && isNullableNumericString(value.roe_pct)
    && isNullableNumericString(value.operating_cash_flow)
    && isNullableNumericString(value.free_cash_flow)
    && isNullableNumericString(value.debt_to_asset_pct)
    && isNullableNumericString(value.current_ratio)
}

export const isStockFinancials: PayloadValidator<StockFinancials> = (value): value is StockFinancials => {
  if (!isRecord(value)) return false
  return typeof value.symbol === 'string'
    && typeof value.name === 'string'
    && financialPeriods.includes(value.period as FinancialPeriod)
    && financialRanges.includes(value.requested_range as FinancialRange)
    && isEffectiveRange(value.effective_range)
    && value.reporting_currency === 'CNY'
    && value.amount_unit === 'CNY'
    && isNullableDate(value.latest_report_date)
    && (value.summary === null || isFinancialSummary(value.summary))
    && Array.isArray(value.reports)
    && value.reports.every(isFinancialReport)
    && isFinancialSource(value.source)
}

export function buildStockFinancialsQuery({ period, range }: StockFinancialsRequest): string {
  return new URLSearchParams({ period, range }).toString()
}

export async function fetchStockFinancials(
  symbol: string,
  request: StockFinancialsRequest,
  signal?: AbortSignal,
): Promise<StockFinancials> {
  return apiRequest<StockFinancials>(
    `/api/v1/stocks/${encodeURIComponent(symbol)}/financials?${buildStockFinancialsQuery(request)}`,
    { method: 'GET', signal, validateResponse: isStockFinancials, parseError: isApiErrorResponse },
  )
}
