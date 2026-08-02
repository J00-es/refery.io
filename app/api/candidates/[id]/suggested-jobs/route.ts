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

    // Same ranking the nightly matcher uses, so what a reviewer sees here and
    // what lands in the pipeline overnight agree. since=2000-01-01 asks for
    // all open roles rather than only those posted since the last match.
    const { data, error } = await createAdminClient().rpc('match_new_jobs_for_candidate', {
      candidate_uuid: id,
      since_timestamp: '2000-01-01T00:00:00Z',
      similarity_threshold: 0.55,
      max_per_company: 1,
    })

    if (error) throw error

    type Match = {
      job_id: string
      title: string
      company_name: string | null
      location: string | null
      similarity: number
      match_score: number | string | null
      job_function: string | null
    }

    // The RPC returns every qualifying role ordered by score; the card only
    // needs the top few.
    const suggestions = ((data ?? []) as Match[]).slice(0, limit).map(m => ({
      ...m,
      match_score: m.match_score == null ? null : Number(m.match_score),
    }))

    return NextResponse.json({ suggestions })
  } catch (error) {
    console.error('Error fetching suggested jobs:', error)
    return NextResponse.json({ error: 'Failed to fetch suggestions' }, { status: 500 })
  }
}
