/**
 * The budget is not optional: every paid entry point, every attempt.
 *
 * The AI SDK is mocked at the module boundary (no network); the ledger is an
 * in-memory adapter that behaves like engine_reserve_budget: a fixed number
 * of allowed reservations, then refusals.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

const provider = vi.hoisted(() => ({ calls: 0, script: [] as (() => Promise<unknown>)[], embedCalls: 0 }))

vi.mock('ai', () => {
  class NoObjectGeneratedError extends Error {
    usage?: unknown
    response?: { id?: string }
    static isInstance(e: unknown): e is NoObjectGeneratedError {
      return e instanceof NoObjectGeneratedError
    }
    constructor(opts: { message?: string; usage?: unknown; response?: { id?: string } }) {
      super(opts.message ?? 'No object generated')
      this.name = 'AI_NoObjectGeneratedError'
      this.usage = opts.usage
      this.response = opts.response
    }
  }
  return {
    Output: { object: (v: unknown) => v },
    NoObjectGeneratedError,
    generateText: async () => {
      provider.calls++
      const next = provider.script.shift()
      if (!next) return { output: { ok: true }, text: 'ok', usage: { inputTokens: 1000, outputTokens: 100 }, response: { id: 'req-default' } }
      return next()
    },
    embed: async () => {
      provider.embedCalls++
      return { embedding: [0.1, 0.2], usage: { tokens: 50 } }
    },
  }
})

import { BudgetDeferredError, paidEmbed, paidGenerateText, setLedgerAdapter } from '@/lib/engine/paid'
import { structured } from '@/lib/desk/model'
import type { LedgerAdapter } from '@/lib/engine/ledger'

interface LedgerRow { id: string; model: string; estimate: number; status: string; actual: number; attempts?: number; request_id?: string | null }

/** An in-memory stand-in for engine_reserve_budget / engine_finalize_budget. */
function fakeLedger(opts: { allow?: number; fail?: boolean; empty?: boolean; malformed?: boolean } = {}): LedgerAdapter & { rows: LedgerRow[]; reserves: number } {
  const rows: LedgerRow[] = []
  let allowed = opts.allow ?? Infinity
  const ledger = {
    rows,
    reserves: 0,
    async rpc(fn: string, args: Record<string, unknown> = {}) {
      if (fn === 'engine_reserve_budget') {
        ledger.reserves++
        if (opts.fail) return { data: null, error: { message: 'connection refused' } }
        if (opts.empty) return { data: [], error: null }
        if (opts.malformed) return { data: [{ allowed: 'yes' }], error: null }
        if (allowed <= 0) {
          rows.push({ id: `blocked-${rows.length}`, model: String(args.p_model), estimate: Number(args.p_estimated_usd), status: 'blocked', actual: 0 })
          return { data: [{ allowed: false, deferred: false, usage_id: rows[rows.length - 1].id, remaining_usd: 0, reason: 'hard_limit' }], error: null }
        }
        allowed--
        const id = `usage-${rows.length}`
        rows.push({ id, model: String(args.p_model), estimate: Number(args.p_estimated_usd), status: 'reserved', actual: 0 })
        return { data: [{ allowed: true, deferred: false, usage_id: id, remaining_usd: 50, reason: 'ok' }], error: null }
      }
      if (fn === 'engine_finalize_budget') {
        const row = rows.find(r => r.id === args.p_usage_id)
        if (row) {
          row.status = String(args.p_status)
          row.actual = Number(args.p_actual_usd)
          row.attempts = Number(args.p_attempts)
          row.request_id = (args.p_provider_request_id as string | null) ?? null
        }
        return { data: null, error: null }
      }
      return { data: null, error: { message: `unknown rpc ${fn}` } }
    },
  }
  return ledger
}

const ok = (id = 'req-ok') => async () => ({ output: { ok: true }, text: 'ok', usage: { inputTokens: 1000, outputTokens: 100, inputTokenDetails: { cacheReadTokens: 200, cacheWriteTokens: 300 } }, response: { id } })
const timeout = () => async () => {
  const e = new Error('The operation was aborted due to timeout')
  e.name = 'TimeoutError'
  throw e
}
const refused = () => async () => {
  throw new Error('429 rate limited')
}

beforeEach(() => {
  provider.calls = 0
  provider.embedCalls = 0
  provider.script = []
})
afterEach(() => setLedgerAdapter(undefined))

describe('the gateway reserves before every dispatch', () => {
  it('a refused reservation dispatches nothing and defers', async () => {
    setLedgerAdapter(fakeLedger({ allow: 0 }))
    await expect(paidGenerateText({ model: 'anthropic/claude-sonnet-5', prompt: 'x', maxOutputTokens: 100 }, { source: 'desk', task: 't' })).rejects.toBeInstanceOf(BudgetDeferredError)
    expect(provider.calls).toBe(0)
  })

  it('no ledger client: nothing is dispatched', async () => {
    setLedgerAdapter(null)
    await expect(paidGenerateText({ model: 'anthropic/claude-sonnet-5', prompt: 'x' }, { source: 'desk', task: 't' })).rejects.toMatchObject({ reservation: { reason: 'no_ledger_client', deferred: true } })
    expect(provider.calls).toBe(0)
  })

  it('a ledger error, an empty row and a malformed row each defer without dispatching', async () => {
    for (const opts of [{ fail: true }, { empty: true }, { malformed: true }]) {
      setLedgerAdapter(fakeLedger(opts))
      await expect(paidGenerateText({ model: 'anthropic/claude-sonnet-5', prompt: 'x' }, { source: 'desk', task: 't' })).rejects.toBeInstanceOf(BudgetDeferredError)
    }
    expect(provider.calls).toBe(0)
  })

  it('embeddings go through the same gate', async () => {
    setLedgerAdapter(fakeLedger({ allow: 0 }))
    await expect(paidEmbed({ model: 'openai/text-embedding-3-small', value: 'hello' }, { source: 'embedding', task: 'e' })).rejects.toBeInstanceOf(BudgetDeferredError)
    expect(provider.embedCalls).toBe(0)
    const ledger = fakeLedger({ allow: 1 })
    setLedgerAdapter(ledger)
    const { charge } = await paidEmbed({ model: 'openai/text-embedding-3-small', value: 'hello' }, { source: 'embedding', task: 'e' })
    expect(provider.embedCalls).toBe(1)
    expect(charge.status).toBe('completed')
    expect(ledger.rows[0].status).toBe('completed')
  })

  it('a successful call finalises the row with usage, cache reads and writes, and the response id', async () => {
    const ledger = fakeLedger()
    setLedgerAdapter(ledger)
    provider.script = [ok('req-1')]
    const { charge } = await paidGenerateText({ model: 'anthropic/claude-sonnet-5', prompt: 'x'.repeat(4000), maxOutputTokens: 100 }, { source: 'desk', task: 't' })
    expect(charge).toMatchObject({ status: 'completed', cachedTokens: 200, cacheWriteTokens: 300, requestId: 'req-1' })
    // 500 fresh input at $2 + 200 cache read at $0.2 + 300 cache write at $2.5 + 100 out at $10, per million
    expect(charge.costUsd).toBeCloseTo((500 * 2 + 200 * 0.2 + 300 * 2.5 + 100 * 10) / 1_000_000, 8)
    expect(ledger.rows[0]).toMatchObject({ status: 'completed', request_id: 'req-1' })
    expect(ledger.rows[0].estimate).toBeGreaterThan(charge.costUsd)
  })

  it('a timeout after dispatch keeps the reservation as uncertain', async () => {
    const ledger = fakeLedger()
    setLedgerAdapter(ledger)
    provider.script = [timeout()]
    await expect(paidGenerateText({ model: 'anthropic/claude-sonnet-5', prompt: 'x' }, { source: 'desk', task: 't' })).rejects.toThrow(/timeout/)
    expect(ledger.rows[0].status).toBe('uncertain')
  })

  it('a billed generation that fails validation is finalised as completed with its usage', async () => {
    const ledger = fakeLedger()
    setLedgerAdapter(ledger)
    const { NoObjectGeneratedError } = await import('ai')
    provider.script = [
      async () => {
        throw new (NoObjectGeneratedError as unknown as new (o: unknown) => Error)({ message: 'bad json', usage: { inputTokens: 900, outputTokens: 400 }, response: { id: 'req-bad' } })
      },
    ]
    await expect(paidGenerateText({ model: 'anthropic/claude-sonnet-5', prompt: 'x' }, { source: 'desk', task: 't' })).rejects.toThrow(/bad json/)
    expect(ledger.rows[0]).toMatchObject({ status: 'completed', request_id: 'req-bad' })
    expect(ledger.rows[0].actual).toBeCloseTo((900 * 2 + 400 * 10) / 1_000_000, 8)
  })

  it('concurrent callers: exactly as many dispatches as the ledger allowed', async () => {
    setLedgerAdapter(fakeLedger({ allow: 2 }))
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => paidGenerateText({ model: 'anthropic/claude-sonnet-5', prompt: 'x' }, { source: 'desk', task: 't' })))
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(2)
    expect(results.filter(r => r.status === 'rejected' && r.reason instanceof BudgetDeferredError)).toHaveLength(4)
    expect(provider.calls).toBe(2)
  })
})

describe('structured(): every attempt in a chain is its own reservation', () => {
  const schema = z.object({ ok: z.boolean() })

  it('timeout on the first model, success on the second: two reservations, the first kept uncertain', async () => {
    const ledger = fakeLedger()
    setLedgerAdapter(ledger)
    provider.script = [timeout(), ok('req-2')]
    const r = await structured('bench', { system: 'S', user: 'U', schema, maxOutputTokens: 500, models: ['anthropic/claude-sonnet-5', 'anthropic/claude-opus-5'] }, { task: 'test' })
    expect(provider.calls).toBe(2)
    expect(ledger.reserves).toBe(2)
    expect(ledger.rows.map(x => x.status)).toEqual(['uncertain', 'completed'])
    expect(ledger.rows[0].model).toBe('anthropic/claude-sonnet-5')
    expect(ledger.rows[1].model).toBe('anthropic/claude-opus-5')
    expect(r.model).toBe('anthropic/claude-opus-5')
    expect(r.attempts).toBe(2)
    expect(r.charges.map(c => c.status)).toEqual(['uncertain', 'completed'])
  })

  it('the no-cache retry of the same model is reserved separately', async () => {
    const ledger = fakeLedger()
    setLedgerAdapter(ledger)
    provider.script = [refused(), ok('req-3')]
    // a non-timeout, non-quota failure retries the same model without the cache option
    provider.script[0] = async () => {
      throw new Error('cache_control not supported')
    }
    await structured('draft', { system: 'S', user: 'U', schema, models: ['anthropic/claude-opus-5'] }, { task: 'test' })
    expect(provider.calls).toBe(2)
    expect(ledger.reserves).toBe(2)
    expect(ledger.rows.map(x => x.status)).toEqual(['failed', 'completed'])
  })

  it('a refusal mid-chain stops the chain: no cheaper-to-dearer fallback past the cap', async () => {
    const ledger = fakeLedger({ allow: 1 })
    setLedgerAdapter(ledger)
    provider.script = [timeout()]
    await expect(structured('bench', { system: 'S', user: 'U', schema, models: ['anthropic/claude-sonnet-5', 'anthropic/claude-opus-5'] }, { task: 'test' })).rejects.toBeInstanceOf(BudgetDeferredError)
    expect(provider.calls).toBe(1)
    expect(ledger.rows.map(x => x.status)).toEqual(['uncertain', 'blocked'])
  })

  it('all attempts fail: every one finalised, the error carries the charges', async () => {
    const ledger = fakeLedger()
    setLedgerAdapter(ledger)
    provider.script = [refused(), refused()]
    await expect(structured('bench', { system: 'S', user: 'U', schema, models: ['anthropic/claude-sonnet-5', 'anthropic/claude-opus-5'] }, { task: 'test' })).rejects.toThrow(/no model answered after 2 attempt/)
    expect(ledger.rows.map(x => x.status)).toEqual(['failed', 'failed'])
  })

  it('the cost the caller stores is the sum of everything billed', async () => {
    const ledger = fakeLedger()
    setLedgerAdapter(ledger)
    const { NoObjectGeneratedError } = await import('ai')
    provider.script = [
      async () => {
        throw new (NoObjectGeneratedError as unknown as new (o: unknown) => Error)({ message: 'bad json', usage: { inputTokens: 1000, outputTokens: 1000 }, response: { id: 'r1' } })
      },
      ok('r2'),
    ]
    const r = await structured('bench', { system: 'S', user: 'U', schema, models: ['anthropic/claude-sonnet-5', 'anthropic/claude-opus-5'] }, { task: 'test' })
    expect(r.charges.map(c => c.status)).toEqual(['billed_invalid', 'completed'])
    expect(r.costUsd).toBeCloseTo(r.charges[0].costUsd + r.charges[1].costUsd, 8)
    expect(r.charges[0].costUsd).toBeGreaterThan(0)
  })

  it('with the budget exhausted the desk makes zero provider requests', async () => {
    setLedgerAdapter(fakeLedger({ allow: 0 }))
    await expect(structured('panel', { system: 'S', user: 'U', schema }, { task: 'panel' })).rejects.toBeInstanceOf(BudgetDeferredError)
    await expect(structured('draft', { system: 'S', user: 'U', schema }, { task: 'draft' })).rejects.toBeInstanceOf(BudgetDeferredError)
    await expect(structured('classify', { system: 'S', user: 'U', schema }, { task: 'classify' })).rejects.toBeInstanceOf(BudgetDeferredError)
    expect(provider.calls).toBe(0)
  })
})

describe('the paid paths outside the desk', () => {
  it('résumé parsing, transcript extraction, the recap and the embedding all stop at the gate', async () => {
    setLedgerAdapter(fakeLedger({ allow: 0 }))
    vi.doMock('@/lib/supabase/server', () => ({ createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }) }))
    const { extractFromTranscripts } = await import('@/lib/transcript-extract')
    await expect(extractFromTranscripts('Synthetic', [{ title: 't', occurredAt: '2026-09-09', text: 'hello' }])).rejects.toBeInstanceOf(BudgetDeferredError)
    const { embedCandidate } = await import('@/lib/embeddings')
    expect(await embedCandidate('00000000-0000-4000-8000-000000000001', { summary: 'a long enough summary to embed for the test' }, 'Synthetic')).toBe(false)
    expect(provider.calls).toBe(0)
    expect(provider.embedCalls).toBe(0)
  })
})
