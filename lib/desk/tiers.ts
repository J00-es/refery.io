/**
 * Logos and schools, looked up before the model runs so "big logo" is a fact
 * on the card rather than an opinion. companies_tiers and schools_tiers are
 * Lily's own tables (S+ down to D); anything not in them is `null`, and the
 * panel may still call it out from its own knowledge, marked as such.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface Logo {
  name: string
  kind: 'company' | 'school'
  tier: string | null
  /** From the table, or the model's own read when the table had no row. */
  source: 'table' | 'model'
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/\b(inc|llc|ltd|corp|corporation|co|the|university of|university)\b\.?/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

interface TierRow {
  name: string
  normalized_name: string | null
  aliases: string[] | null
  tier: string | null
}

let cache: { at: number; companies: TierRow[]; schools: TierRow[] } | null = null

async function tables(admin: SupabaseClient): Promise<{ companies: TierRow[]; schools: TierRow[] }> {
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache
  const [{ data: c }, { data: s }] = await Promise.all([
    admin.from('companies_tiers').select('name, normalized_name, aliases, tier_engineering, tier_sales'),
    admin.from('schools_tiers').select('name, normalized_name, aliases, tier'),
  ])
  const companies = (c ?? []).map(r => ({
    name: r.name as string,
    normalized_name: (r.normalized_name as string) ?? null,
    aliases: (r.aliases as string[]) ?? null,
    // The better of the two tracks; the card says which function the person is in anyway.
    tier: best((r.tier_engineering as string) ?? null, (r.tier_sales as string) ?? null),
  }))
  const schools = (s ?? []).map(r => ({
    name: r.name as string,
    normalized_name: (r.normalized_name as string) ?? null,
    aliases: (r.aliases as string[]) ?? null,
    tier: (r.tier as string) ?? null,
  }))
  cache = { at: Date.now(), companies, schools }
  return cache
}

const RANK = ['S+', 'S', 'A', 'B', 'C', 'D']
function best(a: string | null, b: string | null): string | null {
  const ia = a ? RANK.indexOf(a) : -1
  const ib = b ? RANK.indexOf(b) : -1
  if (ia < 0) return b
  if (ib < 0) return a
  return ia <= ib ? a : b
}

function find(rows: TierRow[], raw: string): TierRow | null {
  const n = norm(raw)
  if (!n) return null
  for (const r of rows) {
    const keys = [r.normalized_name ?? '', r.name, ...(r.aliases ?? [])].map(norm).filter(Boolean)
    // Exact only. "eastern illinois" must not inherit "illinois urbana champaign"
    // through a shared word; a false tier on a card is worse than none.
    if (keys.some(k => k === n)) return r
  }
  return null
}

export async function lookupLogos(
  admin: SupabaseClient,
  companies: string[],
  schools: string[],
): Promise<Logo[]> {
  const t = await tables(admin)
  const out: Logo[] = []
  const seen = new Set<string>()
  for (const c of companies) {
    const key = `c:${norm(c)}`
    if (!norm(c) || seen.has(key)) continue
    seen.add(key)
    const hit = find(t.companies, c)
    out.push({ name: hit?.name ?? c.trim(), kind: 'company', tier: hit?.tier ?? null, source: 'table' })
  }
  for (const s of schools) {
    const key = `s:${norm(s)}`
    if (!norm(s) || seen.has(key)) continue
    seen.add(key)
    const hit = find(t.schools, s)
    out.push({ name: hit?.name ?? s.trim(), kind: 'school', tier: hit?.tier ?? null, source: 'table' })
  }
  return out
}

/** "S+" and "S" read as tier 1 to a human; the card says it that way. */
export function tierWord(tier: string | null): string | null {
  if (!tier) return null
  if (tier === 'S+' || tier === 'S') return 'tier 1'
  if (tier === 'A') return 'tier 2'
  if (tier === 'B') return 'tier 3'
  return null
}
