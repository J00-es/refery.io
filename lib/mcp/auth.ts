/**
 * The desk MCP, the key.
 *
 * One user, one bearer key, issued from /admin/settings#mcp and shown once.
 * Only its SHA-256 is stored, in desk_settings under 'mcp_token', so a read of
 * the settings table never yields a working key. Rotating issues a new one and
 * the old one stops at the same moment; revoking leaves no key at all, and the
 * endpoint answers 401 to everything until a new one is issued.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

export const TOKEN_KEY = 'mcp_token'
const PREFIX = 'rfy_'

export interface TokenRecord {
  hash: string
  /** The last four characters, so the settings page can say which key is live. */
  hint: string
  created_at: string
  last_used_at: string | null
}

export function newToken(): string {
  return PREFIX + randomBytes(24).toString('hex')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function bearerFrom(header: string | null | undefined): string | null {
  if (!header) return null
  const m = /^Bearer\s+(\S+)$/i.exec(header.trim())
  return m ? m[1] : null
}

export function tokenMatches(presented: string, storedHash: string): boolean {
  const a = Buffer.from(hashToken(presented), 'hex')
  const b = Buffer.from(storedHash, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function loadTokenRecord(admin: SupabaseClient): Promise<TokenRecord | null> {
  const { data } = await admin.from('desk_settings').select('value').eq('key', TOKEN_KEY).maybeSingle()
  const v = data?.value as Partial<TokenRecord> | null | undefined
  return v && typeof v.hash === 'string' && v.hash.length === 64
    ? { hash: v.hash, hint: v.hint ?? '', created_at: v.created_at ?? '', last_used_at: v.last_used_at ?? null }
    : null
}

/** Issues a fresh key, replacing any earlier one. The plaintext is returned once and never stored. */
export async function issueToken(admin: SupabaseClient): Promise<string> {
  const token = newToken()
  const record: TokenRecord = { hash: hashToken(token), hint: token.slice(-4), created_at: new Date().toISOString(), last_used_at: null }
  await admin.from('desk_settings').upsert({ key: TOKEN_KEY, value: record as never, updated_at: record.created_at }, { onConflict: 'key' })
  return token
}

export async function revokeToken(admin: SupabaseClient): Promise<void> {
  await admin.from('desk_settings').delete().eq('key', TOKEN_KEY)
}

export type AuthOutcome = { ok: true; record: TokenRecord } | { ok: false; reason: 'no_key_issued' | 'missing' | 'wrong' }

/**
 * Checks the Authorization header against the stored hash and stamps
 * last_used_at at most once a minute, so a busy session is not a write per call.
 */
export async function authenticate(admin: SupabaseClient, authorization: string | null | undefined): Promise<AuthOutcome> {
  const record = await loadTokenRecord(admin)
  if (!record) return { ok: false, reason: 'no_key_issued' }
  const presented = bearerFrom(authorization)
  if (!presented) return { ok: false, reason: 'missing' }
  if (!tokenMatches(presented, record.hash)) return { ok: false, reason: 'wrong' }

  const last = record.last_used_at ? Date.parse(record.last_used_at) : 0
  if (Date.now() - last > 60_000) {
    const next = { ...record, last_used_at: new Date().toISOString() }
    await admin.from('desk_settings').update({ value: next as never }).eq('key', TOKEN_KEY)
    return { ok: true, record: next }
  }
  return { ok: true, record }
}
