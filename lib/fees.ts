/**
 * What a placement is worth, and to whom.
 *
 * Refery charges the client a percentage of the hire's first-year base salary and
 * pays the referring scout most of it. Both numbers have defaults, and a mandate
 * can override either — so the arithmetic lives here rather than being re-derived
 * at each render site, where the default would inevitably drift.
 *
 * Context worth having: the industry sits at 15–30% of first-year salary, ~20%
 * typical for tech. Refery's 10% is deliberately below that — this is a scout
 * network, not a retained agency — and the scout keeps 70% of it, against the
 * ~50% or less a traditional agency splits. Both facts are worth stating plainly
 * on the surfaces a scout reads, which is what `feeExplanation` is for.
 *
 * The honest-unknown case matters as much as the arithmetic. 87% of rows in
 * `jobs` carry no salary, so for a mandate with no band recorded there is no
 * figure to show. This returns null for the amount and still describes the
 * structure, rather than printing a made-up number or a bare "not set".
 */

/** Percent of first-year base salary charged to the client. */
export const DEFAULT_FEE_PERCENTAGE = 10

/** Percent of that fee paid to the referring scout. */
export const DEFAULT_SCOUT_SHARE = 70

/**
 * The numeric fields accept strings as well as numbers.
 *
 * Two callers feed this: rows out of Postgres, where `numeric` arrives as a
 * string over the wire anyway, and the terms editor, which previews the outcome
 * straight from its uncommitted text inputs. `num()` coerces and rejects, so
 * widening the type here is more honest than casting at each call site.
 */
type Numberish = number | string | null | undefined

export interface FeeTerms {
  salary_min?: Numberish
  salary_max?: Numberish
  /** Percent of base. Null uses DEFAULT_FEE_PERCENTAGE. */
  fee_percentage?: Numberish
  /** A fixed client fee, which wins over the percentage. */
  fee_flat?: Numberish
  /** Percent of the fee to the scout. Null uses DEFAULT_SCOUT_SHARE. */
  scout_share?: Numberish
  /** A hand-set payout, which wins over everything. */
  scout_payout?: Numberish
  payout_note?: string | null
}

export interface ResolvedFee {
  /** Where the figure came from, so the UI can be honest about it. */
  basis: 'fixed_payout' | 'flat_fee' | 'percentage' | 'unknown'
  /** True when nothing on the role overrides the platform defaults. */
  isDefault: boolean
  feePercentage: number
  scoutSharePercentage: number
  /** The salary the fee is computed on. A range when the job posts one. */
  baseLow: number | null
  baseHigh: number | null
  /** Client fee. Null when there is no salary to compute it from. */
  feeLow: number | null
  feeHigh: number | null
  /** What the scout earns. Null when unknowable. */
  payoutLow: number | null
  payoutHigh: number | null
}

/**
 * Resolves a mandate's terms into figures.
 *
 * Precedence, most specific first: a hand-set `scout_payout`, then a flat client
 * fee, then a percentage of base — falling back to the platform defaults for
 * whichever of the percentage and the share is not set.
 */
export function resolveFee(terms: FeeTerms): ResolvedFee {
  const feePercentage = num(terms.fee_percentage) ?? DEFAULT_FEE_PERCENTAGE
  const scoutSharePercentage = num(terms.scout_share) ?? DEFAULT_SCOUT_SHARE
  const isDefault =
    num(terms.fee_percentage) == null &&
    num(terms.scout_share) == null &&
    num(terms.fee_flat) == null &&
    num(terms.scout_payout) == null

  // A posted band gives a range; a single figure gives one number twice.
  const min = num(terms.salary_min)
  const max = num(terms.salary_max)
  const baseLow = min ?? max ?? null
  const baseHigh = max ?? min ?? null

  const base = { feePercentage, scoutSharePercentage, isDefault, baseLow, baseHigh }

  const fixed = num(terms.scout_payout)
  if (fixed != null) {
    return { ...base, basis: 'fixed_payout', feeLow: null, feeHigh: null, payoutLow: fixed, payoutHigh: fixed }
  }

  const flat = num(terms.fee_flat)
  if (flat != null) {
    const payout = round(flat * (scoutSharePercentage / 100))
    return { ...base, basis: 'flat_fee', feeLow: flat, feeHigh: flat, payoutLow: payout, payoutHigh: payout }
  }

  if (baseLow == null || baseHigh == null) {
    return { ...base, basis: 'unknown', feeLow: null, feeHigh: null, payoutLow: null, payoutHigh: null }
  }

  const feeLow = round(baseLow * (feePercentage / 100))
  const feeHigh = round(baseHigh * (feePercentage / 100))
  return {
    ...base,
    basis: 'percentage',
    feeLow,
    feeHigh,
    payoutLow: round(feeLow * (scoutSharePercentage / 100)),
    payoutHigh: round(feeHigh * (scoutSharePercentage / 100)),
  }
}

function num(value: unknown): number | null {
  if (value == null || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

/** Rounded to the nearest hundred: a payout estimate should not imply pennies. */
function round(value: number): number {
  return Math.round(value / 100) * 100
}

// ── formatting ──────────────────────────────────────────────────────────────

/** "$12,600" — a figure someone is deciding on deserves full precision. */
export function money(usd?: number | null): string | null {
  if (usd == null || usd <= 0) return null
  return `$${Math.round(usd).toLocaleString('en-US')}`
}

/** "$120k" — for the salary a fee is computed from, where precision is noise. */
export function shortMoney(usd?: number | null): string | null {
  if (usd == null || usd <= 0) return null
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  return `$${Math.round(usd / 1000)}k`
}

function range(low: number | null, high: number | null, fmt = money): string | null {
  if (low == null && high == null) return null
  if (low != null && high != null && low !== high) return `${fmt(low)}–${fmt(high)}`
  return fmt(low ?? high)
}

/**
 * The headline figure: what this scout earns if their candidate is hired.
 * Null when there is no salary band to compute it from.
 */
export function payoutAmount(fee: ResolvedFee): string | null {
  return range(fee.payoutLow, fee.payoutHigh)
}

/**
 * How the figure was arrived at, in one line a scout can check.
 *
 * "10% of $150–180k base · you keep 70%" is the whole deal in nine words, and it
 * is the same sentence whether or not we could compute an amount — which is the
 * point: a mandate with no salary recorded still tells you the structure.
 */
export function feeExplanation(fee: ResolvedFee): string {
  if (fee.basis === 'fixed_payout') return 'Agreed for this search'
  const share = `you keep ${fee.scoutSharePercentage}%`
  if (fee.basis === 'flat_fee') {
    return `${money(fee.feeLow)} flat fee · ${share}`
  }
  const base = range(fee.baseLow, fee.baseHigh, shortMoney)
  return base
    ? `${fee.feePercentage}% of ${base} base · ${share}`
    : `${fee.feePercentage}% of base · ${share} · base not recorded yet`
}

/** The client-side total, for the admin who sets terms. */
export function clientFeeAmount(fee: ResolvedFee): string | null {
  return range(fee.feeLow, fee.feeHigh)
}

/**
 * Payout bands for the desk filter. Matched on the low end of the estimate, so a
 * role never appears in a band it cannot actually reach.
 */
export const PAYOUT_BANDS = [
  { key: 'lt5', label: 'Under $5k', min: 0, max: 5_000 },
  { key: '5to10', label: '$5–10k', min: 5_000, max: 10_000 },
  { key: '10to20', label: '$10–20k', min: 10_000, max: 20_000 },
  { key: 'gte20', label: '$20k+', min: 20_000, max: null },
] as const

export function payoutBandOf(fee: ResolvedFee): string | null {
  const amount = fee.payoutLow
  if (amount == null) return null
  const band = PAYOUT_BANDS.find(b => amount >= b.min && (b.max == null || amount < b.max))
  return band?.key ?? null
}
