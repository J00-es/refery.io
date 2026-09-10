import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { recordPageEvent } from '@/lib/candidate-pages'

/** One view per session per page. Anything malformed is dropped silently. */
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!/^[23456789abcdefghjkmnpqrstuvwxyz]{7}$/.test(slug)) return NextResponse.json({ ok: false }, { status: 404 })
  const body = (await request.json().catch(() => null)) as { kind?: string; via?: string | null; session?: string | null } | null
  if (!body || body.kind !== 'view') return NextResponse.json({ ok: false }, { status: 400 })
  const admin = createAdminClient()
  const { data: page } = await admin.from('candidate_pages').select('job_id, status').eq('slug', slug).maybeSingle()
  if (!page || page.status !== 'published') return NextResponse.json({ ok: false }, { status: 404 })
  const via = typeof body.via === 'string' ? body.via.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30) || null : null
  const session = typeof body.session === 'string' ? body.session.replace(/[^a-z0-9]/gi, '').slice(0, 24) || null : null
  await recordPageEvent(admin, { jobId: page.job_id as string, slug, via, kind: 'view', sessionId: session, headers: request.headers }).catch(() => undefined)
  return NextResponse.json({ ok: true })
}
