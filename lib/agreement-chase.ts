/**
 * Client agreements that went out and never came back.
 *
 * The daily digest has listed the same nine companies since it was built:
 * opened and not signed, sent and never opened, expired unsigned. Nobody
 * chased because chasing meant finding the link, the person and the terms
 * by hand. This does that work and posts one batch card:
 *
 *   chase    opened 3+ days ago, not signed, not chased in the last 7 days:
 *            a short nudge from lily@refery.io with the same link.
 *   resend   sent 3+ days ago and never opened: the same link again, since
 *            the first email most likely went astray.
 *   reissue  expired unsigned: a fresh link on the same terms, and the note.
 *
 * Nothing is sent until :+1:. Every send is a client_agreement_events row
 * (`reminder_sent`, with the action in metadata) so the next run knows, and the daily digest can stop nagging about it.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { ageLabel, postBatch, registerBatchApplier } from '@/lib/batches'
import { issueClientAgreementLink } from '@/lib/agreement-links'
import { clientPaymentTimingForVersion, clientTermsSummary } from '@/lib/agreements'
import { findThread, sendMessage } from '@/lib/google'
import { esc } from '@/lib/slack-bot'

const DAY_MS = 86_400_000
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://refery.xyz').replace(/\/$/, '')
const CAL = 'cal.com/refery-lily/15'
const IGNORE = /^(zzz|sandbox|10k ventures|refery)/i

interface Link {
  id: string
  token: string
  company_id: string
  company_name: string
  recipient_name: string | null
  recipient_email: string | null
  agreement_version: string
  fee_percentage: number
  fee_options: number[] | null
  leadership_fee_percentage: number | null
  short_slug: string | null
  page_notes: Record<string, string> | null
  status: string
  sent_at: string
  viewed_at: string | null
  signed_at: string | null
  expires_at: string
  created_by: string
}

type Action = 'chase' | 'resend' | 'reissue'

function first(name: string | null): string {
  return (name ?? '').trim().split(/\s+/)[0] || 'there'
}

function terms(version: string, fee: number, lead: number | null = null): string {
  const t = clientTermsSummary(version)
  // A tiered link (v2.9) carries two rates; the chosen one is what the page
  // shows, and the leadership minimum applies whichever they pick.
  const feeLine = lead
    ? `${fee}% of first-year base for standard IC hires, ${lead}% for Head, Director, VP, C-suite and Staff/Principal hires, fully contingent, no retainer`
    : `${fee}% of first-year base, fully contingent, no retainer`
  return `${feeLine}. ${t.payment}. ${t.guarantee}.`
}

export function chaseEmail(
  action: Action,
  l: { company_name: string; recipient_name: string | null; agreement_version: string; fee_percentage: number; leadership_fee_percentage?: number | null; sent_at: string },
  url: string,
): { subject: string; body: string } {
  const lead = l.leadership_fee_percentage ? Number(l.leadership_fee_percentage) : null
  const sentOn = new Date(l.sent_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
  const subject = `[Refery] ${l.company_name} | services agreement`
  const lines =
    action === 'reissue'
      ? [
          `Hi ${first(l.recipient_name)},`,
          '',
          `The agreement link I sent on ${sentOn} has expired, so here is a fresh one on the same terms: ${url}`,
          '',
          terms(l.agreement_version, l.fee_percentage, lead),
          '',
          'It takes about two minutes and nothing else needs setting up. If one of the terms is the sticking point, tell me which and I will adjust it rather than leave this sitting.',
        ]
      : action === 'resend'
        ? [
            `Hi ${first(l.recipient_name)},`,
            '',
            `Resending in case the first one went astray: the ${l.company_name} services agreement is here: ${url}`,
            '',
            terms(l.agreement_version, l.fee_percentage, lead),
            '',
            'Two minutes, nothing to set up. Once it is signed we start sending profiles.',
          ]
        : [
            `Hi ${first(l.recipient_name)},`,
            '',
            `Quick nudge on the agreement from ${sentOn}: ${url}`,
            '',
            terms(l.agreement_version, l.fee_percentage, lead),
            '',
            `If a term is holding it up, say which and I will change it. If it is easier to talk it through, ${CAL} works.`,
          ]
  return { subject, body: [...lines, '', 'Best,', 'Lily'].join('\n') }
}

async function recipientFor(admin: SupabaseClient, l: Link): Promise<{ name: string | null; email: string | null }> {
  if (l.recipient_email) return { name: l.recipient_name, email: l.recipient_email }
  const { data: cc } = await admin.from('client_companies').select('contact_name, contact_email').eq('company_id', l.company_id).maybeSingle()
  if (cc?.contact_email) return { name: (cc.contact_name as string | null) ?? null, email: cc.contact_email as string }
  const { data: c } = await admin
    .from('company_contacts')
    .select('name, email, persona_type')
    .eq('company_id', l.company_id)
    .not('email', 'is', null)
    .order('persona_type', { ascending: true })
    .limit(5)
  const founder = (c ?? []).find(x => x.persona_type === 'founder') ?? (c ?? [])[0]
  return founder ? { name: (founder.name as string | null) ?? null, email: founder.email as string } : { name: null, email: null }
}

async function lastChase(admin: SupabaseClient, companyId: string): Promise<string | null> {
  const { data } = await admin
    .from('client_agreement_events')
    .select('occurred_at')
    .eq('company_id', companyId)
    .eq('event_type', 'reminder_sent')
    .order('occurred_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data?.occurred_at as string | undefined) ?? null
}

export async function postAgreementChase(admin: SupabaseClient, channel: string): Promise<{ posted: number; skipped: string[]; errors: string[] }> {
  const out = { posted: 0, skipped: [] as string[], errors: [] as string[] }
  const { data: links, error } = await admin.from('client_agreement_links').select('*').in('status', ['sent', 'viewed']).order('created_at', { ascending: false })
  if (error) {
    out.errors.push(error.message)
    return out
  }
  const { data: openBatches } = await admin.from('slack_batches').select('items').eq('kind', 'agreement_chase').eq('status', 'open')
  const onCards = new Set<string>()
  for (const b of openBatches ?? []) for (const i of (b.items as { id: string }[]) ?? []) onCards.add(i.id)

  const seen = new Set<string>()
  const items = []
  for (const l of (links ?? []) as Link[]) {
    if (IGNORE.test(l.company_name)) continue
    if (seen.has(l.company_id) || onCards.has(l.id)) continue
    // A company with any signed link is a client, whatever older links say.
    const { data: signed } = await admin.from('client_agreement_links').select('id').eq('company_id', l.company_id).eq('status', 'signed').limit(1)
    if (signed?.length) continue
    // A lost or churned deal is never chased again; Lily reopens it by hand.
    const { data: co } = await admin.from('companies').select('relationship_status').eq('id', l.company_id).maybeSingle()
    if (co && ['lost', 'churned'].includes(String(co.relationship_status ?? ''))) continue
    const { data: cc } = await admin.from('client_companies').select('is_active').eq('company_id', l.company_id).maybeSingle()
    if (cc && cc.is_active === false) continue
    seen.add(l.company_id)

    const now = Date.now()
    const expired = new Date(l.expires_at).getTime() < now
    const viewedAgo = l.viewed_at ? (now - new Date(l.viewed_at).getTime()) / DAY_MS : null
    const sentAgo = (now - new Date(l.sent_at).getTime()) / DAY_MS
    let action: Action | null = null
    if (expired) action = 'reissue'
    else if (l.status === 'viewed' && viewedAgo !== null && viewedAgo >= 3) action = 'chase'
    else if (l.status === 'sent' && sentAgo >= 3) action = 'resend'
    if (!action) continue

    const last = await lastChase(admin, l.company_id)
    if (last && now - new Date(last).getTime() < 7 * DAY_MS) {
      out.skipped.push(`${l.company_name}: chased ${ageLabel(last)} ago`)
      continue
    }
    const to = await recipientFor(admin, l)
    const state = expired ? `expired ${ageLabel(l.expires_at)} ago` : l.status === 'viewed' ? `opened ${ageLabel(l.viewed_at!)} ago, not signed` : `sent ${ageLabel(l.sent_at)} ago, never opened`
    const payment = clientPaymentTimingForVersion(l.agreement_version) ?? 'net30'
    items.push({
      n: 0,
      id: l.id,
      label: `*${esc(l.company_name)}* · v${esc(l.agreement_version)} at ${l.fee_percentage}%${l.leadership_fee_percentage ? ` (${l.leadership_fee_percentage}% leadership)` : ''} · ${state} · ${to.email ? `to <mailto:${esc(to.email)}|${esc(to.name ?? to.email)}>` : ':warning: _no email on file, add a contact on the client page first_'} · <${APP_URL}/companies/${l.company_id}|client>`,
      decision: to.email ? action : 'skip',
      data: { action, toName: to.name, toEmail: to.email, payment },
    })
  }
  if (!items.length) return out
  const res = await postBatch(admin, {
    kind: 'agreement_chase',
    channel,
    title: `Client agreements out and unsigned · ${items.length}`,
    intro: 'chase nudges an opened link, resend re-sends a link nobody opened, reissue replaces an expired link with a fresh one on the same terms. All from lily@refery.io, in the existing thread when there is one.',
    items: items.map((it, k) => ({ ...it, n: k + 1 })),
    decisions: ['chase', 'resend', 'reissue'],
    footer: 'Each send is logged on the company, so the daily digest stops listing it and the next card waits a week.',
  })
  if (res.ok) out.posted = items.length
  else out.errors.push(res.error ?? 'post failed')
  return out
}

registerBatchApplier('agreement_chase', async (admin, { batch, slackUser }) => {
  const lines: string[] = []
  const counts: Record<string, number> = {}
  for (const item of batch.items) {
    counts[item.decision] = (counts[item.decision] ?? 0) + 1
    if (item.decision === 'skip') {
      lines.push(`${item.n}. skipped`)
      continue
    }
    const { data } = await admin.from('client_agreement_links').select('*').eq('id', item.id).maybeSingle()
    if (!data) {
      lines.push(`${item.n}. link is gone`)
      continue
    }
    const l = data as Link
    if (l.status === 'signed') {
      lines.push(`${item.n}. ${esc(l.company_name)}: signed in the meantime, nothing sent`)
      continue
    }
    const to = { name: (item.data?.toName as string | null) ?? l.recipient_name, email: (item.data?.toEmail as string | null) ?? l.recipient_email }
    if (!to.email) {
      lines.push(`${item.n}. ${esc(l.company_name)}: no email, nothing sent`)
      continue
    }
    const action = item.decision as Action
    let url = l.short_slug ? `${APP_URL}/sign/${l.short_slug}` : `${APP_URL}/sign/client-agreement/${l.token}`
    let newLinkId: string | null = null
    if (action === 'reissue') {
      try {
        // The short slug is unique, so it moves from the expired link to the
        // fresh one; the address the client already has keeps working.
        if (l.short_slug) await admin.from('client_agreement_links').update({ short_slug: null }).eq('id', l.id)
        const issued = await issueClientAgreementLink(admin, {
          companyId: l.company_id,
          companyName: l.company_name,
          feePercent: Number(l.fee_percentage),
          feeOptions: l.fee_options ?? undefined,
          leadershipFeePercent: l.leadership_fee_percentage ? Number(l.leadership_fee_percentage) : null,
          shortSlug: l.short_slug,
          pageNotes: l.page_notes,
          paymentTiming: clientPaymentTimingForVersion(l.agreement_version) ?? 'net30',
          recipientName: l.recipient_name,
          recipientEmail: l.recipient_email,
          createdBy: l.created_by,
        })
        url = issued.url
        newLinkId = issued.id
        await admin.from('client_agreement_links').update({ status: 'revoked', revoked_at: new Date().toISOString() }).eq('id', l.id)
      } catch (err) {
        if (l.short_slug) await admin.from('client_agreement_links').update({ short_slug: l.short_slug }).eq('id', l.id)
        lines.push(`${item.n}. ${esc(l.company_name)}: could not reissue (${esc(err instanceof Error ? err.message : 'unknown')})`)
        continue
      }
    }
    const email = chaseEmail(action, { ...l, recipient_name: to.name }, url)
    let thread = null
    try {
      thread = await findThread(to.email)
    } catch {
      thread = null
    }
    const sent = await sendMessage({ to: to.email, toName: to.name, subject: email.subject, body: email.body, thread })
    if (sent.error) {
      lines.push(`${item.n}. ${esc(l.company_name)}: :warning: not sent (${esc(sent.error)})`)
      continue
    }
    await admin.from('client_agreement_events').insert({
      link_id: newLinkId ?? l.id,
      company_id: l.company_id,
      event_type: 'reminder_sent',
      metadata: { action, to: to.email, subject: email.subject, gmail_thread_id: sent.threadId ?? null, by: slackUser, replaced_link_id: newLinkId ? l.id : null },
    })
    lines.push(`${item.n}. ${esc(l.company_name)}: ${action === 'reissue' ? 'new link issued and ' : ''}sent to ${esc(to.email)}${thread ? ' in the existing thread' : ''}`)
  }
  return { lines, summary: { counts } }
})
