/**
 * The model route register: one place that says which model may see what,
 * what it costs, and what it supports. lib/desk/model.ts reads its allowlist
 * and prices from here; the benchmark reads its candidate routes from here.
 *
 * `candidateData` is the contractual line: a route may receive candidate
 * documents only if somebody has checked the provider's terms, our account
 * settings and its retention behaviour, and recorded it. A route registered
 * with candidateData = false can be benchmarked on synthetic fixtures and
 * nothing else.
 *
 * Prices are USD per million tokens, list price on the date given, checked
 * against the provider's pricing page. They are planning numbers, not the
 * gateway's invoice; the ledger reconciles the two.
 */

export type Provider = 'anthropic' | 'openai' | 'google'

export interface Route {
  id: string
  provider: Provider
  /** Approved to receive candidate documents. */
  candidateData: boolean
  /** Registered for the blinded benchmark on synthetic fixtures. */
  benchmark: boolean
  /** USD per million: input, output, cache read, cache write. Null when the route does not bill it. */
  price: { input: number; output: number; cacheRead: number | null; cacheWrite: number | null }
  priceCheckedOn: string
  supports: { structuredOutput: boolean; effort: ('none' | 'low' | 'medium' | 'high')[]; promptCache: boolean }
  /** Which provider option carries the effort setting on the AI gateway. */
  effortOption: 'anthropic.effort' | 'openai.reasoningEffort' | 'google.thinkingLevel' | null
  notes?: string
}

export const ROUTES: Record<string, Route> = {
  'anthropic/claude-opus-5': {
    id: 'anthropic/claude-opus-5', provider: 'anthropic', candidateData: true, benchmark: true,
    price: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 }, priceCheckedOn: '2026-09-07',
    supports: { structuredOutput: true, effort: ['low', 'medium', 'high'], promptCache: true }, effortOption: 'anthropic.effort',
    notes: 'Incumbent panel route.',
  },
  'anthropic/claude-sonnet-5': {
    id: 'anthropic/claude-sonnet-5', provider: 'anthropic', candidateData: true, benchmark: true,
    price: { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 }, priceCheckedOn: '2026-09-07',
    supports: { structuredOutput: true, effort: ['low', 'medium', 'high'], promptCache: true }, effortOption: 'anthropic.effort',
    notes: 'Incumbent bench route.',
  },
  'anthropic/claude-haiku-4-5': {
    id: 'anthropic/claude-haiku-4-5', provider: 'anthropic', candidateData: true, benchmark: true,
    price: { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 }, priceCheckedOn: '2026-09-07',
    supports: { structuredOutput: true, effort: ['low', 'medium', 'high'], promptCache: true }, effortOption: 'anthropic.effort',
  },
  'openai/gpt-5.6-sol': {
    id: 'openai/gpt-5.6-sol', provider: 'openai', candidateData: true, benchmark: true,
    // The desk had 2/12 here; official standard pricing on 2026-09-09 is 4/20 (audit finding 14).
    price: { input: 4, output: 20, cacheRead: 0.4, cacheWrite: null }, priceCheckedOn: '2026-09-09',
    supports: { structuredOutput: true, effort: ['none', 'low', 'medium', 'high'], promptCache: true }, effortOption: 'openai.reasoningEffort',
  },
  'google/gemini-3.6-flash': {
    id: 'google/gemini-3.6-flash', provider: 'google', candidateData: true, benchmark: true,
    price: { input: 0.3, output: 2.5, cacheRead: 0.03, cacheWrite: null }, priceCheckedOn: '2026-09-07',
    supports: { structuredOutput: true, effort: [], promptCache: false }, effortOption: null,
    notes: 'Résumé parser route.',
  },
  // ── proposed by the audit; synthetic-fixture benchmark only until the register says otherwise ──
  'openai/gpt-5.6-luna': {
    id: 'openai/gpt-5.6-luna', provider: 'openai', candidateData: false, benchmark: true,
    price: { input: 0.2, output: 1.2, cacheRead: 0.02, cacheWrite: null }, priceCheckedOn: '2026-09-09',
    supports: { structuredOutput: true, effort: ['none', 'low', 'medium'], promptCache: true }, effortOption: 'openai.reasoningEffort',
    notes: 'Audit proposal: extraction, triage, drafts. The Brain already uses it for classification and drafts (no candidate documents).',
  },
  'openai/gpt-5.6-terra': {
    id: 'openai/gpt-5.6-terra', provider: 'openai', candidateData: false, benchmark: true,
    price: { input: 2, output: 12, cacheRead: 0.2, cacheWrite: null }, priceCheckedOn: '2026-09-09',
    supports: { structuredOutput: true, effort: ['none', 'low', 'medium', 'high'], promptCache: true }, effortOption: 'openai.reasoningEffort',
    notes: 'Audit proposal: assessment, scorecards, detailed matching.',
  },
  'openai/text-embedding-3-small': {
    id: 'openai/text-embedding-3-small', provider: 'openai', candidateData: true, benchmark: false,
    price: { input: 0.02, output: 0, cacheRead: null, cacheWrite: null }, priceCheckedOn: '2026-09-09',
    supports: { structuredOutput: false, effort: [], promptCache: false }, effortOption: null,
    notes: 'The only embedding route; the vector column is sized for it.',
  },
  'openai/gpt-4o': {
    id: 'openai/gpt-4o', provider: 'openai', candidateData: true, benchmark: false,
    price: { input: 2.5, output: 10, cacheRead: 1.25, cacheWrite: null }, priceCheckedOn: '2026-09-09',
    supports: { structuredOutput: true, effort: [], promptCache: false }, effortOption: null,
    notes: 'Two legacy routes (generate-email, jobs/parse-url) and the old Python panel still name it.',
  },
  'openai/gpt-5.4-mini': {
    id: 'openai/gpt-5.4-mini', provider: 'openai', candidateData: false, benchmark: true,
    price: { input: 0.75, output: 4.5, cacheRead: 0.075, cacheWrite: null }, priceCheckedOn: '2026-09-09',
    supports: { structuredOutput: true, effort: ['none', 'low', 'medium', 'high'], promptCache: true }, effortOption: 'openai.reasoningEffort',
    notes: 'Audit proposal: benchmark as the cheaper alternative to Terra.',
  },
}

export function routeFor(id: string): Route | null {
  return ROUTES[id] ?? null
}

export function isApprovedForCandidateData(id: string): boolean {
  return ROUTES[id]?.candidateData === true
}

export function isBenchmarkRoute(id: string): boolean {
  return ROUTES[id]?.benchmark === true
}

/** Cost of one call at list price. Unknown routes are priced at the most expensive known route so an estimate never flatters. */
export function costOf(model: string, inTok: number, outTok: number, cachedTok = 0, cacheWriteTok = 0): number {
  const r = ROUTES[model] ?? ROUTES['anthropic/claude-opus-5']
  const fresh = Math.max(0, inTok - cachedTok - cacheWriteTok)
  const cacheRead = r.price.cacheRead ?? r.price.input
  const cacheWrite = r.price.cacheWrite ?? r.price.input
  return (fresh * r.price.input + cachedTok * cacheRead + cacheWriteTok * cacheWrite + outTok * r.price.output) / 1_000_000
}

/** Worst case before dispatch: no cache hit, the full output budget. */
export function worstCaseCost(model: string, inputChars: number, maxOutputTokens: number): number {
  const inTok = Math.ceil(inputChars / 3.5)
  return costOf(model, inTok, maxOutputTokens, 0, 0)
}

/** The provider option carrying the effort level for this route, or nothing. */
export function effortOptions(model: string, effort: 'none' | 'low' | 'medium' | 'high'): Record<string, Record<string, string>> {
  const r = ROUTES[model]
  if (!r || !r.supports.effort.includes(effort)) return {}
  switch (r.effortOption) {
    case 'anthropic.effort':
      return { anthropic: { effort } }
    case 'openai.reasoningEffort':
      return { openai: { reasoningEffort: effort } }
    default:
      return {}
  }
}
