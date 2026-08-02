import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireCandidateAccess } from '@/lib/current-user'

/**
 * Open roles ranked by embedding similarity to this candidate, excluding any
 * already in their pipeline. Read-only — proposing a role is not the same as
 * putting the candidate in front of it, so nothing is written until someone
 * accepts a suggestion.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    const access = await requireCandidateAccess(id)
    if (!access.ok) {
      return NextResponse.json({ error: access.message }, { status: access.status })
    }

    const limit = Math.min(
      20,
      Math.max(1, parseInt(request.nextUrl.searchParams.get('limit') || '6', 10) || 6),
    )

    const { data, error } = await createAdminClient().rpc('suggested_jobs_for_candidate', {
      p_candidate_id: id,
      p_limit: limit,
    })

    if (error) throw error

    return NextResponse.json({ suggestions: data ?? [] })
  } catch (error) {
    console.error('Error fetching suggested jobs:', error)
    return NextResponse.json({ error: 'Failed to fetch suggestions' }, { status: 500 })
  }
}
