/**
 * The decision card: one message in #refery-desk per candidate, built so the
 * decision is obvious in five seconds and the consequence of each reaction is
 * written on the card. Mirrors the mock-up Lily approved on 6 Sep 2026.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { addReaction, esc, postThreadReply, type SlackBlock } from '@/lib/slack-bot'
import { knownToYou, postToDesk } from '@/lib/desk-notifications'
import type { PanelRow } from '@/lib/desk/panel'
import { seatBand, type Seat } from '@/lib/desk/seats'
import { tierWord } from '@/lib/desk/tiers'
import { firstNameOf, properName, type Owner } from '@/lib/desk/people'
import type { ParsedResumeData } from '@/lib/types'

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://refery.xyz').replace(/\/$/, '')

/** The reactions seeded on every decision card, in the order they appear. */
export const DECISION_REACTIONS = ['fire', '+1', '-1', 'raising_hand', 'zzz'] as const

export const DECISION_LEGEND =
  ':fire: intro now (sends the email)  ·  :+1: bench (sends the note)  ·  :-1: not a fit, then one line in the thread, or "send"  ·  :raising_hand: you handle it  ·  :zzz: a week  ·  reply "edit: …" to change the email first'

const money = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? `$${Math.round(n / 1000)}k` : null)

export interface CardInput {
  candidate: Record<string, unknown>
  panel: PanelRow
  owner: Owner | null
  seats: Seat[]
  recipient: 'candidate' | 'owner'
  /** Someone else already owns this person: name and since when. */
  duplicateOf: { name: string; ownerName: string | null; since: string } | null
  latencyLine: string
}

function headline(c: Record<string, unknown>): string {
  const p = (c.parsed_data ?? {}) as Partial<ParsedResumeData>
  const w = p.work_history?.[0]
  const role = w ? [w.title, w.company].filter(Boolean).join(' at ') : p.headline ?? null
  const edu = p.education?.[0]?.institution ?? null
  const bits = [
    role,
    edu && !role?.includes(edu) ? edu : null,
    (c.location as string) ?? p.location ?? null,
    typeof c.experience_years === 'number' ? `${c.experience_years} yrs` : null,
    (c.visa_status as string) ?? null,
    money(c.salary_expectation_min) ? `asks ${money(c.salary_expectation_min)}` : null,
    (c.remote_preference as string) ?? null,
  ].filter(Boolean)
  return bits.join(' · ')
}

function seatName(seat: Seat): string {
  return `${seat.companyName} · ${seat.headline || seat.title}`
}

function seatMeta(seat: Seat): string {
  const city = seat.location?.split(/[,(]/)[0].trim()
  return [city, seat.stage, seat.industry].filter(Boolean).join(', ')
}

export function suggestedLine(panel: PanelRow, recipient: 'candidate' | 'owner', owner: Owner | null): string {
  const emoji = { intro_now: ':fire: Intro now', bench: ':+1: Bench', not_fit: ':-1: Not a fit', route_elsewhere: ':compass: Not a candidate' }[panel.suggested_decision] ?? panel.suggested_decision
  const who =
    panel.suggested_decision === 'route_elsewhere'
      ? ''
      : recipient === 'candidate'
        ? ' The email goes to them directly.'
        : ` The email goes to ${owner?.firstName ?? 'the owner'}.`
  return `*Suggested: ${emoji}.* ${esc(panel.suggested_reason ?? '')}${who}`
}

export function draftFor(panel: PanelRow, decision: 'intro_now' | 'bench' | 'not_fit'): { subject: string; body: string } {
  const d = panel.drafts?.[decision]
  return { subject: d?.subject ?? '', body: d?.body ?? '' }
}

export function buildDecisionCard(input: CardInput): { text: string; blocks: SlackBlock[] } {
  const { candidate: c, panel, owner, seats, recipient } = input
  const name = properName(c.name as string)
  const grade = panel.grade
  const byLine =
    recipient === 'candidate'
      ? c.intake_source === 'inbound'
        ? 'came in directly (owner: you)'
        : 'owner: you'
      : `referred by ${owner?.name ?? owner?.email ?? 'a partner'}${owner?.role ? ` · ${owner.role}` : ''}${owner && !owner.signed ? ' · not signed yet' : ''}`

  const logos = (panel.logos ?? [])
    .filter(l => l.tier || l.source === 'model')
    .slice(0, 6)
    .map(l => `${l.kind === 'school' ? '' : ''}*${esc(l.name)}*${l.tier ? ` (${tierWord(l.tier) ?? l.tier})` : l.source === 'model' ? ' (notable)' : ''}`)
  const bySeat = new Map(seats.map(s => [s.jobId, s]))
  const fits = (panel.seat_fits ?? []).filter(f => bySeat.has(f.job_id))
  const strong = fits.filter(f => f.fit === 'strong')
  const possible = fits.filter(f => f.fit === 'possible')
  const shown = [...strong, ...(strong.length < 3 ? possible.slice(0, 3 - strong.length) : [])]
  const others = fits.length - shown.length

  const seatLines = shown.map(f => {
    const s = bySeat.get(f.job_id)!
    const dot = f.fit === 'strong' ? ':large_green_circle:' : ':large_yellow_circle:'
    const meta = [seatMeta(s), seatBand(s)].filter(Boolean).join(' · ')
    const block = f.blockers?.length ? ` · :warning: ${esc(f.blockers.join('; '))}` : ''
    return `${dot} *${esc(seatName(s))}*${meta ? ` (${esc(meta)})` : ''} · ${f.fit} · ${esc(f.reason)}${block}`
  })

  const flags = (panel.flags ?? []).map(f => `:warning: ${esc(f)}`).join('   ')
  const missing = (panel.missing_facts ?? []).filter(m => m !== 'email')
  const missingLine = missing.length ? `:grey_question: not on record: ${missing.join(', ')}` : null

  const suggested = panel.suggested_decision as 'intro_now' | 'bench' | 'not_fit' | 'route_elsewhere'
  const draft = suggested === 'route_elsewhere' ? null : draftFor(panel, suggested)
  const draftTo = recipient === 'candidate' ? (c.email as string) ?? 'no email on record' : owner?.email ?? ''

  const blocks: SlackBlock[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `:inbox_tray: *${esc(name)}* · *${esc(grade)}* · ${esc(byLine)} · ${esc(input.latencyLine)}`,
      },
    },
    { type: 'context', elements: [{ type: 'mrkdwn', text: esc(headline(c)) || 'no background on record' }] },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Panel: ${esc(grade)} · ${esc(panel.positioning ?? '')}.* ${esc(panel.summary ?? '')}`,
      },
    },
    ...(panel.highlights?.length
      ? [{ type: 'section', text: { type: 'mrkdwn', text: panel.highlights.map(h => `• ${esc(h)}`).join('\n') } }]
      : []),
    ...(logos.length ? [{ type: 'context', elements: [{ type: 'mrkdwn', text: `:label: ${logos.join(' · ')}` }] }] : []),
    ...(flags || missingLine
      ? [{ type: 'context', elements: [{ type: 'mrkdwn', text: [flags, missingLine].filter(Boolean).join('\n') }] }]
      : []),
    ...(input.duplicateOf
      ? [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `:bangbang: *Already known:* ${esc(input.duplicateOf.name)}, owned by ${esc(input.duplicateOf.ownerName ?? 'someone else')} since ${input.duplicateOf.since}. The first claim holds; this card is for the record.`,
            },
          },
        ]
      : []),
    ...(panel.person_type !== 'job_seeker'
      ? [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `:compass: *Not a candidate:* reads as a *${esc(panel.person_type)}*. No intro email will be drafted. :+1: files them as not a candidate; route them to the ${panel.person_type === 'founder' ? 'hiring-lead' : panel.person_type === 'recruiter' ? 'partner' : 'right'} flow by hand.`,
            },
          },
        ]
      : []),
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: seats.length
          ? `*Live searches*\n${seatLines.join('\n') || '_none strong or possible_'}${others > 0 ? `\n_${others} other seat${others === 1 ? '' : 's'}: no._` : ''}`
          : '*Live searches*\n_No live seats today._',
      },
    },
    { type: 'section', text: { type: 'mrkdwn', text: suggestedLine(panel, recipient, owner) } },
    ...(draft
      ? [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `_To: ${esc(draftTo)} · Subject: ${esc(draft.subject)}_\n>${esc(draft.body).slice(0, 2400).replace(/\n/g, '\n>')}`,
            },
          },
        ]
      : []),
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: [
            c.resume_blob_pathname ? `<${APP_URL}/api/file?pathname=${encodeURIComponent(String(c.resume_blob_pathname))}|CV>` : 'no CV on file',
            c.linkedin_url ? `<${esc(String(c.linkedin_url))}|LinkedIn>` : null,
            `<${APP_URL}/candidates/${c.id}|profile>`,
          ]
            .filter(Boolean)
            .join('  ·  '),
        },
      ],
    },
    { type: 'context', elements: [{ type: 'mrkdwn', text: DECISION_LEGEND }] },
  ]

  return { text: `${name} · ${grade} · suggested ${suggested.replace(/_/g, ' ')}`, blocks }
}

/** Post the card, remember where it is, seed the reactions. */
export async function postDecisionCard(admin: SupabaseClient, input: CardInput): Promise<{ ok: boolean; error?: string }> {
  const card = buildDecisionCard(input)
  const posted = await postToDesk(card.text, card.blocks)
  if (!posted.ok || !posted.ts || !posted.channel) return { ok: false, error: posted.error }

  await admin
    .from('candidates')
    .update({ desk_card_channel: posted.channel, desk_card_ts: posted.ts, desk_reason_pending_at: null, desk_draft_override: null })
    .eq('id', input.candidate.id)

  const known = await knownToYou(admin, input.candidate.id as string)
  if (!/no call or email on record/.test(known)) await postThreadReply(posted.channel, posted.ts, known)

  for (const r of DECISION_REACTIONS) await addReaction(posted.channel, posted.ts, r)
  return { ok: true }
}

/** The candidate whose decision card is this Slack message, if it is one. */
export async function candidateForSlackMessage(
  admin: SupabaseClient,
  channel: string,
  ts: string,
): Promise<Record<string, unknown> | null> {
  const { data } = await admin
    .from('candidates')
    .select('id, name, email, journey_stage, owner_user_id, intake_source, desk_reason_pending_at, desk_draft_override, desk_card_channel, desk_card_ts, person_type, panel_grade')
    .eq('desk_card_channel', channel)
    .eq('desk_card_ts', ts)
    .maybeSingle()
  return data ?? null
}

export function firstName(c: Record<string, unknown>): string {
  return firstNameOf(c.name as string)
}
