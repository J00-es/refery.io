/**
 * After the call.
 *
 * The recap card already exists (lib/call-recap.ts). This gives its reactions
 * meaning, turns a typed reply into Lily's note on the record, and drafts the
 * two emails that follow a verdict: the anonymised blurb to a founder, and
 * the update to whoever referred the person. Each draft is a thread message
 * with its own :+1:, and that :+1: is the send.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { addReaction, esc, postThreadReply } from '@/lib/slack-bot'
import { structured } from '@/lib/desk/model'
import { latestPanel } from '@/lib/desk/panel'
import { loadLiveSeats, seatBrief, type Seat } from '@/lib/desk/seats'
import { firstNameOf, lilyUserId, loadOwner, properName } from '@/lib/desk/people'
import { cancelFollowups, logActivity, moveJourney, scheduleFollowup, sendDeskEmail } from '@/lib/desk/outbound'
import { referrerOutcome } from '@/lib/desk/emails'
import type { ParsedResumeData } from '@/lib/types'

const VERDICT_BY_REACTION: Record<string, { lily: string; stage: string; label: string }> = {
  fire: { lily: 'very_strong', stage: 'warm', label: 'very strong' },
  '+1': { lily: 'strong', stage: 'warm', label: 'strong' },
  thumbsup: { lily: 'strong', stage: 'warm', label: 'strong' },
  '-1': { lily: 'weak', stage: 'post_committee_not_fit', label: 'not a fit after the call' },
  thumbsdown: { lily: 'weak', stage: 'post_committee_not_fit', label: 'not a fit after the call' },
  zzz: { lily: 'moderate', stage: 'warm', label: 'hold, off market for now' },
}

/** The recap whose card is this message. */
export async function recapForSlackMessage(admin: SupabaseClient, channel: string, ts: string) {
  const { data } = await admin
    .from('call_recaps')
    .select('id, entity_type, entity_id, person_name, person_email, summary, gmail_draft_id, occurred_at')
    .eq('slack_channel_id', channel)
    .eq('slack_message_ts', ts)
    .maybeSingle()
  return data
}

const AfterCallSchema = z.object({
  hm_blurbs: z.array(
    z.object({
      job_id: z.string(),
      subject: z.string(),
      body: z.string().describe('Plain text to the founder. One paragraph, no name, no current employer, the three facts they will ask (work authorisation, comp expectation, location), why this person for this seat, and "want an intro?". Signed Lily.'),
    }),
  ),
  referrer_update: z.object({
    subject: z.string(),
    body: z.string().describe('Plain text to the person who referred them. Two to four sentences: we spoke, the honest read, what happens next. In Lily\'s voice. Signed Lily.'),
  }),
})

/**
 * Draft the founder blurb(s) and the referrer update from the verdict, the
 * panel and the recap. Each lands in the thread with a :+1: that sends.
 */
export async function draftAfterCall(
  admin: SupabaseClient,
  input: { candidateId: string; verdict: string; note: string | null; channel: string; ts: string; by: string; recap?: Record<string, unknown> | null },
): Promise<{ ok: boolean; error?: string }> {
  const { data: c } = await admin.from('candidates').select('*').eq('id', input.candidateId).maybeSingle()
  if (!c) return { ok: false, error: 'candidate not found' }
  const [panel, owner, seats] = await Promise.all([latestPanel(admin, c.id), loadOwner(admin, c.owner_user_id ?? null), loadLiveSeats(admin)])
  const strongIds = new Set((panel?.seat_fits ?? []).filter(f => f.fit === 'strong' || f.fit === 'possible').map(f => f.job_id))
  const targets = seats.filter(s => strongIds.has(s.jobId)).slice(0, 3)
  const name = properName(c.name)
  const p = (c.parsed_data ?? {}) as Partial<ParsedResumeData>
  const recapText = input.recap ? JSON.stringify(input.recap).slice(0, 4000) : ''

  const system = `You write two short emails for Lily Joo at Refery after she has spoken to a candidate. Her voice: short, warm, plain, never an em dash, never a placeholder, signs "Best,\\nLily".
The founder blurb is ANONYMISED: no name, no current employer name (say "a perception ML engineer at a leading AV company"), no school name. It states work authorisation, comp expectation and location as facts, gives two or three reasons for this seat, and asks if they want an intro. Subject: "<Seat headline>: a profile for you".
The referrer update is to the person who sent the candidate: we spoke, the honest read in one or two sentences, what happens next (shared with founders / kept warm for the right seat / not a fit and why). Subject: "[Refery] <Candidate full name>".`
  const user = [
    `CANDIDATE: ${name}. Verdict from Lily: ${input.verdict}. ${input.note ? `Lily's note: ${input.note}` : ''}`,
    `Facts: ${c.visa_status ?? p.work_authorization ?? 'visa unknown'} · ${c.location ?? p.location ?? 'location unknown'} · asks ${c.salary_expectation_min ? `$${Math.round(c.salary_expectation_min / 1000)}k` : 'unknown'} · ${c.experience_years ?? p.experience_years ?? '?'} yrs`,
    panel ? `Panel: ${panel.grade}. ${panel.positioning}. ${panel.summary}\nHighlights: ${panel.highlights.join(' | ')}` : '',
    recapText ? `Recap of the call: ${recapText}` : '',
    `REFERRER: ${owner ? (owner.isUs ? 'none (ours)' : `${owner.name ?? owner.email}, first name ${owner.firstName}`) : 'none'}`,
    targets.length ? `SEATS to write a founder blurb for:\n${targets.map(seatBrief).join('\n\n')}` : 'SEATS: none live; return an empty hm_blurbs array.',
  ]
    .filter(Boolean)
    .join('\n\n')

  try {
    const call = await structured('draft', { system, user, schema: AfterCallSchema, maxOutputTokens: 3000 })
    const seatById = new Map(seats.map(s => [s.jobId, s]))
    for (const b of call.output.hm_blurbs) {
      const seat = seatById.get(b.job_id)
      if (!seat) continue
      await postDraftForSend(admin, {
        candidateId: c.id,
        kind: 'hm_blurb',
        to: seat.hiringManagerEmail ?? '',
        toName: seat.hiringManagerName,
        subject: b.subject,
        body: b.body,
        jobId: seat.jobId,
        channel: input.channel,
        ts: input.ts,
        label: `Blurb for ${seat.hiringManagerName ?? 'the founder'} at ${seat.companyName} (${seat.headline || seat.title})${seat.hiringManagerEmail ? '' : ' · :warning: no HM email on record, add one to the client first'}`,
        by: input.by,
      })
    }
    if (owner && !owner.isUs) {
      await postDraftForSend(admin, {
        candidateId: c.id,
        kind: 'referrer_update_verdict',
        to: owner.email,
        toName: owner.name,
        subject: call.output.referrer_update.subject,
        body: call.output.referrer_update.body,
        jobId: null,
        channel: input.channel,
        ts: input.ts,
        label: `Update for ${owner.firstName}`,
        by: input.by,
      })
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** A draft in a thread. The row exists with sent_at null; :+1: on the message sends it. */
export async function postDraftForSend(
  admin: SupabaseClient,
  d: { candidateId: string; kind: string; to: string; toName: string | null; subject: string; body: string; jobId: string | null; channel: string; ts: string; label: string; by: string },
): Promise<void> {
  const r = await postThreadReply(d.channel, d.ts, `:memo: *${esc(d.label)}*\n_To: ${esc(d.to || 'nobody yet')} · Subject: ${esc(d.subject)}_\n>${esc(d.body).replace(/\n/g, '\n>')}\n:+1: sends · reply "edit: …" on this message to change it first`)
  await admin.from('candidate_emails').insert({
    candidate_id: d.candidateId,
    kind: d.kind,
    to_email: d.to.toLowerCase(),
    subject: d.subject,
    body: d.body,
    sent_by: d.by,
    meta: { draft: true, slack_channel: d.channel, slack_ts: r.ts ?? null, thread_ts: d.ts, job_id: d.jobId },
  })
  if (r.ts) await addReaction(d.channel, r.ts, '+1')
}

/** :+1: on a draft message sends it. Returns false when the message is not a draft. */
export async function handleDraftReaction(admin: SupabaseClient, input: { reaction: string; slackUser: string; channel: string; ts: string }): Promise<boolean> {
  if (!['+1', 'thumbsup'].includes(input.reaction)) return false
  const { data: d } = await admin
    .from('candidate_emails')
    .select('*')
    .is('sent_at', null)
    .contains('meta', { draft: true, slack_channel: input.channel, slack_ts: input.ts })
    .maybeSingle()
  if (!d) return false
  if (d.error === 'sending') return true
  if (!d.to_email) {
    await postThreadReply(input.channel, input.ts, ':warning: No address to send to. Add the hiring manager email on the client, then react again.')
    return true
  }
  await admin.from('candidate_emails').update({ error: 'sending' }).eq('id', d.id)
  const { data: c } = await admin.from('candidates').select('id, name').eq('id', d.candidate_id).maybeSingle()
  const sent = await sendDeskEmail(admin, {
    candidateId: d.candidate_id as string,
    kind: d.kind as string,
    to: d.to_email as string,
    subject: d.subject as string,
    body: (d.meta as { override?: string })?.override ?? (d.body as string),
    sentBy: input.slackUser,
    meta: { from_draft: d.id, job_id: (d.meta as { job_id?: string })?.job_id ?? null },
  })
  await admin.from('candidate_emails').update({ error: sent.ok ? 'superseded by sent copy' : sent.error, sent_at: sent.ok ? new Date().toISOString() : null }).eq('id', d.id)
  const first = firstNameOf(c?.name as string)
  if (sent.ok && d.kind === 'hm_blurb') {
    const jobId = (d.meta as { job_id?: string })?.job_id ?? null
    if (jobId) {
      await admin.from('job_candidate_pipeline').upsert(
        { job_id: jobId, candidate_id: d.candidate_id, stage: 'hm_shared', match_reason: 'Anonymised blurb sent from the desk', updated_at: new Date().toISOString() },
        { onConflict: 'job_id,candidate_id' },
      )
      await admin.from('pipeline_internal_state').upsert({ job_id: jobId, candidate_id: d.candidate_id, stage: 'hm_interested', awaiting: 'hm_feedback', updated_at: new Date().toISOString() }, { onConflict: 'job_id,candidate_id' }).then(() => undefined, () => undefined)
      await scheduleFollowup(admin, { candidateId: d.candidate_id as string, kind: 'hm_chase', inHours: 48, jobId, toEmail: d.to_email as string, threadId: sent.threadId })
      await scheduleFollowup(admin, { candidateId: d.candidate_id as string, kind: 'hm_escalate', inHours: 120, jobId, toEmail: d.to_email as string, threadId: sent.threadId })
    }
  }
  await postThreadReply(input.channel, input.ts, sent.ok ? `:white_check_mark: <@${input.slackUser}> sent to ${d.to_email}.${d.kind === 'hm_blurb' ? ` ${first} is with the client; I chase for feedback at 48 h.` : ''}` : `:warning: Did not send: ${sent.error}`)
  return true
}

/** "edit: …" on a draft message replaces its body before sending. */
export async function handleDraftEdit(admin: SupabaseClient, input: { text: string; channel: string; threadTs: string; slackUser: string }): Promise<boolean> {
  const m = input.text.trim().match(/^edit\s*[:：]\s*([\s\S]+)$/i)
  if (!m) return false
  // The most recent unsent draft in this thread is the one being edited.
  const { data: d } = await admin
    .from('candidate_emails')
    .select('id, meta')
    .is('sent_at', null)
    .contains('meta', { draft: true, slack_channel: input.channel, thread_ts: input.threadTs })
    .order('created_at', { ascending: false })
    .limit(1)
  const target = d?.[0]
  if (!target) return false
  await admin.from('candidate_emails').update({ meta: { ...(target.meta as Record<string, unknown>), override: m[1].trim() } }).eq('id', target.id)
  await postThreadReply(input.channel, input.threadTs, `:pencil2: Got it. :+1: on the draft above now sends this version.`)
  return true
}

/** A reaction on a recap card. */
export async function handleRecapReaction(admin: SupabaseClient, input: { reaction: string; slackUser: string; channel: string; ts: string }): Promise<boolean> {
  const recap = await recapForSlackMessage(admin, input.channel, input.ts)
  if (!recap) return false
  if (input.reaction === 'email') {
    await postThreadReply(input.channel, input.ts, recap.gmail_draft_id ? `The recap draft is in Gmail: https://mail.google.com/mail/u/0/#drafts?compose=${recap.gmail_draft_id}` : 'No Gmail draft was created for this call.')
    return true
  }
  const v = VERDICT_BY_REACTION[input.reaction]
  if (!v) return false
  if (recap.entity_type !== 'candidate' || !recap.entity_id) {
    await postThreadReply(input.channel, input.ts, `This call is filed as a ${recap.entity_type}, so there is no candidate verdict to set.`)
    return true
  }
  const cid = recap.entity_id as string
  const now = new Date().toISOString()
  await admin.from('candidates').update({ lily_verdict: v.lily, updated_at: now, ...(input.reaction === 'zzz' ? { availability_status: 'off_market' } : {}) }).eq('id', cid)
  await moveJourney(admin, cid, v.stage, `Lily after the call: ${v.label}.`, { by: input.slackUser })
  await cancelFollowups(admin, cid, ['candidate_book_nudge', 'candidate_book_escalate', 'referrer_nudge_1', 'referrer_nudge_2', 'referrer_escalate'], 'call happened')
  await logActivity(admin, cid, 'decision_made', `Verdict after the call: ${v.label}.`, { metadata: { by: input.slackUser, lily_verdict: v.lily } })
  await admin.from('candidate_decisions').insert({ candidate_id: cid, decision: input.reaction === 'fire' ? 'verdict_very_strong' : input.reaction === 'zzz' ? 'verdict_hold' : v.stage === 'warm' ? 'verdict_strong' : 'verdict_not_fit', decided_by: input.slackUser, via: 'slack' })

  const first = firstNameOf(recap.person_name as string)
  await postThreadReply(input.channel, input.ts, `:white_check_mark: <@${input.slackUser}> ${first}: *${v.label}*. Journey: *${v.stage.replace(/_/g, ' ')}*. Drafting the follow-ups now.`)
  if (input.reaction !== 'zzz') {
    const d = await draftAfterCall(admin, { candidateId: cid, verdict: v.label, note: null, channel: input.channel, ts: input.ts, by: input.slackUser, recap: (recap.summary as Record<string, unknown>) ?? null })
    if (!d.ok) await postThreadReply(input.channel, input.ts, `:warning: Could not draft the follow-ups: ${d.error}`)
  }
  return true
}

/** A typed reply in a recap card's thread is Lily's note on the record. */
export async function handleRecapThreadReply(admin: SupabaseClient, input: { text: string; slackUser: string; channel: string; threadTs: string }): Promise<boolean> {
  const recap = await recapForSlackMessage(admin, input.channel, input.threadTs)
  if (!recap) return false
  if (recap.entity_type !== 'candidate' || !recap.entity_id) return true
  if (/^edit\s*[:：]/i.test(input.text)) return handleDraftEdit(admin, { text: input.text, channel: input.channel, threadTs: input.threadTs, slackUser: input.slackUser })
  const userId = await lilyUserId(admin)
  const { error } = await admin.from('recruiter_notes').insert({
    candidate_id: recap.entity_id,
    user_id: userId,
    note_type: 'call',
    content: input.text.trim(),
  })
  await logActivity(admin, recap.entity_id as string, 'note_added', `Lily's note after the call.`, { performedBy: userId, metadata: { via: 'slack' } })
  await postThreadReply(input.channel, input.threadTs, error ? `:warning: Could not save the note: ${error.message}` : `:pencil2: Saved as your note on ${firstNameOf(recap.person_name as string)}'s record.`)
  return true
}

/** From a bench card: draft an anonymised blurb for one warm person and one seat. */
export async function draftHmBlurb(admin: SupabaseClient, input: { candidate: Record<string, unknown>; jobId: string; by: string; channel: string; ts: string }): Promise<{ ok: boolean; error?: string }> {
  const [seat] = await loadLiveSeats(admin, [input.jobId])
  if (!seat) return { ok: false, error: 'seat is not live' }
  const c = input.candidate
  const { data: full } = await admin.from('candidates').select('*').eq('id', c.id).maybeSingle()
  const panel = await latestPanel(admin, c.id as string)
  const p = ((full?.parsed_data ?? {}) as Partial<ParsedResumeData>)
  const { data: notes } = await admin.from('recruiter_notes').select('content').eq('candidate_id', c.id).eq('note_type', 'call').order('created_at', { ascending: false }).limit(2)
  const system = `You write one anonymised email from Lily Joo at Refery to a founder about a person she has met and vouches for. No name, no current employer name, no school name. State work authorisation, comp expectation and location as facts, give two or three reasons for this seat, and ask if they want an intro. Short, warm, plain, no em dash, signed "Best,\\nLily". Subject: "<Seat headline>: a profile for you".`
  const user = `SEAT\n${seatBrief(seat)}\n\nPERSON\n${panel ? `${panel.positioning}. ${panel.summary}\nHighlights: ${panel.highlights.join(' | ')}` : String(full?.recruiter_verdict ?? p.summary ?? '')}\nFacts: ${full?.visa_status ?? p.work_authorization ?? 'visa unknown'} · ${full?.location ?? p.location ?? 'location unknown'} · asks ${full?.salary_expectation_min ? `$${Math.round(full.salary_expectation_min / 1000)}k` : 'unknown'} · ${full?.experience_years ?? p.experience_years ?? '?'} yrs\n${(notes ?? []).length ? `Lily's notes after meeting them: ${(notes ?? []).map(n => n.content).join(' | ')}` : ''}`
  try {
    const call = await structured('draft', { system, user, schema: z.object({ subject: z.string(), body: z.string() }), maxOutputTokens: 1200 })
    await postDraftForSend(admin, {
      candidateId: c.id as string,
      kind: 'hm_blurb',
      to: seat.hiringManagerEmail ?? '',
      toName: seat.hiringManagerName,
      subject: call.output.subject,
      body: call.output.body,
      jobId: seat.jobId,
      channel: input.channel,
      ts: input.ts,
      label: `${properName(c.name as string)} → ${seat.hiringManagerName ?? 'the founder'} at ${seat.companyName}${seat.hiringManagerEmail ? '' : ' · :warning: no HM email on record'}`,
      by: input.by,
    })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export { referrerOutcome }
export type { Seat }
