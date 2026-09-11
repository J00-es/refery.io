/**
 * One-tap candidate consent.
 *
 * A partner submitting someone can have Refery email the candidate a short
 * note in the partner's name: "I'd like to put you forward for <anonymised
 * role>. OK?" One tap says yes. That tap is the candidate's consent, the
 * partner's ownership tie-break and the GDPR record, dated. The candidate
 * never sees the company name here; that comes with an Interview.
 */

import { Resend } from 'resend'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/server'
import { notifySlack } from '@/lib/slack'
import { draftFor, loadWriter, messageContext, sendPartnerMessage } from '@/lib/messages'

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://refery.xyz').replace(/\/$/, '')

export function consentUrl(t: string): string {
  return `${APP_URL}/c/${t}`
}

export interface ConsentView {
  id: string
  token: string
  status: 'requested' | 'agreed' | 'declined'
  candidateFirstName: string
  partnerFirstName: string
  partnerName: string
  roleTitle: string
  anonCompany: string
  location: string | null
  answeredAt: string | null
}

export async function loadConsent(admin: SupabaseClient, t: string): Promise<ConsentView | null> {
  if (!/^[a-f0-9]{32}$/.test(t)) return null
  const { data: c } = await admin
    .from('candidate_consents')
    .select('id, token, status, answered_at, candidate_id, company_id, submission_id, requested_by_user_id')
    .eq('token', t)
    .maybeSingle()
  if (!c) return null
  const [{ data: cand }, { data: client }, { data: partner }, { data: sub }] = await Promise.all([
    admin.from('candidates').select('name').eq('id', c.candidate_id).maybeSingle(),
    admin.from('client_companies').select('anon_alias').eq('company_id', c.company_id).maybeSingle(),
    admin.from('users_admin').select('full_name').eq('user_id', c.requested_by_user_id).maybeSingle(),
    c.submission_id ? admin.from('role_submissions_v').select('job_id, job_title').eq('id', c.submission_id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  let roleTitle = (sub?.job_title as string | null) ?? 'a role'
  let location: string | null = null
  if (sub?.job_id) {
    const { data: role } = await admin.from('partner_roles_v').select('headline, location').eq('job_id', sub.job_id).maybeSingle()
    roleTitle = (role?.headline as string | null) || roleTitle
    location = (role?.location as string | null) ?? null
  }
  const anonCompany = (client?.anon_alias as string | null) ?? 'a company we work with'
  // The alias usually names the city already ("marketplace, Barcelona"); say it once.
  const city = location?.split(',')[0]?.trim()
  if (city && anonCompany.toLowerCase().includes(city.toLowerCase())) location = null
  const partnerName = (partner?.full_name as string | null) || 'Your contact'
  return {
    id: c.id as string,
    token: c.token as string,
    status: c.status as ConsentView['status'],
    candidateFirstName: ((cand?.name as string | null) ?? 'there').split(/\s+/)[0],
    partnerFirstName: partnerName.split(/\s+/)[0],
    partnerName,
    roleTitle,
    anonCompany,
    location,
    answeredAt: (c.answered_at as string | null) ?? null,
  }
}

/** Creates the consent and emails the candidate. Returns null when there is no email. */
export async function requestConsent(
  admin: SupabaseClient,
  input: { candidateId: string; companyId: string; submissionId: string; requestedByUserId: string },
): Promise<{ token: string; sent: boolean; error?: string } | null> {
  // Since 2026-09-11 the note is the "Put you forward" moment of the partner
  // composer (lib/messages): sent as "<partner> via Refery", Reply-To the
  // partner, same one-tap page. The composer mints the consent row itself.
  const { data: who } = await admin.from('users_admin').select('user_id, email, full_name, role').eq('user_id', input.requestedByUserId).maybeSingle()
  if (!who?.email) return { token: '', sent: false, error: 'partner not found' }
  const writer = await loadWriter(admin, { id: input.requestedByUserId, email: String(who.email), fullName: (who.full_name as string | null) ?? null, isSuperAdmin: who.role === 'super_admin' })
  const ctx = await messageContext(admin, input.candidateId, writer)
  if (!ctx) return null
  if (!ctx.email) return null
  let draft
  try {
    draft = draftFor(ctx, 'consent', input.submissionId)
  } catch (e) {
    return { token: '', sent: false, error: e instanceof Error ? e.message : 'could not draft' }
  }
  const r = await sendPartnerMessage(admin, ctx, { moment: 'consent', subject: draft.subject, body: draft.body, ccLily: false, submissionId: input.submissionId, via: 'submit' })
  const { data: row } = await admin.from('candidate_consents').select('token').eq('submission_id', input.submissionId).order('created_at', { ascending: false }).limit(1).maybeSingle()
  const t = (row?.token as string | undefined) ?? ''
  if (!r.ok) {
    console.warn('[consent] note not sent', input.submissionId, r.error)
    return { token: t, sent: false, error: r.error }
  }
  console.log('[consent] note sent', input.submissionId)
  return { token: t, sent: true }
}

export async function answerConsent(t: string, answer: 'agreed' | 'declined', meta: { ip: string | null; userAgent: string | null; note: string | null }): Promise<{ ok: boolean; view?: ConsentView; error?: string }> {
  const admin = createAdminClient()
  const view = await loadConsent(admin, t)
  if (!view) return { ok: false, error: 'not found' }
  if (view.status !== 'requested') return { ok: true, view }

  const now = new Date().toISOString()
  const { data: row } = await admin
    .from('candidate_consents')
    .update({ status: answer, answered_at: now, note: meta.note, ip: meta.ip, user_agent: meta.userAgent, updated_at: now })
    .eq('token', t)
    .select('submission_id, candidate_id, company_id, requested_by_user_id')
    .single()
  if (row?.submission_id) {
    await admin
      .from('role_submissions')
      .update({ consent_status: answer, consent_at: now, ...(answer === 'agreed' ? { spoken_to_candidate: 'interested' } : {}) })
      .eq('id', row.submission_id)
  }

  const { data: partner } = await admin.from('users_admin').select('email, full_name').eq('user_id', row?.requested_by_user_id ?? '').maybeSingle()
  await notifySlack({
    stream: 'clients',
    emoji: answer === 'agreed' ? ':white_check_mark:' : ':no_entry_sign:',
    title: `${view.candidateFirstName} ${answer === 'agreed' ? 'agreed to be put forward' : 'said not now'} for ${view.roleTitle}`,
    context: `Asked by ${view.partnerName}. ${answer === 'agreed' ? 'Consent, ownership and the GDPR record are dated now.' : 'The submission stays, marked declined by the candidate; tell the partner.'}`,
    fields: [{ label: 'Client', value: view.anonCompany }],
  })
  if (partner?.email && process.env.RESEND_API_KEY) {
    const first = ((partner.full_name as string | null) ?? '').split(/\s+/)[0] || 'there'
    const body =
      answer === 'agreed'
        ? `Hi ${first},\n\n${view.candidateFirstName} said yes to being put forward for ${view.roleTitle}. That tap is their consent and the start of your protection on them with this client.\n\nNothing more from you on this one: Refery reviews next, and the stage moves on the search page.\n\nBest,\nLily`
        : `Hi ${first},\n\n${view.candidateFirstName} said not now to ${view.roleTitle}. The submission stays on your pipeline as declined by the candidate; no need to chase.\n\nBest,\nLily`
    try {
      const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({ from: 'Lily at Refery <hello@refery.io>', to: partner.email as string, replyTo: 'lily@refery.io', subject: `[Refery] ${view.candidateFirstName} | ${answer === 'agreed' ? 'said yes' : 'said not now'}`, text: body })
      if (error) console.warn('[consent] partner email failed', error.message)
      else console.log('[consent] partner told', answer)
    } catch (e) {
      console.warn('[consent] partner email failed', e instanceof Error ? e.message : e)
    }
  }
  return { ok: true, view: { ...view, status: answer, answeredAt: now } }
}
