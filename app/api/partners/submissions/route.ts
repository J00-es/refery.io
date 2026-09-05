import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { ownsCandidate } from '@/lib/current-user'
import { previewBlocked, resolvePartnerAccess } from '@/lib/partners-access'
import { ACTIVE_SUBMISSION_STATUSES, WORK_AUTH_OPTIONS, SPOKEN_OPTIONS, canWorkSearch } from '@/lib/partners'
import { MIN_PITCH, qualifies, recordClaim } from '@/lib/submission-claims'

interface Draft {
  candidate_id: string
  pitch: string
  highlights: string[]
  /** How the partner knows this person, in their own words. */
  relationship: string
  /** They confirm they can introduce this person to us now. */
  can_introduce: boolean
  /** The four things every client asks on the first read. */
  work_authorization: string | null
  current_base: number | null
  target_base: number | null
  spoken_to_candidate: string | null
  /** Nobody else has introduced this person to the client another way. */
  fresh_introduction: boolean | null
}

const WORK_AUTH = new Set<string>(WORK_AUTH_OPTIONS.map(o => o.value))
const SPOKEN = new Set<string>(SPOKEN_OPTIONS.map(o => o.value))

function money(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[,$\s]/g, ''))
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null
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
        relationship: typeof o.relationship === 'string' ? o.relationship.trim() : '',
        can_introduce: o.can_introduce === true,
        work_authorization:
          typeof o.work_authorization === 'string' && WORK_AUTH.has(o.work_authorization)
            ? o.work_authorization
            : null,
        current_base: money(o.current_base),
        target_base: money(o.target_base),
        spoken_to_candidate:
          typeof o.spoken_to_candidate === 'string' && SPOKEN.has(o.spoken_to_candidate)
            ? o.spoken_to_candidate
            : null,
        fresh_introduction: typeof o.fresh_introduction === 'boolean' ? o.fresh_introduction : null,
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
  // Per search, not per client: being on the Arx FDE seat does not mean you
  // are working the RL Environments seat. A legacy company grant still counts.
  if (!canWorkSearch(access, jobId, companyId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (!role.is_live || role.job_status !== 'open') {
    return NextResponse.json(
      { error: 'This search is closed. Nothing more can be submitted to it.' },
      { status: 409 },
    )
  }

  // Ownership, resolved in one query rather than per candidate.
  const { data: candidates } = await adminClient
    .from('candidates')
    .select(
      'id, name, owner_user_id, uploaded_by_user_id, user_id, email, phone, linkedin_url, resume_blob_pathname',
    )
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

  const accepted: Draft[] = []
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
    // What makes this a submission rather than an upload: a CV, a way to reach
    // them, how you know them, and that you can introduce them now. The last one
    // is the anti-hoarding rule, and it is why a claim can be reviewed later if
    // the introduction never happens.
    const gate = qualifies(candidate, {
      relationship: draft.relationship,
      canIntroduce: draft.can_introduce,
    })
    if (!gate.ok) {
      rejected.push({ candidate_id: draft.candidate_id, reason: gate.reason })
      continue
    }
    if (remaining <= 0) {
      rejected.push({ candidate_id: draft.candidate_id, reason: 'No submission slots left on this role' })
      continue
    }
    remaining -= 1
    accepted.push({ ...draft, pitch: draft.pitch.slice(0, 4000) })
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
        work_authorization: a.work_authorization,
        current_base: a.current_base,
        target_base: a.target_base,
        spoken_to_candidate: a.spoken_to_candidate,
        fresh_introduction: a.fresh_introduction,
      })),
    )
    .select('id, candidate_id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // The claim is the contractual right the submission creates, and it is
  // deliberately written after the submission rather than inside it: a failure
  // here must not lose the partner's work. One timestamp for the batch, so two
  // candidates submitted together cannot be split by a millisecond.
  const claimedAt = new Date()
  for (const a of accepted) {
    await recordClaim(adminClient, {
      holderUserId: access.appUser.id,
      originatingUserId: access.appUser.id,
      candidateId: a.candidate_id,
      clientCompanyId: companyId,
      relationship: a.relationship,
      at: claimedAt,
    })
  }

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

  // Submitting is the clearest possible yes, so a proposal the partner never
  // pressed "I'll work this" on becomes working here rather than expiring.
  const held = access.assignmentByJob.get(jobId)
  if (held && held.status === 'proposed') {
    await adminClient
      .from('search_assignments')
      .update({
        status: 'working',
        confirmed_at: claimedAt.toISOString(),
        expires_at: null,
        updated_at: claimedAt.toISOString(),
      })
      .eq('id', held.id)
  }

  return NextResponse.json({
    submitted: inserted?.length ?? 0,
    rejected,
    slots_left: cap ? Math.max(0, remaining) : null,
    active_statuses: ACTIVE_SUBMISSION_STATUSES,
  })
}
