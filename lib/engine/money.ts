/**
 * Pay comparisons, in code, never in a prompt.
 *
 * Current pay, target pay, base, OTE and equity are different numbers with a
 * currency and a period each. Two numbers are compared only when both are the
 * same kind in the same currency for the same period; otherwise the answer is
 * "not comparable", which is a question for the call, not a blocker. A low
 * ask says nothing about capability or level (audit finding 8).
 */

export type PayKind = 'base' | 'ote' | 'total' | 'unknown'

export interface Money {
  amount: number
  currency: string
  /** annual unless said otherwise */
  period?: 'year' | 'month' | 'day' | 'hour'
  kind: PayKind
}

export interface Band {
  min: number | null
  max: number | null
  currency: string
  kind: PayKind
  period?: 'year' | 'month' | 'day' | 'hour'
}

export type BandPosition = 'inside' | 'at_maximum' | 'at_minimum' | 'below' | 'above' | 'not_comparable' | 'unknown'

export interface BandComparison {
  position: BandPosition
  /** Signed, positive when the ask is above the maximum. Null when not comparable. */
  gapToMax: number | null
  gapToMin: number | null
  detail: string
}

export function normalizeCurrency(raw: string | null | undefined): string {
  const c = (raw ?? '').trim().toUpperCase()
  if (!c) return 'USD'
  if (c === '$' || c === 'US$') return 'USD'
  if (c === '€') return 'EUR'
  if (c === '£') return 'GBP'
  return c
}

const k = (n: number, currency: string) => {
  const sym = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : `${currency} `
  return `${sym}${Math.round(n / 1000)}k`
}

export function formatMoney(n: number, currency = 'USD'): string {
  return k(n, normalizeCurrency(currency))
}

export function compareAskToBand(ask: Money | null, band: Band | null): BandComparison {
  if (!ask || !band || (band.min == null && band.max == null)) {
    return { position: 'unknown', gapToMax: null, gapToMin: null, detail: 'ask or band not on record' }
  }
  const ac = normalizeCurrency(ask.currency)
  const bc = normalizeCurrency(band.currency)
  if (ac !== bc) {
    return { position: 'not_comparable', gapToMax: null, gapToMin: null, detail: `ask in ${ac}, band in ${bc}; not compared until converted on the call` }
  }
  if ((ask.period ?? 'year') !== (band.period ?? 'year')) {
    return { position: 'not_comparable', gapToMax: null, gapToMin: null, detail: 'ask and band use different pay periods' }
  }
  if (ask.kind === 'unknown' || band.kind === 'unknown') {
    return { position: 'not_comparable', gapToMax: null, gapToMin: null, detail: 'not known whether the figures are base or total' }
  }
  if (ask.kind !== band.kind) {
    return { position: 'not_comparable', gapToMax: null, gapToMin: null, detail: `ask is ${ask.kind}, band is ${band.kind}; not the same number` }
  }
  const a = ask.amount
  const min = band.min
  const max = band.max
  if (max != null && a > max) {
    return { position: 'above', gapToMax: a - max, gapToMin: min != null ? a - min : null, detail: `ask ${k(a, ac)} is ${k(a - max, ac)} above the band maximum ${k(max, ac)}` }
  }
  if (min != null && a < min) {
    return { position: 'below', gapToMax: max != null ? a - max : null, gapToMin: a - min, detail: `ask ${k(a, ac)} is ${k(min - a, ac)} below the band minimum ${k(min, ac)}` }
  }
  if (max != null && a === max) {
    return { position: 'at_maximum', gapToMax: 0, gapToMin: min != null ? a - min : null, detail: `ask ${k(a, ac)} is at the band maximum` }
  }
  if (min != null && a === min) {
    return { position: 'at_minimum', gapToMax: max != null ? a - max : null, gapToMin: 0, detail: `ask ${k(a, ac)} is at the band minimum` }
  }
  const where = min != null && max != null ? `inside the ${k(min, ac)} to ${k(max, ac)} band` : max != null ? `under the ${k(max, ac)} maximum` : `above the ${k(min!, ac)} minimum`
  return { position: 'inside', gapToMax: max != null ? a - max : null, gapToMin: min != null ? a - min : null, detail: `ask ${k(a, ac)} is ${where}` }
}

/** Parse "$180k", "180000", "€120k", "150-170k" (first number), "OTE 200k". */
export function parseMoney(raw: string | number | null | undefined, fallbackCurrency = 'USD'): Money | null {
  if (raw == null) return null
  if (typeof raw === 'number') return raw > 0 ? { amount: raw, currency: fallbackCurrency, kind: 'unknown' } : null
  const s = raw.trim()
  if (!s) return null
  const currency = /€|eur/i.test(s) ? 'EUR' : /£|gbp/i.test(s) ? 'GBP' : /\$|usd/i.test(s) ? 'USD' : fallbackCurrency
  const kind: PayKind = /\bote\b|on.target/i.test(s) ? 'ote' : /\btotal\b|\btc\b/i.test(s) ? 'total' : /\bbase\b/i.test(s) ? 'base' : 'unknown'
  const m = s.replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*(k|m)?/i)
  if (!m) return null
  let amount = Number(m[1])
  if (m[2]?.toLowerCase() === 'k') amount *= 1000
  if (m[2]?.toLowerCase() === 'm') amount *= 1_000_000
  if (amount < 1000) amount *= 1000 // "180" means 180k in this house
  return { amount, currency, kind }
}
