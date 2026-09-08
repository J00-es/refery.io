/**
 * Founders who just raised and are hiring in SF or New York, written to once
 * a week with two follow-ups, from lily@refery.io.
 *
 * The jobs table already knows who is hiring (the nightly ATS ingest) and the
 * companies table knows who just raised. The join is the list. Each Monday
 * this picks up to twenty companies that raised a Seed, A or B round in the
 * last 45 days, have an open founding-engineer or GTM role in SF or NY, and
 * have a founder address on file, drafts one email each from the facts, and
 * posts them as a batch card. :+1: sends the lot.
 *
 * After that the follow-up engine owns the thread: every day it reads each
 * Gmail thread; a reply becomes a hiring lead (card, thread note, follow-ups
 * cancelled); silence gets follow-up 1 at day 4 and follow-up 2 at day 9;
 * three weeks of nothing marks the thread dead. Every send is a row in the
 * outreach tables, so the hub at /outreach finally has something to show.
 *
 * Companies without a founder address are listed at the foot of the card.
 * Resolving them is the work-email-sourcing skill (Apollo, one credit per
 * address) and writes company_contacts; the next run picks them up.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { postBatch, registerBatchApplier, type BatchItem } from '@/lib/batches'
import { sendMessage, threadMessages, addressOf } from '@/lib/google'
import { hiringLeadBlocks } from '@/lib/intake'
import { addReaction, esc, postMessage, postThreadReply } from '@/lib/slack-bot'

const DAY_MS = 86_400_000
const CAL = 'cal.com/refery-lily/15'
const PER_WEEK = 20
const FUNDED_WITHIN_DAYS = 45
const ROUNDS = ['Pre-Seed', 'Seed', 'Series A', 'Series B']
const FOLLOWUP_DAYS = [4, 9]
const DEAD_AFTER_DAYS = 21
const SFNY = /san francisco|bay area|new york|nyc|,\s*(ca|ny)\b|palo alto|menlo park|mountain view|oakland|brooklyn/i
const ROLE = /founding|engineer|developer|account executive|\bae\b|sales|gtm|go-to-market|growth|forward.?deployed|product engineer|solutions engineer|bdr|sdr/i
const NOT_ROLE = /intern|manager, quality|hr business|recruit|executive business partner|attorney|paralegal|nurse|driver|warehouse/i

interface Company {
  id: string
  name: string
  website: string | null
  location: string | null
  last_funding_type: string | null
  last_funding_date: string | null
  last_funding_amount_usd: number | null
  top_investors: string | null
}

interface Job {
  id: string
  title: string
  location: string | null
}

interface Contact {
  id: string
  name: string | null
  email: string | null
  title: string | null
  persona_type: string | null
}

function first(name: string | null): string {
  return (name ?? '').trim().split(/\s+/)[0] || 'there'
}

function roundLabel(c: Company): string {
  const amt = c.last_funding_amount_usd
  const m = amt ? (amt >= 1_000_000 ? `$${Math.round(amt / 100_000) / 10}M` : `$${Math.round(amt / 1000)}k`) : null
  const type = (c.last_funding_type ?? 'round').replace('Series ', 'Series ')
  return m ? `${m} ${type}` : type
}

function leadInvestor(c: Company): string | null {
  const inv = (c.top_investors ?? '').split(',').map(s => s.trim()).filter(Boolean)[0]
  return inv || null
}

export function founderEmail(c: Company, contact: Contact, jobs: Job[]): { subject: string; body: string } {
  const roles = jobs.slice(0, 2).map(j => j.title.replace(/\s*\(.*?\)\s*/g, ' ').trim())
  const n = jobs.length
  const inv = leadInvestor(c)
  const roleLine =
    n === 1
      ? `I saw the ${roles[0]} role you have open`
      : `I saw ${n} open roles on your careers page, including ${roles[0]}${roles[1] ? ` and ${roles[1]}` : ''}`
  return {
    subject: `[Refery] ${c.name} | ${roles[0]}`,
    body: [
      `Hi ${first(contact.name)},`,
      '',
      `Lily from Refery. Congrats on the ${roundLabel(c)}${inv ? ` with ${inv}` : ''}. :)`,
      '',
      `${roleLine}. Those are exactly the seats we fill: founding engineers and early GTM hires in SF and New York, sourced through scouts and independent recruiters who introduce people from their own networks, so you see profiles that are not on job boards or applying anywhere.`,
      '',
      'Terms are simple: contingent, 10 to 20% of base, no retainer, one free replacement inside 90 days. Most founders see the first two or three profiles within a week of the brief.',
      '',
      `Worth 15 minutes? ${CAL}`,
      '',
      'Best,',
      'Lily',
    ].join('\n'),
  }
}

async function candidates(admin: SupabaseClient, limit: number): Promise<{ ready: { company: Company; contact: Contact; jobs: Job[] }[]; noEmail: { company: Company; jobs: Job[] }[] }> {
  const since = new Date(Date.now() - FUNDED_WITHIN_DAYS * DAY_MS).toISOString().slice(0, 10)
  const { data: cos } = await admin
    .from('companies')
    .select('id, name, website, location, last_funding_type, last_funding_date, last_funding_amount_usd, top_investors')
    .gte('last_funding_date', since)
    .in('last_funding_type', ROUNDS)
    .eq('is_placement_relevant', true)
    .or('relationship_status.is.null,relationship_status.eq.not_contacted')
    .or('do_not_contact.is.null,do_not_contact.eq.false')
    .order('last_funding_date', { ascending: false })
    .limit(400)

  const ready: { company: Company; contact: Contact; jobs: Job[] }[] = []
  const noEmail: { company: Company; jobs: Job[] }[] = []
  for (const c of (cos ?? []) as Company[]) {
    // HQ outside the US is out of scope even when a role is posted in SF or NY.
    if (c.location && !/united states|\bUSA?\b/i.test(c.location)) continue
    const { data: jobs } = await admin.from('jobs').select('id, title, location').eq('company_id', c.id).eq('status', 'open').order('created_at', { ascending: false }).limit(30)
    const fit = ((jobs ?? []) as Job[]).filter(j => SFNY.test(j.location ?? '') && ROLE.test(j.title) && !NOT_ROLE.test(j.title))
    if (!fit.length) continue
    // Never write to someone we already have a thread with.
    const { data: prior } = await admin.from('outreach_recipients').select('id').eq('current_company_id', c.id).limit(1)
    if (prior?.length) continue
    const { data: contacts } = await admin
      .from('company_contacts')
      .select('id, name, email, title, persona_type')
      .eq('company_id', c.id)
      .not('email', 'is', null)
      .limit(10)
    const order = ['founder', 'cto_eng', 'exec', 'talent']
    const pick = ((contacts ?? []) as Contact[]).sort((a, b) => order.indexOf(a.persona_type ?? 'other') - order.indexOf(b.persona_type ?? 'other'))[0]
    if (pick?.email) ready.push({ company: c, contact: pick, jobs: fit })
    else noEmail.push({ company: c, jobs: fit })
    if (ready.length >= limit) break
  }
  return { ready, noEmail }
}

export async function postFounderBatch(admin: SupabaseClient, channel: string): Promise<{ posted: number; noEmail: number; errors: string[] }> {
  const out = { posted: 0, noEmail: 0, errors: [] as string[] }
  const { ready, noEmail } = await candidates(admin, PER_WEEK)
  out.noEmail = noEmail.length
  if (!ready.length) {
    if (noEmail.length) {
      const names = noEmail.slice(0, 15).map(x => `${esc(x.company.name)} (${x.jobs.length})`).join(', ')
      await postMessage(channel, 'Founder outreach: nobody to write to yet', [
        { type: 'section', text: { type: 'mrkdwn', text: `:mag: *Founder outreach, this week*\n${noEmail.length} companies raised in the last ${FUNDED_WITHIN_DAYS} days and have an SF or NY founding seat open, but none has a founder address on file. Run the work-email-sourcing skill on these and Monday's card fills itself:\n${names}` } },
      ])
    }
    return out
  }
  const items: BatchItem[] = ready.map((r, k) => {
    const email = founderEmail(r.company, r.contact, r.jobs)
    return {
      n: k + 1,
      id: r.company.id,
      label: `*${esc(r.company.name)}* · ${esc(roundLabel(r.company))}${r.company.last_funding_date ? ` on ${r.company.last_funding_date}` : ''} · ${r.jobs.length} SF/NY ${r.jobs.length === 1 ? 'seat' : 'seats'}: ${esc(r.jobs.slice(0, 2).map(j => j.title).join(', '))} · to <mailto:${esc(r.contact.email!)}|${esc(r.contact.name ?? r.contact.email!)}>${r.contact.title ? ` (${esc(r.contact.title)})` : ''}`,
      decision: 'send',
      data: { contactId: r.contact.id, to: r.contact.email, toName: r.contact.name, subject: email.subject, body: email.body, jobIds: r.jobs.map(j => j.id), persona: r.contact.persona_type },
    }
  })
  const footer = noEmail.length
    ? `${noEmail.length} more ${noEmail.length === 1 ? 'company fits' : 'companies fit'} but ${noEmail.length === 1 ? 'has' : 'have'} no founder address yet: ${noEmail.slice(0, 8).map(x => esc(x.company.name)).join(', ')}${noEmail.length > 8 ? ', …' : ''}. Source them and they join next Monday's card.`
    : 'Every fitting company had a founder address.'
  const res = await postBatch(admin, {
    kind: 'founder_outreach',
    channel,
    title: `Founders who just raised and are hiring in SF or NY · ${items.length}`,
    intro: 'One email each from lily@refery.io: congrats on the round, the roles we saw, how Refery works, the calendar link. Follow-ups go out on day 4 and day 9 by themselves and stop the moment anyone replies. Reply `3 skip` to drop a line before you :+1:.',
    items,
    decisions: ['send'],
    footer,
  })
  if (res.ok) out.posted = items.length
  else out.errors.push(res.error ?? 'post failed')
  return out
}

registerBatchApplier('founder_outreach', async (admin, { batch, slackUser }) => {
  const lines: string[] = []
  let sent = 0
  for (const item of batch.items) {
    if (item.decision !== 'send') {
      lines.push(`${item.n}. skipped`)
      continue
    }
    const d = item.data ?? {}
    const to = String(d.to ?? '')
    if (!to) {
      lines.push(`${item.n}. no address`)
      continue
    }
    const res = await sendMessage({ to, toName: (d.toName as string | null) ?? null, subject: String(d.subject), body: String(d.body) })
    if (res.error) {
      lines.push(`${item.n}. :warning: ${esc(to)}: ${esc(res.error)}`)
      continue
    }
    const now = new Date()
    const { data: recipient } = await admin
      .from('outreach_recipients')
      .insert({
        name: (d.toName as string | null) ?? to,
        email: to,
        current_company_id: item.id,
        persona: (d.persona as string | null) === 'founder' ? 'founder_ceo' : (d.persona as string | null) === 'cto_eng' ? 'founder_cto' : 'exec_other',
        inbound_source: 'apollo_search',
        preferred_channel: 'email',
        lifetime_touches: 1,
        first_contacted_at: now.toISOString(),
        last_contacted_at: now.toISOString(),
        tags: ['just_raised'],
      })
      .select('id')
      .single()
    const { data: thread } = await admin
      .from('outreach_threads')
      .insert({
        recipient_id: recipient?.id ?? null,
        company_id: item.id,
        outreach_pattern: 'other',
        primary_channel: 'email',
        channels_used: ['email'],
        subject: String(d.subject),
        status: 'awaiting_reply',
        total_touches: 1,
        outbound_count: 1,
        inbound_count: 0,
        first_touch_at: now.toISOString(),
        last_touch_at: now.toISOString(),
        last_activity_at: now.toISOString(),
        notes: `just_raised_v1 · sent from Slack batch by ${slackUser}`,
        gmail_thread_id: res.threadId ?? null,
      })
      .select('id')
      .single()
    await admin.from('outreach_messages').insert({
      thread_id: thread?.id ?? null,
      recipient_id: recipient?.id ?? null,
      company_id: item.id,
      direction: 'outbound',
      channel: 'email',
      subject: String(d.subject),
      body: String(d.body),
      body_word_count: String(d.body).split(/\s+/).length,
      hook_used: 'funding_round',
      personalization_level: 'medium',
      cta_type: 'meeting_booking',
      pattern_used: 'other',
      included_calendar_link: true,
      sent_at: now.toISOString(),
      activity_at: now.toISOString(),
      external_message_id: res.messageId ?? null,
      external_thread_id: res.threadId ?? null,
    })
    for (let k = 0; k < FOLLOWUP_DAYS.length; k++) {
      await admin.from('outreach_followups').insert({
        thread_id: thread?.id ?? null,
        recipient_id: recipient?.id ?? null,
        due_at: new Date(now.getTime() + FOLLOWUP_DAYS[k] * DAY_MS).toISOString(),
        action_type: 'email_followup',
        status: 'pending',
        notes: `step ${k + 1}`,
      })
    }
    await admin.from('companies').update({ relationship_status: 'proposal_sent' }).eq('id', item.id)
    sent++
    lines.push(`${item.n}. sent to ${esc(to)}`)
  }
  return { lines, summary: { sent } }
})

function followupEmail(step: number, companyName: string, firstName: string, roleTitle: string): string {
  if (step === 1) {
    return [
      `Hi ${firstName},`,
      '',
      `Quick one on the ${roleTitle} seat at ${companyName}.`,
      '',
      'If it helps to see what we mean before a call, I can send two or three anonymised profiles for it. No agreement needed for that, just a yes.',
      '',
      `Otherwise ${CAL} is the fastest way to get me the brief.`,
      '',
      'Best,',
      'Lily',
    ].join('\n')
  }
  return [
    `Hi ${firstName},`,
    '',
    `Closing the loop. I will assume ${companyName} has the ${roleTitle} search covered for now.`,
    '',
    `If that changes, reply here or grab a slot whenever it suits: ${CAL}`,
    '',
    'Good luck with the build.',
    '',
    'Best,',
    'Lily',
  ].join('\n')
}

/**
 * Daily. Reads every open founder thread, turns a reply into a hiring lead,
 * sends the next follow-up when it is due, and retires threads that have
 * gone three weeks without a word.
 */
export async function runFounderFollowups(admin: SupabaseClient, leadsChannel: string): Promise<{ checked: number; replied: number; sent: number; dead: number; errors: string[] }> {
  const out = { checked: 0, replied: 0, sent: 0, dead: 0, errors: [] as string[] }
  const { data: threads } = await admin
    .from('outreach_threads')
    .select('id, recipient_id, company_id, subject, status, first_touch_at, last_touch_at, outbound_count, gmail_thread_id')
    .eq('status', 'awaiting_reply')
    .not('gmail_thread_id', 'is', null)
  for (const t of threads ?? []) {
    out.checked++
    const { data: recipient } = await admin.from('outreach_recipients').select('id, name, email').eq('id', t.recipient_id).maybeSingle()
    const { data: company } = await admin.from('companies').select('id, name').eq('id', t.company_id).maybeSingle()
    if (!recipient?.email || !company) continue

    let msgs: Awaited<ReturnType<typeof threadMessages>>
    try {
      msgs = await threadMessages(t.gmail_thread_id as string)
    } catch (err) {
      out.errors.push(`${recipient.email}: ${err instanceof Error ? err.message : 'gmail failed'}`)
      continue
    }
    if (msgs.error) {
      out.errors.push(`${recipient.email}: ${msgs.error}`)
      continue
    }
    const inbound = msgs.messages.filter(m => !/refery\.io$/i.test(addressOf(m.from)))
    if (inbound.length) {
      const last = inbound[inbound.length - 1]
      const when = new Date(last.internalDate).toISOString()
      await admin.from('outreach_threads').update({ status: 'replied_neutral', inbound_count: inbound.length, first_reply_at: when, last_activity_at: when, last_touch_at: when }).eq('id', t.id)
      await admin.from('outreach_messages').insert({ thread_id: t.id, recipient_id: recipient.id, company_id: company.id, direction: 'inbound', channel: 'email', subject: last.subject, body: last.text.slice(0, 4000), received_at: when, activity_at: when, external_message_id: last.id, external_thread_id: t.gmail_thread_id })
      await admin.from('outreach_followups').update({ status: 'cancelled', notes: 'replied' }).eq('thread_id', t.id).eq('status', 'pending')
      await admin.from('outreach_recipients').update({ last_replied_at: when, lifetime_replies: 1 }).eq('id', recipient.id)

      // The reply becomes a hiring lead, on the same card the form produces,
      // so it is decided the same way and chased the same way.
      const { data: lead } = await admin
        .from('hiring_manager_leads')
        .insert({ full_name: recipient.name ?? recipient.email, work_email: recipient.email, company_name: company.name, roles_hiring_for: null, source: 'founder_outreach_reply', status: 'in_conversation', outreach_sent_at: t.first_touch_at, last_contacted_at: t.last_touch_at, replied_at: when, gmail_thread_id: t.gmail_thread_id })
        .select('id')
        .single()
      const built = hiringLeadBlocks({ id: lead?.id ?? t.id, full_name: recipient.name ?? recipient.email, work_email: recipient.email, company_name: company.name, roles_hiring_for: null, created_at: when, source: 'founder_outreach_reply' })
      built.blocks[0] = { type: 'section', text: { type: 'mrkdwn', text: `:mailbox_with_mail: *${esc(recipient.name ?? recipient.email)} at ${esc(company.name)} replied to the founder email*\n>${esc(last.text.slice(0, 600)).replace(/\n/g, '\n>')}` } }
      built.blocks[built.blocks.length - 1] = { type: 'context', elements: [{ type: 'mrkdwn', text: 'The thread is in lily@refery.io. Reply there; this card is the record.' }] }
      const posted = await postMessage(leadsChannel, `${recipient.name ?? recipient.email} replied`, built.blocks)
      if (posted.ok && posted.ts && lead?.id) await admin.from('hiring_manager_leads').update({ slack_channel_id: posted.channel ?? leadsChannel, slack_message_ts: posted.ts }).eq('id', lead.id)
      if (posted.ok && posted.ts) await addReaction(posted.channel ?? leadsChannel, posted.ts, 'eyes')
      out.replied++
      continue
    }

    const { data: due } = await admin.from('outreach_followups').select('id, notes').eq('thread_id', t.id).eq('status', 'pending').lte('due_at', new Date().toISOString()).order('due_at', { ascending: true }).limit(1).maybeSingle()
    if (due) {
      const step = Number((due.notes as string | null)?.match(/step (\d)/)?.[1] ?? '1')
      const roleTitle = (t.subject as string).split('|')[1]?.trim() || 'founding'
      const head = msgs.messages[msgs.messages.length - 1]
      const body = followupEmail(step, company.name, first(recipient.name), roleTitle)
      const res = await sendMessage({ to: recipient.email, toName: recipient.name, subject: t.subject as string, body, thread: { threadId: t.gmail_thread_id as string, messageId: head?.messageId ?? null, subject: head?.subject ?? (t.subject as string) } })
      if (res.error) {
        out.errors.push(`${recipient.email}: ${res.error}`)
        continue
      }
      const now = new Date().toISOString()
      await admin.from('outreach_followups').update({ status: 'completed', completed_at: now }).eq('id', due.id)
      await admin.from('outreach_messages').insert({ thread_id: t.id, recipient_id: recipient.id, company_id: company.id, direction: 'outbound', channel: 'email', subject: t.subject, body, body_word_count: body.split(/\s+/).length, hook_used: 'none', personalization_level: 'light', cta_type: 'meeting_booking', pattern_used: 'e_followup', included_calendar_link: true, sent_at: now, activity_at: now, external_message_id: res.messageId ?? null, external_thread_id: t.gmail_thread_id })
      await admin.from('outreach_threads').update({ total_touches: (t.total_touches as number ?? 1) + 1, outbound_count: (t.outbound_count as number) + 1, last_touch_at: now, last_activity_at: now }).eq('id', t.id)
      await admin.from('outreach_recipients').update({ last_contacted_at: now, lifetime_touches: (t.outbound_count as number) + 1 }).eq('id', recipient.id)
      out.sent++
      continue
    }

    if (Date.now() - new Date(t.first_touch_at as string).getTime() > DEAD_AFTER_DAYS * DAY_MS) {
      await admin.from('outreach_threads').update({ status: 'no_response_dead', last_activity_at: new Date().toISOString() }).eq('id', t.id)
      await admin.from('outreach_followups').update({ status: 'cancelled', notes: 'no response' }).eq('thread_id', t.id).eq('status', 'pending')
      out.dead++
    }
  }
  return out
}
