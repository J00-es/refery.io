/**
 * Partners write to their own candidates from the portal.
 *
 * The partner is the author; Refery is the postal service with a few house
 * rules. A message goes out through Resend as "Name via Refery
 * <partners@refery.io>" (the domain carries the reputation, the display name
 * carries the person), Reply-To the partner's own address plus a per-thread
 * alias on the receiving domain, so the reply lands in the partner's inbox and
 * a copy lands on the candidate's record through the same inbound webhook that
 * ingests emailed CVs. Nothing is ever sent automatically; nothing here calls
 * a model.
 *
 * Every send writes its candidate_emails row first, then calls Resend with an
 * idempotency key, then applies the moment's one side effect (told the
 * candidate; consent requested; intro sent). A failure is written to the row
 * and shown to the partner in plain words.
 */

import { randomBytes } from 'node:crypto'
import { Resend } from 'resend'
import type { SupabaseClient } from '@supabase/supabase-js'
import { esc, textToHtml } from '@/lib/desk/html'
import { logActivity } from '@/lib/desk/outbound'
import { properName } from '@/lib/desk/people'
import { recordHumanDecision } from '@/lib/engine/decisions'
import { MOMENT_KIND, MOMENT_LABEL, MOMENTS, footerText, renderMoment, type Draft, type Moment, type MomentFacts } from '@/lib/messages/templates'

export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://refery.xyz').replace(/\/$/, '')
const FROM_ADDRESS = process.env.MESSAGES_FROM_ADDRESS ?? 'partners@refery.io'
/** The domain Resend receives on. Unset: replies go to the partner only and are not captured. */
const INBOUND_DOMAIN = (process.env.MESSAGES_INBOUND_DOMAIN ?? '').trim().toLowerCase() || null
const DEFAULT_PER_DAY = 30
const PER_CANDIDATE_HOURS = 24
const ALIAS_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

export { MOMENTS, MOMENT_LABEL, type Moment }

// ── who is writing, to whom ──────────────────────────────────────────────────

export interface Writer {
  userId: string
  email: string
  name: string
  first: string
  signature: string | null
  perDay: number
  isSuperAdmin: boolean
}

export interface SubmissionView {
  id: string
  jobId: string
  companyId: string
  status: string
  consentStatus: string | null
  jobTitle: string
  companyName: string
  headline: string | null
  location: string | null
  anonAlias: string | null
  bookingUrl: string | null
  interviewSteps: string | null
  declineReason: string | null
  startDate: string | null
}

export interface MessageContext {
  candidate: Record<string, unknown>
  candidateFirst: string
  email: string | null
  writer: Writer
  submissions: SubmissionView[]
  /** A hard stop that applies to every moment, in plain words. */
  blocked: string | null
  /** Per moment: why it cannot be sent right now, or null. */
  unavailable: Partial<Record<Moment, string>>
  /** The moment the page should open on, given where the person is. */
  suggested: Moment
}

export async function loadWriter(admin: SupabaseClient, user: { id: string; email: string; fullName: string | null; isSuperAdmin: boolean }): Promise<Writer> {
  const { data } = await admin.from('users_admin').select('full_name, signature, messages_per_day').eq('user_id', user.id).maybeSingle()
  const name = ((data?.full_name as string | null) ?? user.fullName ?? '').trim() || user.email.split('@')[0]
  return {
    userId: user.id,
    email: user.email.toLowerCase(),
    name,
    first: name.split(/\s+/)[0],
    signature: ((data?.signature as string | null) ?? '').trim() || null,
    perDay: (data?.messages_per_day as number | null) ?? DEFAULT_PER_DAY,
    isSuperAdmin: user.isSuperAdmin,
  }
}

function stepsText(v: unknown): string | null {
  if (!v) return null
  if (typeof v === 'string') return v.trim() || null
  if (Array.isArray(v)) {
    const lines = v
      .map(s => (typeof s === 'string' ? s : s && typeof s === 'object' ? String((s as Record<string, unknown>).label ?? (s as Record<string, unknown>).step ?? (s as Record<string, unknown>).title ?? '') : ''))
      .map(s => s.trim())
      .filter(Boolean)
    return lines.length ? lines.map((l, i) => `${i + 1}. ${l}`).join('\n') : null
  }
  return null
}

async function loadSubmissions(admin: SupabaseClient, candidateId: string, writer: Writer): Promise<SubmissionView[]> {
  let q = admin
    .from('role_submissions_v')
    .select('id, job_id, company_id, status, consent_status, job_title, company_name, decline_reason, start_date, submitted_by_user_id')
    .eq('candidate_id', candidateId)
    .order('created_at', { ascending: false })
  if (!writer.isSuperAdmin) q = q.eq('submitted_by_user_id', writer.userId)
  const { data: rows } = await q.limit(10)
  if (!rows?.length) return []
  const jobIds = [...new Set(rows.map(r => r.job_id as string))]
  const companyIds = [...new Set(rows.map(r => r.company_id as string))]
  const [{ data: roles }, { data: clients }] = await Promise.all([
    admin.from('partner_roles_v').select('job_id, headline, location, interview_steps').in('job_id', jobIds),
    admin.from('client_companies').select('company_id, anon_alias, booking_url').in('company_id', companyIds),
  ])
  const roleBy = new Map((roles ?? []).map(r => [r.job_id as string, r]))
  const clientBy = new Map((clients ?? []).map(c => [c.company_id as string, c]))
  return rows.map(r => {
    const role = roleBy.get(r.job_id as string)
    const client = clientBy.get(r.company_id as string)
    return {
      id: r.id as string,
      jobId: r.job_id as string,
      companyId: r.company_id as string,
      status: String(r.status),
      consentStatus: (r.consent_status as string | null) ?? null,
      jobTitle: String(r.job_title ?? ''),
      companyName: String(r.company_name ?? ''),
      headline: (role?.headline as string | null) ?? null,
      location: (role?.location as string | null) ?? null,
      anonAlias: (client?.anon_alias as string | null) ?? null,
      bookingUrl: (client?.booking_url as string | null) ?? null,
      interviewSteps: stepsText(role?.interview_steps),
      declineReason: (r.decline_reason as string | null) ?? null,
      startDate: (r.start_date as string | null) ?? null,
    }
  })
}

const OPEN_STATUSES = ['submitted', 'shortlisted', 'sent_to_client']

/** The submission a moment is about, by default the most recent one in the right state. */
export function submissionForMoment(subs: SubmissionView[], moment: Moment, submissionId?: string | null): SubmissionView | null {
  const pick = submissionId ? subs.find(s => s.id === submissionId) ?? null : null
  if (pick) return pick
  switch (moment) {
    case 'consent':
      return subs.find(s => OPEN_STATUSES.includes(s.status) && s.consentStatus !== 'agreed' && s.consentStatus !== 'requested') ?? null
    case 'interview':
      return subs.find(s => s.status === 'client_interview' || s.status === 'offer') ?? null
    case 'pass':
      return subs.find(s => s.status === 'declined') ?? null
    case 'hired':
      return subs.find(s => s.status === 'placed') ?? null
    default:
      return subs.find(s => OPEN_STATUSES.includes(s.status) || s.status === 'client_interview') ?? subs[0] ?? null
  }
}

function validEmail(v: unknown): string | null {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? v.trim().toLowerCase() : null
}

export async function messageContext(admin: SupabaseClient, candidateId: string, writer: Writer): Promise<MessageContext | null> {
  const { data: candidate } = await admin.from('candidates').select('*').eq('id', candidateId).maybeSingle()
  if (!candidate) return null
  const first = properName(candidate.name as string).split(/\s+/)[0]
  const email = validEmail(candidate.email)
  const [submissions, { data: state }, { data: dnc }] = await Promise.all([
    loadSubmissions(admin, candidateId, writer),
    admin.from('candidate_contact_state').select('bounced_at, bounced_email, opted_out_at').eq('candidate_id', candidateId).maybeSingle(),
    admin.from('candidate_human_decisions').select('id').eq('candidate_id', candidateId).eq('kind', 'contact').eq('value', 'do_not_contact').is('revoked_at', null).limit(1),
  ])

  let blocked: string | null = null
  if (!email) blocked = `There is no email address on ${first}'s profile. Add one under Edit and come back.`
  else if (state?.opted_out_at || dnc?.length) blocked = `${first} asked not to be contacted through Refery.`
  else if (state?.bounced_at && state.bounced_email === email) blocked = `Mail to ${email} bounced. Update the address under Edit and try again.`
  else {
    const dayAgo = new Date(Date.now() - 24 * 3_600_000).toISOString()
    const { count } = await admin.from('candidate_emails').select('id', { count: 'exact', head: true }).eq('sent_by_user_id', writer.userId).eq('direction', 'out').gt('created_at', dayAgo).not('sent_at', 'is', null)
    if ((count ?? 0) >= writer.perDay) blocked = `You have sent ${count} messages in the last 24 hours, which is the daily limit. Ask Lily if you need more.`
  }

  const unavailable: Partial<Record<Moment, string>> = {}
  const stage = String(candidate.journey_stage ?? '')
  if (stage !== 'intro_requested') unavailable.intro = 'Lily has not asked for an intro yet. This one appears when she does.'
  if (!submissionForMoment(submissions, 'consent')) unavailable.consent = submissions.some(s => s.consentStatus === 'agreed') ? `${first} has already agreed to be put forward.` : submissions.some(s => s.consentStatus === 'requested') ? `Already asked; waiting on ${first}'s tap.` : `Put ${first} forward on a search first; the ask goes with it.`
  if (!submissionForMoment(submissions, 'interview')) unavailable.interview = 'No client has asked to interview them yet.'
  if (!submissionForMoment(submissions, 'pass')) unavailable.pass = 'No client has passed on them.'
  if (!submissionForMoment(submissions, 'hired')) unavailable.hired = 'No accepted offer on file.'

  const suggested: Moment = stage === 'intro_requested' ? 'intro' : !unavailable.interview ? 'interview' : !unavailable.pass ? 'pass' : !unavailable.hired ? 'hired' : !unavailable.consent && candidate.consent_told_candidate ? 'consent' : 'received'

  return { candidate, candidateFirst: first, email, writer, submissions, blocked, unavailable, suggested }
}

// ── drafting ─────────────────────────────────────────────────────────────────

export interface DraftView extends Draft {
  moment: Moment
  submissionId: string | null
  to: string | null
  ccLily: boolean
  /** One line under the Send button saying what moves. */
  effect: string
}

function fmtDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function factsFor(ctx: MessageContext, moment: Moment, sub: SubmissionView | null, consentLink: string | null): MomentFacts {
  const agreed = sub?.consentStatus === 'agreed' || (sub ? ['client_interview', 'offer', 'placed', 'declined'].includes(sub.status) : false)
  const companyOrAlias = sub ? (agreed ? sub.companyName : sub.anonAlias || 'a company I work with') : null
  return {
    candidateFirst: ctx.candidateFirst,
    partnerFirst: ctx.writer.first,
    partnerName: ctx.writer.name,
    signature: ctx.writer.signature,
    searchHeadline: sub ? sub.headline || sub.jobTitle : null,
    companyOrAlias,
    city: sub?.location?.split(',')[0]?.trim() || null,
    bookingLink: sub?.bookingUrl ?? null,
    interviewSteps: sub?.interviewSteps ?? null,
    reason: sub?.declineReason ?? null,
    startDate: fmtDate(sub?.startDate ?? null),
    consentLink,
  }
}

export function effectFor(moment: Moment, first: string, sub: SubmissionView | null = null): string {
  switch (moment) {
    case 'received':
      return `On send: "told the candidate" becomes yes. Nothing else moves.`
    case 'consent':
      return `On send: the one-tap consent ask goes in your name; ${first}'s tap answers it. The company stays an alias until then.`
    case 'intro':
      return `On send: ${first} moves to Intro sent, Lily gets her copy and follows up. Nothing else.`
    case 'interview':
      return sub?.bookingUrl
        ? `On send: kept on ${first}'s record and the submission. The client's booking link is the call to action.`
        : `On send: kept on ${first}'s record. No booking link on this client yet, so the draft says Lily is setting up the first call; she makes the introduction to the hiring manager.`
    case 'pass':
    case 'hired':
    case 'blank':
      return `On send: kept on ${first}'s record. Nothing moves.`
  }
}

export function draftFor(ctx: MessageContext, moment: Moment, submissionId?: string | null): DraftView {
  const sub = submissionForMoment(ctx.submissions, moment, submissionId)
  // The consent page link is minted at send time; the draft shows where it goes.
  const facts = factsFor(ctx, moment, sub, moment === 'consent' ? `${APP_URL}/c/…` : null)
  const d = renderMoment(moment, facts)
  return { ...d, moment, submissionId: sub?.id ?? null, to: ctx.email, ccLily: moment === 'intro', effect: effectFor(moment, ctx.candidateFirst, sub) }
}

// ── the rules at send time ───────────────────────────────────────────────────

/** Client names the candidate must not read before agreeing, for this candidate. */
function protectedNames(ctx: MessageContext): string[] {
  return ctx.submissions
    .filter(s => OPEN_STATUSES.includes(s.status) && s.consentStatus !== 'agreed')
    .map(s => s.companyName.trim())
    .filter(n => n.length >= 3)
}

export function namesClientTooEarly(ctx: MessageContext, moment: Moment, text: string): string | null {
  if (!['received', 'consent', 'intro', 'blank'].includes(moment)) return null
  const hay = text.toLowerCase()
  for (const n of protectedNames(ctx)) {
    if (hay.includes(n.toLowerCase())) return n
  }
  return null
}

async function recentOutbound(admin: SupabaseClient, candidateId: string): Promise<{ blockedUntil: string | null }> {
  const since = new Date(Date.now() - PER_CANDIDATE_HOURS * 3_600_000).toISOString()
  const { data: last } = await admin
    .from('candidate_emails')
    .select('created_at, direction')
    .eq('candidate_id', candidateId)
    .not('sent_by_user_id', 'is', null)
    .gt('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1)
  const row = last?.[0]
  // A reply from the candidate since the last message lifts the 24-hour rule.
  if (!row || row.direction === 'in') return { blockedUntil: null }
  return { blockedUntil: new Date(new Date(row.created_at as string).getTime() + PER_CANDIDATE_HOURS * 3_600_000).toISOString() }
}

// ── sending ──────────────────────────────────────────────────────────────────

function newAlias(): string {
  const bytes = randomBytes(7)
  let s = ''
  for (const b of bytes) s += ALIAS_ALPHABET[b % ALIAS_ALPHABET.length]
  return `m-${s}`
}

async function stopUrlFor(admin: SupabaseClient, candidateId: string): Promise<string> {
  await admin.from('candidate_contact_state').upsert({ candidate_id: candidateId }, { onConflict: 'candidate_id', ignoreDuplicates: true })
  const { data } = await admin.from('candidate_contact_state').select('opt_out_token').eq('candidate_id', candidateId).maybeSingle()
  return `${APP_URL}/stop/${data?.opt_out_token ?? ''}`
}

export interface SendInput {
  moment: Moment
  subject: string
  body: string
  ccLily: boolean
  submissionId?: string | null
  /** Where the send came from, for the record. */
  via: 'page' | 'submit' | 'mcp'
}

export type SendResult = { ok: true; emailId: string; message: string } | { ok: false; error: string; code: string }

export async function sendPartnerMessage(admin: SupabaseClient, ctx: MessageContext, input: SendInput): Promise<SendResult> {
  const first = ctx.candidateFirst
  if (!MOMENTS.includes(input.moment)) return { ok: false, error: 'Unknown moment.', code: 'moment' }
  if (ctx.blocked) return { ok: false, error: ctx.blocked, code: 'blocked' }
  if (ctx.unavailable[input.moment]) return { ok: false, error: ctx.unavailable[input.moment]!, code: 'unavailable' }
  const email = ctx.email!
  const subject = input.subject.trim()
  const body = input.body.trim()
  if (!subject) return { ok: false, error: 'Give it a subject.', code: 'subject' }
  if (!body) return { ok: false, error: 'The message is empty.', code: 'body' }
  if (body.length > 12_000) return { ok: false, error: 'That is longer than an email should be. Keep it under 12,000 characters.', code: 'body' }

  const tooEarly = namesClientTooEarly(ctx, input.moment, `${subject}\n${body}`)
  if (tooEarly) return { ok: false, error: `Name the company only after ${first} has agreed to be put forward. Until then it is the alias; "${tooEarly}" has to come out.`, code: 'client_name' }

  const recent = await recentOutbound(admin, ctx.candidate.id as string)
  if (recent.blockedUntil) {
    const at = new Date(recent.blockedUntil).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    return { ok: false, error: `One message per person per day, unless they reply. You can write to ${first} again after ${at}.`, code: 'rate' }
  }

  const sub = submissionForMoment(ctx.submissions, input.moment, input.submissionId)
  if (['consent', 'interview', 'pass', 'hired'].includes(input.moment) && !sub) return { ok: false, error: 'That moment needs a submission and there is none in the right state.', code: 'unavailable' }

  // The consent ask mints its token first, so the body can carry the real link.
  let finalBody = body
  let consentToken: string | null = null
  if (input.moment === 'consent' && sub) {
    consentToken = Array.from(randomBytes(16), b => b.toString(16).padStart(2, '0')).join('')
    const { error } = await admin.from('candidate_consents').insert({
      token: consentToken,
      candidate_id: ctx.candidate.id,
      company_id: sub.companyId,
      submission_id: sub.id,
      requested_by_user_id: ctx.writer.userId,
      email,
    })
    if (error) return { ok: false, error: `Could not record the ask: ${error.message}`, code: 'consent' }
    await admin.from('role_submissions').update({ consent_status: 'requested' }).eq('id', sub.id)
    const link = `${APP_URL}/c/${consentToken}`
    finalBody = finalBody.includes(`${APP_URL}/c/`) ? finalBody.replace(/https?:\/\/\S+\/c\/\S*/g, link) : `${finalBody}\n\n${link}`
  }

  const stopUrl = await stopUrlFor(admin, ctx.candidate.id as string)
  const footer = footerText(ctx.writer.name, ctx.writer.first, stopUrl)
  const text = `${finalBody}\n\n--\n${footer}`
  const html = `${textToHtml(finalBody)}<p style="margin:18px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11.5px;line-height:1.5;color:#9C9C95">Sent by ${esc(ctx.writer.name)} through Refery. Replies go to ${esc(ctx.writer.first)}. Prefer no email from Refery? <a href="${esc(stopUrl)}" style="color:#6E6E68">Stop here</a>.</p>`

  const alias = INBOUND_DOMAIN ? newAlias() : null
  const replyTo = alias ? [ctx.writer.email, `${alias}@${INBOUND_DOMAIN}`] : [ctx.writer.email]
  const cc = input.ccLily ? ['lily@refery.io'] : []

  const { data: row, error: rowErr } = await admin
    .from('candidate_emails')
    .insert({
      candidate_id: ctx.candidate.id,
      kind: MOMENT_KIND[input.moment],
      to_email: email,
      cc_emails: cc,
      subject,
      body: text,
      sent_by: ctx.writer.email,
      sent_by_user_id: ctx.writer.userId,
      direction: 'out',
      provider: 'resend',
      reply_to: replyTo.join(', '),
      thread_alias: alias,
      meta: { moment: input.moment, submission_id: sub?.id ?? null, via: input.via, consent_token: consentToken },
    })
    .select('id')
    .single()
  if (rowErr || !row) return { ok: false, error: `Could not record the message: ${rowErr?.message ?? 'unknown'}`, code: 'ledger' }
  const emailId = row.id as string

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    await admin.from('candidate_emails').update({ error: 'RESEND_API_KEY not set' }).eq('id', emailId)
    return { ok: false, error: 'Sending is not configured on this server.', code: 'config' }
  }
  try {
    const resend = new Resend(apiKey)
    const res = await resend.emails.send(
      {
        from: `${ctx.writer.name} via Refery <${FROM_ADDRESS}>`,
        to: email,
        cc: cc.length ? cc : undefined,
        replyTo,
        subject,
        text,
        html,
        headers: { 'List-Unsubscribe': `<${stopUrl}>` },
      },
      { idempotencyKey: `pm-${emailId}` },
    )
    if (res.error) throw new Error(res.error.message || JSON.stringify(res.error))
    const now = new Date().toISOString()
    await admin.from('candidate_emails').update({ sent_at: now, provider_id: res.data?.id ?? null, error: null }).eq('id', emailId)
    await admin.from('candidates').update({ last_contacted: now, updated_at: now }).eq('id', ctx.candidate.id)
    await logActivity(admin, ctx.candidate.id as string, 'email_sent', `${MOMENT_LABEL[input.moment]} from ${ctx.writer.name} to ${email}: "${subject}"`, {
      source: 'human',
      performedBy: ctx.writer.userId,
      metadata: { email_id: emailId, kind: MOMENT_KIND[input.moment], moment: input.moment, via: input.via },
    })
    await afterSend(admin, ctx, input.moment, sub)
    return { ok: true, emailId, message: `Sent to ${first}. Replies land in your inbox${alias ? ' and on this page' : ''}.` }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'send failed'
    await admin.from('candidate_emails').update({ error: message.slice(0, 500) }).eq('id', emailId)
    if (consentToken && sub) {
      await admin.from('candidate_consents').delete().eq('token', consentToken)
      await admin.from('role_submissions').update({ consent_status: null }).eq('id', sub.id)
    }
    return { ok: false, error: `The email did not send: ${message}. Nothing has changed; try again in a minute.`, code: 'send' }
  }
}

/** The one thing each moment moves after the mail is out. */
async function afterSend(admin: SupabaseClient, ctx: MessageContext, moment: Moment, sub: SubmissionView | null): Promise<void> {
  const id = ctx.candidate.id as string
  if (moment === 'received' && ctx.candidate.consent_told_candidate !== true) {
    await admin.from('candidates').update({ consent_told_candidate: true }).eq('id', id)
  }
  if (moment === 'intro' && String(ctx.candidate.journey_stage) === 'intro_requested') {
    const { onIntroLanded } = await import('@/lib/desk/followups')
    await onIntroLanded(admin, ctx.candidate, { threadId: '', from: ctx.writer.email, at: Date.now() }, ctx.writer.email)
    await logActivity(admin, id, 'signal_seen', `${ctx.writer.first} sent the intro from Refery, Lily in copy.`, { source: 'human', performedBy: ctx.writer.userId })
    await admin.from('desk_links').update({ used_at: new Date().toISOString() }).eq('candidate_id', id).is('used_at', null)
  }
  void sub
}

// ── replies ──────────────────────────────────────────────────────────────────

const ALIAS_RE = /^(m-[a-z0-9]{7})@/i

/** The thread alias in a list of recipients, if any. */
export function aliasIn(recipients: unknown): string | null {
  const list = Array.isArray(recipients) ? recipients : typeof recipients === 'string' ? [recipients] : []
  for (const r of list) {
    const addr = String(r).match(/<([^>]+)>/)?.[1] ?? String(r)
    const m = addr.trim().match(ALIAS_RE)
    if (m) return m[1].toLowerCase()
  }
  return null
}

/** Full text of a received email, from Resend's receiving API. */
async function receivedText(emailId: string, apiKey: string): Promise<{ text: string | null; subject: string | null; from: string | null }> {
  const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, { headers: { Authorization: `Bearer ${apiKey}` } })
  if (!res.ok) return { text: null, subject: null, from: null }
  const body = (await res.json()) as { text?: string; html?: string; subject?: string; from?: string }
  const text = (body.text ?? '').trim() || (body.html ? body.html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+\n/g, '\n').replace(/[ \t]+/g, ' ').trim() : '')
  return { text: text || null, subject: body.subject ?? null, from: body.from ?? null }
}

/** Strip the quoted history so the timeline shows what was actually written. */
function topOfReply(text: string): string {
  const cut = text.search(/\n(On .{5,120} wrote:|-{2,}\s*Original Message|From: .+\n(Sent|Date):)/)
  return (cut > 0 ? text.slice(0, cut) : text).trim()
}

export async function captureReply(admin: SupabaseClient, event: { emailId: string; from: string | null; to: unknown; cc: unknown; subject: string | null; createdAt: string | null }): Promise<'filed' | 'no_alias' | 'unknown_alias' | 'skipped'> {
  const alias = aliasIn(event.to) ?? aliasIn(event.cc)
  if (!alias) return 'no_alias'
  const { data: out } = await admin
    .from('candidate_emails')
    .select('id, candidate_id, sent_by, sent_by_user_id, to_email, reply_to')
    .eq('thread_alias', alias)
    .eq('direction', 'out')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!out) return 'unknown_alias'
  const { data: dup } = await admin.from('candidate_emails').select('id').eq('provider_id', event.emailId).limit(1)
  if (dup?.length) return 'skipped'

  const apiKey = process.env.RESEND_API_KEY
  const received = apiKey ? await receivedText(event.emailId, apiKey) : { text: null, subject: null, from: null }
  const fromAddr = (event.from ?? received.from ?? '').match(/<([^>]+)>/)?.[1] ?? (event.from ?? received.from ?? '')
  const from = fromAddr.trim().toLowerCase()
  const fromCandidate = from === String(out.to_email).toLowerCase()
  const fromPartner = from === String(out.sent_by).toLowerCase()
  const text = topOfReply(received.text ?? '') || '(no text)'
  const direction = fromPartner ? 'out' : 'in'

  await admin.from('candidate_emails').insert({
    candidate_id: out.candidate_id,
    kind: fromCandidate ? 'candidate_reply' : fromPartner ? 'partner_followup' : 'thread_message',
    to_email: fromPartner ? out.to_email : String(out.sent_by),
    cc_emails: [],
    subject: event.subject ?? received.subject ?? '',
    body: text.slice(0, 20_000),
    sent_by: from,
    sent_by_user_id: out.sent_by_user_id,
    direction,
    provider: 'resend',
    provider_id: event.emailId,
    thread_alias: alias,
    sent_at: event.createdAt ?? new Date().toISOString(),
    read_at: direction === 'out' ? new Date().toISOString() : null,
    meta: { in_reply_to: out.id, from },
  })
  const { data: c } = await admin.from('candidates').select('name').eq('id', out.candidate_id).maybeSingle()
  const who = fromCandidate ? properName((c?.name as string) ?? '').split(/\s+/)[0] : from
  const snippet = text.replace(/\s+/g, ' ').slice(0, 140)
  await logActivity(admin, out.candidate_id as string, 'contact_made', `${fromPartner ? 'Follow-up from the partner' : `Reply from ${who}`}: "${snippet}"`, { source: 'automation', metadata: { provider_id: event.emailId, alias } })
  return 'filed'
}

// ── bounces, complaints, stops ───────────────────────────────────────────────

export async function recordBounce(admin: SupabaseClient, event: { type: string; emailId: string | null; to: unknown }): Promise<number> {
  const list = (Array.isArray(event.to) ? event.to : typeof event.to === 'string' ? [event.to] : []).map(a => (String(a).match(/<([^>]+)>/)?.[1] ?? String(a)).trim().toLowerCase())
  if (!list.length) return 0
  const { data: cands } = await admin.from('candidates').select('id, email').in('email', list)
  let n = 0
  for (const c of cands ?? []) {
    const now = new Date().toISOString()
    const patch = event.type === 'email.complained' ? { opted_out_at: now, updated_at: now } : { bounced_at: now, bounced_email: String(c.email).toLowerCase(), updated_at: now }
    await admin.from('candidate_contact_state').upsert({ candidate_id: c.id, ...patch }, { onConflict: 'candidate_id' })
    if (event.type === 'email.complained') {
      await recordHumanDecision(admin, { candidateId: c.id as string, kind: 'contact', value: 'do_not_contact', actor: 'candidate', sourceEvent: 'email_complaint', sourceRef: { provider_id: event.emailId }, reason: 'Marked a Refery email as spam.', dedupeKey: `complaint:${c.id}` })
    }
    await logActivity(admin, c.id as string, 'email_sent', event.type === 'email.complained' ? `Marked a Refery email as spam; no more mail.` : `Mail to ${c.email} bounced.`, { source: 'automation', metadata: { provider_id: event.emailId, event: event.type } })
    if (event.emailId) await admin.from('candidate_emails').update({ error: event.type }).eq('provider_id', event.emailId)
    n++
  }
  return n
}

export async function stopContact(admin: SupabaseClient, token: string, meta: { ip: string | null }): Promise<{ ok: boolean; first?: string; already?: boolean }> {
  if (!/^[a-f0-9]{32}$/.test(token)) return { ok: false }
  const { data: state } = await admin.from('candidate_contact_state').select('candidate_id, opted_out_at').eq('opt_out_token', token).maybeSingle()
  if (!state) return { ok: false }
  const { data: c } = await admin.from('candidates').select('name').eq('id', state.candidate_id).maybeSingle()
  const first = properName((c?.name as string) ?? '').split(/\s+/)[0]
  if (state.opted_out_at) return { ok: true, first, already: true }
  const now = new Date().toISOString()
  await admin.from('candidate_contact_state').update({ opted_out_at: now, updated_at: now }).eq('candidate_id', state.candidate_id)
  await recordHumanDecision(admin, { candidateId: state.candidate_id as string, kind: 'contact', value: 'do_not_contact', actor: 'candidate', sourceEvent: 'message_stop_link', sourceRef: { ip: meta.ip }, reason: 'Tapped the stop link in a partner message.', dedupeKey: `stop:${state.candidate_id}` })
  await logActivity(admin, state.candidate_id as string, 'decision_made', `${first} asked not to be contacted through Refery (stop link).`, { source: 'human' })
  return { ok: true, first }
}

/** Unread replies per candidate, for the list's "replied" chip. */
export async function unreadReplies(admin: SupabaseClient, candidateIds: string[]): Promise<Set<string>> {
  if (!candidateIds.length) return new Set()
  const { data } = await admin.from('candidate_emails').select('candidate_id').in('candidate_id', candidateIds).eq('direction', 'in').is('read_at', null)
  return new Set((data ?? []).map(r => r.candidate_id as string))
}

export async function markRepliesRead(admin: SupabaseClient, candidateId: string): Promise<void> {
  await admin.from('candidate_emails').update({ read_at: new Date().toISOString() }).eq('candidate_id', candidateId).eq('direction', 'in').is('read_at', null)
}
