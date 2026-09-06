/**
 * What happened since we asked: read straight from Gmail and from the
 * calendar signals the nightly ingester already writes. Every check is a
 * question with a yes or no answer and a piece of evidence attached, so a
 * timer never fires on someone who already replied.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { addressOf, searchMessages, selfAddress, threadMessages, type GmailMessageMeta } from '@/lib/google'
import { structured } from '@/lib/desk/model'

const daysAgo = (ms: number) => Math.max(1, Math.ceil((Date.now() - ms) / 86_400_000) + 1)

/** An email from the candidate, or one with them on it that is not from us, since `sinceMs`. */
export async function introLanded(candidateEmail: string, sinceMs: number): Promise<GmailMessageMeta | null> {
  const me = await selfAddress()
  const q = `(from:${candidateEmail} OR cc:${candidateEmail} OR to:${candidateEmail}) -from:${me} newer_than:${daysAgo(sinceMs)}d -category:promotions`
  const { messages } = await searchMessages(q, 10)
  const hit = messages.find(m => m.internalDate >= sinceMs && addressOf(m.from) !== me)
  return hit ?? null
}

/** A delivery failure for this address since `sinceMs`: Gmail's own bounce, or a postmaster's. */
export async function bounced(toEmail: string, sinceMs: number): Promise<GmailMessageMeta | null> {
  const q = `(from:mailer-daemon@googlemail.com OR from:mailer-daemon OR from:postmaster OR subject:"Delivery Status Notification" OR subject:"Undeliverable") "${toEmail}" newer_than:${daysAgo(sinceMs)}d`
  const { messages } = await searchMessages(q, 5)
  return messages.find(m => m.internalDate >= sinceMs) ?? null
}

/** The candidate wrote to us (any thread) since `sinceMs`. */
export async function candidateWrote(candidateEmail: string, sinceMs: number): Promise<GmailMessageMeta | null> {
  const { messages } = await searchMessages(`from:${candidateEmail} newer_than:${daysAgo(sinceMs)}d`, 5)
  return messages.find(m => m.internalDate >= sinceMs) ?? null
}

/** A calendar event with the candidate on it after `sinceMs`, from the signals table or a cal.com email. */
export async function bookingFound(admin: SupabaseClient, candidateId: string, candidateEmail: string | null, sinceMs: number): Promise<{ when: string; via: string } | null> {
  const since = new Date(sinceMs).toISOString()
  const { data } = await admin
    .from('ingested_signals')
    .select('occurred_at, title')
    .eq('source', 'calendar')
    .eq('entity_type', 'candidate')
    .eq('entity_id', candidateId)
    .gt('occurred_at', since)
    .order('occurred_at', { ascending: true })
    .limit(1)
  if (data?.length) return { when: data[0].occurred_at as string, via: 'calendar' }
  if (!candidateEmail) return null
  const { messages } = await searchMessages(
    `"${candidateEmail}" (from:cal.com OR from:calendar-notification@google.com OR subject:invitation OR subject:"new event") newer_than:${daysAgo(sinceMs)}d`,
    5,
  )
  const hit = messages.find(m => m.internalDate >= sinceMs)
  return hit ? { when: new Date(hit.internalDate).toISOString(), via: 'email' } : null
}

export type ReplyKind = 'connected' | 'promised' | 'declined' | 'not_now' | 'booked' | 'question' | 'other'

const ReplySchema = z.object({
  kind: z.enum(['connected', 'promised', 'declined', 'not_now', 'booked', 'question', 'other']),
  summary: z.string().describe('One line, under 120 characters, on what they said.'),
})

/** Replies in a thread that are not from us, after `sinceMs`. */
export async function repliesSince(threadId: string, sinceMs: number): Promise<{ from: string; text: string; at: number }[]> {
  const me = await selfAddress()
  const { messages } = await threadMessages(threadId)
  return messages
    .filter(m => m.internalDate > sinceMs && addressOf(m.from) !== me)
    .map(m => ({ from: addressOf(m.from), text: m.text || m.snippet, at: m.internalDate }))
}

/**
 * What a reply means, from a small model. Cheap, and wrong less often than a
 * regex. `who` is the role of the person replying, which changes what
 * "connected" and "booked" can mean.
 */
export async function classifyReply(input: { who: 'referrer' | 'candidate'; text: string; candidateName: string }): Promise<{ kind: ReplyKind; summary: string }> {
  const system = `You classify one email reply for a recruiting desk. Answer with the kind and a one-line summary.
Kinds:
  connected  the referrer has introduced the candidate to Lily, or says they just did (an email with both on it, "intros coming through today", "connected you two").
  promised   the referrer will do it later ("will do next week", "let me check with them first").
  declined   the referrer will not introduce, or the candidate is not interested.
  not_now    the candidate (or referrer on their behalf) says timing is off: off market, on holiday, come back in N months.
  booked     the candidate says they booked, or asks for a time, or confirms a call.
  question   they asked something that needs a human answer.
  other      anything else, including out-of-office and thanks.`
  const user = `The reply is from the ${input.who}${input.who === 'candidate' ? ` (${input.candidateName})` : ` about ${input.candidateName}`}:\n\n${input.text.slice(0, 3000)}`
  try {
    const r = await structured('classify', { system, user, schema: ReplySchema, maxOutputTokens: 200 })
    return r.output
  } catch (err) {
    console.warn('[desk:signals] classify failed:', err instanceof Error ? err.message : err)
    return { kind: 'other', summary: 'could not read the reply' }
  }
}
