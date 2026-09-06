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
 */

import { generateText, Output } from 'ai'
import type { z } from 'zod'

export type DeskJob = 'panel' | 'bench' | 'classify' | 'draft'

const CHAINS: Record<DeskJob, string[]> = {
  panel: [process.env.DESK_PANEL_MODEL, 'anthropic/claude-opus-5', 'anthropic/claude-sonnet-5', 'openai/gpt-5.6-sol'].filter(
    (m): m is string => !!m,
  ),
  bench: [process.env.DESK_BENCH_MODEL, 'anthropic/claude-sonnet-5', 'anthropic/claude-opus-5', 'google/gemini-3.6-flash'].filter(
    (m): m is string => !!m,
  ),
  classify: [process.env.DESK_CLASSIFY_MODEL, 'anthropic/claude-haiku-4-5', 'google/gemini-3.6-flash', 'anthropic/claude-sonnet-5'].filter(
    (m): m is string => !!m,
  ),
  draft: [process.env.DESK_DRAFT_MODEL, 'anthropic/claude-opus-5', 'anthropic/claude-sonnet-5'].filter((m): m is string => !!m),
}

/** USD per million tokens, input then output. Cache reads bill at a tenth of input. */
const PRICE: Record<string, [number, number]> = {
  'anthropic/claude-opus-5': [5, 25],
  'anthropic/claude-sonnet-5': [2, 10],
  'anthropic/claude-haiku-4-5': [1, 5],
  'openai/gpt-5.6-sol': [2, 12],
  'google/gemini-3.6-flash': [0.3, 2.5],
}

export function costOf(model: string, inTok: number, outTok: number, cachedTok = 0): number {
  const [pin, pout] = PRICE[model] ?? [5, 25]
  const fresh = Math.max(0, inTok - cachedTok)
  return (fresh * pin + cachedTok * pin * 0.1 + outTok * pout) / 1_000_000
}

export interface ModelCall<T> {
  output: T
  model: string
  tokensIn: number
  tokensOut: number
  cachedTokens: number
  costUsd: number
  latencyMs: number
}

const TIMEOUT: Record<DeskJob, number> = { panel: 110_000, bench: 110_000, classify: 30_000, draft: 90_000 }

/**
 * Structured call with a cached system prefix.
 *
 * The prefix (rubric, briefs, examples) is marked for provider-side caching so
 * the second candidate of the day pays a tenth for it. If the gateway rejects
 * the cache option for a model, the same call is retried without it: an option
 * is never allowed to turn a working call into a failed one.
 */
/** Thinking depth per job. Output tokens are the cost driver on Opus, and grading a CV does not need `high`. */
const EFFORT: Record<DeskJob, 'low' | 'medium' | 'high'> = { panel: 'medium', bench: 'low', classify: 'low', draft: 'medium' }

export async function structured<T>(
  job: DeskJob,
  input: { system: string; user: string; schema: z.ZodType<T>; maxOutputTokens?: number },
): Promise<ModelCall<T>> {
  let lastError: unknown
  for (const model of CHAINS[job]) {
    for (const withCache of [true, false]) {
      const startedAt = Date.now()
      try {
        const { output, usage } = await generateText({
          model,
          output: Output.object({ schema: input.schema }),
          maxOutputTokens: input.maxOutputTokens ?? 4000,
          maxRetries: 0,
          abortSignal: AbortSignal.timeout(TIMEOUT[job]),
          ...(withCache && model.startsWith('anthropic/') ? { providerOptions: { anthropic: { effort: EFFORT[job] } } } : {}),
          messages: [
            {
              role: 'system',
              content: input.system,
              ...(withCache && model.startsWith('anthropic/')
                ? { providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } } }
                : {}),
            },
            { role: 'user', content: input.user },
          ],
        })
        const tokensIn = usage?.inputTokens ?? 0
        const tokensOut = usage?.outputTokens ?? 0
        const u = usage as { cachedInputTokens?: number; inputTokenDetails?: { cacheReadTokens?: number } } | undefined
        const cached = u?.inputTokenDetails?.cacheReadTokens ?? u?.cachedInputTokens ?? 0
        const latencyMs = Date.now() - startedAt
        console.log(`[desk:${job}] ok model=${model} ms=${latencyMs} in=${tokensIn} cached=${cached} out=${tokensOut}`)
        return { output, model, tokensIn, tokensOut, cachedTokens: cached, costUsd: costOf(model, tokensIn, tokensOut, cached), latencyMs }
      } catch (err) {
        lastError = err
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`[desk:${job}] model=${model} cache=${withCache} failed after ${Date.now() - startedAt}ms: ${msg.slice(0, 200)}`)
        // A timeout or a quota error will hit the no-cache retry too; move on.
        if (!withCache || /timeout|abort|429|quota|credit/i.test(msg)) break
      }
    }
  }
  throw new Error(`[desk:${job}] no model answered: ${lastError instanceof Error ? lastError.message : 'unknown'}`)
}
