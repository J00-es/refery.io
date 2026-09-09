/**
 * Every paid provider call goes through here. There is no other way to reach
 * the AI SDK from application code: `generateText` and `embed` are imported
 * only in this file, so a call that skips the ledger cannot be written by
 * accident (grep for "from 'ai'" to check).
 *
 * One dispatched attempt = one reservation = one finalised ledger row:
 *   - reserved before dispatch, at a worst case for THIS model, this input
 *     and the full output budget, priced at the dearer of input and
 *     cache-write rates;
 *   - finalised `completed` with the provider's usage (cache reads, cache
 *     writes, reasoning tokens, response id) when it answers;
 *   - finalised `completed` with the usage the provider reported even when
 *     the output failed validation, because that generation was billed;
 *   - kept `uncertain` (reservation retained) on a timeout or abort after
 *     dispatch, because the provider may still have billed it;
 *   - finalised `failed` (nothing billed) on a refusal before generation.
 *
 * A reservation that is refused or cannot be made throws BudgetDeferredError
 * before any request leaves the process. Callers queue the work with the
 * reason; nobody is rejected because the month ran out.
 *
 * Tests inject a no-network adapter with `setLedgerAdapter`; production
 * resolves the service-role client on first use.
 */

import { generateText, embed, NoObjectGeneratedError, type EmbedResult, type LanguageModelUsage } from 'ai'
import { costOf, routeFor } from '@/lib/engine/routes'
import { BudgetDeferredError, finalize, reserve, type LedgerAdapter, type LedgerSource } from '@/lib/engine/ledger'

export interface PaidMeta {
  source: LedgerSource
  task: string
  discretionary?: boolean
  metadata?: Record<string, unknown>
  /** Override the ledger client for this call (tests, scripts). */
  ledger?: LedgerAdapter
}

let injected: LedgerAdapter | null | undefined

/** Tests and scripts: use this adapter for every paid call. `null` means "no client" (every call defers). */
export function setLedgerAdapter(adapter: LedgerAdapter | null | undefined): void {
  injected = adapter
}

export async function ledgerClient(meta?: PaidMeta): Promise<LedgerAdapter | null> {
  if (meta?.ledger) return meta.ledger
  if (injected !== undefined) return injected
  try {
    const mod = await import('@/lib/supabase/server')
    return mod.createAdminClient()
  } catch (err) {
    console.warn(`[engine:paid] no ledger client: ${err instanceof Error ? err.message : err}`)
    return null
  }
}

export type ChargeStatus = 'completed' | 'billed_invalid' | 'uncertain' | 'failed'

export interface Charge {
  model: string
  usageId: string | null
  status: ChargeStatus
  costUsd: number
  tokensIn: number
  tokensOut: number
  cachedTokens: number
  cacheWriteTokens: number
  reasoningTokens: number | null
  requestId: string | null
  latencyMs: number
}

type GenerateArgs = Parameters<typeof generateText>[0] & { model: string }

/** What a caller reads from a text call. `output` is the structured object when the call asked for one. */
export interface PaidTextResult<O = unknown> {
  text: string
  output: O
  usage: LanguageModelUsage | undefined
  response?: { id?: string }
  finishReason?: string
}

/** Conservative token estimate for what a call sends. Files (PDF pages bill as images) are priced generously. */
export function estimateInputTokens(args: { system?: unknown; prompt?: unknown; messages?: unknown }): number {
  let chars = 0
  let files = 0
  const walk = (v: unknown): void => {
    if (v == null) return
    if (typeof v === 'string') {
      chars += v.length
      return
    }
    if (Array.isArray(v)) {
      for (const x of v) walk(x)
      return
    }
    if (typeof v === 'object') {
      const o = v as Record<string, unknown>
      if (o.type === 'file' || o.type === 'image') {
        const data = o.data ?? o.image
        files += typeof data === 'string' ? Math.max(8_000, Math.ceil(data.length / 6)) : 8_000
        return
      }
      for (const k of Object.keys(o)) if (k !== 'providerOptions') walk(o[k])
    }
  }
  walk(args.system)
  walk(args.prompt)
  walk(args.messages)
  return Math.ceil(chars / 3) + files
}

/** Worst case for one attempt: no cache hit, the whole output budget, input at the dearer of input and cache-write rates. */
export function worstCaseUsd(model: string, inputTokens: number, maxOutputTokens: number): number {
  const r = routeFor(model) ?? routeFor('anthropic/claude-opus-5')!
  const inRate = Math.max(r.price.input, r.price.cacheWrite ?? 0)
  return (inputTokens * inRate + maxOutputTokens * r.price.output) / 1_000_000
}

function isTimeout(err: unknown): boolean {
  const e = err as { name?: string; message?: string } | undefined
  return e?.name === 'AbortError' || e?.name === 'TimeoutError' || /timeout|abort/i.test(e?.message ?? '')
}

function usageOf(usage: unknown): { tokensIn: number; tokensOut: number; cached: number; cacheWrite: number; reasoning: number | null } {
  const u = (usage ?? {}) as { inputTokens?: number; outputTokens?: number; cachedInputTokens?: number; inputTokenDetails?: { cacheReadTokens?: number; cacheWriteTokens?: number }; outputTokenDetails?: { reasoningTokens?: number }; reasoningTokens?: number }
  return {
    tokensIn: u.inputTokens ?? 0,
    tokensOut: u.outputTokens ?? 0,
    cached: u.inputTokenDetails?.cacheReadTokens ?? u.cachedInputTokens ?? 0,
    cacheWrite: u.inputTokenDetails?.cacheWriteTokens ?? 0,
    reasoning: u.outputTokenDetails?.reasoningTokens ?? u.reasoningTokens ?? null,
  }
}

/**
 * One reserved, dispatched and finalised attempt. Throws BudgetDeferredError
 * before dispatch when the ledger says no or cannot be reached; rethrows the
 * provider's error after finalising the attempt otherwise. The charge for a
 * failed attempt is attached to the error as `err.charge`.
 */
export async function paidGenerateText<O = unknown>(args: GenerateArgs, meta: PaidMeta): Promise<{ result: PaidTextResult<O>; charge: Charge }> {
  const ledger = await ledgerClient(meta)
  const model = args.model
  const maxOut = typeof args.maxOutputTokens === 'number' ? args.maxOutputTokens : 4096
  const estimate = worstCaseUsd(model, estimateInputTokens(args), maxOut)
  const r = await reserve(ledger, { source: meta.source, task: meta.task, model, estimateUsd: estimate, discretionary: meta.discretionary, metadata: meta.metadata })
  if (!r.allowed) throw new BudgetDeferredError(r)

  const startedAt = Date.now()
  const base = { model, usageId: r.usageId, tokensIn: 0, tokensOut: 0, cachedTokens: 0, cacheWriteTokens: 0, reasoningTokens: null as number | null, requestId: null as string | null }
  try {
    // An explicit synthetic-benchmark transport uses the same route price and
    // ledger, while allowing the existing OpenAI account to be tested directly.
    let providerModel: Parameters<typeof generateText>[0]['model'] = args.model
    if (meta.source === 'benchmark' && process.env.ENGINE_BENCHMARK_DIRECT_OPENAI === '1') {
      if (!args.model.startsWith('openai/') || !routeFor(args.model)?.benchmark) throw new Error('Direct benchmark requires a registered OpenAI route')
      const { createOpenAI } = await import('@ai-sdk/openai')
      providerModel = createOpenAI({ apiKey: process.env.OPENAI_API_KEY }).responses(args.model.slice('openai/'.length))
    }
    const result = (await generateText({ ...args, model: providerModel, maxRetries: 0 })) as unknown as PaidTextResult<O>
    const u = usageOf(result.usage)
    const costUsd = costOf(model, u.tokensIn, u.tokensOut, u.cached, u.cacheWrite)
    const requestId = (result as { response?: { id?: string } }).response?.id ?? null
    await finalize(ledger, r.usageId, { status: 'completed', actualUsd: costUsd, inputTokens: u.tokensIn, outputTokens: u.tokensOut, cachedTokens: u.cached, reasoningTokens: u.reasoning ?? undefined, providerRequestId: requestId, attempts: 1 })
    return { result, charge: { ...base, status: 'completed', costUsd, tokensIn: u.tokensIn, tokensOut: u.tokensOut, cachedTokens: u.cached, cacheWriteTokens: u.cacheWrite, reasoningTokens: u.reasoning, requestId, latencyMs: Date.now() - startedAt } }
  } catch (err) {
    let charge: Charge
    if (typeof NoObjectGeneratedError?.isInstance === 'function' && NoObjectGeneratedError.isInstance(err) && err.usage) {
      // The provider generated and billed; the output did not validate.
      const u = usageOf(err.usage)
      const costUsd = costOf(model, u.tokensIn, u.tokensOut, u.cached, u.cacheWrite)
      const requestId = err.response?.id ?? null
      await finalize(ledger, r.usageId, { status: 'completed', actualUsd: costUsd, inputTokens: u.tokensIn, outputTokens: u.tokensOut, cachedTokens: u.cached, reasoningTokens: u.reasoning ?? undefined, providerRequestId: requestId, attempts: 1 })
      charge = { ...base, status: 'billed_invalid', costUsd, tokensIn: u.tokensIn, tokensOut: u.tokensOut, cachedTokens: u.cached, cacheWriteTokens: u.cacheWrite, reasoningTokens: u.reasoning, requestId, latencyMs: Date.now() - startedAt }
    } else if (isTimeout(err)) {
      await finalize(ledger, r.usageId, { status: 'uncertain', actualUsd: 0, inputTokens: 0, outputTokens: 0, attempts: 1 })
      charge = { ...base, status: 'uncertain', costUsd: 0, latencyMs: Date.now() - startedAt }
    } else {
      await finalize(ledger, r.usageId, { status: 'failed', actualUsd: 0, inputTokens: 0, outputTokens: 0, attempts: 1 })
      charge = { ...base, status: 'failed', costUsd: 0, latencyMs: Date.now() - startedAt }
    }
    ;(err as { charge?: Charge }).charge = charge
    throw err
  }
}

type EmbedArgs = Omit<Parameters<typeof embed>[0], 'model'> & { model: string }

export async function paidEmbed(args: EmbedArgs, meta: PaidMeta): Promise<{ result: EmbedResult; charge: Charge }> {
  const ledger = await ledgerClient(meta)
  const model = args.model
  const inputTokens = Math.ceil(String(args.value ?? '').length / 3)
  const estimate = (inputTokens * (routeFor(model)?.price.input ?? 0.02)) / 1_000_000
  const r = await reserve(ledger, { source: meta.source, task: meta.task, model, estimateUsd: estimate, discretionary: meta.discretionary, metadata: meta.metadata })
  if (!r.allowed) throw new BudgetDeferredError(r)
  const startedAt = Date.now()
  try {
    const result = await embed({ ...(args as Parameters<typeof embed>[0]), maxRetries: 0 })
    const tokens = (result.usage as { tokens?: number } | undefined)?.tokens ?? inputTokens
    const costUsd = (tokens * (routeFor(model)?.price.input ?? 0.02)) / 1_000_000
    await finalize(ledger, r.usageId, { status: 'completed', actualUsd: costUsd, inputTokens: tokens, outputTokens: 0, attempts: 1 })
    return { result, charge: { model, usageId: r.usageId, status: 'completed', costUsd, tokensIn: tokens, tokensOut: 0, cachedTokens: 0, cacheWriteTokens: 0, reasoningTokens: null, requestId: null, latencyMs: Date.now() - startedAt } }
  } catch (err) {
    await finalize(ledger, r.usageId, { status: isTimeout(err) ? 'uncertain' : 'failed', actualUsd: 0, inputTokens: 0, outputTokens: 0, attempts: 1 })
    throw err
  }
}

export { BudgetDeferredError }
