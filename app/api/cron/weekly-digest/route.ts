import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { DESK_BETA_ONLY, PROPOSAL_DAYS, searchStageMeta, submissionStatus, type SearchAssignmentRow } from '@/lib/partners'
import { renderWeeklyDigest, sendWeeklyDigest, type WeeklyDigest } from '@/lib/weekly-digest-email'

/**
 * Sunday: the partner digest, and the proposal sweep.
 *
 * Two jobs share this cron because they run on the same rhythm and read the
 * same tables:
 *
 *   the sweep    a proposal nobody answered inside PROPOSAL_DAYS becomes a
 *                declined row with a stated reason, so the search drops back to
 *                "open to you, on request" and coverage stops counting a yes
 *                that never came. Re-proposing later is one click.
 *   the digest   one email per partner on at least one search: what moved,
 *                what needs them, where each search stands, what is new.
 *                Nobody with nothing on gets nothing.
 *
 * `?dry=1` renders without sending and returns the emails, which is how the
 * copy gets checked before a Sunday.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const DAY_MS = 24 * 60 * 60 * 1000
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://refery.xyz'

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

function firstName(full: string | null | undefined, email: string): string {
  const name = (full ?? '').trim().split(/\s+/)[0]
  return name || email.split('@')[0] || 'there'
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const dry = request.nextUrl.searchParams.get('dry') === '1'
  const only = request.nextUrl.searchParams.get('to') // one address, for a test send

  const adminClient = createAdminClient()
  const now = new Date()
  const since = new Date(now.getTime() - 7 * DAY_MS).toISOString()

  // ── the sweep ─────────────────────────────────────────────────────────────
  const { data: expired } = await adminClient
    .from('search_assignments')
    .select('id')
    .eq('status', 'proposed')
    .lt('expires_at', now.toISOString())
  let swept = 0
  if (expired?.length && !dry) {
    const { error } = await adminClient
      .from('search_assignments')
      .update({
        status: 'declined',
        declined_at: now.toISOString(),
        declined_reason: `No answer within ${PROPOSAL_DAYS} days`,
        updated_at: now.toISOString(),
      })
      .in('id', expired.map(e => e.id as string))
    if (!error) swept = expired.length
  }

  // ── who gets one ──────────────────────────────────────────────────────────
  const { data: assignmentRows } = await adminClient
    .from('search_assignments')
    .select('*')
    .in('status', ['proposed', 'working'])
  const assignments = (assignmentRows ?? []) as SearchAssignmentRow[]
  const userIds = [...new Set(assignments.map(a => a.user_id))]
  if (!userIds.length) return NextResponse.json({ swept, sent: 0, skipped: 'nobody is on a search' })

  const jobIds = [...new Set(assignments.map(a => a.job_id))]

  const [{ data: users }, { data: roles }, { data: submissions }, { data: events }, { data: answers }] =
    await Promise.all([
      adminClient.from('users_admin').select('user_id, email, full_name, status, is_beta').in('user_id', userIds),
      adminClient
        .from('partner_roles_v')
        .select('job_id, company_id, title, headline, company_name, search_stage, stage_moved_at, is_live, job_status')
        .in('job_id', jobIds),
      adminClient
        .from('role_submissions_v')
        .select('id, job_id, company_id, candidate_name, status, submitted_by_user_id, updated_at, work_authorization, hm_rating, hm_note, decline_reason, review_note, job_title, company_name')
        .in('submitted_by_user_id', userIds),
      adminClient
        .from('role_submission_events')
        .select('submission_id, to_status, note, created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: true }),
      adminClient
        .from('search_questions')
        .select('job_id, question, answer, answered_at')
        .in('job_id', jobIds)
        .eq('is_visible', true)
        .gte('answered_at', since),
    ])

  const roleById = new Map((roles ?? []).map(r => [r.job_id as string, r]))
  const eventsBySubmission = new Map<string, { to_status: string; note: string | null; created_at: string }[]>()
  for (const e of events ?? []) {
    const list = eventsBySubmission.get(e.submission_id as string) ?? []
    list.push({ to_status: e.to_status as string, note: (e.note as string | null) ?? null, created_at: e.created_at as string })
    eventsBySubmission.set(e.submission_id as string, list)
  }

  const weekLabel = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  const results: { to: string; sent: boolean; error?: string; subject?: string; html?: string }[] = []

  for (const user of users ?? []) {
    if (user.status !== 'active' || !user.email) continue
    // Every link in the digest opens the desk. While the desk is in beta, a
    // partner outside it would land on a 404, so they get no digest yet.
    if (DESK_BETA_ONLY && !user.is_beta) continue
    if (only && user.email !== only) continue
    const uid = user.user_id as string
    const mine = assignments.filter(a => a.user_id === uid)
    if (!mine.length) continue

    const digest: WeeklyDigest = {
      to: user.email as string,
      firstName: firstName(user.full_name as string | null, user.email as string),
      weekLabel,
      moved: [],
      needsYou: [],
      searches: [],
      fresh: [],
    }

    // What moved: their submissions with an event this week. The latest event
    // wins, and its note comes along, because the note is the point.
    for (const s of (submissions ?? []).filter(x => x.submitted_by_user_id === uid)) {
      const trail = eventsBySubmission.get(s.id as string)
      if (!trail?.length) continue
      const last = trail[trail.length - 1]
      const meta = submissionStatus(last.to_status)
      const where = `${s.job_title} at ${s.company_name}`
      let text = `${meta.label.toLowerCase()} · ${where}.`
      if (last.to_status === 'declined') {
        text = `is not moving forward at ${s.company_name}.${s.decline_reason || last.note ? ` Reason: ${s.decline_reason ?? last.note}.` : ''}`
      } else if (last.note) {
        text += ` ${last.note}`
      }
      if (s.hm_rating || s.hm_note) {
        const read = s.hm_rating ? ['', 'strong no', 'no', 'yes', 'strong yes'][s.hm_rating as number] : null
        text += ` The hiring manager's read${read ? `: ${read}` : ''}${s.hm_note ? `. "${s.hm_note}"` : '.'}`
      }
      digest.moved.push({ lead: (s.candidate_name as string) ?? 'A candidate', text })
    }

    // Needs you: proposals without an answer, and open submissions missing the
    // one field every client asks about.
    const pending = mine.filter(a => a.status === 'proposed')
    if (pending.length) {
      const names = pending
        .map(a => roleById.get(a.job_id))
        .filter(Boolean)
        .map(r => `${r!.headline || r!.title} at ${r!.company_name}`)
      digest.needsYou.push({
        lead: pending.length === 1 ? 'One search is proposed to you.' : `${pending.length} searches are proposed to you.`,
        text: `Confirm or decline: ${names.join('; ')}. Unanswered, it lapses after ${PROPOSAL_DAYS} days.`,
      })
    }
    for (const s of (submissions ?? []).filter(
      x => x.submitted_by_user_id === uid && !x.work_authorization && ['submitted', 'shortlisted', 'sent_to_client'].includes(x.status as string),
    )) {
      digest.needsYou.push({
        lead: `${s.candidate_name}`,
        text: `is missing work authorisation on ${s.job_title} at ${s.company_name}. Clients ask on the first read.`,
      })
    }

    // Your searches: one line each with the stage and your own in-play count.
    for (const a of mine) {
      const r = roleById.get(a.job_id)
      if (!r) continue
      const open = r.is_live && r.job_status === 'open'
      const inPlay = (submissions ?? []).filter(
        x => x.submitted_by_user_id === uid && x.job_id === a.job_id && !['declined', 'withdrawn'].includes(x.status as string),
      ).length
      digest.searches.push({
        title: (r.headline as string) || (r.title as string),
        company: r.company_name as string,
        href: `${APP_URL}/searches/${r.company_id}/roles/${r.job_id}`,
        status: [
          a.status === 'proposed' ? 'proposed to you' : null,
          searchStageMeta(r.search_stage as string).label,
          open ? 'still open' : 'closed',
          inPlay ? `${inPlay} of yours in play` : 'nothing from you yet',
        ]
          .filter(Boolean)
          .join(' · '),
      })
    }

    // New this week: answers added on their searches.
    for (const q of answers ?? []) {
      if (!mine.some(a => a.job_id === q.job_id)) continue
      const r = roleById.get(q.job_id as string)
      digest.fresh.push({
        lead: `Q&A on ${r ? `${r.headline || r.title}` : 'a search'}:`,
        text: `"${q.question}" ${q.answer}`,
      })
    }

    if (dry) {
      const rendered = renderWeeklyDigest(digest)
      results.push({ to: digest.to, sent: false, subject: rendered.subject, html: rendered.html })
    } else {
      const r = await sendWeeklyDigest(digest)
      results.push({ to: digest.to, ...r })
    }
  }

  return NextResponse.json({
    swept,
    sent: results.filter(r => r.sent).length,
    results: dry ? results : results.map(({ html: _html, ...rest }) => rest),
  })
}
