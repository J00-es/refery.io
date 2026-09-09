/**
 * One place that decides which model does which job on the desk, and what it
 * costs. Every name is an env var so a trade-down is a variable change, not a
 * deploy.
 *
 *   panel      once per candidate; the text partners and Lily read. Opus 5.
 *   bench      once per seat, over forty summaries. Sonnet 5.
 *   classify   was that reply a yes, a promise, a no. Haiku 4.5.
 *   draft      the short emails after a call. Opus 5, same as the recap.
 *
 * Each has a chain: the first model that answers wins, and a retired id or a
 * gateway hiccup degrades the run instead of ending it, which is how the
 * résumé parser and the recap already behave.
 *
 * Since 2026-09-09 the allowlist and the prices come from the route register
 * (lib/engine/routes.ts), every call reserves against the shared ledger
 * before dispatch and finalises after, and the provider's response id is
 * kept for reconciliation. Production chains are unchanged: the audit's
 * proposed routes are registered for the synthetic benchmark only.
 */

import { generateText, Output } from 'ai'
import type { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { costOf as routeCost, effortOptions, isApprovedForCandidateData, routeFor, worstCaseCost } from '@/lib/engine/routes'
import { BudgetDeferredError, finalize, reserve, type LedgerSource } from '@/lib/engine/ledger'

export type DeskJob = 'panel' | 'bench' | 'classify' | 'draft'

/**
 * Routes approved to receive candidate data, from the register. An env var
 * naming something unapproved is refused rather than obeyed, and a chain
 * skips past a model it does not recognise instead of quietly using it.
 */
export function isApprovedRoute(model: string): boolean {
  return isApprovedForCandidateData(model)
}

function approved(models: string[], job: string): string[] {
  const ok: string[] = []
  for (const m of models) {
    if (isApprovedRoute(m)) {
      if (!ok.includes(m)) ok.push(m)
    } else console.error(`[model] "${m}" is not an approved route and was dropped from the ${job} chain`)
  }
  return ok
}

const CHAINS: Record<DeskJob, string[]> = {
  panel: approved([process.env.DESK_PANEL_MODEL, 'anthropic/claude-opus-5', 'anthropic/claude-sonnet-5', 'openai/gpt-5.6-sol'].filter((m): m is string => !!m), 'panel'),
  bench: approved([process.env.DESK_BENCH_MODEL, 'anthropic/claude-sonnet-5', 'anthropic/claude-opus-5', 'google/gemini-3.6-flash'].filter((m): m is string => !!m), 'bench'),
  classify: approved([process.env.DESK_CLASSIFY_MODEL, 'anthropic/claude-haiku-4-5', 'google/gemini-3.6-flash', 'anthropic/claude-sonnet-5'].filter((m): m is string => !!m), 'classify'),
  draft: approved([process.env.DESK_DRAFT_MODEL, 'anthropic/claude-opus-5', 'anthropic/claude-sonnet-5'].filter((m): m is string => !!m), 'draft'),
}

export function chainFor(job: DeskJob): string[] {
  return [...CHAINS[job]]
}

export function costOf(model: string, inTok: number, outTok: number, cachedTok = 0): number {
  return routeCost(model, inTok, outTok, cachedTok)
}

export interface ModelCall<T> {
  output: T
  model: string
  tokensIn: number
  tokensOut: number
  cachedTokens: number
  costUsd: number
  latencyMs: number
  /** The provider's response id, for reconciling the ledger against usage exports. */
  requestId: string | null
  /** The ledger row this call was reserved on, when a ledger client was given. */
  usageId: string | null
  attempts: number
}

const TIMEOUT: Record<DeskJob, number> = { panel: 110_000, bench: 110_000, classify: 30_000, draft: 90_000 }

/** Thinking depth per job. Output tokens are the cost driver on Opus, and grading a CV does not need `high`. */
const EFFORT: Record<DeskJob, 'low' | 'medium' | 'high'> = { panel: 'medium', bench: 'low', classify: 'low', draft: 'medium' }

export interface LedgerOptions {
  admin: SupabaseClient
  source?: LedgerSource
  task?: string
  discretionary?: boolean
  metadata?: Record<string, unknown>
}

/**
 * Structured call with a cached system prefix.
 *
 * The prefix (rubric, briefs, examples) is marked for provider-side caching so
 * the second candidate of the day pays a tenth for it. If the gateway rejects
 * the cache option for a model, the same call is retried without it: an option
 * is never allowed to turn a working call into a failed one.
 *
 * With `ledger` set, the worst case for the first model in the chain is
 * reserved before dispatch; a refusal throws BudgetDeferredError so the
 * caller can queue the work with a visible reason instead of failing the
 * person. Every attempt, including fallbacks, is finalised on the same row.
 */
export async function structured<T>(
  job: DeskJob,
  input: { system: string; user: string; schema: z.ZodType<T>; maxOutputTokens?: number; models?: string[]; effort?: 'none' | 'low' | 'medium' | 'high' },
  ledger?: LedgerOptions,
): Promise<ModelCall<T>> {
  const chain = input.models ? approved(input.models, job) : CHAINS[job]
  if (!chain.length) throw new Error(`[desk:${job}] no approved model in the chain`)
  const maxOut = input.maxOutputTokens ?? 4000
  const effort = input.effort ?? EFFORT[job]

  let usageId: string | null = null
  if (ledger) {
    const r = await reserve(ledger.admin, {
      source: ledger.source ?? 'desk',
      task: ledger.task ?? job,
      model: chain[0],
      estimateUsd: worstCaseCost(chain[0], input.system.length + input.user.length, maxOut),
      discretionary: ledger.discretionary ?? false,
      metadata: ledger.metadata ?? {},
    })
    if (!r.allowed) throw new BudgetDeferredError(r)
    usageId = r.usageId
  }

  let lastError: unknown
  let attempts = 0
  let uncertain = false
  for (const model of chain) {
    const route = routeFor(model)
    for (const withCache of [true, false]) {
      const startedAt = Date.now()
      attempts++
      try {
        const res = await generateText({
          model,
          output: Output.object({ schema: input.schema }),
          maxOutputTokens: maxOut,
          maxRetries: 0,
          abortSignal: AbortSignal.timeout(TIMEOUT[job]),
          ...(withCache && route?.effortOption ? { providerOptions: effortOptions(model, effort) } : {}),
          messages: [
            {
              role: 'system',
              content: input.system,
              ...(withCache && route?.supports.promptCache && route.provider === 'anthropic' ? { providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' as const } } } } : {}),
            },
            { role: 'user', content: input.user },
          ],
        })
        const { output, usage } = res
        const tokensIn = usage?.inputTokens ?? 0
        const tokensOut = usage?.outputTokens ?? 0
        const u = usage as { cachedInputTokens?: number; inputTokenDetails?: { cacheReadTokens?: number }; outputTokenDetails?: { reasoningTokens?: number } } | undefined
        const cached = u?.inputTokenDetails?.cacheReadTokens ?? u?.cachedInputTokens ?? 0
        const reasoning = u?.outputTokenDetails?.reasoningTokens ?? undefined
        const requestId = (res as { response?: { id?: string } }).response?.id ?? null
        const latencyMs = Date.now() - startedAt
        const costUsd = routeCost(model, tokensIn, tokensOut, cached)
        console.log(`[desk:${job}] ok model=${model} ms=${latencyMs} in=${tokensIn} cached=${cached} out=${tokensOut} attempts=${attempts}`)
        if (ledger) await finalize(ledger.admin, usageId, { status: 'completed', actualUsd: costUsd, inputTokens: tokensIn, outputTokens: tokensOut, cachedTokens: cached, reasoningTokens: reasoning, providerRequestId: requestId, attempts })
        return { output, model, tokensIn, tokensOut, cachedTokens: cached, costUsd, latencyMs, requestId, usageId, attempts }
      } catch (err) {
        lastError = err
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`[desk:${job}] model=${model} cache=${withCache} failed after ${Date.now() - startedAt}ms: ${msg.slice(0, 200)}`)
        // A timeout after dispatch may still have been billed.
        if (/timeout|abort/i.test(msg)) uncertain = true
        // A timeout or a quota error will hit the no-cache retry too; move on.
        if (!withCache || /timeout|abort|429|quota|credit/i.test(msg)) break
      }
    }
  }
  if (ledger) await finalize(ledger.admin, usageId, { status: uncertain ? 'uncertain' : 'failed', actualUsd: 0, inputTokens: 0, outputTokens: 0, attempts })
  throw new Error(`[desk:${job}] no model answered: ${lastError instanceof Error ? lastError.message : 'unknown'}`)
}
