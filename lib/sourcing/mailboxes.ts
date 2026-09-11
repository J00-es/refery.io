/**
 * The mailboxes the desk sends from, and what each can carry today.
 *
 * Three ways to hold a credential, all free:
 *   desk             the desk's own Google token (lily@refery.io), from
 *                    desk_settings, exactly as recaps and desk emails use it
 *   refresh_token    a mailbox connected through the same OAuth flow, its
 *                    refresh token kept on the row
 *   service_account  domain-wide delegation: the service account in
 *                    GOOGLE_SERVICE_ACCOUNT_JSON impersonates the address.
 *                    No consent screen, no expiry, one admin step per
 *                    Workspace organisation.
 *
 * Capacity is a small number on purpose. A new mailbox starts at daily_cap
 * and gains ramp_step every weekday until cap_ceiling; sends made outside
 * this desk are counted through reserved_other rather than by reading every
 * thread. An alias shares its account's allowance, so an alias is entered as
 * the account it belongs to, never as a second mailbox.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createSign } from 'node:crypto'
import { accessToken, profileAs } from '@/lib/google'
import type { MailboxRow } from '@/lib/sourcing/types'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPES = ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.readonly']
const STALE_SYNC_MS = 2 * 60 * 60 * 1000

const cache = new Map<string, { token: string; expiresAt: number }>()

async function mintWithRefreshToken(refreshToken: string): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) return null
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) return null
  const data = (await res.json()) as { access_token?: string; expires_in?: number }
  return data.access_token ?? null
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

/** A JWT bearer grant for one user of the Workspace, signed by the service account. */
async function mintWithServiceAccount(address: string): Promise<string | null> {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) return null
  let sa: { client_email?: string; private_key?: string }
  try {
    sa = JSON.parse(raw)
  } catch {
    return null
  }
  if (!sa.client_email || !sa.private_key) return null
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(JSON.stringify({ iss: sa.client_email, sub: address, scope: SCOPES.join(' '), aud: TOKEN_URL, iat: now, exp: now + 3600 }))
  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${claims}`)
  const signature = signer.sign(sa.private_key.replace(/\\n/g, '\n'), 'base64url')
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claims}.${signature}` }),
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) {
    console.error(`[sourcing:mailboxes] delegation for ${address} refused: ${res.status} ${(await res.text()).slice(0, 200)}`)
    return null
  }
  const data = (await res.json()) as { access_token?: string }
  return data.access_token ?? null
}

export async function mailboxToken(m: MailboxRow): Promise<string | null> {
  const c = cache.get(m.id)
  if (c && c.expiresAt > Date.now() + 60_000) return c.token
  let token: string | null = null
  if (m.credential.kind === 'desk') token = await accessToken()
  else if (m.credential.kind === 'refresh_token') token = await mintWithRefreshToken(m.credential.refresh_token)
  else if (m.credential.kind === 'service_account') token = await mintWithServiceAccount(m.address)
  if (token) cache.set(m.id, { token, expiresAt: Date.now() + 50 * 60_000 })
  return token
}

/** Weekdays between two instants, the ramp's clock. */
function weekdaysSince(iso: string): number {
  const start = new Date(iso)
  const now = new Date()
  let n = 0
  for (let d = new Date(start); d < now; d.setUTCDate(d.getUTCDate() + 1)) {
    const wd = d.getUTCDay()
    if (wd !== 0 && wd !== 6) n++
  }
  return Math.max(0, n - 1)
}

export function effectiveCap(m: MailboxRow): number {
  if (!m.ramp_started_at) return Math.min(m.daily_cap, m.cap_ceiling)
  return Math.min(m.cap_ceiling, m.daily_cap + m.ramp_step * weekdaysSince(m.ramp_started_at))
}

export async function sentToday(admin: SupabaseClient, mailboxId: string): Promise<number> {
  const start = new Date()
  start.setUTCHours(0, 0, 0, 0)
  const { count } = await admin.from('sourcing_events').select('id', { count: 'exact', head: true }).eq('mailbox_id', mailboxId).eq('kind', 'sent').gte('created_at', start.toISOString())
  return count ?? 0
}

export interface MailboxHealth {
  mailbox: MailboxRow
  cap: number
  sent: number
  room: number
  /** Why it will not send right now, or null. */
  blocked: string | null
  replied30: number
  sent30: number
  bounced30: number
}

export async function mailboxHealth(admin: SupabaseClient, m: MailboxRow): Promise<MailboxHealth> {
  const cap = effectiveCap(m)
  const sent = await sentToday(admin, m.id)
  const room = Math.max(0, cap - sent - m.reserved_other)
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const { data: ev } = await admin.from('sourcing_events').select('kind').eq('mailbox_id', m.id).gte('created_at', since).in('kind', ['sent', 'reply', 'bounce'])
  const rows = ev ?? []
  const sent30 = rows.filter(r => r.kind === 'sent').length
  const replied30 = rows.filter(r => r.kind === 'reply').length
  const bounced30 = rows.filter(r => r.kind === 'bounce').length
  let blocked: string | null = null
  if (m.status === 'paused') blocked = 'paused'
  else if (m.status === 'error') blocked = m.last_error ? `error: ${m.last_error.slice(0, 120)}` : 'error'
  else if (m.last_sync_ok === false) blocked = 'reply sync failed; nothing sends until it reads again'
  else if (m.last_sync_at && Date.now() - new Date(m.last_sync_at).getTime() > STALE_SYNC_MS) blocked = 'reply sync is stale'
  else if (sent30 >= 20 && bounced30 / Math.max(1, sent30) > 0.03) blocked = `bounce rate ${Math.round((bounced30 / sent30) * 100)}% over 30 days`
  else if (room <= 0) blocked = 'cap reached for today'
  return { mailbox: m, cap, sent, room, blocked, replied30, sent30, bounced30 }
}

export async function loadMailboxes(admin: SupabaseClient): Promise<MailboxRow[]> {
  const { data } = await admin.from('sourcing_mailboxes').select('*').order('created_at')
  return (data ?? []) as MailboxRow[]
}

/**
 * The desk's own mailbox is always on the list. Adding it here, not in a
 * migration, so the row carries whatever address the desk token belongs to.
 */
export async function ensureDeskMailbox(admin: SupabaseClient): Promise<void> {
  const { count } = await admin.from('sourcing_mailboxes').select('id', { count: 'exact', head: true })
  if (count) return
  const token = await accessToken()
  const p = token ? await profileAs(token) : { email: undefined }
  const address = p.email ?? 'lily@refery.io'
  await admin.from('sourcing_mailboxes').insert({
    address,
    display_name: 'Lily Joo',
    signs_as: 'Lily',
    owner_email: 'lily@10kventures.co',
    credential: { kind: 'desk' },
    daily_cap: 20,
    cap_ceiling: 50,
    ramp_step: 5,
    ramp_started_at: new Date().toISOString(),
    // Recaps, desk emails and founder outbound go out of this box too.
    reserved_other: 10,
    status: 'active',
  })
}

/** Try the credential now: the address it resolves to, or the error. */
export async function testMailbox(m: MailboxRow): Promise<{ ok: boolean; address?: string; error?: string }> {
  const token = await mailboxToken(m)
  if (!token) return { ok: false, error: m.credential.kind === 'service_account' ? 'no token: is GOOGLE_SERVICE_ACCOUNT_JSON set and the client id delegated for this domain?' : 'no token' }
  const p = await profileAs(token)
  if (p.error) return { ok: false, error: p.error }
  if (p.email && p.email !== m.address.toLowerCase()) return { ok: false, error: `the credential belongs to ${p.email}, not ${m.address}` }
  return { ok: true, address: p.email }
}

/**
 * What the current mailboxes can carry in a month, honestly: every send
 * counts, first emails only on send days, and each person needs the steps
 * the sequence has.
 */
export function forecast(mailboxes: MailboxRow[], input: { steps: number; sendDays: number }): { sendsPerMonth: number; firstEmailsPerMonth: number; peoplePerMonth: number } {
  const active = mailboxes.filter(m => m.status === 'active')
  const daily = active.reduce((s, m) => s + Math.max(0, Math.min(m.cap_ceiling, effectiveCap(m)) - m.reserved_other), 0)
  const sendsPerMonth = daily * 22
  const firstEmailsPerMonth = daily * Math.round((input.sendDays / 5) * 22)
  const peoplePerMonth = Math.min(firstEmailsPerMonth, Math.floor(sendsPerMonth / Math.max(1, input.steps)))
  return { sendsPerMonth, firstEmailsPerMonth, peoplePerMonth }
}
