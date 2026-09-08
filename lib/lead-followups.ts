/**
 * Hiring leads get a second and a third touch, then silence.
 *
 * The first email goes out on :+1: (or from a backlog card). Until now that
 * was the whole conversation: nothing chased, nothing noticed a reply. This
 * runs daily and, for every lead in conversation with no reply on record:
 *
 *   reads Gmail for anything from that address since the first email, and if
 *   there is a reply, stamps replied_at, posts it in the card's thread, and
 *   stops;
 *   otherwise, at day 4 sends follow-up 1 and at day 9 sends follow-up 2;
 *   after that it leaves the lead alone. Two follow-ups is the number Lily
 *   sends by hand.
 *
 * Reply detection is a Gmail search from lily@refery.io, which is where the
 * Resend reply-to lands, so no new ingestion path is needed.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { searchMessages } from '@/lib/google'
import { hiringLeadFollowup, sendIntakeEmail } from '@/lib/intake-emails'
import { esc, postThreadReply } from '@/lib/slack-bot'

const DAY_MS = 86_400_000
/** Days after the previous touch. */
const STEP_AFTER_DAYS = [4, 5]

interface Lead {
  id: string
  full_name: string
  work_email: string
  company_name: string
  roles_hiring_for: string | null
  status: string
  outreach_sent_at: string | null
  last_contacted_at: string | null
  replied_at: string | null
  followups_sent: number
  slack_channel_id: string | null
  slack_message_ts: string | null
}

async function replySince(email: string, sinceIso: string): Promise<{ date: string; snippet: string } | null> {
  const since = new Date(sinceIso)
  const days = Math.max(1, Math.ceil((Date.now() - since.getTime()) / DAY_MS) + 1)
  const res = await searchMessages(`from:${email} newer_than:${days}d -in:chats`, 5)
  for (const m of res.messages) {
    if (m.internalDate && m.internalDate > since.getTime()) return { date: new Date(m.internalDate).toISOString(), snippet: m.snippet ?? '' }
  }
  return null
}

export async function runLeadFollowups(admin: SupabaseClient): Promise<{ checked: number; replied: number; sent: number; errors: string[] }> {
  const out = { checked: 0, replied: 0, sent: 0, errors: [] as string[] }
  const { data, error } = await admin
    .from('hiring_manager_leads')
    .select('*')
    .eq('status', 'in_conversation')
    .is('replied_at', null)
    .not('outreach_sent_at', 'is', null)
  if (error) {
    out.errors.push(error.message)
    return out
  }

  for (const lead of (data ?? []) as Lead[]) {
    out.checked++
    const lastTouch = lead.last_contacted_at ?? lead.outreach_sent_at!
    let reply: { date: string; snippet: string } | null = null
    try {
      reply = await replySince(lead.work_email, lead.outreach_sent_at!)
    } catch (err) {
      out.errors.push(`${lead.work_email}: ${err instanceof Error ? err.message : 'gmail failed'}`)
      continue
    }
    if (reply) {
      await admin.from('hiring_manager_leads').update({ replied_at: reply.date }).eq('id', lead.id)
      out.replied++
      if (lead.slack_channel_id && lead.slack_message_ts) {
        await postThreadReply(lead.slack_channel_id, lead.slack_message_ts, `:mailbox_with_mail: ${esc(lead.full_name)} replied on ${reply.date.slice(0, 10)}: _${esc(reply.snippet.slice(0, 240))}_ · it is in lily@refery.io. Follow-ups stopped.`)
      }
      continue
    }

    const step = (lead.followups_sent ?? 0) + 1
    if (step > STEP_AFTER_DAYS.length) continue
    const dueAt = new Date(lastTouch).getTime() + STEP_AFTER_DAYS[step - 1] * DAY_MS
    if (Date.now() < dueAt) continue

    const email = hiringLeadFollowup(step as 1 | 2, lead.full_name, lead.company_name, lead.roles_hiring_for)
    const sent = await sendIntakeEmail(lead.work_email, email)
    if (!sent.sent) {
      out.errors.push(`${lead.work_email}: ${sent.error ?? 'send failed'}`)
      continue
    }
    const now = new Date().toISOString()
    await admin.from('hiring_manager_leads').update({ followups_sent: step, last_contacted_at: now }).eq('id', lead.id)
    out.sent++
    if (lead.slack_channel_id && lead.slack_message_ts) {
      await postThreadReply(lead.slack_channel_id, lead.slack_message_ts, `:outbox_tray: Follow-up ${step} of ${STEP_AFTER_DAYS.length} sent to ${esc(lead.work_email)}.${step === STEP_AFTER_DAYS.length ? ' That was the last one; the lead stays in conversation until they write.' : ''}`)
    }
  }
  return out
}
