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

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://refery.xyz').replace(/\/$/, '')
const FROM = 'Refery <hello@refery.io>'

function token(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

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
  const partnerName = (partner?.full_name as string | null) || 'Your contact'
  return {
    id: c.id as string,
    token: c.token as string,
    status: c.status as ConsentView['status'],
    candidateFirstName: ((cand?.name as string | null) ?? 'there').split(/\s+/)[0],
    partnerFirstName: partnerName.split(/\s+/)[0],
    partnerName,
    roleTitle,
    anonCompany: (client?.anon_alias as string | null) ?? 'a company we work with',
    location,
    answeredAt: (c.answered_at as string | null) ?? null,
  }
}

/** Creates the consent and emails the candidate. Returns null when there is no email. */
export async function requestConsent(
  admin: SupabaseClient,
  input: { candidateId: string; companyId: string; submissionId: string; requestedByUserId: string },
): Promise<{ token: string; sent: boolean; error?: string } | null> {
  const { data: cand } = await admin.from('candidates').select('email, name').eq('id', input.candidateId).maybeSingle()
  const email = typeof cand?.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cand.email) ? cand.email.trim().toLowerCase() : null
  if (!email) return null

  const t = token()
  const { error } = await admin.from('candidate_consents').insert({
    token: t,
    candidate_id: input.candidateId,
    company_id: input.companyId,
    submission_id: input.submissionId,
    requested_by_user_id: input.requestedByUserId,
    email,
  })
  if (error) return { token: t, sent: false, error: error.message }
  await admin.from('role_submissions').update({ consent_status: 'requested' }).eq('id', input.submissionId)

  const view = await loadConsent(admin, t)
  if (!view) return { token: t, sent: false, error: 'could not load' }

  const url = consentUrl(t)
  const subject = `${view.partnerFirstName} would like to put you forward for a role`
  const text = `Hi ${view.candidateFirstName},\n\n${view.partnerName} would like to put you forward, through Refery, for a ${view.roleTitle} role at ${view.anonCompany}${view.location ? ` (${view.location})` : ''}. Nothing is shared with the company until you say so.\n\nOne tap is enough:\n${url}\n\nIf it is not for you, the same link has a "not now". Either way, ${view.partnerFirstName} hears back today.\n\nRefery`
  const html = `<div style="font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#161613;max-width:560px;">
<p>Hi ${view.candidateFirstName},</p>
<p><strong>${view.partnerName}</strong> would like to put you forward, through Refery, for a <strong>${view.roleTitle}</strong> role at ${view.anonCompany}${view.location ? ` (${view.location})` : ''}. Nothing is shared with the company until you say so.</p>
<p><a href="${url}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#1F3A2F;color:#ffffff;font-weight:600;text-decoration:none;">Yes, go ahead</a></p>
<p style="color:#6E6E68;font-size:13.5px;">If it is not for you, the same page has a "not now". Either way, ${view.partnerFirstName} hears back today.</p>
<p>Refery</p></div>`

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { token: t, sent: false, error: 'RESEND_API_KEY not set' }
  try {
    const resend = new Resend(apiKey)
    const { error: sendErr } = await resend.emails.send({ from: FROM, to: email, replyTo: 'lily@refery.io', subject, html, text })
    if (sendErr) return { token: t, sent: false, error: sendErr.message }
    return { token: t, sent: true }
  } catch (e) {
    return { token: t, sent: false, error: e instanceof Error ? e.message : 'send failed' }
  }
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
        ? `Hi ${first},\n\n${view.candidateFirstName} said yes to being put forward for ${view.roleTitle}. That tap is their consent and the start of your protection on them with this client.\n\nBest,\nLily`
        : `Hi ${first},\n\n${view.candidateFirstName} said not now to ${view.roleTitle}. The submission stays on your pipeline as declined by the candidate; no need to chase.\n\nBest,\nLily`
    try {
      await new Resend(process.env.RESEND_API_KEY).emails.send({ from: 'Lily at Refery <hello@refery.io>', to: partner.email as string, replyTo: 'lily@refery.io', subject: `[Refery] ${view.candidateFirstName} | ${answer === 'agreed' ? 'said yes' : 'said not now'}`, text: body })
    } catch {
      /* the Slack card carries it */
    }
  }
  return { ok: true, view: { ...view, status: answer, answeredAt: now } }
}
