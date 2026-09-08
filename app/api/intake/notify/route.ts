/**
 * Announces a new intake row in Slack, and sends the applicant a receipt.
 *
 * Called by an AFTER INSERT trigger on scout_applications and
 * hiring_manager_leads. Slack is where these get reviewed.
 *
 * For a scout application the row is reconciled first: a test row is marked
 * invalid and never announced, an existing partner is closed as
 * already_partner with a short card and no email, and everyone else gets the
 * full card plus the receipt (email A) telling them when they will hear.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { addReaction, postMessage } from '@/lib/slack-bot'
import {
  alreadyPartnerBlocks,
  hiringLeadBlocks,
  scoutBlocks,
  type HiringLead,
  type ScoutApplication,
} from '@/lib/intake'
import { linkedinKey, reconcile } from '@/lib/onboarding/identity'
import { bestMatches } from '@/lib/onboarding/matcher'
import { preferencesFromApplication, reviewDate } from '@/lib/onboarding/decisions'
import { queueEmail } from '@/lib/comms'
import { templateA } from '@/lib/voice/templates'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** The five decisions, pre-seeded so triage is one click. */
const SCOUT_AFFORDANCES = ['+1', 'raised_hands', 'question', 'world_map', '-1']
const LEAD_AFFORDANCES = ['+1', '-1']

function channelFor(table: string): string | null {
  if (table === 'scout_applications') return process.env.SLACK_CHANNEL_SCOUT_APPS || null
  if (table === 'hiring_manager_leads') return process.env.SLACK_CHANNEL_HIRING_LEADS || null
  return null
}

export async function POST(req: NextRequest) {
  const secret = process.env.INTAKE_WEBHOOK_SECRET || ''
  if (!secret || req.headers.get('x-intake-secret') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let payload: { table?: string; record?: Record<string, unknown> }
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const table = payload.table ?? ''
  const record = payload.record
  if (!record || typeof record.id !== 'string') {
    return NextResponse.json({ error: 'missing record' }, { status: 400 })
  }

  const channel = channelFor(table)
  if (!channel) {
    console.warn(`[intake] no channel configured for table "${table}"`)
    return NextResponse.json({ error: 'unknown table' }, { status: 400 })
  }

  const admin = createAdminClient()

  if (table === 'scout_applications') {
    const a = record as unknown as ScoutApplication
    const key = linkedinKey(a.linkedin_url)
    const recon = await reconcile(admin, { email: a.email, linkedin_url: a.linkedin_url, full_name: a.full_name }, a.id)

    // Matched to a campaign audience: already approved by the person who built
    // the list. A short info card, no reactions, no receipt (they are on their
    // way into sign-up right now).
    if ((record as { status?: string }).status === 'approved' && a.source_campaign) {
      const posted = await postMessage(channel, `Joined via campaign link: ${a.full_name}`, [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `:link: *${a.full_name}* matched the *${a.source_campaign}* audience and is setting up an account. <mailto:${a.email}|${a.email}> · <${a.linkedin_url}|LinkedIn>. Nothing to decide; they appear on the partner desk when the account exists.`,
          },
        },
      ])
      if (posted.ok && posted.ts) {
        await admin.from('scout_applications').update({ slack_channel_id: posted.channel ?? channel, slack_message_ts: posted.ts, linkedin_key: key }).eq('id', a.id)
      }
      return NextResponse.json({ ok: true, campaignMatched: true })
    }

    if (recon.isTest || recon.isInternal) {
      await admin.from('scout_applications').update({ status: 'invalid', linkedin_key: key, decision: 'invalid', decided_by: 'system', decided_at: new Date().toISOString() }).eq('id', a.id)
      return NextResponse.json({ ok: true, invalid: true })
    }

    // An active partner who applied again: close it, say so, send nothing.
    if (recon.account?.matchedBy === 'email' && recon.account.status === 'active') {
      await admin
        .from('scout_applications')
        .update({ status: 'already_partner', linkedin_key: key, partner_user_id: recon.account.userId, decision: 'already_partner', decided_by: 'system', decided_at: new Date().toISOString() })
        .eq('id', a.id)
      const built = alreadyPartnerBlocks(a, recon.account)
      const posted = await postMessage(channel, built.text, built.blocks)
      if (posted.ok && posted.ts) {
        await admin.from('scout_applications').update({ slack_channel_id: posted.channel ?? channel, slack_message_ts: posted.ts }).eq('id', a.id)
      }
      return NextResponse.json({ ok: true, alreadyPartner: true })
    }

    // What we would suggest, so the card can say it. Rule-based, no cost.
    const matches = await bestMatches(admin, '00000000-0000-0000-0000-000000000000', preferencesFromApplication(a))
    const suggestion = matches[0]
      ? { title: matches[0].role.headline || matches[0].role.title, company: matches[0].role.company_name, reason: matches[0].reason }
      : null

    const built = scoutBlocks(a, { reconciliation: recon, suggestion })
    const posted = await postMessage(channel, built.text, built.blocks)
    if (!posted.ok || !posted.ts) {
      return NextResponse.json({ error: posted.error ?? 'post failed' }, { status: 502 })
    }

    await admin
      .from('scout_applications')
      .update({ slack_channel_id: posted.channel ?? channel, slack_message_ts: posted.ts, linkedin_key: key })
      .eq('id', a.id)

    for (const name of SCOUT_AFFORDANCES) await addReaction(posted.channel ?? channel, posted.ts, name)

    // The receipt. Essential, immediate, once.
    const q = await queueEmail(admin, {
      to: a.email,
      toName: a.full_name,
      applicationId: a.id,
      email: templateA({ fullName: a.full_name, reviewDate: reviewDate() }),
      dedupeKey: `A:${a.id}`,
      slack: { channel: posted.channel ?? channel, ts: posted.ts },
    })
    if (q.ok) await admin.from('scout_applications').update({ receipt_sent_at: new Date().toISOString() }).eq('id', a.id)

    return NextResponse.json({ ok: true, ts: posted.ts, receipt: q.ok })
  }

  const built = hiringLeadBlocks(record as unknown as HiringLead)
  const posted = await postMessage(channel, built.text, built.blocks)
  if (!posted.ok || !posted.ts) {
    return NextResponse.json({ error: posted.error ?? 'post failed' }, { status: 502 })
  }
  const { error } = await admin
    .from(table)
    .update({ slack_channel_id: posted.channel ?? channel, slack_message_ts: posted.ts })
    .eq('id', record.id)
  if (error) console.error(`[intake] could not record slack ts for ${table}/${record.id}:`, error.message)
  for (const name of LEAD_AFFORDANCES) await addReaction(posted.channel ?? channel, posted.ts, name)
  return NextResponse.json({ ok: true, ts: posted.ts })
}
