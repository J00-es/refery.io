import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { candidateOwnershipFilter, getAppUser } from '@/lib/current-user'

/**
 * The review queue. Drafts are written by the nightly and never sent on their
 * own — this lists what is waiting, scoped to candidates the viewer can see.
 */
export async function GET(request: NextRequest) {
  try {
    const appUser = await getAppUser()
    if (!appUser?.isActive) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const status = request.nextUrl.searchParams.get('status') || 'draft'
    const adminClient = createAdminClient()

    // Scope by candidate ownership, the same rule as the candidates page. The
    // service-role client bypasses RLS, so the filter has to be explicit.
    let visibleIds: string[] | null = null
    if (!appUser.canViewAllCandidates) {
      const { data } = await adminClient
        .from('candidates')
        .select('id')
        .or(candidateOwnershipFilter(appUser.id))
      visibleIds = (data ?? []).map(c => c.id)
      if (!visibleIds.length) return NextResponse.json({ drafts: [] })
    }

    let query = adminClient
      .from('brief_email_drafts')
      .select('id, candidate_id, recipient_email, recipient_name, subject, grade, status, created_at, sent_at, send_error')
      .eq('status', status)
      .order('created_at', { ascending: false })
      .limit(100)

    if (visibleIds) query = query.in('candidate_id', visibleIds)

    const { data: drafts, error } = await query
    if (error) throw error

    // Attach candidate names in one round trip rather than an embed, which
    // PostgREST types awkwardly here.
    const ids = [...new Set((drafts ?? []).map(d => d.candidate_id))]
    const names = new Map<string, string>()
    if (ids.length) {
      const { data: cands } = await adminClient.from('candidates').select('id, name').in('id', ids)
      for (const c of cands ?? []) names.set(c.id as string, c.name as string)
    }

    return NextResponse.json({
      drafts: (drafts ?? []).map(d => ({ ...d, candidate_name: names.get(d.candidate_id) ?? 'Unknown' })),
    })
  } catch (error) {
    console.error('Error listing brief drafts:', error)
    return NextResponse.json({ error: 'Failed to list drafts' }, { status: 500 })
  }
}
