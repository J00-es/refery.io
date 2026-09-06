/**
 * The follow-up engine. Runs every half hour from pg_cron.
 *
 * Every pending follow-up is a question about one person with a due date. The
 * engine first checks whether the thing we were waiting for already happened
 * (an intro landed, a booking appeared, a reply came in), and only then does
 * what the timer says. Formulaic messages go out on their own. Anything that
 * needs a choice is posted in the candidate's card thread with reactions, and
 * the follow-up is marked `escalated` so it is never silently dropped.
 *
 * At the end of each run a sweep looks for people in a waiting stage with no
 * pending follow-up at all, and gives them one. That sweep is the guarantee
 * behind "nothing goes quiet".
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { addReaction, esc, postThreadReply } from '@/lib/slack-bot'
import { deskChannels } from '@/lib/desk-notifications'
import { postMessage } from '@/lib/slack-bot'
import { calendarReply, candidateNudge, referrerNudge, referrerOutcome } from '@/lib/desk/emails'
import { bookingFound, candidateWrote, classifyReply, introLanded, repliesSince } from '@/lib/desk/signals'
import { cancelFollowups, deskSetting, logActivity, moveJourney, scheduleFollowup, sendDeskEmail } from '@/lib/desk/outbound'
import { loadOwner, properName } from '@/lib/desk/people'
import { latestPanel } from '@/lib/desk/panel'
import { applyDecision } from '@/lib/desk/decide'
import type { ParsedResumeData } from '@/lib/types'

type Followup = {
  id: string
  candidate_id: string
  kind: string
  due_at: string
  status: string
  attempts: number
  to_email: string | null
  gmail_thread_id: string | null
  job_id: string | null
  meta: Record<string, unknown>
  created_at: string
}

const MAX_PER_RUN = 40

async function candidateOf(admin: SupabaseClient, id: string) {
  const { data } = await admin.from('candidates').select('*').eq('id', id).maybeSingle()
  return data
}

async function threadNote(c: Record<string, unknown>, text: string): Promise<{ ts?: string; channel?: string }> {
  if (c.desk_card_channel && c.desk_card_ts) {
    const r = await postThreadReply(c.desk_card_channel as string, c.desk_card_ts as string, text)
    return { ts: r.ts, channel: c.desk_card_channel as string }
  }
  // No card (older candidate). Post a line to the desk instead so it is seen.
  for (const ch of deskChannels()) {
    const r = await postMessage(ch, text, [{ type: 'section', text: { type: 'mrkdwn', text } }])
    if (r.ok) return { ts: r.ts, channel: ch }
  }
  return {}
}

function ms(iso: string | null | undefined): number {
  return iso ? new Date(iso).getTime() : 0
}

function missingFor(c: Record<string, unknown>): string[] {
  const p = (c.parsed_data ?? {}) as Partial<ParsedResumeData>
  const out: string[] = []
  if (!c.visa_status && !p.work_authorization) out.push('visa')
  if (!c.location && !p.location) out.push('location')
  if (!c.salary_expectation_min && !c.salary_expectation_max) out.push('comp')
  out.push('stage', 'roles', 'start')
  return out
}

/** The intro landed: reply with the calendar link, move on, start the candidate timers. */
export async function onIntroLanded(admin: SupabaseClient, c: Record<string, unknown>, evidence: { threadId: string; from: string; at: number }, by: string): Promise<void> {
  const owner = await loadOwner(admin, (c.owner_user_id as string) ?? null)
  const name = properName(c.name as string)
  const reply = calendarReply({
    candidateName: name,
    referrerFirstName: owner && !owner.isUs ? owner.firstName : null,
    missing: missingFor(c),
    hasCv: Boolean(c.resume_blob_pathname),
  })
  const sent = c.email
    ? await sendDeskEmail(admin, {
        candidateId: c.id as string,
        kind: 'calendar_reply',
        to: c.email as string,
        toName: name,
        cc: owner && !owner.isUs ? [owner.email] : [],
        subject: reply.subject,
        body: reply.body,
        threadId: evidence.threadId,
        sentBy: by,
      })
    : { ok: false, error: 'no candidate email on record', threadId: null }
  await moveJourney(admin, c.id as string, 'intro_sent', `Intro landed (email from ${evidence.from}). Calendar link ${sent.ok ? 'sent' : 'NOT sent'}.`, { by })
  await cancelFollowups(admin, c.id as string, ['referrer_nudge_1', 'referrer_nudge_2', 'referrer_escalate'], 'intro landed')
  const days = await deskSetting<number[]>(admin, 'candidate_nudge_days', [4, 10])
  await scheduleFollowup(admin, { candidateId: c.id as string, kind: 'candidate_book_nudge', inDays: days[0] ?? 4, toEmail: c.email as string, threadId: evidence.threadId })
  await scheduleFollowup(admin, { candidateId: c.id as string, kind: 'candidate_book_escalate', inDays: days[1] ?? 10, toEmail: c.email as string, threadId: evidence.threadId })
  await threadNote(
    c,
    sent.ok
      ? `:handshake: Intro landed from ${esc(evidence.from)}. I replied with your calendar link${owner && !owner.isUs ? ` (${owner.firstName} cc'd)` : ''}. ${name.split(' ')[0]} is *intro sent*; I nudge on day ${days[0] ?? 4} if they have not booked.`
      : `:handshake: Intro landed from ${esc(evidence.from)}, but I could not send the calendar reply: ${sent.error}. Worth replying by hand.`,
  )
}

/** A booking appeared: the call is on the calendar. */
export async function onBooked(admin: SupabaseClient, c: Record<string, unknown>, when: string, via: string, by: string): Promise<void> {
  await moveJourney(admin, c.id as string, 'committee_call', `Call booked for ${when.slice(0, 10)} (${via}).`, { by })
  await cancelFollowups(admin, c.id as string, ['candidate_book_nudge', 'candidate_book_escalate'], 'booked')
  const owner = await loadOwner(admin, (c.owner_user_id as string) ?? null)
  if (owner && !owner.isUs) {
    await sendDeskEmail(admin, {
      candidateId: c.id as string,
      kind: 'referrer_update_booked',
      to: owner.email,
      toName: owner.name,
      subject: `[Refery] ${properName(c.name as string)}`,
      body: referrerOutcome({ referrerFirstName: owner.firstName, candidateName: properName(c.name as string), outcome: 'booked' }),
      sentBy: by,
    })
  }
  await threadNote(c, `:calendar: ${properName(c.name as string).split(' ')[0]} booked a call for ${when.slice(0, 10)}. *Call booked.*${owner && !owner.isUs ? ` ${owner.firstName} has been told.` : ''}`)
}

async function escalate(
  admin: SupabaseClient,
  f: Followup,
  c: Record<string, unknown>,
  text: string,
  reactions: string[],
): Promise<void> {
  const posted = await threadNote(c, text)
  await admin
    .from('candidate_followups')
    .update({ status: 'escalated', meta: { ...(f.meta ?? {}), slack_channel: posted.channel ?? null, slack_ts: posted.ts ?? null }, done_at: new Date().toISOString() })
    .eq('id', f.id)
  if (posted.channel && posted.ts) for (const r of reactions) await addReaction(posted.channel, posted.ts, r)
}

async function done(admin: SupabaseClient, f: Followup, note: string): Promise<void> {
  await admin.from('candidate_followups').update({ status: 'done', note, done_at: new Date().toISOString() }).eq('id', f.id)
}

async function pushBack(admin: SupabaseClient, f: Followup, days: number, note: string): Promise<void> {
  await admin
    .from('candidate_followups')
    .update({ due_at: new Date(Date.now() + days * 86_400_000).toISOString(), attempts: f.attempts + 1, note })
    .eq('id', f.id)
}

// ── handlers ─────────────────────────────────────────────────────────────────

async function referrerStep(admin: SupabaseClient, f: Followup, c: Record<string, unknown>): Promise<void> {
  const askedAt = ms(f.created_at) - 60_000
  const first = properName(c.name as string).split(' ')[0]
  const owner = await loadOwner(admin, (c.owner_user_id as string) ?? null)

  if (c.email) {
    const landed = await introLanded(c.email as string, askedAt)
    if (landed) {
      await done(admin, f, 'intro landed')
      await onIntroLanded(admin, c, { threadId: landed.threadId, from: landed.from, at: landed.internalDate }, 'desk')
      return
    }
  }

  if (f.gmail_thread_id) {
    const replies = await repliesSince(f.gmail_thread_id, ms(f.meta?.last_reply_at as string) || askedAt)
    const last = replies[replies.length - 1]
    if (last) {
      const read = await classifyReply({ who: 'referrer', text: last.text, candidateName: properName(c.name as string) })
      await logActivity(admin, c.id as string, 'signal_seen', `${owner?.firstName ?? 'The referrer'} replied: ${read.kind}. ${read.summary}`, { source: 'gmail' })
      if (read.kind === 'connected') {
        // They say they did; give the intro two days to show up before nudging again.
        await pushBack(admin, f, 2, `referrer says connected: ${read.summary}`)
        await admin.from('candidate_followups').update({ meta: { ...(f.meta ?? {}), last_reply_at: new Date(last.at).toISOString() } }).eq('id', f.id)
        return
      }
      if (read.kind === 'promised') {
        await pushBack(admin, f, 3, `referrer promised: ${read.summary}`)
        await admin.from('candidate_followups').update({ meta: { ...(f.meta ?? {}), last_reply_at: new Date(last.at).toISOString() } }).eq('id', f.id)
        await threadNote(c, `:hourglass: ${owner?.firstName ?? 'The referrer'} replied: "${esc(read.summary)}". Waiting three more days before the next nudge.`)
        return
      }
      if (read.kind === 'declined' || read.kind === 'not_now') {
        await cancelFollowups(admin, c.id as string, ['referrer_nudge_1', 'referrer_nudge_2', 'referrer_escalate'], read.kind)
        await escalate(admin, f, c, `:no_entry: ${owner?.firstName ?? 'The referrer'} replied: "${esc(read.summary)}". :raising_hand: I reach out to ${first} directly, saying it came from them  ·  :zzz: park ${first} as dormant`, ['raising_hand', 'zzz'])
        return
      }
      if (read.kind === 'question') {
        await escalate(admin, f, c, `:speech_balloon: ${owner?.firstName ?? 'The referrer'} asked something: "${esc(read.summary)}". Needs your reply in Gmail. React :white_check_mark: here once answered and I resume the timers.`, ['white_check_mark'])
        return
      }
    }
  }

  if (f.kind === 'referrer_escalate') {
    await escalate(
      admin,
      f,
      c,
      `:alarm_clock: Day ${Math.round((Date.now() - askedAt) / 86_400_000)}: no intro from ${owner?.firstName ?? 'the referrer'} after two nudges. :raising_hand: I email ${first} directly, saying it came from ${owner?.firstName ?? 'them'}  ·  :zzz: drop it and tell ${owner?.firstName ?? 'them'}`,
      ['raising_hand', 'zzz'],
    )
    return
  }

  if (!owner || !f.to_email) {
    await done(admin, f, 'no owner email')
    return
  }
  const attempt = f.kind === 'referrer_nudge_1' ? 1 : 2
  const sent = await sendDeskEmail(admin, {
    candidateId: c.id as string,
    kind: `referrer_nudge_${attempt}`,
    to: f.to_email,
    toName: owner.name,
    subject: `[Refery] ${properName(c.name as string)}`,
    body: referrerNudge({ referrerFirstName: owner.firstName, candidateName: properName(c.name as string), attempt }),
    threadId: f.gmail_thread_id,
    sentBy: 'desk',
  })
  await done(admin, f, sent.ok ? 'nudge sent' : `nudge failed: ${sent.error}`)
  await threadNote(c, sent.ok ? `:envelope: Nudge ${attempt} sent to ${owner.firstName}.` : `:warning: Nudge ${attempt} to ${owner.firstName} did not send: ${sent.error}`)
}

async function candidateStep(admin: SupabaseClient, f: Followup, c: Record<string, unknown>): Promise<void> {
  const askedAt = ms(f.created_at) - 60_000
  const first = properName(c.name as string).split(' ')[0]
  const booked = await bookingFound(admin, c.id as string, (c.email as string) ?? null, askedAt)
  if (booked) {
    await done(admin, f, 'booked')
    await onBooked(admin, c, booked.when, booked.via, 'desk')
    return
  }
  if (c.email) {
    const wrote = await candidateWrote(c.email as string, ms(f.meta?.last_reply_at as string) || askedAt)
    if (wrote) {
      const read = await classifyReply({ who: 'candidate', text: wrote.snippet, candidateName: properName(c.name as string) })
      await logActivity(admin, c.id as string, 'signal_seen', `${first} replied: ${read.kind}. ${read.summary}`, { source: 'gmail' })
      if (read.kind === 'booked') {
        await pushBack(admin, f, 2, `says booked: ${read.summary}`)
        await admin.from('candidate_followups').update({ meta: { ...(f.meta ?? {}), last_reply_at: new Date(wrote.internalDate).toISOString() } }).eq('id', f.id)
        return
      }
      if (read.kind === 'not_now' || read.kind === 'declined') {
        await admin.from('candidates').update({ availability_status: 'off_market' }).eq('id', c.id)
        await cancelFollowups(admin, c.id as string, ['candidate_book_nudge', 'candidate_book_escalate'], read.kind)
        await escalate(admin, f, c, `:zzz: ${first} replied: "${esc(read.summary)}". Marked off market. :white_check_mark: fine, tell the referrer  ·  :raising_hand: you will reply yourself`, ['white_check_mark', 'raising_hand'])
        return
      }
      if (read.kind === 'question') {
        await escalate(admin, f, c, `:speech_balloon: ${first} asked something: "${esc(read.summary)}". Needs your reply in Gmail. React :white_check_mark: once answered and I resume the timers.`, ['white_check_mark'])
        return
      }
    }
  }
  if (f.kind === 'candidate_book_escalate') {
    await escalate(admin, f, c, `:alarm_clock: ${first} has not booked after a nudge. :raising_hand: you email them by hand  ·  :zzz: park as dormant and tell the referrer`, ['raising_hand', 'zzz'])
    return
  }
  if (!c.email) {
    await done(admin, f, 'no candidate email')
    return
  }
  const sent = await sendDeskEmail(admin, {
    candidateId: c.id as string,
    kind: 'candidate_nudge',
    to: c.email as string,
    toName: properName(c.name as string),
    subject: `${first} / Lily @ Refery`,
    body: candidateNudge({ candidateName: properName(c.name as string) }),
    threadId: f.gmail_thread_id,
    sentBy: 'desk',
  })
  await done(admin, f, sent.ok ? 'nudge sent' : `nudge failed: ${sent.error}`)
  await threadNote(c, sent.ok ? `:envelope: Nudged ${first} to book.` : `:warning: Nudge to ${first} did not send: ${sent.error}`)
}

async function reminderStep(admin: SupabaseClient, f: Followup, c: Record<string, unknown>): Promise<void> {
  const stage = String(c.journey_stage)
  if (!['decision_pending', 'uploaded', 'calibrating', 'ready_for_intro'].includes(stage)) {
    await done(admin, f, 'moved on')
    return
  }
  const panel = await latestPanel(admin, c.id as string)
  const days = Math.round((Date.now() - ms(c.decision_pending_since as string)) / 86_400_000)
  await threadNote(c, `:bell: Still waiting on you for ${properName(c.name as string)} (${days} day${days === 1 ? '' : 's'}). Suggested: *${panel?.suggested_decision.replace(/_/g, ' ') ?? 'a decision'}*. React on the card above.`)
  await done(admin, f, 'reminded')
  // Keep asking weekly until decided. A reminder that stops is a loophole.
  await scheduleFollowup(admin, { candidateId: c.id as string, kind: 'decision_reminder', inDays: 7 })
}

async function snoozeStep(admin: SupabaseClient, f: Followup, c: Record<string, unknown>): Promise<void> {
  await admin.from('candidates').update({ desk_snoozed_until: null }).eq('id', c.id)
  await done(admin, f, 'reposted')
  if (['decision_pending', 'uploaded', 'calibrating', 'ready_for_intro'].includes(String(c.journey_stage))) {
    await threadNote(c, `:alarm_clock: Snooze over for ${properName(c.name as string)}. Still undecided; react on the card above.`)
    await scheduleFollowup(admin, { candidateId: c.id as string, kind: 'decision_reminder', inDays: 7 })
  }
}

async function benchAutosendStep(admin: SupabaseClient, f: Followup, c: Record<string, unknown>): Promise<void> {
  const hours = await deskSetting<number | null>(admin, 'bench_autosend_hours', null)
  if (hours === null || String(c.journey_stage) !== 'decision_pending') {
    await done(admin, f, hours === null ? 'autosend off' : 'already decided')
    return
  }
  const panel = await latestPanel(admin, c.id as string)
  if (panel?.suggested_decision !== 'bench') {
    await done(admin, f, 'suggestion is not bench')
    return
  }
  const r = await applyDecision(admin, { candidateId: c.id as string, decision: 'bench', by: 'desk', via: 'auto' })
  await done(admin, f, r.ok ? 'benched automatically' : `failed: ${r.error}`)
  await threadNote(c, `:robot_face: No reaction after ${hours}h, so I benched them as suggested. ${r.message}`)
}

async function hmStep(admin: SupabaseClient, f: Followup, c: Record<string, unknown>): Promise<void> {
  // Feedback from the hiring manager is recorded on the submission (hm_rating) or as a pipeline stage change.
  const jobId = f.job_id
  if (!jobId) {
    await done(admin, f, 'no job')
    return
  }
  const { data: sub } = await admin.from('role_submissions').select('hm_rating, status, updated_at').eq('candidate_id', c.id).eq('job_id', jobId).maybeSingle()
  const { data: st } = await admin.from('pipeline_internal_state').select('stage, updated_at').eq('candidate_id', c.id).eq('job_id', jobId).maybeSingle()
  const heard = (sub?.hm_rating != null) || (sub && !['sent_to_client', 'shortlisted', 'submitted'].includes(String(sub.status))) || (st && st.stage !== 'hm_interested')
  if (heard) {
    await done(admin, f, 'feedback in')
    return
  }
  const { data: job } = await admin.from('partner_roles_v').select('company_name, headline, title, hiring_manager_name').eq('job_id', jobId).maybeSingle()
  const where = `${job?.headline ?? job?.title ?? 'the seat'} at ${job?.company_name ?? 'the client'}`
  const first = properName(c.name as string).split(' ')[0]
  if (f.kind === 'hm_chase') {
    const to = (f.to_email as string) ?? null
    if (to) {
      const sent = await sendDeskEmail(admin, {
        candidateId: c.id as string,
        kind: 'hm_chase',
        to,
        toName: job?.hiring_manager_name ?? null,
        subject: `Re: ${first} for ${job?.headline ?? job?.title ?? 'the role'}`,
        body: `Hi ${(job?.hiring_manager_name ?? 'there').split(' ')[0]}, quick nudge on ${first}. Would love a yes or no this week so I can keep them warm (or release them). Thanks!\n\nBest,\nLily`,
        threadId: f.gmail_thread_id,
        sentBy: 'desk',
      })
      await done(admin, f, sent.ok ? 'HM nudged' : `HM nudge failed: ${sent.error}`)
      await threadNote(c, sent.ok ? `:envelope: Nudged ${job?.hiring_manager_name ?? 'the hiring manager'} at ${job?.company_name ?? 'the client'} for feedback on ${first}.` : `:warning: HM nudge did not send: ${sent.error}`)
    } else {
      await escalate(admin, f, c, `:alarm_clock: No feedback from ${job?.company_name ?? 'the client'} on ${first} for ${where}, and no HM email on record to nudge. Worth a Slack or WhatsApp. React :white_check_mark: when you have chased.`, ['white_check_mark'])
    }
    return
  }
  await escalate(admin, f, c, `:rotating_light: Five days and still no feedback from ${job?.company_name ?? 'the client'} on ${first} for ${where}. React :white_check_mark: when chased, or :zzz: to stop asking.`, ['white_check_mark', 'zzz'])
}

// ── the run ──────────────────────────────────────────────────────────────────

export async function runFollowups(admin: SupabaseClient): Promise<Record<string, unknown>> {
  const { data } = await admin
    .from('candidate_followups')
    .select('*')
    .eq('status', 'pending')
    .lte('due_at', new Date().toISOString())
    .order('due_at', { ascending: true })
    .limit(MAX_PER_RUN)
  const rows = (data ?? []) as Followup[]
  const results: Record<string, unknown>[] = []

  for (const f of rows) {
    const c = await candidateOf(admin, f.candidate_id)
    if (!c) {
      await done(admin, f, 'candidate gone')
      continue
    }
    try {
      switch (f.kind) {
        case 'referrer_nudge_1':
        case 'referrer_nudge_2':
        case 'referrer_escalate':
          if (String(c.journey_stage) !== 'intro_requested') await done(admin, f, `stage is ${c.journey_stage}`)
          else await referrerStep(admin, f, c)
          break
        case 'candidate_book_nudge':
        case 'candidate_book_escalate':
          if (String(c.journey_stage) !== 'intro_sent') await done(admin, f, `stage is ${c.journey_stage}`)
          else await candidateStep(admin, f, c)
          break
        case 'decision_reminder':
          await reminderStep(admin, f, c)
          break
        case 'snooze_repost':
          await snoozeStep(admin, f, c)
          break
        case 'bench_autosend':
          await benchAutosendStep(admin, f, c)
          break
        case 'hm_chase':
        case 'hm_escalate':
          await hmStep(admin, f, c)
          break
        default:
          await done(admin, f, `unknown kind ${f.kind}`)
      }
      results.push({ id: f.id, kind: f.kind, candidate: c.name })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[desk:followups] ${f.kind} for ${f.candidate_id} threw:`, err)
      await admin
        .from('candidate_followups')
        .update({ attempts: f.attempts + 1, note: message.slice(0, 300), status: f.attempts + 1 >= 3 ? 'failed' : 'pending', due_at: new Date(Date.now() + 3_600_000).toISOString() })
        .eq('id', f.id)
      results.push({ id: f.id, kind: f.kind, error: message })
    }
  }

  const swept = await sweep(admin)
  return { processed: results.length, results, swept }
}

/**
 * Nobody in a waiting stage may be without a pending or escalated follow-up.
 * Anyone found without one gets an escalation now, which puts them in Slack.
 */
async function sweep(admin: SupabaseClient): Promise<number> {
  const waiting: Record<string, string> = {
    intro_requested: 'referrer_escalate',
    intro_sent: 'candidate_book_escalate',
    decision_pending: 'decision_reminder',
  }
  let created = 0
  for (const [stage, kind] of Object.entries(waiting)) {
    const { data: people } = await admin
      .from('candidates')
      .select('id, name, journey_stage_at, desk_snoozed_until, intake_source')
      .eq('journey_stage', stage)
      .lt('journey_stage_at', new Date(Date.now() - 2 * 86_400_000).toISOString())
    for (const p of people ?? []) {
      if (p.intake_source === 'calibration') continue
      if (p.desk_snoozed_until && new Date(p.desk_snoozed_until as string).getTime() > Date.now()) continue
      const { count } = await admin
        .from('candidate_followups')
        .select('id', { count: 'exact', head: true })
        .eq('candidate_id', p.id)
        .in('status', ['pending', 'escalated'])
      if ((count ?? 0) > 0) continue
      await scheduleFollowup(admin, { candidateId: p.id as string, kind, inHours: 0, meta: { swept: true } })
      created++
    }
  }
  return created
}

/** A reaction on an escalation line in a card thread. */
export async function handleEscalationReaction(
  admin: SupabaseClient,
  input: { reaction: string; slackUser: string; channel: string; ts: string },
): Promise<boolean> {
  const { data: f } = await admin
    .from('candidate_followups')
    .select('*')
    .eq('status', 'escalated')
    .contains('meta', { slack_channel: input.channel, slack_ts: input.ts })
    .maybeSingle()
  if (!f) return false
  const c = await candidateOf(admin, f.candidate_id as string)
  if (!c) return true
  const first = properName(c.name as string).split(' ')[0]
  const owner = await loadOwner(admin, (c.owner_user_id as string) ?? null)
  const fk = String(f.kind)

  const finish = async (note: string) =>
    admin.from('candidate_followups').update({ status: 'done', note, done_at: new Date().toISOString() }).eq('id', f.id)

  if (input.reaction === 'white_check_mark') {
    await finish(`cleared by ${input.slackUser}`)
    // Resume the timers for the stage the person is in.
    if (String(c.journey_stage) === 'intro_requested') await scheduleFollowup(admin, { candidateId: c.id as string, kind: 'referrer_escalate', inDays: 5, toEmail: owner?.email ?? null, threadId: f.gmail_thread_id as string })
    if (String(c.journey_stage) === 'intro_sent') await scheduleFollowup(admin, { candidateId: c.id as string, kind: 'candidate_book_escalate', inDays: 5, toEmail: c.email as string, threadId: f.gmail_thread_id as string })
    if (fk.startsWith('hm_')) await scheduleFollowup(admin, { candidateId: c.id as string, kind: 'hm_escalate', inDays: 3, jobId: f.job_id as string, toEmail: f.to_email as string })
    await postThreadReply(input.channel, input.ts, `:white_check_mark: <@${input.slackUser}> cleared it. Timers resume.`)
    return true
  }

  if (input.reaction === 'zzz') {
    await finish(`parked by ${input.slackUser}`)
    if (fk.startsWith('hm_')) {
      await postThreadReply(input.channel, input.ts, `:zzz: Stopped asking about ${first} at this client.`)
      return true
    }
    await moveJourney(admin, c.id as string, 'dormant', `Parked as dormant from Slack.`, { by: input.slackUser })
    if (owner && !owner.isUs) {
      await sendDeskEmail(admin, {
        candidateId: c.id as string,
        kind: 'referrer_update_dormant',
        to: owner.email,
        toName: owner.name,
        subject: `[Refery] ${properName(c.name as string)}`,
        body: referrerOutcome({ referrerFirstName: owner.firstName, candidateName: properName(c.name as string), outcome: 'dormant' }),
        threadId: f.gmail_thread_id as string,
        sentBy: input.slackUser,
      })
    }
    await postThreadReply(input.channel, input.ts, `:zzz: <@${input.slackUser}> parked ${first} as *dormant*.${owner && !owner.isUs ? ` ${owner.firstName} has been told.` : ''}`)
    return true
  }

  if (input.reaction === 'raising_hand') {
    await finish(`taken by ${input.slackUser}`)
    if (String(c.journey_stage) === 'intro_requested' && c.email) {
      // Go direct, in Lily's words: "saying it came from you".
      const { directAfterReferrer } = await import('@/lib/desk/emails')
      const panel = await latestPanel(admin, c.id as string)
      const { loadLiveSeats, seatLabel } = await import('@/lib/desk/seats')
      const seats = await loadLiveSeats(admin)
      const by = new Map(seats.map(s => [s.jobId, s]))
      const lines = (panel?.seat_fits ?? []).filter(x => x.fit === 'strong' && by.has(x.job_id)).map(x => seatLabel(by.get(x.job_id)!, false))
      const mail = directAfterReferrer({ candidateName: properName(c.name as string), referrerName: owner?.name ?? owner?.firstName ?? 'A mutual contact', seatLines: lines.length ? lines : ['a couple of early-stage searches in SF and NY'] })
      const sent = await sendDeskEmail(admin, { candidateId: c.id as string, kind: 'direct_after_referrer', to: c.email as string, toName: properName(c.name as string), subject: mail.subject, body: mail.body, sentBy: input.slackUser })
      await moveJourney(admin, c.id as string, 'intro_sent', 'Went direct after the referrer did not connect.', { by: input.slackUser })
      const days = await deskSetting<number[]>(admin, 'candidate_nudge_days', [4, 10])
      await scheduleFollowup(admin, { candidateId: c.id as string, kind: 'candidate_book_nudge', inDays: days[0] ?? 4, toEmail: c.email as string, threadId: sent.threadId })
      await scheduleFollowup(admin, { candidateId: c.id as string, kind: 'candidate_book_escalate', inDays: days[1] ?? 10, toEmail: c.email as string, threadId: sent.threadId })
      if (owner && !owner.isUs) {
        await sendDeskEmail(admin, { candidateId: c.id as string, kind: 'referrer_update_direct', to: owner.email, toName: owner.name, subject: `[Refery] ${properName(c.name as string)}`, body: referrerOutcome({ referrerFirstName: owner.firstName, candidateName: properName(c.name as string), outcome: 'went_direct' }), threadId: f.gmail_thread_id as string, sentBy: input.slackUser })
      }
      await postThreadReply(input.channel, input.ts, sent.ok ? `:email: <@${input.slackUser}> went direct. Emailed ${first}${owner && !owner.isUs ? ` and told ${owner.firstName}` : ''}. *Intro sent.*` : `:warning: Could not email ${first}: ${sent.error}`)
      return true
    }
    await postThreadReply(input.channel, input.ts, `:raising_hand: <@${input.slackUser}> is handling ${first} by hand. Timers stopped; I will check again in a week.`)
    await scheduleFollowup(admin, { candidateId: c.id as string, kind: String(c.journey_stage) === 'intro_sent' ? 'candidate_book_escalate' : 'referrer_escalate', inDays: 7, toEmail: f.to_email as string, threadId: f.gmail_thread_id as string })
    return true
  }
  return true
}
