/**
 * Shape and presentation of the two public intake forms.
 *
 * Both land in Slack rather than email, and both are actioned from Slack with
 * a reaction. The channel message is therefore not a heads-up: it is the whole
 * review surface, and has to carry enough to decide on without opening
 * anything else. For a scout application that means: is this someone we
 * already know, what did they tell us, what is unverified, and what we would
 * suggest if Lily says yes.
 */

import { esc, type SlackBlock } from '@/lib/slack-bot'
import type { Reconciliation, ExistingAccount } from '@/lib/onboarding/identity'
import { linkedinKey } from '@/lib/onboarding/identity'

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
  source_campaign?: string | null
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
  /** What the form cannot tell us, so nobody mistakes the read for a verdict. */
  unknowns: string[]
}

/**
 * A single ranked read on an application.
 *
 * Deliberately a handful of readable rules rather than a weighted model: with
 * no placement outcomes to calibrate against, an opaque score would be false
 * precision. The reasons matter more than the number, which is why they are
 * shown in the message rather than kept internal. Nothing here costs anything.
 */
export function scoutPriority(a: ScoutApplication): PriorityVerdict {
  const reasons: string[] = []
  const unknowns: string[] = []
  let score = 0

  const us = (a.cities_us ?? []).map(c => c.toLowerCase())
  if (us.some(c => PRIORITY_CITIES.has(c))) {
    score += 2
    reasons.push('SF/NY in reach')
  }

  const samples = usableSamples(a)
  if (samples.usable.length > 0) {
    score += 1
    reasons.push(`shared ${samples.usable.length} sample${samples.usable.length === 1 ? '' : 's'}`)
    unknowns.push('whether the samples are people they can actually introduce')
  }

  if (a.network_tier && STRONG_TIERS.has(a.network_tier.toLowerCase())) {
    score += 1
    reasons.push(`self-rated ${a.network_tier.toLowerCase()}`)
  }
  if (a.network_tier) unknowns.push('network quality is self-reported')

  if (a.has_hired) {
    score += 1
    reasons.push('has hired before')
  }

  if (a.pool_size && DEEP_POOLS.has(a.pool_size.toLowerCase())) {
    score += 1
    reasons.push('deep pool')
    if (a.pool_size.toLowerCase() === 'continuous flow') unknowns.push('what "continuous flow" means in practice')
  }

  const priority: Priority = score >= 4 ? 'High' : score >= 2 ? 'Medium' : 'Low'
  return { priority, score, reasons, unknowns }
}

/** Sample links, minus duplicates and the applicant's own profile. */
export function usableSamples(a: ScoutApplication): { usable: string[]; selfLinks: number; duplicates: number } {
  const own = linkedinKey(a.linkedin_url)
  const seen = new Set<string>()
  const usable: string[] = []
  let selfLinks = 0
  let duplicates = 0
  for (const url of (a.sample_candidate_urls ?? []).filter(Boolean)) {
    const key = linkedinKey(url) ?? url.trim().toLowerCase()
    if (own && key === own) {
      selfLinks++
      continue
    }
    if (seen.has(key)) {
      duplicates++
      continue
    }
    seen.add(key)
    usable.push(url)
  }
  return { usable, selfLinks, duplicates }
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

export interface ScoutCardContext {
  reconciliation: Reconciliation
  suggestion: { title: string; company: string | null; reason: string } | null
}

/**
 * The scout card. Slack renders section fields two per row and caps them at
 * ten, so these are grouped into sections rather than one over-long list that
 * Slack would silently truncate.
 */
export function scoutBlocks(a: ScoutApplication, ctx?: ScoutCardContext): { text: string; blocks: SlackBlock[] } {
  const verdict = scoutPriority(a)
  const cities = [...(a.cities_us ?? []), ...(a.cities_europe ?? []), ...(a.cities_row ?? [])]
  const hiring = a.has_hired === null ? '_not answered_' : a.has_hired ? list(a.hiring_roles) : 'Has not hired directly'
  const samples = usableSamples(a)
  const via = a.source_campaign ? ` · via ${esc(a.source_campaign)} link` : a.source && a.source !== 'website' ? ` · via ${esc(a.source)}` : ''

  const text = `New application: ${a.full_name}`
  const blocks: SlackBlock[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${PRIORITY_EMOJI[verdict.priority]} *New application: ${esc(a.full_name)}*\n<mailto:${esc(a.email)}|${esc(a.email)}>  ·  <${esc(a.linkedin_url)}|LinkedIn>${via}`,
      },
    },
  ]

  // Before you decide: who we already know this to be.
  if (ctx) {
    const r = ctx.reconciliation
    const lines: string[] = []
    if (r.account) {
      lines.push(
        r.account.matchedBy === 'email'
          ? `:warning: An account exists under this email (${esc(r.account.role)}, ${esc(r.account.status)}).`
          : `:warning: A LinkedIn match on an existing account: ${esc(r.account.email)} (${esc(r.account.role)}, ${esc(r.account.status)}). Likely the same person; confirm before deciding.`,
      )
    }
    if (r.earlier) {
      lines.push(`Applied before on ${r.earlier.createdAt.slice(0, 10)}, then *${esc(r.earlier.status ?? 'new')}*${r.earlier.decision ? ` (${esc(r.earlier.decision)})` : ''}.`)
    }
    if (!lines.length) lines.push('No existing account. No earlier application. No prior decision.')
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Before you decide*\n${lines.join('\n')}` } })
  }

  blocks.push(
    {
      type: 'section',
      fields: [
        field('Network reach', list(cities)),
        field('Stages', list(a.stages)),
        field('People they know', list(a.profile_types)),
        field('How they know them', hiring),
      ],
    },
    {
      type: 'section',
      fields: [
        field('Self-rated network', a.network_tier ? esc(a.network_tier) : '_not answered_'),
        field('Pool they can share', a.pool_size ? esc(a.pool_size) : '_not answered_'),
        field('Talent type', list(a.talent_archetypes)),
        field('Samples shared', samples.usable.length ? `${samples.usable.length} usable${samples.selfLinks ? `, ${samples.selfLinks} own profile ignored` : ''}${samples.duplicates ? `, ${samples.duplicates} duplicate` : ''}` : 'None'),
      ],
    },
  )

  if (samples.usable.length) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${samples.usable.map((u, i) => `<${esc(u)}|Sample ${i + 1}>`).join('  ·  ')}\n_Context only. Nobody is contacted and nothing is created from these; a candidate enters Refery only as a CV PDF._`,
      },
    })
  }

  const read = [
    verdict.reasons.length ? `*Why it may fit* · ${esc(verdict.reasons.join(' · '))}` : '*Why it may fit* · nothing stands out on the form',
    verdict.unknowns.length ? `*Unknown* · ${esc(verdict.unknowns.join('; '))}` : null,
  ].filter(Boolean)
  blocks.push({ type: 'section', text: { type: 'mrkdwn', text: read.join('\n') } })

  if (ctx?.suggestion) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Would suggest after account setup* · ${esc(ctx.suggestion.title)}${ctx.suggestion.company ? ` at ${esc(ctx.suggestion.company)}` : ''}\n_${esc(ctx.suggestion.reason)}. A suggestion, not an assignment; they accept or decline on Searches._`,
      },
    })
  } else if (ctx) {
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: 'No live search matches their reach and functions today. :world_map: sends the honest no-match note.' }] })
  }

  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: ':+1: approve, independent start  ·  :raised_hands: approve, offer a call  ·  :question: ask one thing (reply here)  ·  :world_map: no matching search  ·  :-1: decline\nEach reaction queues the matching email for 3 minutes. Reply `cancel` in the thread to stop it.',
      },
    ],
  })
  return { text, blocks }
}

/** The short card for someone who is already a partner. Nothing to react to. */
export function alreadyPartnerBlocks(a: ScoutApplication, account: ExistingAccount): { text: string; blocks: SlackBlock[] } {
  const text = `Already a partner: ${a.full_name}`
  return {
    text,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:white_check_mark: *Already a partner: ${esc(a.full_name)}*\n<mailto:${esc(a.email)}|${esc(a.email)}> applied again. Active ${esc(account.role)} account since before this application. Closed as already-partner, no email sent. Anything they need is on the partner desk.`,
        },
      },
    ],
  }
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
      fields: [field('Company', esc(l.company_name)), field('Domain', esc(l.work_email.split('@')[1] ?? ''))],
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Roles they are hiring for*\n${l.roles_hiring_for ? `>${esc(l.roles_hiring_for).replace(/\n/g, '\n>')}` : '_not provided_'}`,
      },
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: ':+1: to send the reply and offer a call   ·   :-1: to reject' }],
    },
  ]
  return { text, blocks }
}
