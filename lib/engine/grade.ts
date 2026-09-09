/**
 * The grade contract, frozen in one place.
 *
 * A grade is a rubric label. It is not a population percentile: nothing in
 * the system measures a population, so "top 10% of L2 engineers" was a claim
 * without a denominator (audit finding 6). Consumers render the label and the
 * criterion from here and never from the model's prose.
 */

export const GRADE_CONTRACT_VERSION = 'grade-v1' as const

export type Grade = 'A+' | 'A' | 'A-' | 'B+' | 'pass'

export interface GradeSpec {
  grade: Grade
  /** Short, criterion-based, what the reader sees next to the letter. */
  label: string
  /** The rubric line the panel grades against. */
  criterion: string
  /** Rank for comparisons (higher is stronger). */
  rank: number
  /** At or above the intro bar. A default, not a gate. */
  meetsBar: boolean
}

export const GRADES: Record<Grade, GradeSpec> = {
  'A+': { grade: 'A+', rank: 5, meetsBar: true, label: 'exceptional evidence', criterion: 'Clear zero-to-one ownership with numbers, at a level a founder would interrupt a meeting for. Rare.' },
  A: { grade: 'A', rank: 4, meetsBar: true, label: 'strong evidence', criterion: 'Zero-to-one ownership with numbers, strong logos or an exceptional trajectory, and current AI-native work.' },
  'A-': { grade: 'A-', rank: 3, meetsBar: true, label: 'strong, the intro bar', criterion: 'Real ownership on the CV; would get a call at most clients.' },
  'B+': { grade: 'B+', rank: 2, meetsBar: false, label: 'solid, generic for our seats', criterion: 'Employable, but process work, maintenance, no zero-to-one, no numbers, or the wrong shape for the seats we work.' },
  pass: { grade: 'pass', rank: 1, meetsBar: false, label: 'below the bar, or not placeable by us', criterion: 'Below B+, or a profile Refery cannot place today.' },
}

export function isGrade(x: unknown): x is Grade {
  return typeof x === 'string' && x in GRADES
}

export function gradeSpec(g: string | null | undefined): GradeSpec | null {
  return isGrade(g) ? GRADES[g] : null
}

/** "A- · strong, the intro bar" */
export function gradeLabel(g: string | null | undefined): string {
  const s = gradeSpec(g)
  return s ? `${s.grade} · ${s.label}` : (g ?? 'ungraded')
}

const PERCENTILE = /\b(top|bottom)\s*~?\s*\d{1,3}(\.\d+)?\s*%(\s*(of|among|for)\b)?/gi
const ORDINAL_CLAIM = /\b(one of the )?(best|strongest|weakest)\s+\d+%/gi

/** Remove population claims from a line of prose. Keeps the rest untouched. */
export function stripPercentiles(text: string | null | undefined): string {
  if (!text) return ''
  return text
    .replace(PERCENTILE, '')
    .replace(ORDINAL_CLAIM, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,;:·-]+|[\s,;:·-]+$/g, '')
    .trim()
}

export function hasPercentile(text: string | null | undefined): boolean {
  if (!text) return false
  return new RegExp(PERCENTILE.source, 'i').test(text) || new RegExp(ORDINAL_CLAIM.source, 'i').test(text)
}

/**
 * The line a card shows under the letter. Deterministic: the level and the
 * function are structured fields; the peer line is the model's description of
 * the kind of work, with any percentile removed.
 */
export function positioningLine(input: { grade: string | null; level?: string | null; fn?: string | null; peerLine?: string | null }): string {
  const spec = gradeSpec(input.grade)
  const who = [input.level, input.fn].filter(Boolean).join(' ')
  const peer = stripPercentiles(input.peerLine)
  const parts = [spec ? spec.label : null, who || null, peer || null].filter(Boolean)
  return parts.join(' · ')
}
