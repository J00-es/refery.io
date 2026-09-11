/**
 * The sourcing desk's shapes, shared by the brief builder, the grader, the
 * sequencer and the pages. Zod where a model writes the value, plain types
 * where only we do.
 */

import { z } from 'zod'

/** Where a fact in the brief came from, so a reader can check it. */
export const SourceRef = z.object({
  kind: z.enum(['job', 'hm_brief', 'hm_answer', 'question', 'call', 'rejection', 'lily', 'note', 'market']),
  label: z.string().describe('Short, for a chip: "brief", "founder call 2 Sep", "HM answer 7 Sep".'),
  date: z.string().nullable().describe('ISO date when known.'),
})
export type SourceRef = z.infer<typeof SourceRef>

export const Requirement = z.object({
  key: z.string().describe('snake_case handle, stable across versions: "react_native", "realtime_prod".'),
  label: z.string().describe('One line a recruiter would say.'),
  mandatory: z.boolean().describe('True when a miss ends the conversation; false for a preference.'),
  detail: z.string().nullable().describe('What counts as evidence for it, one sentence.'),
  sources: z.array(SourceRef),
})
export type Requirement = z.infer<typeof Requirement>

export const BriefSpec = z.object({
  who: z.string().describe('One paragraph on who the client is actually looking for, in plain words, citing what the sources say.'),
  requirements: z.array(Requirement).max(12),
  signals: z.array(z.object({ text: z.string(), sources: z.array(SourceRef) })).max(8).describe('Things that make someone a stronger bet without being required.'),
  not_for: z.array(z.object({ text: z.string(), sources: z.array(SourceRef) })).max(8),
  titles: z.array(z.string()).max(12).describe('Job titles to search for.'),
  employers: z.array(z.object({ name: z.string(), domain: z.string().nullable(), why: z.string() })).max(15).describe('Lookalike employers whose people would fit, with the reason. Never treat a famous name as a proxy for ability.'),
  keywords: z.array(z.string()).max(12).describe('Words that would appear in a fitting profile.'),
  locations: z.array(z.string()).max(6).describe('Where the person must be, as a search would phrase it: "San Francisco, CA".'),
  years: z.object({ min: z.number().nullable(), max: z.number().nullable() }),
  onsite: z.enum(['onsite', 'hybrid', 'remote', 'unknown']),
  open_with: z.string().describe('How to open the first email to this kind of person: what to lead with, what to leave out. Two or three sentences.'),
  questions: z.array(z.string()).max(4).describe('Things the sources do not settle that the client should be asked.'),
  market: z
    .object({
      summary: z.string().describe('What the market for this person looks like: who competes for them, how scarce they are, what moves them. Three to five sentences, from the market pages and notes, with the page named.'),
      comp: z.string().nullable().describe('What this title pays in this city according to the pages read, against the seat band. Null when no page said.'),
      talent_pools: z.array(z.string()).max(8).describe('Where these people are found in numbers: company types, teams, communities, conferences. Each with the page or note it came from.'),
      risks: z.array(z.string()).max(5).describe('What will make this search hard, from the market: a band under market, an onsite ask in a remote market, a tiny pool.'),
    })
    .nullable()
    .describe('Null only when no market pages or notes were given.'),
})
export type BriefSpec = z.infer<typeof BriefSpec>

export interface BriefSource {
  kind: SourceRef['kind']
  label: string
  ref: string | null
  at: string | null
  chars: number
}

export interface BriefChange {
  field: string
  before: string
  after: string
}

export interface BriefOverride {
  path: string
  value: unknown
  by: string
  at: string
  reason: string | null
}

export interface BriefRow {
  id: string
  job_id: string
  version: number
  status: 'draft' | 'approved' | 'superseded'
  spec: BriefSpec
  sources: BriefSource[]
  changes: BriefChange[] | null
  overrides: BriefOverride[]
  model: string | null
  approved_by: string | null
  approved_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

/** One email address on a person, with how sure we are of it and where it came from. */
export interface PersonEmail {
  address: string
  kind: 'work' | 'personal' | 'unknown'
  status: 'verified' | 'found' | 'guessed' | 'bounced' | 'invalid'
  source: string
  checked_at: string | null
}

export interface PersonFact {
  claim: string
  source: string
  url: string | null
  observed_at: string
}

export interface PersonHistory {
  title: string | null
  employer: string | null
  start: string | null
  end: string | null
  current: boolean
  description: string | null
}

export interface PersonRow {
  id: string
  full_name: string
  first_name: string | null
  last_name: string | null
  headline: string | null
  current_title: string | null
  current_employer: string | null
  employer_domain: string | null
  location: string | null
  relocation: 'unknown' | 'willing' | 'unwilling'
  links: { linkedin?: string; github?: string; website?: string }
  emails: PersonEmail[]
  history: PersonHistory[]
  education: { school: string | null; degree: string | null; end: string | null }[]
  facts: PersonFact[]
  apollo_id: string | null
  specter_id: string | null
  candidate_id: string | null
  do_not_contact: boolean
  do_not_contact_reason: string | null
  last_contacted_at: string | null
  last_enriched_at: string | null
  enrichment_credits: number
  created_at: string
  updated_at: string
}

/** The grader's verdict on one requirement, with the evidence it used. */
export const RequirementVerdict = z.object({
  key: z.string(),
  verdict: z.enum(['supported', 'contradicted', 'unknown']),
  evidence: z.string().nullable().describe('The line from the record that supports or contradicts it, quoted or closely paraphrased. Null when unknown.'),
})
export type RequirementVerdict = z.infer<typeof RequirementVerdict>

export const GradeOutput = z.object({
  requirements: z.array(RequirementVerdict),
  fit: z.enum(['fit', 'near_miss', 'not_fit']),
  grade: z.enum(['A', 'B', 'C']),
  why: z.array(z.string()).max(3).describe('Up to three bullets, each quoting or closely paraphrasing something in the record.'),
  watch_for: z.string().nullable().describe('The one thing to check on a call, or null.'),
  hook: z.string().nullable().describe('One sentence for the top of the first email about a specific thing this person did, only if the record states it. Null when the record has nothing specific enough.'),
  hook_evidence: z.string().nullable().describe('The exact line of the record the hook rests on. Null when hook is null.'),
})
export type GradeOutput = z.infer<typeof GradeOutput>

export const ScreenOutput = z.object({
  promising: z.boolean(),
  reason: z.string().describe('One line.'),
})

export type PoolDecision = 'none' | 'ready' | 'held' | 'not_fit'
export type FitStatus = 'unknown' | 'fit' | 'near_miss' | 'not_fit'
export type ContactStatus = 'none' | 'guessed' | 'found' | 'verified'
export type RelationshipStatus = 'unchecked' | 'clear' | 'client_employee' | 'protected' | 'do_not_contact' | 'contacted_recently' | 'in_sequence' | 'on_desk'

export interface PoolRow {
  id: string
  job_id: string
  person_id: string
  brief_version: number | null
  source: 'apollo' | 'bench' | 'manual' | 'partner'
  source_meta: Record<string, unknown>
  screen: 'pending' | 'promising' | 'screened_out'
  screen_reason: string | null
  grade: 'A' | 'B' | 'C' | null
  fit_status: FitStatus
  requirements: RequirementVerdict[]
  why: string[]
  watch_for: string | null
  hook: string | null
  hook_evidence: string | null
  hook_ok: boolean
  contact_status: ContactStatus
  relationship_status: RelationshipStatus
  relationship_note: string | null
  decision: PoolDecision
  decision_reason: string | null
  decided_by: string | null
  decided_at: string | null
  graded_at: string | null
  model: string | null
  created_at: string
  updated_at: string
}

export interface SequenceStep {
  n: number
  /** Days after the previous step. Step 1 is 0. */
  day: number
  subject: string
  body: string
}

export interface SequenceRow {
  id: string
  job_id: string
  version: number
  steps: SequenceStep[]
  mailbox_ids: string[]
  address_preference: 'personal_first' | 'work_first' | 'work_only'
  send_days: number[]
  followup_days: number[]
  window_start: string
  window_end: string
  mode: 'learning' | 'batches' | 'auto'
  sending: boolean
  created_at: string
  updated_at: string
}

export type MailboxCredential = { kind: 'desk' } | { kind: 'refresh_token'; refresh_token: string } | { kind: 'service_account' }

export interface MailboxRow {
  id: string
  address: string
  display_name: string
  signs_as: string
  owner_email: string | null
  credential: MailboxCredential
  daily_cap: number
  cap_ceiling: number
  ramp_step: number
  ramp_started_at: string | null
  reserved_other: number
  status: 'active' | 'paused' | 'error'
  last_error: string | null
  last_sync_at: string | null
  last_sync_ok: boolean | null
  last_history_id: string | null
  created_at: string
  updated_at: string
}

export interface RenderedDraft {
  n: number
  /** Days after the previous step, frozen with the text so a later template edit cannot move a queued follow-up. */
  day: number
  subject: string
  body: string
}

export interface BatchItem {
  pool_id: string
  person_id: string
  name: string
  mailbox_id: string
  address: string
  drafts: RenderedDraft[]
  /** sha256 of person, mailbox, address and the drafts: what the approval covers. */
  hash: string
}

export interface BatchRow {
  id: string
  job_id: string
  sequence_id: string | null
  sequence_version: number | null
  brief_version: number | null
  items: BatchItem[]
  status: 'proposed' | 'approved' | 'cancelled'
  slack_batch_id: string | null
  slack_channel: string | null
  slack_ts: string | null
  created_by: string | null
  approved_by: string | null
  approved_at: string | null
  created_at: string
  updated_at: string
}

export type RunState = 'queued' | 'active' | 'replied' | 'bounced' | 'ooo' | 'paused' | 'stopped' | 'done' | 'error'

export interface RunRow {
  id: string
  batch_id: string | null
  job_id: string
  person_id: string
  pool_id: string | null
  mailbox_id: string
  address: string
  sequence_version: number | null
  drafts: RenderedDraft[]
  step: number
  state: RunState
  stopped_reason: string | null
  reply_kind: string | null
  reply_summary: string | null
  next_at: string | null
  gmail_thread_id: string | null
  gmail_message_ids: string[]
  first_subject: string | null
  first_message_id: string | null
  last_sent_at: string | null
  last_error: string | null
  created_at: string
  updated_at: string
}

export type ReplyKind = 'interested' | 'question' | 'not_now' | 'not_interested' | 'wrong_person' | 'do_not_contact' | 'other'

/** What "ready to write to" needs, all four at once. */
export function isReady(p: Pick<PoolRow, 'fit_status' | 'contact_status' | 'relationship_status' | 'decision'>): boolean {
  return p.decision === 'ready' && p.fit_status === 'fit' && (p.contact_status === 'found' || p.contact_status === 'verified') && p.relationship_status === 'clear'
}

/** Why a person is not ready, in the order a reader wants to fix them. */
export function notReadyBecause(p: Pick<PoolRow, 'fit_status' | 'contact_status' | 'relationship_status' | 'decision'>): string[] {
  const out: string[] = []
  if (p.fit_status === 'unknown') out.push('not read yet')
  else if (p.fit_status !== 'fit') out.push(p.fit_status === 'near_miss' ? 'near miss' : 'not a fit')
  if (p.contact_status === 'none') out.push('no email')
  else if (p.contact_status === 'guessed') out.push('email is a guess')
  if (p.relationship_status === 'unchecked') out.push('checks not run')
  else if (p.relationship_status !== 'clear') out.push(p.relationship_status.replace(/_/g, ' '))
  if (p.decision !== 'ready') out.push(p.decision === 'none' ? 'no decision' : p.decision.replace(/_/g, ' '))
  return out
}
