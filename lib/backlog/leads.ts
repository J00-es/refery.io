/**
 * The hiring-lead backlog: founders who filled in the start-hiring form and
 * were never answered.
 *
 * Defaults, in order:
 *   internal or test address       reject, closed now, no card
 *   already a client               onboarded, closed now, no email
 *   free mailbox and no eng or GTM role in the text   decline (no email)
 *   otherwise                      reply (the same email :+1: sends today,
 *                                  with one line about the wait when it is late)
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { ageDays, ageLabel, postBatch, registerBatchApplier, type BatchItem } from '@/lib/batches'
import { hiringLeadEmail, sendIntakeEmail } from '@/lib/intake-emails'
import { isInternalEmail, looksLikeTestRow } from '@/lib/onboarding/identity'
import { LATE_AFTER_DAYS } from '@/lib/onboarding/decisions'
import { esc } from '@/lib/slack-bot'

const PER_CARD = 10
const DECISIONS = ['reply', 'decline', 'client']
const FREE_MAIL = new Set(['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'proton.me', 'protonmail.com', 'live.com', 'aol.com'])
const ROLE_WORDS = /engineer|developer|founding|cto|gtm|sales|account (executive|manager)|ae\b|bdr|sdr|growth|marketing|product|design|data|ai|ml|ops|operations|chief of staff|recruit/i

interface Lead {
  id: string
  full_name: string
  work_email: string
  company_name: string
  roles_hiring_for: string | null
  status: string
  created_at: string
}

async function knownClient(admin: SupabaseClient, companyName: string, domain: string): Promise<boolean> {
  const name = companyName.trim()
  if (!name) return false
  const { data: signed } = await admin.from('client_agreement_links').select('id').eq('status', 'signed').ilike('company_name', name).limit(1)
  if (signed?.length) return true
  const { data: cos } = await admin.from('companies').select('id, website').ilike('name', name).limit(3)
  for (const c of cos ?? []) {
    const { data: cc } = await admin.from('client_companies').select('company_id, is_active').eq('company_id', c.id).maybeSingle()
    if (cc?.is_active) return true
    if (domain && typeof c.website === 'string' && c.website.includes(domain)) {
      const { data: cc2 } = await admin.from('client_companies').select('company_id').eq('company_id', c.id).maybeSingle()
      if (cc2) return true
    }
  }
  return false
}

export async function postLeadBacklog(admin: SupabaseClient, channel: string): Promise<{ cards: number; rows: number; closedNow: number; errors: string[] }> {
  const out = { cards: 0, rows: 0, closedNow: 0, errors: [] as string[] }
  const { data: open } = await admin.from('slack_batches').select('items').eq('kind', 'lead_backlog').eq('status', 'open')
  const onCards = new Set<string>()
  for (const b of open ?? []) for (const i of (b.items as BatchItem[]) ?? []) onCards.add(i.id)

  const { data: rows, error } = await admin.from('hiring_manager_leads').select('*').eq('status', 'new').order('created_at', { ascending: true })
  if (error) {
    out.errors.push(error.message)
    return out
  }

  const items: BatchItem[] = []
  for (const r of (rows ?? []) as Lead[]) {
    if (onCards.has(r.id)) continue
    const domain = (r.work_email.split('@')[1] ?? '').toLowerCase()
    const now = new Date().toISOString()
    if (isInternalEmail(r.work_email) || looksLikeTestRow({ full_name: r.full_name, email: r.work_email })) {
      await admin.from('hiring_manager_leads').update({ status: 'rejected', reviewed_at: now, reviewed_by: 'backlog' }).eq('id', r.id)
      out.closedNow++
      continue
    }
    if (await knownClient(admin, r.company_name, domain)) {
      await admin.from('hiring_manager_leads').update({ status: 'onboarded', reviewed_at: now, reviewed_by: 'backlog' }).eq('id', r.id)
      out.closedNow++
      continue
    }
    const roles = (r.roles_hiring_for ?? '').trim()
    const weak = FREE_MAIL.has(domain) && !ROLE_WORDS.test(roles)
    items.push({
      n: 0,
      id: r.id,
      label: `*${esc(r.full_name)}* at ${esc(r.company_name)} · <mailto:${esc(r.work_email)}|${esc(domain)}> · ${ageLabel(r.created_at)} · ${esc(roles || 'no roles given')}${weak ? ' · _free mailbox, no eng or GTM role_' : ''}`,
      decision: weak ? 'decline' : 'reply',
    })
  }
  out.rows = items.length
  for (let i = 0; i < items.length; i += PER_CARD) {
    const slice = items.slice(i, i + PER_CARD).map((it, k) => ({ ...it, n: k + 1 }))
    const res = await postBatch(admin, {
      kind: 'lead_backlog',
      channel,
      title: `Hiring leads waiting · ${slice.length} of ${items.length}`,
      intro: 'reply sends the first email and offers a call, then the follow-up engine takes over (day 4 and day 9, stops on any reply). decline closes it quietly. client marks it as already ours.',
      items: slice,
      decisions: DECISIONS,
    })
    if (res.ok) out.cards++
    else out.errors.push(res.error ?? 'post failed')
  }
  return out
}

registerBatchApplier('lead_backlog', async (admin, { batch, slackUser }) => {
  const lines: string[] = []
  const counts: Record<string, number> = {}
  const now = new Date().toISOString()
  for (const item of batch.items) {
    counts[item.decision] = (counts[item.decision] ?? 0) + 1
    if (item.decision === 'skip') {
      lines.push(`${item.n}. skipped`)
      continue
    }
    const { data: row } = await admin.from('hiring_manager_leads').select('*').eq('id', item.id).maybeSingle()
    if (!row || row.status !== 'new') {
      lines.push(`${item.n}. already ${row?.status ?? 'gone'}, left alone`)
      continue
    }
    const r = row as Lead
    if (item.decision === 'decline') {
      await admin.from('hiring_manager_leads').update({ status: 'rejected', reviewed_at: now, reviewed_by: slackUser }).eq('id', r.id)
      lines.push(`${item.n}. ${esc(r.company_name)}: declined, nothing sent`)
      continue
    }
    if (item.decision === 'client') {
      await admin.from('hiring_manager_leads').update({ status: 'onboarded', reviewed_at: now, reviewed_by: slackUser }).eq('id', r.id)
      lines.push(`${item.n}. ${esc(r.company_name)}: marked as a client, nothing sent`)
      continue
    }
    const late = ageDays(r.created_at) > LATE_AFTER_DAYS
    const email = hiringLeadEmail(r.full_name, r.company_name, r.roles_hiring_for, { late })
    const sent = await sendIntakeEmail(r.work_email, email)
    if (sent.sent) {
      await admin
        .from('hiring_manager_leads')
        .update({ status: 'in_conversation', reviewed_at: now, reviewed_by: slackUser, outreach_sent_at: now, last_contacted_at: now, outreach_error: null })
        .eq('id', r.id)
      lines.push(`${item.n}. ${esc(r.company_name)}: sent "${esc(email.subject)}" to ${esc(r.work_email)}`)
    } else {
      await admin.from('hiring_manager_leads').update({ outreach_error: sent.error ?? 'unknown' }).eq('id', r.id)
      lines.push(`${item.n}. ${esc(r.company_name)}: :warning: email did not send (${esc(sent.error ?? 'unknown')}), still new`)
    }
  }
  return { lines, summary: { counts } }
})
