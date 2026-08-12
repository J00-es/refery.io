import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolvePartnerAccess } from '@/lib/partners-access'
import { SUBMISSION_STATUSES, type SubmissionStatus } from '@/lib/partners'

const VALID = new Set(SUBMISSION_STATUSES.map(s => s.value))

/**
 * Moving a submission along, or a scout pulling one back.
 *
 * Two callers with different rights: an admin sets any status, and the scout who
 * submitted may only withdraw their own. A scout marking their own candidate
 * "placed" would make the payout figures fiction.
 *
 * Two side effects are deliberate, because the rest of the product already reads
 * those fields and would otherwise disagree with this page:
 *
 *   sent_to_client → a `job_candidate_pipeline` row at `hm_shared`, which is
 *                    exactly what that stage means ("profile shared with the
 *                    hiring manager"). The dashboard and the job page count it.
 *   placed         → `candidates.status = 'hired'`, which is what every
 *                    placement figure in the app is derived from.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await resolvePartnerAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  const status = body?.status as SubmissionStatus | undefined
  const note =
    typeof body?.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 2000) : null

  if (!status || !VALID.has(status)) {
    return NextResponse.json({ error: 'Unknown status' }, { status: 400 })
  }

  const adminClient = createAdminClient()
  const { data: submission } = await adminClient
    .from('role_submissions')
    .select('id, job_id, candidate_id, company_id, submitted_by_user_id, status')
    .eq('id', id)
    .maybeSingle()

  if (!submission) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isOwner = submission.submitted_by_user_id === access.appUser.id
  if (!access.canManage) {
    if (!isOwner) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (status !== 'withdrawn') {
      return NextResponse.json(
        { error: 'You can withdraw a submission, but only Refery can move it forward.' },
        { status: 403 },
      )
    }
  }

  if (submission.status === status) return NextResponse.json({ ok: true, unchanged: true })

  const now = new Date().toISOString()
  const terminal = status === 'placed' || status === 'declined' || status === 'withdrawn'
  const patch: Record<string, unknown> = {
    status,
    updated_at: now,
    decided_at: terminal ? now : null,
  }
  if (access.canManage) {
    patch.reviewed_by = access.appUser.id
    patch.reviewed_at = now
    if (note) patch.review_note = note
  }

  const { error } = await adminClient.from('role_submissions').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await adminClient.from('role_submission_events').insert({
    submission_id: id,
    from_status: submission.status,
    to_status: status,
    note,
    actor_user_id: access.appUser.id,
  })

  if (status === 'sent_to_client') {
    await adminClient.from('job_candidate_pipeline').upsert(
      {
        job_id: submission.job_id,
        candidate_id: submission.candidate_id,
        stage: 'hm_shared',
        owner_user_id: submission.submitted_by_user_id,
        added_by_user_id: access.appUser.id,
        match_reason: 'Submitted through the partner desk',
        updated_at: now,
      },
      { onConflict: 'job_id,candidate_id' },
    )
  }

  if (status === 'placed') {
    await adminClient
      .from('candidates')
      .update({ status: 'hired', updated_at: now })
      .eq('id', submission.candidate_id)
  }

  return NextResponse.json({ ok: true, status })
}
