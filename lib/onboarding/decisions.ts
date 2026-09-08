/**
 * Lily's admission decision, and what follows from it.
 *
 * Five decisions, one function. Each records who decided and when, queues the
 * matching email with a three-minute window in which a thread reply can still
 * cancel it, and says in the thread exactly what was queued. No decision is
 * ever taken by a timer: a 48-hour wait produces a task and one honest
 * pending note, never an approval or a rejection.
 *
 * Personalisation is one fact from the application, chosen by rule. If the
 * template a decision calls for cannot be filled honestly, the decision falls
 * back to the simpler template and the thread says why.
 */

import { randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { DECISION_DELAY_MS, cancelQueued, queueEmail } from '@/lib/comms'
import { focusLine, templateB, templateC, templateD, templateE, templateF, templateP } from '@/lib/voice/templates'
import type { ScoutApplication } from '@/lib/intake'
import { bestMatches, whereSearchesAre, type Preferences } from '@/lib/onboarding/matcher'
import { FUNCTIONS } from '@/lib/job-ui'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'https://refery.xyz'

export type Decision = 'approve' | 'approve_call' | 'clarify' | 'no_match' | 'decline'

export const DECISION_STATUS: Record<Decision, string> = {
  approve: 'approved',
  approve_call: 'in_conversation',
  clarify: 'clarification',
  no_match: 'no_match',
  decline: 'rejected',
}

export const DECISION_LABEL: Record<Decision, string> = {
  approve: 'approved, independent start',
  approve_call: 'approved, with a call',
  clarify: 'clarification needed',
  no_match: 'no matching search',
  decline: 'declined',
}

/** Two working days from now, as "Thursday 10 September". */
export function reviewDate(from = new Date(), workingDays = 2): string {
  const d = new Date(from)
  let left = workingDays
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1)
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) left--
  }
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
}

function token(): string {
  return randomBytes(18).toString('base64url')
}

/** Reads the form's free-text answers into the matcher's vocabulary. */
export function preferencesFromApplication(a: ScoutApplication): Preferences {
  const cities = [...(a.cities_us ?? []), ...(a.cities_europe ?? []), ...(a.cities_row ?? [])]
  const functions = (a.profile_types ?? [])
    .map((p): string | null => {
      const s = p.toLowerCase()
      if (s.includes('engineer')) return 'engineering'
      if (s.includes('data') || s.includes('ai')) return 'data'
      if (s.includes('gtm') || s.includes('sales')) return 'sales'
      if (s.includes('product')) return 'product'
      if (s.includes('design')) return 'design'
      if (s.includes('operations') || s.includes('finance')) return 'operations'
      if (s.includes('talent') || s.includes('people')) return 'people'
      return null
    })
    .filter((x): x is string => Boolean(x))
  const stages = (a.stages ?? []).map((s): string => {
    const t = s.toLowerCase()
    if (t.startsWith('seed')) return 'seed'
    if (t.includes('series a')) return 'series a'
    if (t.includes('series b')) return 'series b'
    return 'later'
  })
  return { network_cities: cities, functions: [...new Set(functions)], stages: [...new Set(stages)], would_relocate: null }
}

/** Recruiters and agencies actively work searches; everyone else introduces people they know. */
export function contributionMode(a: ScoutApplication): 'recruit' | 'introduce' {
  const roles = (a.hiring_roles ?? []).map(r => r.toLowerCase())
  return roles.some(r => r.includes('recruiter') || r.includes('agency')) ? 'recruit' : 'introduce'
}

/** One true thing from the form, in Lily's words. */
export function verifiedDetail(a: ScoutApplication): string {
  const samples = (a.sample_candidate_urls ?? []).filter(Boolean).length
  const city = (a.cities_us ?? [])[0] ?? (a.cities_europe ?? [])[0] ?? (a.cities_row ?? [])[0]
  const fn = (a.profile_types ?? [])[0]
  if (samples > 0) return `the ${samples === 1 ? 'person' : `${samples} people`} you mentioned`
  if (fn && city) return `telling me about your ${fn.toLowerCase()} network in ${city}`
  if (city) return `telling me about your network in ${city}`
  return 'telling me about the people you know'
}

function specialty(a: ScoutApplication): string {
  const fns = (a.profile_types ?? []).slice(0, 2).map(p => p.toLowerCase().replace(' (sales and marketing)', '')).join(' and ')
  const city = (a.cities_us ?? []).slice(0, 2).join(' and ')
  return [fns, city ? `in ${city}` : ''].filter(Boolean).join(' ') || 'for startups'
}

async function liveFocus(admin: SupabaseClient): Promise<string> {
  const { data } = await admin
    .from('partner_roles_v')
    .select('department, title, location_buckets, company_stage')
    .eq('is_live', true)
    .eq('job_status', 'open')
  const roles = data ?? []
  const fnCount = new Map<string, number>()
  for (const r of roles) {
    const hay = `${r.department ?? ''} ${r.title}`.toLowerCase()
    for (const f of FUNCTIONS) if (f.patterns.some(p => hay.includes(p))) fnCount.set(f.label, (fnCount.get(f.label) ?? 0) + 1)
  }
  const fns = [...fnCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => k.replace(' & GTM', ' and GTM').toLowerCase())
  const where = await whereSearchesAre(admin)
  return focusLine({ functions: fns, cities: [where.replace(/^on-site /, '').replace(/^in /, '')], stages: [] })
}

export interface DecideInput {
  applicationId: string
  decision: Decision
  by: string
  slack?: { channel: string; ts: string } | null
}

export interface DecideResult {
  ok: boolean
  status?: string
  queued?: string
  note?: string
  error?: string
}

export async function decideApplication(admin: SupabaseClient, input: DecideInput): Promise<DecideResult> {
  const { data: a } = await admin.from('scout_applications').select('*').eq('id', input.applicationId).maybeSingle()
  if (!a) return { ok: false, error: 'application not found' }
  const app = a as ScoutApplication & { status: string | null; invite_token: string | null; decision: string | null }

  const status = DECISION_STATUS[input.decision]
  const now = new Date().toISOString()

  // Claim the row: whichever reaction lands first wins, and a second one is told so.
  const { data: claimed } = await admin
    .from('scout_applications')
    .update({
      status,
      decision: input.decision,
      decided_by: input.by,
      decided_at: now,
      reviewed_at: now,
      reviewed_by: input.by,
      contribution_mode: contributionMode(app),
      invite_token: app.invite_token ?? token(),
    })
    .eq('id', app.id)
    .in('status', ['new', 'clarification', 'paused'])
    .select('invite_token, contribution_mode')
    .maybeSingle()
  if (!claimed) return { ok: false, error: `already decided (${app.status})` }

  // A newer decision replaces anything still waiting in the queue.
  await cancelQueued(admin, { applicationId: app.id }, `replaced by decision: ${input.decision}`)

  const fullName = String(app.full_name ?? '').trim()
  const inviteToken = claimed.invite_token as string
  const onboardingLink = `${APP_URL}/auth/sign-up?invite=${inviteToken}`
  const previewLink = `${APP_URL}/invite/${inviteToken}`
  const stop = { kind: 'application_status' as const, applicationId: app.id, status }
  const common = { to: app.email, toName: fullName, applicationId: app.id, delayMs: DECISION_DELAY_MS, stop, slack: input.slack ?? null }

  let note = ''
  try {
    switch (input.decision) {
      case 'approve': {
        const mode = claimed.contribution_mode as string
        let email = templateB({ fullName, verifiedDetail: verifiedDetail(app), onboardingLink })
        if (mode === 'recruit') {
          const preview = await approvedPreview(admin, app)
          if (preview) {
            email = templateC({ fullName, specialty: specialty(app), anonymisedSummary: preview.summary, previewLink })
            await admin.from('scout_applications').update({ decision_note: `preview: ${preview.jobId}` }).eq('id', app.id)
          } else note = 'No approved preview matched, so the scout email (B) went instead of the recruiter one (C).'
        }
        const q = await queueEmail(admin, { ...common, email, dedupeKey: `${email.templateId}:${app.id}:${now}` })
        return { ok: true, status, queued: q.ok ? email.templateId : undefined, note: q.ok ? note : `email not queued: ${q.reason}` }
      }
      case 'approve_call': {
        const preview = await approvedPreview(admin, app)
        const detail = verifiedDetail(app)
        const city = (app.cities_us ?? [])[0]
        let email
        if (preview) {
          email = templateD({
            fullName,
            verifiedDetail: detail,
            reason: city ? `Your ${city} network sits right on the searches we are running now` : 'Your network sits right on the searches we are running now',
            previewLink,
            question: `the ${preview.title} search`,
          })
        } else {
          email = templateB({ fullName, verifiedDetail: detail, onboardingLink })
          note = 'No approved preview to point at, so the plain approval (B) went; offer the call from the desk once they join.'
        }
        const q = await queueEmail(admin, { ...common, email, dedupeKey: `${email.templateId}:${app.id}:${now}` })
        return { ok: true, status, queued: q.ok ? email.templateId : undefined, note: q.ok ? note : `email not queued: ${q.reason}` }
      }
      case 'clarify':
        return { ok: true, status, note: 'Nothing sent. Reply in this thread with your question and it goes to them as an email from you.' }
      case 'no_match': {
        const prefs = preferencesFromApplication(app)
        const strength = prefs.network_cities.length
          ? `Your network around ${prefs.network_cities.slice(0, 2).join(' and ')}`
          : 'Your network'
        const email = templateF({ fullName, strength, whereSearchesAre: await whereSearchesAre(admin), applied: true })
        const q = await queueEmail(admin, { ...common, email, dedupeKey: `F:${app.id}:${now}` })
        return { ok: true, status, queued: q.ok ? 'F' : undefined, note: q.ok ? '' : `email not queued: ${q.reason}` }
      }
      case 'decline': {
        const email = templateE({ fullName, focusLine: await liveFocus(admin) })
        const q = await queueEmail(admin, { ...common, email, dedupeKey: `E:${app.id}:${now}` })
        return { ok: true, status, queued: q.ok ? 'E' : undefined, note: q.ok ? '' : `email not queued: ${q.reason}` }
      }
    }
  } catch (err) {
    return { ok: true, status, note: `decision recorded, email not sent: ${err instanceof Error ? err.message : 'unknown'}. Send by hand.` }
  }
}

/** The best live search with a preview Lily approved for people who have not signed. */
export async function approvedPreviewForApplication(admin: SupabaseClient, app: ScoutApplication) {
  return approvedPreview(admin, app)
}

async function approvedPreview(admin: SupabaseClient, app: ScoutApplication): Promise<{ jobId: string; title: string; summary: string } | null> {
  const prefs = preferencesFromApplication(app)
  // bestMatches needs a user id to exclude answered searches; an applicant has none.
  const matches = await bestMatches(admin, '00000000-0000-0000-0000-000000000000', prefs)
  if (!matches.length) return null
  const { data: previews } = await admin
    .from('partner_roles')
    .select('job_id, preview_summary')
    .eq('preview_approved', true)
    .in('job_id', matches.map(m => m.role.job_id))
  const byJob = new Map((previews ?? []).map(p => [p.job_id as string, p.preview_summary as string | null]))
  const hit = matches.find(m => byJob.get(m.role.job_id))
  return hit ? { jobId: hit.role.job_id, title: hit.role.headline || hit.role.title, summary: byJob.get(hit.role.job_id)! } : null
}

/** The honest pending note, once, at 48 hours. */
export async function sendPendingNote(admin: SupabaseClient, app: { id: string; full_name: string; email: string }, slack: { channel: string; ts: string } | null) {
  const email = templateP({ fullName: app.full_name, newReviewDate: reviewDate(new Date(), 2) })
  const q = await queueEmail(admin, {
    to: app.email,
    toName: app.full_name,
    applicationId: app.id,
    email,
    dedupeKey: `P:${app.id}`,
    stop: { kind: 'application_status', applicationId: app.id, status: 'new' },
    slack,
  })
  if (q.ok) await admin.from('scout_applications').update({ pending_note_sent_at: new Date().toISOString() }).eq('id', app.id)
  return q
}
