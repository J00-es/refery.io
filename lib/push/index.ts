/**
 * Web push for the installed app.
 *
 * A person who added Refery to their phone (or allowed notifications in a
 * browser) has one row per device in push_subscriptions. This module sends
 * to those rows. It rides on the moments that already send an email, so a
 * push is never a new kind of message: it is the same news, on the lock
 * screen, a few seconds before the email lands.
 *
 * Every function here is best effort and never throws. A push that fails
 * must not break the decision, the proposal or the answer it accompanies.
 *
 * Keys: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY in the environment win; otherwise
 * desk_settings 'web_push_vapid' (generated once on 11 Sep 2026).
 */

import webpush from 'web-push'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/server'

export interface PushPayload {
  title: string
  body: string
  /** Path or absolute URL opened when the notification is tapped. */
  url: string
  /** Same tag replaces the previous notification instead of stacking. */
  tag?: string
}

export interface Vapid {
  publicKey: string
  privateKey: string
  subject: string
}

let cachedVapid: Vapid | null | undefined

export async function getVapid(admin: SupabaseClient = createAdminClient()): Promise<Vapid | null> {
  if (cachedVapid !== undefined) return cachedVapid
  const envPub = process.env.VAPID_PUBLIC_KEY
  const envPriv = process.env.VAPID_PRIVATE_KEY
  if (envPub && envPriv) {
    cachedVapid = { publicKey: envPub, privateKey: envPriv, subject: process.env.VAPID_SUBJECT || 'mailto:hello@refery.io' }
    return cachedVapid
  }
  const { data } = await admin.from('desk_settings').select('value').eq('key', 'web_push_vapid').maybeSingle()
  const v = (data?.value ?? null) as Partial<Vapid> | null
  cachedVapid = v?.publicKey && v?.privateKey ? { publicKey: v.publicKey, privateKey: v.privateKey, subject: v.subject || 'mailto:hello@refery.io' } : null
  return cachedVapid
}

interface SubRow {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

export interface PushResult {
  sent: number
  failed: number
  /** Endpoints the push service said are gone, removed here. */
  expired: number
}

const NOTHING: PushResult = { sent: 0, failed: 0, expired: 0 }

async function deliver(admin: SupabaseClient, rows: SubRow[], payload: PushPayload): Promise<PushResult> {
  if (!rows.length) return NOTHING
  const vapid = await getVapid(admin)
  if (!vapid) return NOTHING
  const body = JSON.stringify(payload)
  const result: PushResult = { sent: 0, failed: 0, expired: 0 }
  const now = new Date().toISOString()
  await Promise.all(
    rows.map(async row => {
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          body,
          { TTL: 60 * 60 * 24, urgency: 'normal', vapidDetails: vapid },
        )
        result.sent += 1
        await admin.from('push_subscriptions').update({ last_pushed_at: now, last_error: null }).eq('id', row.id)
      } catch (e) {
        const status = (e as { statusCode?: number })?.statusCode
        if (status === 404 || status === 410) {
          // The browser dropped the subscription (app removed, permission revoked).
          result.expired += 1
          await admin.from('push_subscriptions').delete().eq('id', row.id)
        } else {
          result.failed += 1
          const message = e instanceof Error ? e.message : String(e)
          await admin.from('push_subscriptions').update({ last_error: message.slice(0, 500) }).eq('id', row.id)
          console.error('[push] failed', status, message)
        }
      }
    }),
  )
  return result
}

/** Push to every device of one users_admin row. */
export async function pushToUser(admin: SupabaseClient, userId: string, payload: PushPayload): Promise<PushResult> {
  try {
    const { data } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', userId)
    return await deliver(admin, (data ?? []) as SubRow[], payload)
  } catch (e) {
    console.error('[push] pushToUser', e)
    return NOTHING
  }
}

/**
 * Push to the person behind an email address, the way every email sender
 * already addresses them. users_admin.email is lower-cased and trimmed by a
 * trigger, so one equality match finds them; an address that maps to more
 * than one row (Lily has two) reaches every device of each.
 */
export async function pushToEmail(email: string | null | undefined, payload: PushPayload, admin: SupabaseClient = createAdminClient()): Promise<PushResult> {
  const normalized = (email ?? '').trim().toLowerCase()
  if (!normalized) return NOTHING
  try {
    const { data: users } = await admin.from('users_admin').select('id').eq('email', normalized).limit(5)
    const ids = (users ?? []).map(u => u.id as string)
    if (!ids.length) return NOTHING
    const { data } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').in('user_id', ids)
    return await deliver(admin, (data ?? []) as SubRow[], payload)
  } catch (e) {
    console.error('[push] pushToEmail', e)
    return NOTHING
  }
}
