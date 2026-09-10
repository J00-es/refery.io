/**
 * A partner's own link: refery.xyz/r/<code>.
 *
 * One active code per person. Minted as five random characters from the
 * brief-slug alphabet, and replaceable by something they can remember
 * ("maya", "maya-okafor"). A replaced code is retired, not killed: a link
 * already pasted into a DM keeps working. A revoked code (abuse) shows the
 * closed page. Uniqueness is the table's primary key, so two people can never
 * hold the same code, whatever the race.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'https://refery.xyz').replace(/\/$/, '')

/** No 0/O/1/l/i, as in lib/hm-brief.ts. */
const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz'
const MINTED_LENGTH = 5
export const CODE_MIN = 3
export const CODE_MAX = 30
export const CODE_RE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/

/** Words a code may not be: routes, brands, and things that would read as ours. */
const RESERVED = new Set([
  'refery', 'lily', 'admin', 'join', 'apply', 'start', 'go', 'r', 'j', 'me', 'c', 'b', 'sign', 'api', 'auth', 'login', 'signup', 'sign-up',
  'candidates', 'searches', 'partners', 'pipeline', 'firm', 'jobs', 'companies', 'dashboard', 'help', 'support', 'hello', 'team', 'www',
  'test', 'null', 'undefined', 'about', 'terms', 'privacy', 'slack', 'invite', 'intro', 'share', 'link', 'referral', 'refer',
])

export function mintCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(MINTED_LENGTH))
  return Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join('')
}

export function referralUrl(code: string): string {
  return `${APP_URL}/r/${code}`
}

/** Lower-case, spaces and punctuation to hyphens, no leading or trailing hyphen. */
export function normaliseCode(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, CODE_MAX)
}

export type CodeProblem = 'too_short' | 'too_long' | 'characters' | 'reserved'

/** Why a chosen code cannot be used, before the database is asked. */
export function codeProblem(code: string): CodeProblem | null {
  if (code.length < CODE_MIN) return 'too_short'
  if (code.length > CODE_MAX) return 'too_long'
  if (!CODE_RE.test(code)) return 'characters'
  if (RESERVED.has(code)) return 'reserved'
  return null
}

export const CODE_PROBLEM_TEXT: Record<CodeProblem, string> = {
  too_short: 'At least three characters.',
  too_long: 'Thirty characters at most.',
  characters: 'Letters, numbers and hyphens only.',
  reserved: 'That one is taken by Refery itself. Try another.',
}

export interface ShareCode {
  code: string
  userId: string
  status: 'active' | 'retired' | 'revoked'
  kind: 'minted' | 'chosen' | 'rotated'
}

/** The person's active code, minting one on first use. */
export async function ensureShareCode(admin: SupabaseClient, userId: string): Promise<string> {
  const { data } = await admin.from('share_codes').select('code').eq('user_id', userId).eq('status', 'active').maybeSingle()
  if (data?.code) return data.code as string
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = mintCode()
    const { error } = await admin.from('share_codes').insert({ code, user_id: userId, status: 'active', kind: 'minted' })
    if (!error) return code
    // A collision on the primary key, or the partial unique index because a
    // parallel request minted first: read it back.
    if (error.code === '23505') {
      const { data: again } = await admin.from('share_codes').select('code').eq('user_id', userId).eq('status', 'active').maybeSingle()
      if (again?.code) return again.code as string
      continue
    }
    throw new Error(`share code: ${error.message}`)
  }
  throw new Error('share code: could not mint a unique code')
}

/** Every code that resolves to this person (active first), for the share panel and telemetry. */
export async function codesFor(admin: SupabaseClient, userId: string): Promise<string[]> {
  const { data } = await admin.from('share_codes').select('code, status').eq('user_id', userId).neq('status', 'revoked').order('created_at', { ascending: false })
  const rows = (data ?? []) as { code: string; status: string }[]
  return [...rows.filter(r => r.status === 'active'), ...rows.filter(r => r.status !== 'active')].map(r => r.code)
}

/** Who a code belongs to. Null for unknown or revoked, and the caller shows the same closed page for both. */
export async function resolveCode(admin: SupabaseClient, raw: string): Promise<{ code: string; userId: string; status: 'active' | 'retired' } | null> {
  const code = raw.toLowerCase()
  if (!CODE_RE.test(code)) return null
  const { data } = await admin.from('share_codes').select('code, user_id, status').eq('code', code).maybeSingle()
  if (!data || data.status === 'revoked') return null
  return { code: data.code as string, userId: data.user_id as string, status: data.status as 'active' | 'retired' }
}

/** Three codes near the one they wanted, none of them taken. */
export async function suggestCodes(admin: SupabaseClient, wanted: string, fullName: string | null): Promise<string[]> {
  const base = normaliseCode(wanted) || 'me'
  const first = normaliseCode((fullName ?? '').split(/\s+/)[0] ?? '')
  const last = normaliseCode((fullName ?? '').split(/\s+/).slice(-1)[0] ?? '')
  const candidates = [
    first && last && first !== last ? `${first}-${last}` : null,
    `${base}-${Math.floor(10 + Math.random() * 90)}`,
    `${base}-refers`,
    `${base}-${mintCode().slice(0, 3)}`,
    first ? `${first}-${mintCode().slice(0, 2)}` : null,
  ].filter((c): c is string => !!c && c !== base && !codeProblem(c))
  const unique = [...new Set(candidates)]
  if (!unique.length) return []
  const { data } = await admin.from('share_codes').select('code').in('code', unique)
  const taken = new Set((data ?? []).map(r => r.code as string))
  return unique.filter(c => !taken.has(c)).slice(0, 3)
}

export type ClaimResult = { ok: true; code: string } | { ok: false; reason: CodeProblem | 'taken' | 'same'; message: string; suggestions: string[] }

/**
 * Replace the person's active code with one they chose. The old one is
 * retired and keeps resolving. Refuses a code anyone else holds, active or
 * retired, and says so with three free alternatives.
 */
export async function claimCode(admin: SupabaseClient, userId: string, raw: string, fullName: string | null): Promise<ClaimResult> {
  const code = normaliseCode(raw)
  const problem = codeProblem(code)
  if (problem) return { ok: false, reason: problem, message: CODE_PROBLEM_TEXT[problem], suggestions: await suggestCodes(admin, code, fullName) }

  const { data: existing } = await admin.from('share_codes').select('code, user_id, status').eq('code', code).maybeSingle()
  if (existing && existing.user_id === userId) {
    if (existing.status === 'active') return { ok: false, reason: 'same', message: 'That is already your link.', suggestions: [] }
    // Bringing back one of their own retired codes: swap it in.
    await admin.from('share_codes').update({ status: 'retired', retired_at: new Date().toISOString() }).eq('user_id', userId).eq('status', 'active')
    await admin.from('share_codes').update({ status: 'active', retired_at: null, kind: 'chosen' }).eq('code', code)
    return { ok: true, code }
  }
  if (existing) return { ok: false, reason: 'taken', message: 'Someone already has that link. Try one of these.', suggestions: await suggestCodes(admin, code, fullName) }

  // Retire, then insert. Insert first would trip the one-active index; the
  // primary key still refuses a parallel claim of the same code.
  const now = new Date().toISOString()
  await admin.from('share_codes').update({ status: 'retired', retired_at: now }).eq('user_id', userId).eq('status', 'active')
  const { error } = await admin.from('share_codes').insert({ code, user_id: userId, status: 'active', kind: 'chosen' })
  if (error) {
    // Lost the race: put the old code back and report it as taken.
    await admin.from('share_codes').update({ status: 'active', retired_at: null }).eq('user_id', userId).eq('retired_at', now)
    if (error.code === '23505') return { ok: false, reason: 'taken', message: 'Someone already has that link. Try one of these.', suggestions: await suggestCodes(admin, code, fullName) }
    throw new Error(`share code: ${error.message}`)
  }
  return { ok: true, code }
}

/**
 * Abuse or a leak: every code the person holds stops resolving and a fresh
 * minted one takes over. Old links show the closed page from this minute.
 */
export async function rotateCode(admin: SupabaseClient, userId: string): Promise<string> {
  const now = new Date().toISOString()
  await admin.from('share_codes').update({ status: 'revoked', retired_at: now }).eq('user_id', userId).neq('status', 'revoked')
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = mintCode()
    const { error } = await admin.from('share_codes').insert({ code, user_id: userId, status: 'active', kind: 'rotated' })
    if (!error) return code
    if (error.code !== '23505') throw new Error(`share code: ${error.message}`)
  }
  throw new Error('share code: could not mint a unique code')
}
