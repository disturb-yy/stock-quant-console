import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './client'
import { fetchDemoStatus } from './demoStatus'

const demoStatus = {
  mode: 'demo' as const,
  provider: 'mysql-demo-fixture' as const,
  seed_version: 'fnd-003-demo-v1',
  as_of: '2024-06-28',
  counts: { instruments: 3, daily_bars: 6, daily_basics: 6, financial_metrics: 6, index_snapshots: 4 },
  sample_stocks: [{ code: '000001.SZ', name: '平安银行', exchange: 'SZSE' as const, status: 'active' as const }],
}

describe('fetchDemoStatus', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('requests the relative development status endpoint', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(demoStatus), { status: 200 }),
    )

    await expect(fetchDemoStatus()).resolves.toEqual(demoStatus)
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/v1/dev/demo-status')
  })

  it('rejects a payload that does not match the generated enum contract', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ...demoStatus, mode: 'preview' }), { status: 200 }),
    )

    await expect(fetchDemoStatus()).rejects.toMatchObject<Partial<ApiError>>({ kind: 'invalid-payload' })
  })

  it('preserves a unified backend error for the shared client', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: 'DEPENDENCY_UNAVAILABLE', message: '演示数据存储不可用' }), { status: 503 }),
    )

    await expect(fetchDemoStatus()).rejects.toMatchObject<Partial<ApiError>>({
      kind: 'backend',
      status: 503,
      payload: { code: 'DEPENDENCY_UNAVAILABLE' },
    })
  })
})
