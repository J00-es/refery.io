/**
 * Legacy human-label parsing, as a migration aid only.
 *
 * candidates.lily_verdict carries three generations of meaning: a chip value
 * the app wrote, a first-line token the old skill proposed on Lily's behalf
 * followed by prose, and free prose. None of it proves who wrote it or that a
 * call happened, so anything parsed here is `legacy_unverified` until a human
 * confirms it. Calibration never reads these (audit finding 1).
 */

export type LegacyToken = 'very_strong' | 'strong' | 'moderate' | 'weak' | 'pass'

export interface ParsedLegacyVerdict {
  token: LegacyToken | null
  /** 'low' is stored by the Weak chip; recorded so the alias is visible. */
  aliasOf: string | null
  prose: string
  multiline: boolean
  provenance: 'legacy_unverified'
}

const ALIASES: Record<string, LegacyToken> = {
  very_strong: 'very_strong',
  strong: 'strong',
  moderate: 'moderate',
  weak: 'weak',
  low: 'weak',
  pass: 'pass',
}

export function parseLegacyVerdict(raw: string | null | undefined): ParsedLegacyVerdict | null {
  if (raw == null) return null
  const text = raw.trim()
  if (!text) return null
  const lines = text.split(/\r?\n/)
  const first = lines[0].trim().toLowerCase()
  const token = ALIASES[first] ?? null
  return {
    token,
    aliasOf: token && first !== token ? first : null,
    prose: token ? lines.slice(1).join('\n').trim() : text,
    multiline: lines.length > 1,
    provenance: 'legacy_unverified',
  }
}

/**
 * The two historical mappings, kept side by side so nobody silently picks
 * one. Neither is used for calibration; they document the disagreement.
 */
export const LEGACY_MAPPINGS = {
  desk_2026_09: { very_strong: 'A+', strong: 'A', moderate: 'A-', weak: 'B+', pass: 'pass' },
  skill_v3_1: { very_strong: 'A', strong: 'A-', moderate: 'B+', weak: 'B', low: 'B', pass: 'B-' },
} as const
