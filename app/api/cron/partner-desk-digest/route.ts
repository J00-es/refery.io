import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { esc, postMessage, type SlackBlock } from '@/lib/slack-bot'
import { partnerSignupChannel } from '@/lib/partner-signup-slack'

export const dynamic = 'force-dynamic'

/**
 * Monday morning: who among our partners is stuck, and on what.
 *
 * The counterpart to the Sunday digest. That one goes out to partners about
 * their own searches; this one comes back to us about the partners themselves.
 *
 * Reads partner_state_v, the same view the desk page reads, so the digest and
 * the page can never disagree about who is stalled. Nothing is computed twice.
 *
 * Pushed rather than pulled on purpose. A desk you have to remember to open is
 * one that gets opened the week after someone goes cold, and the whole point of
 * the thing is noticing before that.
 */

/** How many names to print per group before it becomes a wall. */
const NAMES_SHOWN = 3

interface PartnerRow {
  full_name: string | null
  email: string
  days_quiet: number
  state: string
  stalled: boolean
  submissions: number
}

function nameOf(p: PartnerRow): string {
  return p.full_name?.trim() || p.email.split('@')[0]
}

/** "142 days", or months once a day count stops meaning anything. */
function wait(days: number): string {
  return days >= 60 ? `${Math.round(days / 30)} months` : `${days} days`
}

/**
 * One group's line: a count, then the longest-waiting few by name.
 *
 * Names matter more than the number. "40 stalled" is a statistic nobody acts
 * on; "Marjorie, 142 days" is a person.
 */
function groupBlock(title: string, note: string, rows: PartnerRow[]): string | null {
  if (!rows.length) return null
  const shown = rows.slice(0, NAMES_SHOWN)
  const names = shown.map(p => `${esc(nameOf(p))} (${wait(p.days_quiet)})`).join(', ')
  const rest = rows.length > shown.length ? `, and ${rows.length - shown.length} more` : ''
  return `*${title} · ${rows.length}*\n${names}${rest}\n_${note}_`
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('partner_state_v')
    .select('full_name, email, days_quiet, state, stalled, submissions')
    .order('days_quiet', { ascending: false })

  if (error) {
    console.error('[partner-desk-digest] query failed:', error)
    return NextResponse.json({ error: 'query failed' }, { status: 500 })
  }

  const rows = (data ?? []) as PartnerRow[]
  const stalled = rows.filter(p => p.stalled)
  const working = rows.filter(p => p.state === 'working')

  // Nothing to say is worth saying nothing. A digest that arrives every week
  // regardless is one that stops being read.
  if (!stalled.length) {
    return NextResponse.json({ ok: true, posted: false, reason: 'nobody is stalled' })
  }

  const neverOffered = stalled.filter(p => p.state === 'signed_idle' || p.state === 'joined_unsigned')
  const tookNothingSent = stalled.filter(p => p.state === 'took_a_search' || p.state === 'search_offered')
  const lapsed = stalled.filter(p => p.state === 'lapsed')

  const sections = [
    groupBlock('Never given a search', 'Signed up and asked for nothing. Ours to fix.', neverOffered),
    groupBlock('Took a search, sent nothing', 'They said yes. Worth a note before it goes cold.', tookNothingSent),
    groupBlock('Submitted before, gone quiet', 'Cheapest to restart: they know how this works.', lapsed),
  ].filter((s): s is string => s !== null)

  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
  const blocks: SlackBlock[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `:compass: *Partner desk · ${today}*\n${stalled.length} stalled, ${working.length} working.`,
      },
    },
    ...sections.map(text => ({ type: 'section' as const, text: { type: 'mrkdwn' as const, text } })),
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: 'Open the desk to propose a search to several of them at once: refery.xyz/admin/partners',
        },
      ],
    },
  ]

  const sent = await postMessage(partnerSignupChannel(), `Partner desk: ${stalled.length} stalled`, blocks)
  if (!sent.ok) {
    console.error('[partner-desk-digest] slack post failed:', sent.error)
    return NextResponse.json({ error: `slack: ${sent.error}` }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    posted: true,
    stalled: stalled.length,
    working: working.length,
    groups: {
      never_offered: neverOffered.length,
      took_nothing_sent: tookNothingSent.length,
      lapsed: lapsed.length,
    },
  })
}
