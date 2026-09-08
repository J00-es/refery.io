/**
 * The candidate's CV for the founder, behind the brief slug.
 *
 * Only a submission delivered to this brief's company resolves, so a slug
 * reaches exactly the CVs that were sent to that client and nothing else.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { get } from '@vercel/blob'
import { createAdminClient } from '@/lib/supabase/server'
import { findPublishedBrief } from '@/lib/hm-brief'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest, ctx: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await ctx.params
  const brief = await findPublishedBrief(slug)
  if (!brief) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const db = createAdminClient()
  const { data: briefRow } = await db.from('hm_briefs').select('company_id').eq('id', brief.id).single()
  const { data: s } = await db
    .from('role_submissions')
    .select('candidate_id, company_id, client_delivered_at')
    .eq('id', id)
    .maybeSingle()
  if (!s || !briefRow || s.company_id !== briefRow.company_id || !s.client_delivered_at) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data: c } = await db.from('candidates').select('resume_blob_pathname, resume_filename, name').eq('id', s.candidate_id).maybeSingle()
  const pathname = c?.resume_blob_pathname as string | null
  if (!pathname) return NextResponse.json({ error: 'No CV on file' }, { status: 404 })

  try {
    const result = await get(pathname, { access: 'private', ifNoneMatch: request.headers.get('if-none-match') ?? undefined })
    if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (result.statusCode === 304) return new NextResponse(null, { status: 304 })
    const filename = (c?.resume_filename as string | null) || `${(c?.name as string | null) ?? 'candidate'}.pdf`
    return new NextResponse(result.stream, {
      headers: {
        'Content-Type': result.blob.contentType ?? 'application/pdf',
        'Content-Disposition': `inline; filename="${filename.replace(/"/g, '')}"`,
        'Cache-Control': 'private, no-store',
        ETag: result.blob.etag,
      },
    })
  } catch (err) {
    console.error('[hm-brief] cv fetch failed:', err)
    return NextResponse.json({ error: 'Could not load the CV' }, { status: 500 })
  }
}
