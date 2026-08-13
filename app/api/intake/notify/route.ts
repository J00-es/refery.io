/**
 * Announces a new intake row in Slack.
 *
 * Called by an AFTER INSERT trigger on scout_applications and
 * hiring_manager_leads. It replaces the notify-submission edge function, which
 * sent email: Slack is now the place these get reviewed, and getting the same
 * event twice in two places trains you to ignore both.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { addReaction, postMessage } from '@/lib/slack-bot'
import {
  hiringLeadBlocks,
  scoutBlocks,
  type HiringLead,
  type ScoutApplication,
} from '@/lib/intake'

export const dynamic = 'force-dynamic'

/** Pre-seeded so triage is one click rather than one click plus a picker. */
const AFFORDANCES = ['+1', '-1']

function channelFor(table: string): string | null {
  if (table === 'scout_applications') return process.env.SLACK_CHANNEL_SCOUT_APPS || null
  if (table === 'hiring_manager_leads') return process.env.SLACK_CHANNEL_HIRING_LEADS || null
  return null
}

export async function POST(req: NextRequest) {
  const secret = process.env.INTAKE_WEBHOOK_SECRET || ''
  if (!secret || req.headers.get('x-intake-secret') !== secret) {
    // Fails closed. Without a shared secret anyone could make the bot post
    // arbitrary applicant details into a private channel.
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

  const built =
    table === 'scout_applications'
      ? scoutBlocks(record as unknown as ScoutApplication)
      : hiringLeadBlocks(record as unknown as HiringLead)

  const posted = await postMessage(channel, built.text, built.blocks)
  if (!posted.ok || !posted.ts) {
    return NextResponse.json({ error: posted.error ?? 'post failed' }, { status: 502 })
  }

  // Written back before the reactions go on: the reaction handler resolves a
  // row by (channel, ts), so a message it cannot resolve is worse than a
  // message with no emoji on it yet.
  const admin = createAdminClient()
  const { error } = await admin
    .from(table)
    .update({ slack_channel_id: posted.channel ?? channel, slack_message_ts: posted.ts })
    .eq('id', record.id)

  if (error) {
    console.error(`[intake] could not record slack ts for ${table}/${record.id}:`, error.message)
  }

  for (const name of AFFORDANCES) {
    await addReaction(posted.channel ?? channel, posted.ts, name)
  }

  return NextResponse.json({ ok: true, ts: posted.ts })
}
