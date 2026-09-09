import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireCandidateAccess } from '@/lib/current-user'
import { recordHumanDecision } from '@/lib/engine/decisions'

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
    const { type, verdict } = await request.json()

    // Validate verdict type
    if (!['recruiter', 'lily'].includes(type)) {
      return NextResponse.json({ error: 'Invalid verdict type' }, { status: 400 })
    }

    // Validate verdict value
    const validVerdicts = ['very_strong', 'strong', 'moderate', 'weak', 'pass', null]
    if (!validVerdicts.includes(verdict)) {
      return NextResponse.json({ error: 'Invalid verdict value' }, { status: 400 })
    }

    // Check permissions - lily verdict can only be set by super admin
    if (type === 'lily' && !appUser.isSuperAdmin) {
      return NextResponse.json(
        { error: 'Only super admin can set Lily verdict' },
        { status: 403 }
      )
    }

    if (
      type === 'recruiter' &&
      !['super_admin', 'admin', 'recruiter', 'scout'].includes(appUser.role)
    ) {
      return NextResponse.json(
        { error: 'You do not have permission to set recruiter verdict' },
        { status: 403 }
      )
    }

    // Update the appropriate verdict field
    const updateField = type === 'lily' ? 'lily_verdict' : 'recruiter_verdict'

    const { data, error } = await createAdminClient()
      .from('candidates')
      .update({
        [updateField]: verdict,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // The attributable record: who set it, when, from where. The legacy
    // column keeps the chip; this row is what calibration may read.
    if (type === 'lily' && verdict) {
      const now = new Date().toISOString()
      await recordHumanDecision(createAdminClient(), {
        candidateId: id,
        kind: 'capability',
        value: verdict,
        actor: appUser.email ?? appUser.id ?? 'super_admin',
        sourceEvent: 'web.verdict_chip',
        sourceRef: { user_id: appUser.id ?? null },
        decidedAt: now,
        dedupeKey: `web.verdict_chip:${id}:${now}`,
      })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error updating verdict:', error)
    return NextResponse.json({ error: 'Failed to update verdict' }, { status: 500 })
  }
}
