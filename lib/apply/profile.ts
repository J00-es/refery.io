/**
 * A person who shares their own CV.
 *
 * The design constraint is the same one the inbound-email path was built
 * under: the candidate row this produces must be indistinguishable from one a
 * partner uploaded. Same blob bucket, same extractor, same coercion helpers,
 * same embedding, same insert trigger that queues the panel. What is unique to
 * this file: the answers the person gave, kept beside the row in
 * candidate_profiles, and the private link that lets them change their mind.
 *
 * Nothing here calls a model beyond the one CV extraction every candidate
 * already costs. Every timer is a state check that sends at most one thing.
 */

import { createHash, randomBytes } from 'node:crypto'
import { del, put } from '@vercel/blob'
import type { SupabaseClient } from '@supabase/supabase-js'
import { analyzeResumeFromBlob } from '@/lib/resume-parser'
import { candidateRowFromParsed, toText } from '@/lib/resume'
import { embedCandidate } from '@/lib/embeddings'
import { normalizeEmail } from '@/lib/current-user'
import { defaultOwnerUserId, findDuplicate, looksLikeResume } from '@/lib/inbound-resume'
import { postAlert, postToFeed } from '@/lib/desk-notifications'
import { esc, postThreadReply } from '@/lib/slack-bot'
import { queueEmail } from '@/lib/comms'
import { templateCS1, templateCS1Dup, templateCS6, templateCSLink, templateCSP, templateRL1, templateRS1, templateRS3 } from '@/lib/voice/templates'
import { reviewDate } from '@/lib/onboarding/decisions'
import { properName } from '@/lib/desk/people'
import { TOKEN_DAYS, checkBurst, newReferralToken, referralActionUrl } from '@/lib/referrals'
import { BASE_BANDS, CONSENT_VERSION, RETENTION_MONTHS, SETTINGS, saysLine, type ApplyAnswers, type BaseAnswer, type Currency } from '@/lib/apply/options'
import type { ParsedResumeData } from '@/lib/types'

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://refery.xyz').replace(/\/$/, '')
export const MAX_PDF_BYTES = 10 * 1024 * 1024
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

export const profileUrl = (token: string) => `${APP_URL}/me/${token}`
export const newToken = () => randomBytes(16).toString('hex')

export function hashIp(ip: string | null): string | null {
  if (!ip) return null
  return createHash('sha256').update(`${process.env.CRON_SECRET ?? 'refery'}:${ip}`).digest('hex').slice(0, 32)
}

export interface ProfileRow {
  id: string
  candidate_id: string
  token: string
  email: string
  full_name: string | null
  looking: string | null
  locations: string[]
  cities: Record<string, string>
  current_location: string | null
  relocation: string | null
  setting: string | null
  work_auth_us: string | null
  work_auth_uk_eu: string[]
  work_auth_other: string | null
  bases: BaseAnswer[]
  current_base: number | null
  start_by: string | null
  stages: string[]
  functions: string[]
  roles: string[]
  roles_other: string | null
  never_companies: string[]
  notes: string | null
  consent_at: string | null
  consent_version: string | null
  consent_until: string | null
  pending_sent_at: string | null
  checkin_sent_at: string | null
  renewed_at: string | null
  paused_at: string | null
  deleted_at: string | null
  source: string
  source_campaign: string | null
  created_at: string
  updated_at: string
}

export interface ProfileView {
  profile: ProfileRow
  candidate: { id: string; name: string; journey_stage: string | null; intake_source: string | null; resume_filename: string | null; resume_blob_pathname: string | null; created_at: string }
  sharedCount: number
}

/** The three things the desk shows from a profile. */
export interface ProfileSummary {
  says: string
  never: string | null
  note: string | null
  on: string
  paused: boolean
}

export function summarise(p: ProfileRow): ProfileSummary {
  return {
    says: saysLine(p),
    never: p.never_companies.length ? p.never_companies.join(', ') : null,
    note: p.notes?.trim() || null,
    on: p.created_at.slice(0, 10),
    paused: !!p.paused_at || !!p.deleted_at,
  }
}

// ── answers → columns ─────────────────────────────────────────────────────

function primaryBase(bases: BaseAnswer[]): { currency: string; min: number | null; max: number | null } | null {
  const b = bases.find(x => x.currency === 'USD') ?? bases[0]
  if (!b) return null
  if (b.band && b.currency !== 'OTHER') {
    const band = BASE_BANDS[b.currency as Currency]?.find(x => x.label === b.band)
    if (band) return { currency: b.currency, min: band.min, max: band.max }
  }
  if (b.amount) return { currency: b.currency, min: b.amount, max: b.amount }
  return null
}

const splitList = (s: string | null | undefined) =>
  (s ?? '')
    .split(/[,\n;]+/)
    .map(x => x.trim())
    .filter(Boolean)
    .slice(0, 20)

/** What the panel and the matcher read, from the person's own answers. */
export function candidateColumnsFrom(a: ApplyAnswers): Record<string, unknown> {
  const base = primaryBase(a.bases)
  const typed = Object.values(a.cities ?? {}).flatMap(splitList)
  const auth = a.workAuthUs ?? ([...a.workAuthUkEu, a.workAuthOther.trim()].filter(Boolean).join('; ') || null)
  return {
    location: a.currentLocation.trim() || null,
    allowed_locations: [...a.locations, ...typed],
    relocation_ok: a.relocation === 'yes' ? true : a.relocation === 'no' ? false : null,
    remote_preference: SETTINGS.find(s => s.key === a.setting)?.label ?? null,
    visa_status: auth,
    salary_expectation_min: base?.min ?? null,
    salary_expectation_max: base?.max ?? null,
    current_base: a.currentBase && a.currentBase > 0 ? Math.round(a.currentBase) : null,
    allowed_stages: a.stages,
  }
}

export function profileColumnsFrom(a: ApplyAnswers): Record<string, unknown> {
  return {
    full_name: a.fullName.trim(),
    looking: a.looking,
    locations: a.locations,
    cities: Object.fromEntries(Object.entries(a.cities ?? {}).filter(([, v]) => (v ?? '').trim()).map(([k, v]) => [k, (v ?? '').trim().slice(0, 200)])),
    current_location: a.currentLocation.trim().slice(0, 120) || null,
    relocation: a.relocation,
    setting: a.setting,
    work_auth_us: a.workAuthUs,
    work_auth_uk_eu: a.workAuthUkEu,
    work_auth_other: a.workAuthOther.trim().slice(0, 200) || null,
    bases: a.bases.map(b => ({ currency: b.currency, band: b.band, amount: b.amount && b.amount > 0 ? Math.round(b.amount) : null, note: (b.note ?? '').trim().slice(0, 80) || null })),
    current_base: a.currentBase && a.currentBase > 0 ? Math.round(a.currentBase) : null,
    start_by: a.startBy,
    stages: a.stages,
    functions: a.functions,
    roles: a.roles,
    roles_other: a.rolesOther.trim().slice(0, 200) || null,
    never_companies: splitList(a.neverCompanies),
    notes: a.notes.trim().slice(0, 280) || null,
  }
}

/** The profile row back into form answers, for the private page. */
export function answersFrom(p: ProfileRow): ApplyAnswers {
  return {
    fullName: p.full_name ?? '',
    email: p.email,
    linkedin: '',
    currentLocation: p.current_location ?? '',
    looking: (p.looking as ApplyAnswers['looking']) ?? null,
    locations: p.locations as ApplyAnswers['locations'],
    cities: p.cities ?? {},
    relocation: (p.relocation as ApplyAnswers['relocation']) ?? null,
    setting: (p.setting as ApplyAnswers['setting']) ?? null,
    workAuthUs: p.work_auth_us,
    workAuthUkEu: p.work_auth_uk_eu ?? [],
    workAuthOther: p.work_auth_other ?? '',
    bases: p.bases ?? [],
    currentBase: p.current_base,
    startBy: (p.start_by as ApplyAnswers['startBy']) ?? null,
    stages: p.stages ?? [],
    functions: p.functions ?? [],
    roles: p.roles ?? [],
    rolesOther: p.roles_other ?? '',
    neverCompanies: (p.never_companies ?? []).join(', '),
    notes: p.notes ?? '',
    consent: !!p.consent_at,
  }
}

// ── the door ──────────────────────────────────────────────────────────────

export async function tooManyAttempts(admin: SupabaseClient, ipHash: string | null): Promise<boolean> {
  if (!ipHash) return false
  const { count } = await admin
    .from('apply_events')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .gt('created_at', new Date(Date.now() - HOUR).toISOString())
  return (count ?? 0) >= 5
}

export async function logEvent(admin: SupabaseClient, e: { email?: string | null; ipHash?: string | null; outcome: string; detail?: string | null; candidateId?: string | null }): Promise<void> {
  await admin.from('apply_events').insert({ email: e.email ?? null, ip_hash: e.ipHash ?? null, outcome: e.outcome, detail: e.detail ?? null, candidate_id: e.candidateId ?? null })
}

export type SubmissionOutcome = { state: 'created'; reviewDate: string } | { state: 'duplicate' } | { state: 'not_resume' }

/**
 * A partner's link or a candidate page was the door. The row is theirs from
 * the first second; Lily sees the person once they confirm (lib/referrals.ts).
 */
export interface ReferralDoor {
  code: string
  userId: string
  referrerName: string
  referrerEmail: string | null
  source: 'link' | 'jd'
  jobId: string | null
  userAgent: string | null
  /** The one optional line the person wrote on the candidate page. */
  candidateNote: string | null
}

function referrerSlackLabel(door: ReferralDoor): string {
  return door.source === 'jd' ? `the candidate page shared by ${esc(door.referrerName)}` : `${esc(door.referrerName)}'s link`
}

export async function createSelfSubmission(
  admin: SupabaseClient,
  input: { bytes: Buffer; filename: string; answers: ApplyAnswers; ipHash: string | null; source: 'apply' | 'go'; sourceCampaign: string | null; referral?: ReferralDoor | null },
): Promise<SubmissionOutcome> {
  const a = input.answers
  const email = normalizeEmail(a.email)
  const linkedin = a.linkedin.trim() || null
  const name = a.fullName.trim()
  const door = input.referral ?? null

  // 1. Already known, by email or LinkedIn? Nothing is created twice and the
  //    parser is never paid for a second copy. A name-only match is not
  //    identity, so it falls through and is flagged on the card as today.
  const dup = await findDuplicate(admin, { email, linkedin_url: linkedin })
  if (dup?.kind === 'hard') {
    const token = await upsertProfile(admin, dup.match.id, a, { source: door ? door.source : input.source, sourceCampaign: door ? door.code : input.sourceCampaign, ipHash: input.ipHash })
    await queueEmail(admin, { to: email, toName: name, email: templateCS1Dup({ fullName: name, profileLink: profileUrl(token) }), dedupeKey: `CS1-dup:${dup.match.id}:${new Date().toISOString().slice(0, 10)}`, meta: { candidate_id: dup.match.id } })
    await logEvent(admin, { email, ipHash: input.ipHash, outcome: 'duplicate', detail: `already on file as ${dup.match.name}`, candidateId: dup.match.id })
    if (door) {
      // Recorded, never credited: the same rule as the submit-time refusal.
      await admin.from('referrals').insert({ candidate_id: dup.match.id, referrer_user_id: door.userId, code: door.code, source: door.source, job_id: door.jobId, status: 'duplicate', candidate_note: door.candidateNote, token: newReferralToken(), token_expires_at: new Date(Date.now() + TOKEN_DAYS * DAY).toISOString(), ip_hash: input.ipHash, user_agent: door.userAgent })
      if (door.referrerEmail) await queueEmail(admin, { to: door.referrerEmail, toName: door.referrerName, userId: door.userId, email: templateRS3({ fullName: door.referrerName, candidate: properName(name) }), dedupeKey: `RS3:${door.userId}:${dup.match.id}`, meta: { candidate_id: dup.match.id } })
      await postToFeed(`:twisted_rightwards_arrows: *${esc(name)}* came through ${referrerSlackLabel(door)}; already on file as *${esc(dup.match.name)}*. Nothing created, not credited; both were told.  ·  <${APP_URL}/candidates/${dup.match.id}|the existing profile>`)
    } else {
      await postToFeed(`:twisted_rightwards_arrows: *${esc(name)}* shared their CV at refery.xyz/apply; already on file as *${esc(dup.match.name)}*. Nothing created; they got the private link to update what they want.  ·  <${APP_URL}/candidates/${dup.match.id}|the existing profile>`)
    }
    return { state: 'duplicate' }
  }

  // 2. Store under the same prefix the upload form uses, then the same extractor.
  const token = newToken()
  const safeName = input.filename.replace(/[^\w.() -]/g, '_').slice(0, 120) || 'cv.pdf'
  const blob = await put(`resumes/self/${token}-${safeName}`, input.bytes, { access: 'private', contentType: 'application/pdf' })
  const parsed = await analyzeResumeFromBlob(blob.pathname)
  if (!looksLikeResume(parsed)) {
    await del(blob.url).catch(() => undefined)
    await logEvent(admin, { email, ipHash: input.ipHash, outcome: 'not_resume', detail: safeName })
    await postToFeed(`:page_facing_up: A file from ${esc(email)} at refery.xyz/apply did not read as a CV. Nothing kept; they were told on the page.`)
    return { state: 'not_resume' }
  }

  // 3. The row. The person's own answers win over what the CV says.
  const derived = candidateRowFromParsed({ parsed, resume_blob_pathname: blob.pathname, resume_filename: input.filename })
  const owner = door ? door.userId : await defaultOwnerUserId(admin)
  if (!owner) throw new Error('No default owner for self-submitted candidates')
  const { data: candidate, error } = await admin
    .from('candidates')
    .insert({
      ...derived,
      ...candidateColumnsFrom(a),
      name,
      email,
      linkedin_url: linkedin ?? toText(derived.linkedin_url),
      parsed_data: parsed,
      user_id: owner,
      owner_user_id: owner,
      uploaded_by_user_id: owner,
      created_by_user_id: owner,
      intake_source: door ? 'referred' : 'self',
      consent_told_candidate: true,
    })
    .select('id')
    .single()
  if (error || !candidate) throw new Error(`insert failed: ${error?.message}`)

  await embedCandidate(candidate.id, parsed as Partial<ParsedResumeData>, name)

  const now = new Date()
  const until = new Date(now)
  until.setUTCMonth(until.getUTCMonth() + RETENTION_MONTHS)
  const { data: profile, error: perr } = await admin
    .from('candidate_profiles')
    .insert({
      candidate_id: candidate.id,
      token,
      email,
      ...profileColumnsFrom(a),
      consent_at: now.toISOString(),
      consent_version: CONSENT_VERSION,
      consent_until: until.toISOString(),
      source: door ? door.source : input.source,
      source_campaign: door ? door.code : input.sourceCampaign,
      ip_hash: input.ipHash,
    })
    .select('id')
    .single()
  if (perr || !profile) throw new Error(`profile insert failed: ${perr?.message}`)

  const date = reviewDate(now)
  await logEvent(admin, { email, ipHash: input.ipHash, outcome: 'created', candidateId: candidate.id })

  if (door) {
    // Theirs, pending their yes. The desk card waits (lib/referrals.ts).
    const rtoken = newReferralToken()
    await admin.from('referrals').insert({
      candidate_id: candidate.id,
      referrer_user_id: door.userId,
      code: door.code,
      source: door.source,
      job_id: door.jobId,
      status: 'pending',
      candidate_note: door.candidateNote,
      token: rtoken,
      token_expires_at: new Date(now.getTime() + TOKEN_DAYS * DAY).toISOString(),
      ip_hash: input.ipHash,
      user_agent: door.userAgent,
    })
    await queueEmail(admin, { to: email, toName: name, email: templateRL1({ fullName: name, referrerName: door.referrerName, reviewDate: date, profileLink: profileUrl(token) }), dedupeKey: `RL1:${profile.id}`, meta: { candidate_id: candidate.id } })
    if (door.referrerEmail) {
      const line = [a.currentLocation.trim() ? `from ${a.currentLocation.trim()}` : null, door.candidateNote ? `and wrote: "${door.candidateNote.slice(0, 140)}"` : null].filter(Boolean).join(' ')
      await queueEmail(admin, {
        to: door.referrerEmail,
        toName: door.referrerName,
        userId: door.userId,
        email: templateRS1({ fullName: door.referrerName, candidate: properName(name), candidateLine: line || null, code: door.code, confirmLink: referralActionUrl(rtoken, 'yes'), declineLink: referralActionUrl(rtoken, 'no'), pageLink: `${APP_URL}/candidates/${candidate.id}` }),
        dedupeKey: `RS1:${candidate.id}`,
        meta: { candidate_id: candidate.id },
      })
    }
    await postToFeed(`:link: *${esc(name)}* came through ${referrerSlackLabel(door)}. The panel reads them now; the card waits for ${esc(door.referrerName.split(/\s+/)[0])}'s yes.  ·  <${APP_URL}/candidates/${candidate.id}|profile>`)
    await checkBurst(admin, door.code, door.userId).catch(() => false)
    return { state: 'created', reviewDate: date }
  }

  await queueEmail(admin, { to: email, toName: name, email: templateCS1({ fullName: name, reviewDate: date, profileLink: profileUrl(token) }), dedupeKey: `CS1:${profile.id}`, meta: { candidate_id: candidate.id } })
  await postToFeed(`:wave: *${esc(name)}* shared their own CV at refery.xyz/apply${input.sourceCampaign ? ` (via the ${esc(input.sourceCampaign)} link)` : ''}. The panel reads them now; the card follows.  ·  <${APP_URL}/candidates/${candidate.id}|profile>`)
  return { state: 'created', reviewDate: date }
}

/** A profile for a candidate that already exists (a duplicate, or a partner's person coming to update). Returns the token. */
async function upsertProfile(admin: SupabaseClient, candidateId: string, a: ApplyAnswers, meta: { source: string; sourceCampaign: string | null; ipHash: string | null }): Promise<string> {
  const { data: existing } = await admin.from('candidate_profiles').select('id, token').eq('candidate_id', candidateId).maybeSingle()
  if (existing) {
    await admin.from('candidate_profiles').update({ ...profileColumnsFrom(a), deleted_at: null }).eq('id', existing.id)
    await admin.from('candidates').update(candidateColumnsFrom(a)).eq('id', candidateId)
    return existing.token as string
  }
  const token = newToken()
  const now = new Date()
  const until = new Date(now)
  until.setUTCMonth(until.getUTCMonth() + RETENTION_MONTHS)
  await admin.from('candidate_profiles').insert({
    candidate_id: candidateId,
    token,
    email: normalizeEmail(a.email),
    ...profileColumnsFrom(a),
    consent_at: now.toISOString(),
    consent_version: CONSENT_VERSION,
    consent_until: until.toISOString(),
    source: meta.source,
    source_campaign: meta.sourceCampaign,
    ip_hash: meta.ipHash,
  })
  await admin.from('candidates').update(candidateColumnsFrom(a)).eq('id', candidateId)
  return token
}

// ── the private page ──────────────────────────────────────────────────────

export async function profileByToken(admin: SupabaseClient, token: string): Promise<ProfileView | null> {
  if (!/^[a-f0-9]{32}$/.test(token)) return null
  const { data: p } = await admin.from('candidate_profiles').select('*').eq('token', token).maybeSingle()
  if (!p) return null
  const { data: c } = await admin.from('candidates').select('id, name, journey_stage, intake_source, resume_filename, resume_blob_pathname, created_at').eq('id', p.candidate_id).maybeSingle()
  if (!c) return null
  const { count } = await admin.from('candidate_consents').select('id', { count: 'exact', head: true }).eq('candidate_id', c.id).eq('status', 'agreed')
  return { profile: p as ProfileRow, candidate: c as ProfileView['candidate'], sharedCount: count ?? 0 }
}

export async function profileById(admin: SupabaseClient, candidateId: string): Promise<ProfileRow | null> {
  const { data } = await admin.from('candidate_profiles').select('*').eq('candidate_id', candidateId).maybeSingle()
  return (data as ProfileRow | null) ?? null
}

export type ProfileStatus = { key: 'deleted' | 'paused' | 'closed' | 'kept' | 'talking' | 'reading'; label: string; detail: string }

export function profileStatus(v: ProfileView): ProfileStatus {
  const p = v.profile
  const j = v.candidate.journey_stage ?? ''
  if (p.deleted_at) return { key: 'deleted', label: 'Deleted', detail: 'Your CV and answers are being removed.' }
  if (p.paused_at) return { key: 'paused', label: 'Paused', detail: 'Nothing is suggested to you until you resume.' }
  if (j === 'not_fit' || j === 'post_committee_not_fit') return { key: 'closed', label: 'Closed', detail: 'Lily wrote to you about this. Your profile stays private.' }
  if (['intro_requested', 'intro_sent', 'committee_call'].includes(j)) return { key: 'talking', label: 'In conversation', detail: 'Lily is in touch with you about a search.' }
  if (['bench', 'warm', 'ready_for_intro'].includes(j)) return { key: 'kept', label: 'Kept in mind', detail: 'You hear from Lily when a search fits what you told us.' }
  return { key: 'reading', label: 'Being read', detail: 'Lily reads every profile herself, within two working days.' }
}

export async function updateProfileAnswers(admin: SupabaseClient, v: ProfileView, a: ApplyAnswers): Promise<void> {
  await admin.from('candidate_profiles').update(profileColumnsFrom(a)).eq('id', v.profile.id)
  await admin.from('candidates').update(candidateColumnsFrom(a)).eq('id', v.candidate.id)
  const says = saysLine({ ...profileColumnsFrom(a) } as Parameters<typeof saysLine>[0])
  await postToFeed(`:pencil2: *${esc(v.candidate.name)}* updated what they're looking for from their private link: ${esc(says)}  ·  <${APP_URL}/candidates/${v.candidate.id}|profile>`)
}

export type ProfileAction = 'pause' | 'resume' | 'renew' | 'delete'

export async function profileAction(admin: SupabaseClient, v: ProfileView, action: ProfileAction): Promise<{ ok: boolean; message: string }> {
  const p = v.profile
  const name = v.candidate.name
  if (action === 'pause') {
    await admin.from('candidate_profiles').update({ paused_at: new Date().toISOString() }).eq('id', p.id)
    await postToFeed(`:pause_button: *${esc(name)}* paused their profile from the private link. Nothing suggested until they come back.`)
    return { ok: true, message: 'Paused. Nothing is suggested to you until you resume.' }
  }
  if (action === 'resume' || action === 'renew') {
    const until = new Date()
    until.setUTCMonth(until.getUTCMonth() + RETENTION_MONTHS)
    await admin
      .from('candidate_profiles')
      .update({ paused_at: null, renewed_at: new Date().toISOString(), consent_until: until.toISOString(), checkin_sent_at: null })
      .eq('id', p.id)
    await postToFeed(`:arrow_forward: *${esc(name)}* is ${action === 'renew' ? 'still looking; profile kept for another 24 months' : 'back; profile resumed'}.`)
    return { ok: true, message: action === 'renew' ? 'Noted. Your profile is kept for another 24 months.' : 'Resumed. You hear from Lily when a search fits.' }
  }
  // delete
  await logEvent(admin, { email: p.email, outcome: 'deleted', candidateId: v.candidate.id, detail: v.candidate.intake_source ?? null })
  // Their own row, whichever door they came through: delete means delete.
  if (v.candidate.intake_source === 'self' || v.profile.source === 'link' || v.profile.source === 'jd') {
    if (v.candidate.resume_blob_pathname) await del(v.candidate.resume_blob_pathname).catch(() => undefined)
    await admin.from('candidates').delete().eq('id', v.candidate.id)
    await postToFeed(`:wastebasket: *${esc(name)}* asked to delete their profile. CV and answers are gone; a dated deletion record stays, nothing else.`)
    return { ok: true, message: 'Done. Your CV and answers are deleted.' }
  }
  await admin.from('candidate_profiles').update({ deleted_at: new Date().toISOString(), paused_at: new Date().toISOString() }).eq('id', p.id)
  await postAlert(`:wastebasket: *${esc(name)}* asked to delete their data, but the profile was uploaded by a partner (${esc(v.candidate.intake_source ?? 'unknown')}). Nothing more is suggested to them; the row itself needs your call.  ·  <${APP_URL}/candidates/${v.candidate.id}|profile>`)
  return { ok: true, message: 'Noted. Nothing more is suggested to you, and we remove your data within 30 days.' }
}

export async function sendFreshLink(admin: SupabaseClient, rawEmail: string): Promise<void> {
  const email = normalizeEmail(rawEmail)
  if (!email.includes('@')) return
  const { data: p } = await admin.from('candidate_profiles').select('id, token, full_name, deleted_at').eq('email', email).is('deleted_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!p) return
  await queueEmail(admin, { to: email, toName: p.full_name, email: templateCSLink({ fullName: (p.full_name as string) || 'there', profileLink: profileUrl(p.token as string) }), dedupeKey: `CS-link:${p.id}:${new Date().toISOString().slice(0, 13)}` })
}

// ── timers, from the daily cron ───────────────────────────────────────────

const PRE_DECISION = ['uploaded', 'calibrating', 'decision_pending']
const KEPT = ['bench', 'warm', 'ready_for_intro', 'uploaded', 'decision_pending', 'calibrating']

export async function runCandidateTimers(admin: SupabaseClient): Promise<{ pending: number; checkins: number; lapsed: number }> {
  const out = { pending: 0, checkins: 0, lapsed: 0 }
  const now = Date.now()
  const iso = (ms: number) => new Date(ms).toISOString()

  // 1. Two working days promised, no decision yet: one honest note, once.
  const { data: waiting } = await admin
    .from('candidate_profiles')
    .select('id, token, email, full_name, candidates!inner(id, name, journey_stage, desk_card_channel, desk_card_ts)')
    .is('pending_sent_at', null)
    .is('deleted_at', null)
    .lt('created_at', iso(now - 2 * DAY))
    .gt('created_at', iso(now - 14 * DAY))
  for (const p of waiting ?? []) {
    const c = (p as unknown as { candidates: { id: string; name: string; journey_stage: string | null; desk_card_channel: string | null; desk_card_ts: string | null } }).candidates
    if (!c || !PRE_DECISION.includes(c.journey_stage ?? '') || !c.desk_card_ts) continue
    const name = (p.full_name as string) || c.name
    const q = await queueEmail(admin, { to: p.email as string, toName: name, email: templateCSP({ fullName: name, newReviewDate: reviewDate(new Date(now)) }), dedupeKey: `CSP:${p.id}`, meta: { candidate_id: c.id } })
    if (!q.ok) continue
    await admin.from('candidate_profiles').update({ pending_sent_at: iso(now) }).eq('id', p.id)
    if (c.desk_card_channel && c.desk_card_ts) await postThreadReply(c.desk_card_channel, c.desk_card_ts, ':hourglass_flowing_sand: Two working days with no decision. A pending note is going to them; the decision is still yours.')
    out.pending++
  }

  // 2. Consent lapsed at 24 months: pause, say so, offer the one-tap renewal.
  const { data: lapsed } = await admin
    .from('candidate_profiles')
    .select('id, token, email, full_name, consent_until, candidates!inner(name)')
    .is('deleted_at', null)
    .is('paused_at', null)
    .lt('consent_until', iso(now))
  for (const p of lapsed ?? []) {
    const name = (p.full_name as string) || (p as unknown as { candidates: { name: string } }).candidates.name
    const t = p.token as string
    const tpl = templateCS6({ fullName: name, keptUntil: 'now', lookingLink: `${profileUrl(t)}?do=looking`, pauseLink: `${profileUrl(t)}?do=pause`, deleteLink: `${profileUrl(t)}?do=delete`, lapsed: true })
    await admin.from('candidate_profiles').update({ paused_at: iso(now) }).eq('id', p.id)
    await queueEmail(admin, { to: p.email as string, toName: name, email: { ...tpl, essential: true }, dedupeKey: `CS6-lapse:${p.id}` })
    out.lapsed++
  }

  // 3. Six months on, untouched and kept in mind: still open?
  const sixMonthsAgo = new Date(now)
  sixMonthsAgo.setUTCMonth(sixMonthsAgo.getUTCMonth() - 6)
  const { data: quiet } = await admin
    .from('candidate_profiles')
    .select('id, token, email, full_name, consent_until, checkin_sent_at, updated_at, candidates!inner(name, journey_stage)')
    .is('deleted_at', null)
    .is('paused_at', null)
    .lt('consent_at', sixMonthsAgo.toISOString())
    .lt('updated_at', iso(now - 90 * DAY))
  for (const p of quiet ?? []) {
    if (p.checkin_sent_at && new Date(p.checkin_sent_at as string).getTime() > sixMonthsAgo.getTime()) continue
    const c = (p as unknown as { candidates: { name: string; journey_stage: string | null } }).candidates
    if (!KEPT.includes(c.journey_stage ?? '')) continue
    const name = (p.full_name as string) || c.name
    const t = p.token as string
    const until = new Date(p.consent_until as string).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    const q = await queueEmail(admin, { to: p.email as string, toName: name, email: templateCS6({ fullName: name, keptUntil: until, lookingLink: `${profileUrl(t)}?do=looking`, pauseLink: `${profileUrl(t)}?do=pause`, deleteLink: `${profileUrl(t)}?do=delete`, lapsed: false }), dedupeKey: `CS6:${p.id}:${iso(now).slice(0, 7)}` })
    if (!q.ok) continue
    await admin.from('candidate_profiles').update({ checkin_sent_at: iso(now) }).eq('id', p.id)
    out.checkins++
  }
  return out
}

/** Who on the bench must not be suggested: paused, deleted, or the company is on their never-list. */
export async function benchExclusions(admin: SupabaseClient, candidateIds: string[], companyName: string | null): Promise<Set<string>> {
  if (!candidateIds.length) return new Set()
  const { data } = await admin.from('candidate_profiles').select('candidate_id, paused_at, deleted_at, never_companies').in('candidate_id', candidateIds)
  const out = new Set<string>()
  const company = (companyName ?? '').toLowerCase().trim()
  for (const p of data ?? []) {
    if (p.paused_at || p.deleted_at) out.add(p.candidate_id as string)
    else if (company && (p.never_companies as string[]).some(n => n.toLowerCase().trim() && (company.includes(n.toLowerCase().trim()) || n.toLowerCase().trim().includes(company)))) out.add(p.candidate_id as string)
  }
  return out
}
