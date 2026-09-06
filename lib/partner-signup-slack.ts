/**
 * The sign-up card you can approve from Slack.
 *
 * The completed-sign-up notice used to go out through an Incoming Webhook,
 * which returns no message timestamp. That is fine for something you only read,
 * but a reaction arrives carrying nothing except a channel and a ts, so a
 * webhook message can never be traced back to the person it is about. Approving
 * from Slack means posting with the bot instead.
 *
 * Falls back to the webhook when SLACK_CHANNEL_PARTNER_SIGNUPS is unset, so an
 * environment that has not been configured yet keeps the notification it
 * already had rather than going quiet.
 */

import { createAdminClient } from '@/lib/supabase/server'
import { normalizeEmail } from '@/lib/current-user'
import { notifySlack, type SlackField } from '@/lib/slack'
import { addReaction, esc, postMessage, type SlackBlock } from '@/lib/slack-bot'

/** Seeded on every card so a decision is one click, never a search for the emoji. */
const AFFORDANCES = ['+1', '-1']

/**
 * #refery-partners, where every sign-up notice has always landed.
 *
 * Hardcoded with an env override, the same way the desk, search-questions and
 * search-access channels are. Leaving it to an unset variable meant no card at
 * all, which made approving from Slack a feature nobody could reach.
 */
const PARTNER_SIGNUPS_CHANNEL = 'C0BPHDJ4EPR'

export function partnerSignupChannel(): string {
  return process.env.SLACK_CHANNEL_PARTNER_SIGNUPS || PARTNER_SIGNUPS_CHANNEL
}

function truncate(s: string, n: number): string {
  const clean = s.replace(/\s+/g, ' ').trim()
  return clean.length > n ? `${clean.slice(0, n - 1)}...` : clean
}

/**
 * Same shape the webhook produced, so the message in the channel does not
 * visibly change: title, a grid of fields, then the one-line instruction.
 */
function blocks(title: string, context: string, fields: SlackField[]): SlackBlock[] {
  const out: SlackBlock[] = [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `:white_check_mark: *${esc(truncate(title, 200))}*` },
    },
  ]

  if (fields.length) {
    out.push({
      type: 'section',
      fields: fields.slice(0, 10).map(f => ({
        type: 'mrkdwn',
        text: `*${esc(f.label)}*\n${esc(truncate(f.value, 300))}`,
      })),
    })
  }

  out.push({ type: 'context', elements: [{ type: 'mrkdwn', text: esc(truncate(context, 300)) }] })
  out.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: ':+1: approve and email them  ·  :-1: leave them inactive, no email',
      },
    ],
  })

  return out
}

export interface PartnerSignupNotice {
  title: string
  context: string
  fields: SlackField[]
  /** Used to find the users_admin row the reaction will act on. */
  email: string | null
}

/**
 * Posts the card and records where it landed, so a later reaction can find the
 * partner it refers to. Best-effort throughout: a sign-up must never fail
 * because Slack did.
 */
export async function announcePartnerSignup(
  n: PartnerSignupNotice,
): Promise<{ sent: boolean; error?: string }> {
  const channel = partnerSignupChannel()
  const email = normalizeEmail(n.email)

  // No channel configured, or no email to tie the card to: nothing downstream
  // could act on it anyway, so send the message we have always sent.
  if (!channel || !email) {
    const res = await notifySlack({
      stream: 'partners',
      emoji: ':white_check_mark:',
      title: n.title,
      context: n.context,
      fields: n.fields,
    })
    return { sent: res.sent, error: res.error }
  }

  const posted = await postMessage(channel, n.title, blocks(n.title, n.context, n.fields))
  if (!posted.ok || !posted.ts) {
    return { sent: false, error: posted.error || 'chat.postMessage returned no ts' }
  }

  // Written before the affordances are seeded: the reaction handler refuses to
  // act on a card it cannot resolve, and a seeded reaction on an unresolvable
  // card would just log a warning.
  const admin = createAdminClient()
  const { error: linkErr } = await admin
    .from('users_admin')
    .update({ slack_channel_id: posted.channel ?? channel, slack_message_ts: posted.ts })
    .eq('email', email)

  if (linkErr) {
    console.error('[partner-signup] could not link slack message to users_admin:', linkErr.message)
  }

  for (const name of AFFORDANCES) {
    await addReaction(posted.channel ?? channel, posted.ts, name)
  }

  return { sent: true }
}
