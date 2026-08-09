import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireCandidateAccess } from '@/lib/current-user'
import { JOURNEY_STAGES, type JourneyStage } from '@/lib/journey'

const VALID = new Set<string>(JOURNEY_STAGES.map(s => s.value))

/**
 * Move a candidate along Journey A by hand.
 *
 * The panel sets an opening position; this is how a human overrides it. No
 * justification is required -- the exceptions are real and asking for a reason
 * every time would just train people to type "n/a". The move is recorded either
 * way, with who made it, which is what makes the question answerable later:
 * did the overrides outperform the rule?
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const access = await requireCandidateAccess(id)
    if (!access.ok) {
      return NextResponse.json({ error: access.message }, { status: access.status })
    }
    const { appUser } = access

    const { stage, note } = (await request.json()) as { stage?: string; note?: string }

    if (!stage || !VALID.has(stage)) {
      return NextResponse.json({ error: 'Unknown stage' }, { status: 400 })
    }

    // post_committee_not_fit asserts that we met the person and decided against
    // them. That is a judgement about a conversation the scout who referred them
    // was not part of, so it stays with the people who hold the committee call.
    if (stage === 'post_committee_not_fit' && !appUser.isAdmin) {
      return NextResponse.json(
        { error: 'Only the talent committee can record a decision made on a call' },
        { status: 403 }
      )
    }

    const admin = createAdminClient()

    const { data: before, error: readErr } = await admin
      .from('candidates')
      .select('journey_stage')
      .eq('id', id)
      .single()

    if (readErr || !before) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })
    }
    if (before.journey_stage === stage) {
      return NextResponse.json({ success: true, unchanged: true })
    }

    const now = new Date().toISOString()
    const { error } = await admin
      .from('candidates')
      .update({
        journey_stage: stage as JourneyStage,
        journey_stage_at: now,
        journey_stage_source: 'human',
        updated_at: now,
      })
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Best-effort: the move is the thing that mattered, and losing the log entry
    // should not fail the request the user actually made.
    await admin.from('candidate_activity_log').insert({
      candidate_id: id,
      activity_type: 'journey_stage_changed',
      description:
        note?.trim() ||
        `Moved by ${appUser.fullName || appUser.email} from ${before.journey_stage} to ${stage}.`,
      source: 'human',
      confidence: 1,
      from_state: before.journey_stage,
      to_state: stage,
      performed_by: appUser.id,
    })

    return NextResponse.json({ success: true, stage })
  } catch (err) {
    console.error('Error updating journey stage:', err)
    return NextResponse.json({ error: 'Failed to update the stage' }, { status: 500 })
  }
}
