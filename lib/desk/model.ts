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
 * Every dispatched attempt in a chain is its own reserved and finalised
 * ledger row (lib/engine/paid.ts): a timeout on the first model stays on the
 * books as uncertain even when the second model answers, and the cost the
 * caller stores is the sum of what was billed. The ledger is mandatory; a
 * call without it does not compile. Production chains are unchanged: the
 * audit's proposed routes are registered for the synthetic benchmark only.
 */

import type { z } from 'zod'
import { Output } from 'ai'
import { effortOptions, isApprovedForCandidateData, routeFor } from '@/lib/engine/routes'
import { BudgetDeferredError, type LedgerAdapter, type LedgerSource } from '@/lib/engine/ledger'
import { paidGenerateText, type Charge } from '@/lib/engine/paid'

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

export { costOf } from '@/lib/engine/routes'

export interface ModelCall<T> {
  output: T
  model: string
  tokensIn: number
  tokensOut: number
  cachedTokens: number
  /** Everything billed across every attempt of this call, not only the one that answered. */
  costUsd: number
  latencyMs: number
  /** The provider's response id of the answering attempt, for reconciliation. */
  requestId: string | null
  /** The ledger row of the answering attempt. */
  usageId: string | null
  attempts: number
  /** Every attempt, in order, with its ledger row and outcome. */
  charges: Charge[]
}

const TIMEOUT: Record<DeskJob, number> = { panel: 110_000, bench: 110_000, classify: 30_000, draft: 90_000 }

/** Thinking depth per job. Output tokens are the cost driver on Opus, and grading a CV does not need `high`. */
const EFFORT: Record<DeskJob, 'low' | 'medium' | 'high'> = { panel: 'medium', bench: 'low', classify: 'low', draft: 'medium' }

/** What the ledger records for this call. Required on every call. */
export interface LedgerMeta {
  task: string
  source?: LedgerSource
  discretionary?: boolean
  metadata?: Record<string, unknown>
  /** A specific ledger client (the route's admin client, or a test adapter). Resolved from the service role when absent. */
  admin?: LedgerAdapter
}

/**
 * Structured call with a cached system prefix.
 *
 * The prefix (rubric, briefs, examples) is marked for provider-side caching so
 * the second candidate of the day pays a tenth for it. If the gateway rejects
 * the cache option for a model, the same call is retried without it: an option
 * is never allowed to turn a working call into a failed one. Each retry and
 * each fallback is its own reservation; a refused reservation ends the call
 * with BudgetDeferredError and nothing is dispatched after that.
 */
export async function structured<T>(
  job: DeskJob,
  input: { system: string; user: string; schema: z.ZodType<T>; maxOutputTokens?: number; models?: string[]; effort?: 'none' | 'low' | 'medium' | 'high' },
  ledger: LedgerMeta,
): Promise<ModelCall<T>> {
  if (!ledger || typeof ledger.task !== 'string') throw new Error(`[desk:${job}] a ledger entry (task) is required for every paid call; nothing was dispatched`)
  const chain = input.models ? approved(input.models, job) : CHAINS[job]
  if (!chain.length) throw new Error(`[desk:${job}] no approved model in the chain`)
  const maxOut = input.maxOutputTokens ?? 4000
  const effort = input.effort ?? EFFORT[job]
  const meta = { source: ledger.source ?? ('desk' as LedgerSource), task: ledger.task, discretionary: ledger.discretionary, metadata: ledger.metadata, ledger: ledger.admin }

  const charges: Charge[] = []
  let lastError: unknown
  for (const model of chain) {
    const route = routeFor(model)
    for (const withCache of [true, false]) {
      try {
        const { result, charge } = await paidGenerateText<T>(
          {
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
          },
          meta,
        )
        charges.push(charge)
        console.log(`[desk:${job}] ok model=${model} ms=${charge.latencyMs} in=${charge.tokensIn} cached=${charge.cachedTokens} out=${charge.tokensOut} attempts=${charges.length}`)
        return {
          output: result.output,
          model,
          tokensIn: charge.tokensIn,
          tokensOut: charge.tokensOut,
          cachedTokens: charge.cachedTokens,
          costUsd: charges.reduce((s, c) => s + c.costUsd, 0),
          latencyMs: charge.latencyMs,
          requestId: charge.requestId,
          usageId: charge.usageId,
          attempts: charges.length,
          charges,
        }
      } catch (err) {
        if (err instanceof BudgetDeferredError) throw err
        lastError = err
        const charge = (err as { charge?: Charge }).charge
        if (charge) charges.push(charge)
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`[desk:${job}] model=${model} cache=${withCache} ${charge?.status ?? 'failed'} after ${charge?.latencyMs ?? '?'}ms: ${msg.slice(0, 200)}`)
        // A timeout or a quota error will hit the no-cache retry too; move on.
        if (!withCache || /timeout|abort|429|quota|credit/i.test(msg)) break
      }
    }
  }
  const billed = charges.reduce((s, c) => s + c.costUsd, 0)
  const e = new Error(`[desk:${job}] no model answered after ${charges.length} attempt(s), $${billed.toFixed(4)} billed: ${lastError instanceof Error ? lastError.message : 'unknown'}`)
  ;(e as { charges?: Charge[] }).charges = charges
  throw e
}
