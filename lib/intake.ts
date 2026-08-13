/**
 * Shape and presentation of the two public intake forms.
 *
 * Both land in Slack rather than email now, and both are actioned from Slack
 * with a reaction. The channel message is therefore not a heads-up: it is the
 * whole review surface, and has to carry enough to decide on without opening
 * anything else.
 */

import { esc, type SlackBlock } from '@/lib/slack-bot'

export type IntakeKind = 'scout' | 'hiring_lead'

export const INTAKE_TABLE: Record<IntakeKind, string> = {
  scout: 'scout_applications',
  hiring_lead: 'hiring_manager_leads',
}

export interface ScoutApplication {
  id: string
  full_name: string
  email: string
  linkedin_url: string
  created_at: string
  source: string | null
  cities_us: string[] | null
  cities_europe: string[] | null
  cities_row: string[] | null
  profile_types: string[] | null
  talent_archetypes: string[] | null
  stages: string[] | null
  network_tier: string | null
  pool_size: string | null
  has_hired: boolean | null
  hiring_roles: string[] | null
  sample_candidate_urls: string[] | null
}

export interface HiringLead {
  id: string
  full_name: string
  work_email: string
  company_name: string
  roles_hiring_for: string | null
  created_at: string
  source: string | null
}

/** Cities we are actively prioritising, lowercased for comparison. */
const PRIORITY_CITIES = new Set([
  'san francisco',
  'san francisco / bay area',
  'bay area',
  'sf',
  'new york',
  'new york city',
  'nyc',
])

const STRONG_TIERS = new Set(['top 0.1%', 'top 1%'])
const DEEP_POOLS = new Set(['50+', 'continuous flow'])

export type Priority = 'High' | 'Medium' | 'Low'

export interface PriorityVerdict {
  priority: Priority
  score: number
  reasons: string[]
}

/**
 * A single ranked read on an application.
 *
 * Deliberately a handful of readable rules rather than a weighted model: with
 * no placement outcomes to calibrate against, an opaque score would be false
 * precision. The reasons matter more than the number, which is why they are
 * shown in the message rather than kept internal.
 */
export function scoutPriority(a: ScoutApplication): PriorityVerdict {
  const reasons: string[] = []
  let score = 0

  const us = (a.cities_us ?? []).map(c => c.toLowerCase())
  if (us.some(c => PRIORITY_CITIES.has(c))) {
    score += 2
    reasons.push('SF/NY network')
  }

  if ((a.sample_candidate_urls ?? []).length > 0) {
    score += 1
    reasons.push(`shared ${(a.sample_candidate_urls ?? []).length} candidate(s)`)
  }

  if (a.network_tier && STRONG_TIERS.has(a.network_tier.toLowerCase())) {
    score += 1
    reasons.push(a.network_tier.toLowerCase())
  }

  if (a.has_hired) {
    score += 1
    reasons.push('has hired before')
  }

  if (a.pool_size && DEEP_POOLS.has(a.pool_size.toLowerCase())) {
    score += 1
    reasons.push('deep pool')
  }

  const priority: Priority = score >= 4 ? 'High' : score >= 2 ? 'Medium' : 'Low'
  return { priority, score, reasons }
}

const PRIORITY_EMOJI: Record<Priority, string> = {
  High: ':fire:',
  Medium: ':large_yellow_circle:',
  Low: ':white_circle:',
}

function list(values: string[] | null | undefined, empty = '_not answered_'): string {
  const v = (values ?? []).filter(Boolean)
  return v.length ? esc(v.join(', ')) : empty
}

function field(label: string, value: string): SlackBlock {
  return { type: 'mrkdwn', text: `*${label}*\n${value}` }
}

/**
 * Slack renders section fields two per row and caps them at ten, so these are
 * grouped into two sections rather than one over-long list that Slack would
 * silently truncate.
 */
export function scoutBlocks(a: ScoutApplication): { text: string; blocks: SlackBlock[] } {
  const verdict = scoutPriority(a)
  const cities = [
    ...(a.cities_us ?? []),
    ...(a.cities_europe ?? []),
    ...(a.cities_row ?? []),
  ]

  const hiring = a.has_hired === null
    ? '_not answered_'
    : a.has_hired
      ? list(a.hiring_roles)
      : 'Has not hired directly'

  const samples = (a.sample_candidate_urls ?? []).filter(Boolean)

  const text = `New scout application: ${a.full_name}`
  const blocks: SlackBlock[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${PRIORITY_EMOJI[verdict.priority]} *New scout application: ${esc(a.full_name)}*\n<mailto:${esc(a.email)}|${esc(a.email)}>  ·  <${esc(a.linkedin_url)}|LinkedIn>`,
      },
    },
    {
      type: 'section',
      fields: [
        field('Cities', list(cities)),
        field('Profiles they know', list(a.profile_types)),
        field('Talent type', list(a.talent_archetypes)),
        field('Stages', list(a.stages)),
      ],
    },
    {
      type: 'section',
      fields: [
        field('Network quality', a.network_tier ? esc(a.network_tier) : '_not answered_'),
        field('Pool they can share', a.pool_size ? esc(a.pool_size) : '_not answered_'),
        field('Hiring background', hiring),
        field('Candidates shared', samples.length ? `${samples.length}` : 'None'),
      ],
    },
  ]

  if (samples.length) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: samples.map((u, i) => `<${esc(u)}|Candidate ${i + 1}>`).join('  ·  '),
      },
    })
  }

  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: verdict.reasons.length
          ? `Priority: *${verdict.priority}* (${esc(verdict.reasons.join(', '))})`
          : `Priority: *${verdict.priority}*`,
      },
    ],
  })

  blocks.push(actionHint('send the intro email and book a call'))
  return { text, blocks }
}

export function hiringLeadBlocks(l: HiringLead): { text: string; blocks: SlackBlock[] } {
  const text = `New hiring lead: ${l.full_name} at ${l.company_name}`
  const blocks: SlackBlock[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `:briefcase: *New hiring lead: ${esc(l.full_name)}*\n${esc(l.company_name)}  ·  <mailto:${esc(l.work_email)}|${esc(l.work_email)}>`,
      },
    },
    {
      type: 'section',
      fields: [
        field('Company', esc(l.company_name)),
        field('Domain', esc(l.work_email.split('@')[1] ?? '')),
      ],
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Roles they are hiring for*\n${l.roles_hiring_for ? `>${esc(l.roles_hiring_for).replace(/\n/g, '\n>')}` : '_not provided_'}`,
      },
    },
    actionHint('send the reply and offer a call'),
  ]
  return { text, blocks }
}

/**
 * The reaction contract, restated on every message. Triage only works if the
 * two gestures are legible without anyone having to remember them.
 */
function actionHint(upAction: string): SlackBlock {
  return {
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `:+1: to ${upAction}   ·   :-1: to mark not qualified`,
      },
    ],
  }
}
