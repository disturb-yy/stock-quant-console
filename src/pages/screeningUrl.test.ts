import { describe, expect, it } from 'vitest'
import {
  defaultScreeningSpec,
  readScreenerId,
  readScreeningSpec,
  serializeScreeningSpec,
  screenerQueryKey,
  screeningQueryKey,
} from './screeningUrl'

describe('screening URL state', () => {
  it('round-trips only the canonical Builder spec', () => {
    const spec = {
      ...defaultScreeningSpec,
      filters: [{ field_id: 'valuation.pe_ttm' as const, operator: 'lte' as const, value: '15' }],
      top_n: 10,
    }

    expect(readScreeningSpec(new URLSearchParams([[screeningQueryKey, serializeScreeningSpec(spec)]]))).toEqual({ spec, invalidReason: null })
  })

  it('recovers malformed, untrusted URL state without treating it as an API spec', () => {
    const result = readScreeningSpec(new URLSearchParams([[screeningQueryKey, '{"universe_id":"other"}']]))

    expect(result.spec).toEqual(defaultScreeningSpec)
    expect(result.invalidReason).toContain('不完整或不受支持')
  })

  it('bounds URL state before parsing oversized input', () => {
    const result = readScreeningSpec(new URLSearchParams([[screeningQueryKey, 'x'.repeat(4097)]]))

    expect(result.spec).toEqual(defaultScreeningSpec)
    expect(result.invalidReason).toContain('过长')
  })

  it('accepts only positive safe integer saved-plan IDs', () => {
    expect(readScreenerId(new URLSearchParams([[screenerQueryKey, '7']]))).toEqual({ id: 7, invalidReason: null })
    expect(readScreenerId(new URLSearchParams([[screenerQueryKey, '0']])).invalidReason).toContain('无效')
    expect(readScreenerId(new URLSearchParams([[screenerQueryKey, 'not-a-number']])).invalidReason).toContain('无效')
  })
})
