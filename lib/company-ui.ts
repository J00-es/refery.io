/**
 * Shared formatting for the companies surfaces. Visual tokens come from
 * lib/candidate-ui.ts so both pages stay one system.
 */

// ── funding ─────────────────────────────────────────────────────────────────
/** $850K · $45M · $1.2B — never more than 4 significant characters. */
export function formatMoney(usd?: number | null): string | null {
  if (usd == null || usd <= 0) return null
  if (usd >= 1_000_000_000) {
    const b = usd / 1_000_000_000
    return `$${b >= 10 ? Math.round(b) : b.toFixed(1).replace(/\.0$/, '')}B`
  }
  if (usd >= 1_000_000) {
    const m = usd / 1_000_000
    return `$${m >= 10 ? Math.round(m) : m.toFixed(1).replace(/\.0$/, '')}M`
  }
  if (usd >= 1_000) return `$${Math.round(usd / 1_000)}K`
  return `$${usd}`
}

/** "Mar 2026" — a funding date only needs month precision. */
export function formatFundingDate(d?: string | null): string | null {
  if (!d) return null
  const date = new Date(d)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}

/** Months since the round closed — drives the "fresh capital" signal. */
export function monthsSince(d?: string | null): number | null {
  if (!d) return null
  const date = new Date(d)
  if (Number.isNaN(date.getTime())) return null
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24 * 30.44)))
}

/**
 * Crunchbase round labels are verbose and inconsistent ("Venture - Series
 * Unknown", "Non-equity Assistance"). Shorten to something that fits a chip
 * without losing the meaning.
 */
export function shortRound(type?: string | null): string | null {
  if (!type) return null
  const map: Record<string, string> = {
    'Venture - Series Unknown': 'Venture',
    'Non-equity Assistance': 'Non-equity',
    'Post-IPO Equity': 'Post-IPO',
    'Post-IPO Debt': 'Post-IPO debt',
    'Post-IPO Secondary': 'Post-IPO 2nd',
    'Debt Financing': 'Debt',
    'Private Equity': 'PE',
    'Secondary Market': 'Secondary',
    'Convertible Note': 'Convertible',
    'Corporate Round': 'Corporate',
    'Initial Coin Offering': 'ICO',
    'Equity Crowdfunding': 'Crowdfunding',
    'Product Crowdfunding': 'Crowdfunding',
  }
  return map[type] ?? type
}

// ── stage ───────────────────────────────────────────────────────────────────
export const STAGE_ORDER = [
  'pre-seed',
  'seed',
  'series-a',
  'series-b',
  'series-c',
  'series-d',
  'series-e',
  'series-f',
  'series-g',
  'series-h',
  'growth',
  'established',
  'public',
] as const

export function stageLabel(stage?: string | null): string | null {
  if (!stage) return null
  const s = stage.toLowerCase()
  if (s.startsWith('series-')) return `Series ${s.slice(7).toUpperCase()}`
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' ')
}

/**
 * A single accent per stage band, low chroma so a grid of cards stays calm:
 * early = forest, mid = slate, late/public = stone.
 */
export function stageTint(stage?: string | null): string {
  const s = (stage || '').toLowerCase()
  if (s === 'pre-seed' || s === 'seed') return 'bg-[#E9F0EC] text-[#1F4D3A]'
  if (s.startsWith('series-a') || s.startsWith('series-b')) return 'bg-[#E7EDF2] text-[#3F5A70]'
  if (s.startsWith('series-')) return 'bg-[#F0EAE2] text-[#7A6250]'
  if (s === 'growth') return 'bg-[#F3F1E6] text-[#6E6A2E]'
  return 'bg-[#F0F0EA] text-[#6E6E68]'
}

// ── size bands for the funding filter ───────────────────────────────────────
export const RAISE_BANDS = [
  { key: 'lt5', label: 'Under $5M', min: 0, max: 5_000_000 },
  { key: '5to25', label: '$5–25M', min: 5_000_000, max: 25_000_000 },
  { key: '25to100', label: '$25–100M', min: 25_000_000, max: 100_000_000 },
  { key: 'gte100', label: '$100M+', min: 100_000_000, max: null },
] as const

export const RECENCY_BANDS = [
  { key: '6mo', label: 'Last 6 months', months: 6 },
  { key: '12mo', label: 'Last 12 months', months: 12 },
  { key: '24mo', label: 'Last 2 years', months: 24 },
] as const

/** Round types worth exposing as a filter; the long tail stays searchable. */
export const ROUND_TYPES = [
  'Pre-Seed',
  'Seed',
  'Series A',
  'Series B',
  'Series C',
  'Series D',
  'Grant',
  'Debt Financing',
  'Private Equity',
] as const

export const COMPANY_SORTS = [
  { key: 'recent_funding', label: 'Recently funded' },
  { key: 'largest_round', label: 'Largest round' },
  { key: 'name', label: 'Name A–Z' },
  { key: 'newest', label: 'Newest added' },
] as const

/** Employee-count strings arrive in several shapes; normalise for display. */
export function employeeLabel(v?: string | null): string | null {
  if (!v) return null
  const t = v.trim()
  return /^\d/.test(t) ? `${t} emp` : t
}

/**
 * Hosts that no longer serve logos. Clearbit's free logo API was retired, and
 * `logo.clearbit.com` now fails to connect at all rather than returning 404 —
 * so the request hangs, `onError` never fires, and the browser leaves a broken
 * image box on the card. 10,612 of the 11,831 stored logo URLs point there.
 *
 * Filtering at render time rather than nulling the column keeps the URLs
 * around in case the logos get re-sourced from these slugs later.
 */
const DEAD_LOGO_HOSTS = ['logo.clearbit.com']

/** The logo URL to actually render, or null to fall back to initials. */
export function usableLogo(url?: string | null): string | null {
  if (!url) return null
  try {
    const host = new URL(url).hostname.toLowerCase()
    return DEAD_LOGO_HOSTS.includes(host) ? null : url
  } catch {
    return null
  }
}

/** top_investors is a comma-separated string; show the first few. */
export function investorList(v?: string | null, take = 2): { shown: string[]; extra: number } {
  if (!v) return { shown: [], extra: 0 }
  const all = v
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
  return { shown: all.slice(0, take), extra: Math.max(0, all.length - take) }
}
