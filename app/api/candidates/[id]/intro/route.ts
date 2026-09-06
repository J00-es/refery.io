import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireCandidateAccess } from '@/lib/current-user'
import { onIntroLanded } from '@/lib/desk/followups'
import { directAfterReferrer } from '@/lib/desk/emails'
import { cancelFollowups, deskSetting, moveJourney, scheduleFollowup, sendDeskEmail } from '@/lib/desk/outbound'
import { latestPanel } from '@/lib/desk/panel'
import { loadLiveSeats, seatLabel } from '@/lib/desk/seats'
import { loadOwner, properName } from '@/lib/desk/people'
import { postThreadReply } from '@/lib/slack-bot'

/**
 * The two buttons a partner has on someone we asked them to introduce.
 *
 *   made          "I made the intro": the timers on them stop, the person is
 *                 intro sent, and we watch for the candidate to book.
 *   send_for_me   Refery writes to the candidate saying it came from the
 *                 partner, with the partner cc'd.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireCandidateAccess(id)
  if (!access.ok) return NextResponse.json({ error: access.message }, { status: access.status })
  const { appUser } = access

  const body = (await request.json().catch(() => ({}))) as { action?: string }
  const admin = createAdminClient()
  const { data: c } = await admin.from('candidates').select('*').eq('id', id).maybeSingle()
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (String(c.journey_stage) !== 'intro_requested') {
    return NextResponse.json({ error: 'We are not waiting on an intro for this person right now.' }, { status: 409 })
  }
  const owner = await loadOwner(admin, c.owner_user_id ?? null)
  const name = properName(c.name)
  const by = appUser.email

  if (body.action === 'made') {
    // No email thread to reply into; write to them fresh, in the same shape as
    // the calendar reply, so the follow-up timers start the same way.
    await onIntroLanded(admin, c, { threadId: '', from: owner?.email ?? by, at: Date.now() }, by)
    return NextResponse.json({ ok: true, message: `Thanks. ${name.split(' ')[0]} is marked as introduced; we take it from here.` })
  }

  if (body.action === 'send_for_me') {
    if (!c.email) return NextResponse.json({ error: 'There is no email address on this profile to write to.' }, { status: 400 })
    const panel = await latestPanel(admin, id)
    const seats = await loadLiveSeats(admin)
    const byId = new Map(seats.map(s => [s.jobId, s]))
    const lines = (panel?.seat_fits ?? []).filter(f => f.fit === 'strong' && byId.has(f.job_id)).map(f => seatLabel(byId.get(f.job_id)!, false))
    const mail = directAfterReferrer({ candidateName: name, referrerName: owner?.name ?? owner?.firstName ?? appUser.fullName ?? 'A mutual contact', seatLines: lines.length ? lines : ['a couple of early-stage searches in SF and NY'] })
    const sent = await sendDeskEmail(admin, {
      candidateId: id,
      kind: 'direct_for_partner',
      to: c.email,
      toName: name,
      cc: owner && !owner.isUs ? [owner.email] : [],
      subject: mail.subject,
      body: mail.body,
      sentBy: by,
    })
    if (!sent.ok) return NextResponse.json({ error: `Could not send: ${sent.error}` }, { status: 500 })
    await moveJourney(admin, id, 'intro_sent', `Refery wrote to them on ${owner?.firstName ?? 'the partner'}'s behalf.`, { by })
    await cancelFollowups(admin, id, ['referrer_nudge_1', 'referrer_nudge_2', 'referrer_escalate'], 'partner asked us to send')
    const days = await deskSetting<number[]>(admin, 'candidate_nudge_days', [4, 10])
    await scheduleFollowup(admin, { candidateId: id, kind: 'candidate_book_nudge', inDays: days[0] ?? 4, toEmail: c.email, threadId: sent.threadId })
    await scheduleFollowup(admin, { candidateId: id, kind: 'candidate_book_escalate', inDays: days[1] ?? 10, toEmail: c.email, threadId: sent.threadId })
    if (c.desk_card_channel && c.desk_card_ts) {
      await postThreadReply(c.desk_card_channel, c.desk_card_ts, `:email: ${owner?.firstName ?? 'The partner'} asked us to write to ${name.split(' ')[0]} directly, so I did (they are cc'd). *Intro sent.*`)
    }
    return NextResponse.json({ ok: true, message: `Sent. ${name.split(' ')[0]} has our email with you cc'd.` })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
