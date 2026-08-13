import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { ownsCandidate } from '@/lib/current-user'
import { previewBlocked, resolvePartnerAccess } from '@/lib/partners-access'
import { ACTIVE_SUBMISSION_STATUSES } from '@/lib/partners'

/** A pitch shorter than this is not a reason, it is a shrug. */
const MIN_PITCH = 40

interface Draft {
  candidate_id: string
  pitch: string
  highlights: string[]
}

function readDrafts(raw: unknown): Draft[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap(item => {
    if (!item || typeof item !== 'object') return []
    const o = item as Record<string, unknown>
    if (typeof o.candidate_id !== 'string' || typeof o.pitch !== 'string') return []
    return [
      {
        candidate_id: o.candidate_id,
        pitch: o.pitch.trim(),
        highlights: Array.isArray(o.highlights)
          ? o.highlights
              .filter((h): h is string => typeof h === 'string' && !!h.trim())
              .map(h => h.trim().slice(0, 240))
              .slice(0, 5)
          : [],
      },
    ]
  })
}

/**
 * Submitting candidates to a mandate — a scout putting their name to someone.
 *
 * Everything here is a real gate rather than a form validation:
 *
 *   the client   you must be assigned to it, or be an admin. This is the whole
 *                point of the access model, and the service-role client bypasses
 *                RLS, so it has to be checked here.
 *   the role     must still be a live mandate on an open job. A closed search
 *                should not quietly accept work.
 *   the person   must be yours. Submitting from someone else's book would take
 *                credit for their sourcing.
 *   the pitch    required, and long enough to be a reason. A submission with no
 *                stated why is what makes a marketplace worthless to the
 *                company reading it.
 *   the slots    a capped role stops accepting once it is full, rather than
 *                taking the work and burying it.
 *
 * Partial success is reported honestly: accepted ids and per-candidate reasons
 * for the rest, so the UI can say which of five went through.
 */
export async function POST(req: Request) {
  const access = await resolvePartnerAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.canUseDesk) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const blocked = previewBlocked(access)
  if (blocked) return NextResponse.json({ error: blocked }, { status: 403 })

  const body = await req.json().catch(() => null)
  const jobId = typeof body?.job_id === 'string' ? body.job_id : null
  const drafts = readDrafts(body?.submissions)

  if (!jobId) return NextResponse.json({ error: 'job_id is required' }, { status: 400 })
  if (!drafts.length) return NextResponse.json({ error: 'No candidates selected' }, { status: 400 })

  const adminClient = createAdminClient()

  const { data: role } = await adminClient
    .from('partner_roles_v')
    .select('job_id, company_id, is_live, job_status, submission_cap, live_submission_count, title')
    .eq('job_id', jobId)
    .maybeSingle()

  if (!role) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const companyId = role.company_id as string
  const unlocked = access.seesEverything || access.assignedCompanyIds.has(companyId)
  if (!unlocked) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!role.is_live || role.job_status !== 'open') {
    return NextResponse.json(
      { error: 'This search is closed. Nothing more can be submitted to it.' },
      { status: 409 },
    )
  }

  // Ownership, resolved in one query rather than per candidate.
  const { data: candidates } = await adminClient
    .from('candidates')
    .select('id, name, owner_user_id, uploaded_by_user_id, user_id')
    .in(
      'id',
      drafts.map(d => d.candidate_id),
    )
  const byId = new Map((candidates ?? []).map(c => [c.id as string, c]))

  const { data: existing } = await adminClient
    .from('role_submissions')
    .select('candidate_id, status')
    .eq('job_id', jobId)
    .in(
      'candidate_id',
      drafts.map(d => d.candidate_id),
    )
  const alreadyIn = new Set((existing ?? []).map(r => r.candidate_id as string))

  const cap = role.submission_cap as number | null
  let remaining = cap ? Math.max(0, cap - ((role.live_submission_count as number) ?? 0)) : Infinity

  const accepted: { candidate_id: string; pitch: string; highlights: string[] }[] = []
  const rejected: { candidate_id: string; reason: string }[] = []

  for (const draft of drafts) {
    const candidate = byId.get(draft.candidate_id)
    if (!candidate) {
      rejected.push({ candidate_id: draft.candidate_id, reason: 'Candidate not found' })
      continue
    }
    if (!ownsCandidate(access.appUser, candidate)) {
      rejected.push({ candidate_id: draft.candidate_id, reason: 'Not one of your candidates' })
      continue
    }
    if (alreadyIn.has(draft.candidate_id)) {
      rejected.push({ candidate_id: draft.candidate_id, reason: 'Already submitted to this role' })
      continue
    }
    if (draft.pitch.length < MIN_PITCH) {
      rejected.push({
        candidate_id: draft.candidate_id,
        reason: `Needs a reason of at least ${MIN_PITCH} characters`,
      })
      continue
    }
    if (remaining <= 0) {
      rejected.push({ candidate_id: draft.candidate_id, reason: 'No submission slots left on this role' })
      continue
    }
    remaining -= 1
    accepted.push({
      candidate_id: draft.candidate_id,
      pitch: draft.pitch.slice(0, 4000),
      highlights: draft.highlights,
    })
  }

  if (!accepted.length) {
    return NextResponse.json({ submitted: 0, rejected }, { status: 409 })
  }

  const { data: inserted, error } = await adminClient
    .from('role_submissions')
    .insert(
      accepted.map(a => ({
        job_id: jobId,
        candidate_id: a.candidate_id,
        company_id: companyId,
        submitted_by_user_id: access.appUser.id,
        status: 'submitted',
        pitch: a.pitch,
        highlights: a.highlights,
      })),
    )
    .select('id, candidate_id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // The trail starts at submission, so the scout can see the whole history
  // later without us reconstructing the first step from created_at.
  if (inserted?.length) {
    await adminClient.from('role_submission_events').insert(
      inserted.map(row => ({
        submission_id: row.id as string,
        from_status: null,
        to_status: 'submitted',
        actor_user_id: access.appUser.id,
      })),
    )
  }

  return NextResponse.json({
    submitted: inserted?.length ?? 0,
    rejected,
    slots_left: cap ? Math.max(0, remaining) : null,
    active_statuses: ACTIVE_SUBMISSION_STATUSES,
  })
}
