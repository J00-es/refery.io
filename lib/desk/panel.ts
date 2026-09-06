/**
 * The panel at the door.
 *
 * One model call per candidate, within a minute of arrival, that does what the
 * nightly panel did (grade, positioning line) plus what it never did: read the
 * live seats, say which the person is strong for and why not the others, and
 * write the three emails Lily might send so the decision on the card is one
 * reaction rather than one email.
 *
 * The stable part of the prompt (rubric, voice, seats, calibration examples)
 * goes first and is cached. The CV goes last. Nothing about a specific
 * candidate appears in the cached prefix.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { structured } from '@/lib/desk/model'
import { loadLiveSeats, seatBrief, seatLabel, seatBand, type Seat } from '@/lib/desk/seats'
import { lookupLogos, tierWord, type Logo } from '@/lib/desk/tiers'
import { firstNameOf, loadOwner, properName, type Owner } from '@/lib/desk/people'
import type { ParsedResumeData, WorkExperience } from '@/lib/types'

export const PANEL_PROMPT_VERSION = 1

const SeatFit = z.object({
  job_id: z.string().describe('The SEAT id exactly as given.'),
  fit: z.enum(['strong', 'possible', 'no']),
  reason: z.string().describe('One clause a founder would repeat. Under 140 characters.'),
  blockers: z
    .array(z.string())
    .describe('Hard facts against it: visa, location, pay band, years, a must they lack. One clause each. Empty when none.'),
})

const Draft = z.object({
  subject: z.string(),
  body: z.string().describe('Plain text, complete, ready to send. No placeholders, no markdown, no square brackets.'),
})

export const PanelSchema = z.object({
  person_type: z
    .enum(['job_seeker', 'founder', 'recruiter', 'investor', 'other'])
    .describe('Judged from the CV and context. A founder currently raising, or someone whose current role is recruiting, is not a job seeker even if a CV arrived.'),
  grade: z.enum(['A+', 'A', 'A-', 'B+', 'pass']),
  level: z.enum(['L1', 'L2', 'L3', 'L4', 'L5', 'L6']).describe('L1 0-2 yrs, L2 3-5, L3 6-9, L4 10-14 or first leadership, L5 senior leadership, L6 executive.'),
  function: z.enum(['engineering', 'research', 'product', 'design', 'gtm', 'operations', 'finance', 'people', 'other']),
  positioning: z
    .string()
    .describe('The one line the nightly panel writes, e.g. "Top 10% of L2 forward-deployed engineers". Percentile first, then the peer group. Under 90 characters.'),
  summary: z.string().describe('Two or three sentences: what they built, with the numbers, where. Concrete. No adjectives without a fact behind them.'),
  highlights: z.array(z.string()).min(1).max(4).describe('Three bullets a founder would say out loud. Each under 120 characters, each with a fact.'),
  logos_from_knowledge: z
    .array(z.object({ name: z.string(), why: z.string() }))
    .describe('Companies or schools on the CV that are notable and were NOT already tagged in the facts you were given (a YC batch, a top lab, a well-known startup). Empty when none.'),
  flags: z.array(z.string()).describe('Things Lily must know before deciding: visa, location, comp, seniority mismatch, gaps, contradictions with what the partner said. Blunt, one clause each. Empty when none.'),
  missing_facts: z.array(z.enum(['visa', 'location', 'comp', 'consent', 'email'])).describe('Facts not on record that a founder will ask first.'),
  seat_fits: z.array(SeatFit).describe('One entry per SEAT given. Every seat, even the no ones.'),
  suggested_decision: z.enum(['intro_now', 'bench', 'not_fit', 'route_elsewhere']),
  suggested_reason: z.string().describe('One sentence Lily reads to justify the suggestion. Name the seats when intro_now.'),
  drafts: z.object({
    intro_now: Draft.describe('The first email for intro_now, to the recipient named in the brief.'),
    bench: Draft.describe('The note for bench, to the recipient named in the brief.'),
    not_fit: Draft.describe('The not-a-fit note, to the recipient named in the brief.'),
    not_fit_reason_line: z
      .string()
      .describe('The single sentence inside drafts.not_fit.body that gives the reason, copied exactly, so Lily can replace it with her own line.'),
  }),
})

export type PanelOutput = z.infer<typeof PanelSchema>

const RUBRIC = `You are the talent panel for Refery, a referral-based recruiting network run by Lily Joo. Refery places people into seed to Series B startups, mostly in San Francisco and New York, mostly engineering, research, product, GTM and operations. Founders pay a fee on hire; scouts and recruiting partners who referred the person earn most of it.

GRADES. Grade against the bar for the seats Refery works, not against the general population.
  A+  top 1 to 2% for their level. A founder would interrupt a meeting to take the call. Rare; do not inflate.
  A   top 5%. Clear zero-to-one ownership with numbers, strong logos or an exceptional trajectory, and the AI-native work founders now ask for.
  A-  top 10%. Strong, real ownership, would get a call at most of our clients. The bar for an intro.
  B+  top 25%. Solid, employable, but generic for our seats: process work, maintenance, no zero-to-one, no numbers, or the wrong shape (large-company only, non-technical for a technical seat).
  pass  below that, or a profile Refery cannot place (wrong country with no path, career change with nothing to show yet).
Calibrate to Lily's judgement: she cares about ownership, speed, shipping, customer contact, and AI-native work (agents, RAG, evals, ML in production). She discounts titles, pedigree without output, and long tenures with nothing shipped. Around 7 in 21 people she takes calls with are below A-, on purpose; when you give B+ to someone with an exact seat fit, say so in flags.

SEAT FIT. For every SEAT: strong means Lily should ask for the intro today; possible means worth a look if the strong ones fall through; no otherwise. Blockers are facts, not opinions: a seat marked "us authorized" is a blocker for anyone needing new sponsorship (an H-1B transfer is a warning, not a blocker); an onsite seat is a blocker for someone who will not relocate; a pay band $30k under the ask is a warning; years outside the asked range by more than three is a warning. A person with a strong seat but a hard blocker is NOT intro_now; suggest bench and say why.

SUGGESTED DECISION.
  intro_now       A- or better, at least one strong seat, no hard blocker.
  bench           A- or better and no strong seat, or a strong seat with a hard blocker. Also A- or better when the only strong seat already has an offer out.
  not_fit         B+ or pass.
  route_elsewhere person_type is not job_seeker.

EMAILS. Written AS Lily, in her voice: short, warm, plain, a smiley where she would put one, never an em dash, never a bulleted wall, never a placeholder. She writes "Hi Cody," and signs "Best,\\nLily". She uses cal.com/refery-lily/15 for her calendar. Real examples she sent:

  To a scout, asking for an intro: "Hey Cody! How are you? :) Really enjoyed our call yesterday, and your first batch came in fast, love it! I went through the profiles and James Niu and Jayson Isaac both look strong. Would you mind making warm email intros for those two? Just connect us and I'll set up a quick call with each :) Or, if easier, happy to directly reach out them saying it was from you! Thanks!! Best, Lily"

  To a scout, not a fit: "Salaar, thanks for sending him! I took a look. He seems solid, especially on the integration / backend side, but I don't think our current startup searches are the strongest fit for him right now. Most are looking for more senior / AI-native profiles. Happy to keep him in our pool though and come back if something more relevant opens :) Best, Lily"

  To a candidate she has not met: "Hi Uzair, Great to meet you! Thanks for the intro, Salaar. Love to meet you and know you better. Would cal.com/refery-lily/15 works for you? Looking forward to it! Best, Lily"

  To a scout, general fit but nothing live: "Thanks for sending Harshita! I went through her profile and she is a strong one. Nothing live matches a product lead right now, so I am keeping her in our pool under your name. The moment a search opens that fits, you will hear from me first and I will ask you for the warm intro then."

Rules for the three drafts:
  intro_now to a partner: name the person, say they look strong and one reason why, list the seats using EXACTLY the seat labels given in the brief (never invent stage, city or vertical), ask for a warm email intro, offer to reach out directly saying it came from them.
  intro_now to the candidate directly: warm, one reason you were impressed, the seats using EXACTLY the labels given, the calendar link, and nothing about fees.
  bench: to the partner, or to the candidate if they came in directly. Strong, nothing live fits today, kept in the pool (under the partner's name when it is a partner), we come back first.
  not_fit: to the partner, or to the candidate if they came in directly. Thank them, one honest reason in one sentence (that sentence is not_fit_reason_line), what would fit better so the next referral lands, keep them in the pool. Never harsh, never vague.
  If a fact is missing (visa, location, comp) and the email goes to a partner, add one short line asking for it.
Subject lines: partner emails "[Refery] <Candidate full name>"; candidate emails "<First name> / Lily @ Refery".`

function cvText(parsed: Partial<ParsedResumeData> | null, fallback: Record<string, unknown>): string {
  if (!parsed) return ''
  if (parsed.raw_text && parsed.raw_text.trim().length > 400) return parsed.raw_text.slice(0, 24_000)
  const work = (parsed.work_history ?? [])
    .map(w => {
      const x = w as WorkExperience & { start_date?: string | null; end_date?: string | null; bullets?: string[] }
      const when = x.duration || (x.start_date || x.end_date ? `${x.start_date ?? '?'} to ${x.end_date ?? 'present'}` : '')
      const detail = x.description || (Array.isArray(x.bullets) ? x.bullets.join(' ') : '')
      return `- ${[x.title, x.company].filter(Boolean).join(' at ')}${when ? ` (${when})` : ''}${detail ? `: ${String(detail).slice(0, 600)}` : ''}`
    })
    .join('\n')
  const edu = (parsed.education ?? [])
    .map(e => `- ${[e.degree, e.field].filter(Boolean).join(', ')}${e.institution ? ` at ${e.institution}` : ''}${e.end_year || e.year ? ` (${e.end_year ?? e.year})` : ''}`)
    .join('\n')
  return [
    parsed.headline ? `Headline: ${parsed.headline}` : null,
    parsed.summary ? `Summary: ${parsed.summary}` : null,
    work ? `Work history:\n${work}` : null,
    edu ? `Education:\n${edu}` : null,
    parsed.skills?.length ? `Skills: ${parsed.skills.join(', ')}` : null,
    (parsed.projects ?? []).length ? `Projects: ${(parsed.projects ?? []).map(p => p.name).filter(Boolean).join('; ')}` : null,
    typeof fallback.ai_analysis === 'string' ? `Earlier analysis: ${String(fallback.ai_analysis).slice(0, 1500)}` : null,
  ]
    .filter(Boolean)
    .join('\n\n')
}

/**
 * Where the panel and Lily disagreed after a call. Appended to the cached
 * prefix as worked examples; refreshed with the cache, which is fine because
 * the set moves slowly.
 */
async function calibrationExamples(admin: SupabaseClient): Promise<string> {
  const { data } = await admin
    .from('candidates')
    .select('name, panel_grade, lily_verdict, recruiter_verdict, parsed_data')
    .not('lily_verdict', 'is', null)
    .not('panel_grade', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(60)
  const rank: Record<string, number> = { 'A+': 5, A: 4, 'A-': 3, 'B+': 2, pass: 1 }
  const verdictGrade: Record<string, string> = { very_strong: 'A+', strong: 'A', moderate: 'A-', weak: 'B+', pass: 'pass' }
  const rows = (data ?? [])
    .map(r => {
      const lily = verdictGrade[String(r.lily_verdict)] ?? null
      const panel = String(r.panel_grade)
      if (!lily) return null
      const gap = Math.abs((rank[lily] ?? 0) - (rank[panel] ?? 0))
      const p = (r.parsed_data ?? {}) as Partial<ParsedResumeData>
      const who = [p.current_title, p.current_company].filter(Boolean).join(' at ') || p.headline || 'unknown role'
      const take = typeof r.recruiter_verdict === 'string' && r.recruiter_verdict.length > 30 ? r.recruiter_verdict.slice(0, 220) : ''
      return { gap, line: `- ${who}: panel said ${panel}, Lily said ${lily} after the call.${take ? ` Panel's reasoning was: "${take}"` : ''}` }
    })
    .filter((x): x is { gap: number; line: string } => !!x)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 12)
  if (!rows.length) return ''
  return `\n\nCALIBRATION. Where the panel and Lily disagreed most after she met the person. Learn the direction of the miss:\n${rows.map(r => r.line).join('\n')}`
}

export interface PanelContext {
  candidate: Record<string, unknown>
  parsed: Partial<ParsedResumeData> | null
  owner: Owner | null
  seats: Seat[]
  logos: Logo[]
  /** Direct to the candidate, or to the partner who owns them. */
  recipient: 'candidate' | 'owner'
  /** The partner's pitch, when they submitted to a search. */
  pitch: string | null
  submittedJobId: string | null
}

export function recipientFor(candidate: Record<string, unknown>, owner: Owner | null): 'candidate' | 'owner' {
  if (!owner || owner.isUs) return 'candidate'
  if (candidate.intake_source === 'inbound') return 'candidate'
  return 'owner'
}

function factsBlock(ctx: PanelContext): string {
  const c = ctx.candidate
  const p = ctx.parsed ?? {}
  const money = (n: unknown) => (typeof n === 'number' && n > 0 ? `$${Math.round(n / 1000)}k` : null)
  const ask = money(c.salary_expectation_min) ?? money(c.salary_expectation_max) ?? money(p.salary_expectation_min) ?? null
  const cur = money(c.current_base)
  const logos = ctx.logos
    .map(l => `${l.name} (${l.kind}${l.tier ? `, ${tierWord(l.tier) ?? l.tier}` : ', not in the tier tables'})`)
    .join('; ')
  return [
    `Name: ${properName(c.name as string)}`,
    `Email on record: ${c.email ? 'yes' : 'no'}`,
    `Location on record: ${(c.location as string) ?? p.location ?? 'unknown'} · relocation: ${c.relocation_ok === true ? 'open to it' : c.relocation_ok === false ? 'no' : p.willing_to_relocate === true ? 'CV says open to it' : 'unknown'}`,
    `Work preference: ${(c.remote_preference as string) ?? p.remote_preference ?? 'unknown'}`,
    `Work authorisation on record: ${(c.visa_status as string) ?? p.work_authorization ?? 'unknown'}`,
    `Comp: asks ${ask ?? 'unknown'}${cur ? `, currently ${cur}` : ''}`,
    `Years of experience: ${(c.experience_years as number) ?? p.experience_years ?? 'unknown'}`,
    `Availability on record: ${(c.availability_status as string) ?? 'unknown'}`,
    `Told they are being shared: ${c.consent_told_candidate === true ? 'yes' : c.consent_told_candidate === false ? 'no' : 'unknown'}`,
    `Came in as: ${(c.intake_source as string) ?? 'unknown'}`,
    logos ? `Logos and schools, tier-checked: ${logos}` : 'Logos and schools: none recognised',
  ].join('\n')
}

function recipientBlock(ctx: PanelContext): string {
  const c = ctx.candidate
  const first = firstNameOf(c.name as string)
  if (ctx.recipient === 'candidate') {
    return `RECIPIENT of all three drafts: the candidate directly, ${first} <${c.email ?? 'no email'}>. ${ctx.owner?.isUs ? 'They are ours (no partner).' : 'They came in directly.'} Do not name clients; use the anonymous seat labels below.`
  }
  const o = ctx.owner!
  return `RECIPIENT of all three drafts: the partner who owns this person, ${o.firstName} (${o.name ?? o.email}, ${o.role}). ${o.signed ? 'They have signed our terms, so you may use the NAMED seat labels below.' : 'They have NOT signed our terms yet, so use only the ANONYMOUS seat labels below.'}`
}

function seatLabels(ctx: PanelContext): string {
  const named = ctx.recipient === 'owner' && !!ctx.owner?.signed
  if (!ctx.seats.length) return 'No live seats today.'
  return ctx.seats
    .map(s => `- SEAT ${s.jobId}: ${named ? seatLabel(s, true) : seatLabel(s, false)}${seatBand(s) ? `, ${seatBand(s)}` : ''}${s.location ? `, ${s.location}` : ''}`)
    .join('\n')
}

export async function buildPanelContext(admin: SupabaseClient, candidateId: string): Promise<PanelContext | null> {
  const { data: candidate } = await admin.from('candidates').select('*').eq('id', candidateId).maybeSingle()
  if (!candidate) return null
  const parsed = (candidate.parsed_data ?? null) as Partial<ParsedResumeData> | null
  const [owner, seats, subRes] = await Promise.all([
    loadOwner(admin, (candidate.owner_user_id as string) ?? null),
    loadLiveSeats(admin),
    admin
      .from('role_submissions')
      .select('job_id, pitch, created_at')
      .eq('candidate_id', candidateId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  const sub = subRes.data
  const companies = (parsed?.work_history ?? []).map(w => w.company).filter((x): x is string => !!x)
  const schools = (parsed?.education ?? []).map(e => e.institution).filter((x): x is string => !!x)
  const logos = await lookupLogos(admin, companies.slice(0, 8), schools.slice(0, 4))
  return {
    candidate,
    parsed,
    owner,
    seats,
    logos,
    recipient: recipientFor(candidate, owner),
    pitch: (sub?.pitch as string) ?? null,
    submittedJobId: (sub?.job_id as string) ?? null,
  }
}

export interface PanelRow {
  id: string
  candidate_id: string
  model: string
  grade: string
  level: string | null
  function: string | null
  positioning: string | null
  summary: string | null
  highlights: string[]
  logos: Logo[]
  flags: string[]
  person_type: string
  seat_fits: { job_id: string; fit: 'strong' | 'possible' | 'no'; reason: string; blockers: string[] }[]
  suggested_decision: string
  suggested_reason: string | null
  drafts: PanelOutput['drafts']
  missing_facts: string[]
  cost_usd: number | null
  latency_ms: number | null
  created_at: string
}

/** Run the panel and write everything it produced. */
export async function runPanel(admin: SupabaseClient, ctx: PanelContext): Promise<PanelRow> {
  const cv = cvText(ctx.parsed, ctx.candidate)
  const system = `${RUBRIC}\n\nLIVE SEATS TODAY (${ctx.seats.length}):\n\n${ctx.seats.map(seatBrief).join('\n\n') || 'none'}${await calibrationExamples(admin)}`
  const user = [
    'CANDIDATE FACTS ON RECORD',
    factsBlock(ctx),
    '',
    recipientBlock(ctx),
    '',
    'SEAT LABELS TO USE IN EMAILS (copy exactly, never embellish):',
    seatLabels(ctx),
    ctx.pitch ? `\nTHE PARTNER'S PITCH${ctx.submittedJobId ? ` (they submitted to SEAT ${ctx.submittedJobId})` : ''}:\n${ctx.pitch.slice(0, 2000)}` : '',
    '',
    'THE CV',
    cv || '(no résumé text on record; grade from the facts above and say so in flags)',
  ].join('\n')

  const call = await structured('panel', { system, user, schema: PanelSchema, maxOutputTokens: 5000 })
  const out = call.output

  const logos: Logo[] = [
    ...ctx.logos,
    ...out.logos_from_knowledge.map(l => ({ name: l.name, kind: 'company' as const, tier: null, source: 'model' as const })),
  ]
  const seatIds = new Set(ctx.seats.map(s => s.jobId))
  const seatFits = out.seat_fits.filter(f => seatIds.has(f.job_id))

  const { data: row, error } = await admin
    .from('candidate_panels')
    .insert({
      candidate_id: ctx.candidate.id,
      model: call.model,
      prompt_version: PANEL_PROMPT_VERSION,
      grade: out.grade,
      level: out.level,
      function: out.function,
      positioning: out.positioning,
      summary: out.summary,
      highlights: out.highlights,
      logos,
      flags: out.flags,
      person_type: out.person_type,
      seat_fits: seatFits,
      suggested_decision: out.suggested_decision,
      suggested_reason: out.suggested_reason,
      drafts: out.drafts,
      missing_facts: out.missing_facts,
      tokens_in: call.tokensIn,
      tokens_out: call.tokensOut,
      cost_usd: call.costUsd,
      latency_ms: call.latencyMs,
    })
    .select('*')
    .single()
  if (error || !row) throw new Error(`could not save panel: ${error?.message}`)

  const now = new Date().toISOString()
  const isSeeker = out.person_type === 'job_seeker'
  const priorStage = String(ctx.candidate.journey_stage ?? 'uploaded')
  // A person already past the door (met, warm, placed) keeps their stage; the
  // panel refreshes the grade and the seat fits, not the relationship.
  const pastTheDoor = ['intro_requested', 'intro_sent', 'committee_call', 'warm', 'placed', 'post_committee_not_fit'].includes(priorStage)
  const patch: Record<string, unknown> = {
    panel_grade: out.grade,
    recruiter_verdict: `${out.positioning}, grade ${out.grade}. ${out.summary}`.slice(0, 2000),
    person_type: out.person_type,
    panel_at: now,
    updated_at: now,
  }
  if (!pastTheDoor) {
    patch.journey_stage = isSeeker ? 'decision_pending' : priorStage === 'uploaded' || priorStage === 'calibrating' ? 'decision_pending' : priorStage
    patch.journey_stage_at = now
    patch.journey_stage_source = 'desk'
    patch.decision_pending_since = now
  }
  await admin.from('candidates').update(patch).eq('id', ctx.candidate.id)

  await admin.from('candidate_activity_log').insert({
    candidate_id: ctx.candidate.id,
    activity_type: 'panel_graded',
    description: `Panel: ${out.grade}. ${out.positioning}. Suggested ${out.suggested_decision.replace(/_/g, ' ')}.`,
    source: 'panel',
    from_state: (ctx.candidate.panel_grade as string) ?? null,
    to_state: out.grade,
    metadata: { panel_id: row.id, model: call.model, cost_usd: call.costUsd, latency_ms: call.latencyMs },
  })

  return row as PanelRow
}

export async function latestPanel(admin: SupabaseClient, candidateId: string): Promise<PanelRow | null> {
  const { data } = await admin
    .from('candidate_panels')
    .select('*')
    .eq('candidate_id', candidateId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as PanelRow | null) ?? null
}
