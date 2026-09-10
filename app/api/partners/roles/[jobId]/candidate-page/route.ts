import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolvePartnerAccess } from '@/lib/partners-access'
import { candidatePageUrl, draftCandidatePage, rotateCandidatePage, updateCandidatePage, type InterviewStep, type PageEdit } from '@/lib/candidate-pages'

/**
 * Lily's controls over a search's candidate page. Admin only. GET reads the
 * page with the original JD beside it; PATCH edits (live at once); POST is
 * one of: redraft, rotate, paste_original.
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 180

async function gate() {
  const access = await resolvePartnerAccess()
  if (!access) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!access.canUseDesk || !access.canManage) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  return { access }
}

export async function GET(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const g = await gate()
  if ('error' in g) return g.error
  const { jobId } = await params
  const admin = createAdminClient()
  const [{ data: page }, { data: job }] = await Promise.all([
    admin.from('candidate_pages').select('*').eq('job_id', jobId).maybeSingle(),
    admin.from('jobs').select('description_original, description_source, job_post_url').eq('id', jobId).maybeSingle(),
  ])
  return NextResponse.json({ page: page ?? null, url: page ? candidatePageUrl(page.slug as string) : null, original: job?.description_original ?? null, originalSource: job?.description_source ?? null, jobPostUrl: job?.job_post_url ?? null })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const g = await gate()
  if ('error' in g) return g.error
  const { jobId } = await params
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  const lines = (v: unknown): string[] | undefined => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : typeof v === 'string' ? v.split('\n') : undefined)
  const edit: PageEdit = {}
  if (typeof body.headline === 'string') edit.headline = body.headline
  if ('company_line' in body) edit.company_line = typeof body.company_line === 'string' ? body.company_line : null
  if ('company_blurb' in body) edit.company_blurb = typeof body.company_blurb === 'string' ? body.company_blurb : null
  if (typeof body.jd_text === 'string') edit.jd_text = body.jd_text
  const req_ = lines(body.requirements)
  if (req_) edit.requirements = req_
  const gtk = lines(body.good_to_know)
  if (gtk) edit.good_to_know = gtk
  if (Array.isArray(body.interview_steps)) {
    edit.interview_steps = (body.interview_steps as unknown[]).flatMap(s => {
      if (!s || typeof s !== 'object') return []
      const o = s as { title?: unknown; detail?: unknown }
      return typeof o.title === 'string' && o.title.trim() ? [{ title: o.title, detail: typeof o.detail === 'string' ? o.detail : null } as InterviewStep] : []
    })
  }
  if (typeof body.show_salary === 'boolean') edit.show_salary = body.show_salary
  if (typeof body.show_equity === 'boolean') edit.show_equity = body.show_equity
  if (body.status === 'published' || body.status === 'draft') edit.status = body.status
  const admin = createAdminClient()
  const page = await updateCandidatePage(admin, jobId, edit)
  if (!page) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ page, url: candidatePageUrl(page.slug) })
}

export async function POST(req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const g = await gate()
  if ('error' in g) return g.error
  const { jobId } = await params
  const body = (await req.json().catch(() => null)) as { action?: string; text?: string } | null
  const admin = createAdminClient()
  const by = g.access.appUser.email
  if (body?.action === 'paste_original') {
    const text = (body.text ?? '').trim()
    if (text.length < 80) return NextResponse.json({ error: 'Paste the whole posting.' }, { status: 400 })
    await admin.from('jobs').update({ description_original: text.slice(0, 40_000), description_source: 'pasted' }).eq('id', jobId)
    const r = await draftCandidatePage(admin, jobId, { by, force: true })
    return NextResponse.json({ page: r?.page ?? null, url: r ? candidatePageUrl(r.page.slug) : null })
  }
  if (body?.action === 'redraft') {
    const r = await draftCandidatePage(admin, jobId, { by, force: true })
    if (!r) return NextResponse.json({ error: 'No search behind this id' }, { status: 404 })
    return NextResponse.json({ page: r.page, url: candidatePageUrl(r.page.slug) })
  }
  if (body?.action === 'create') {
    const r = await draftCandidatePage(admin, jobId, { by })
    if (!r) return NextResponse.json({ error: 'No search behind this id' }, { status: 404 })
    return NextResponse.json({ page: r.page, url: candidatePageUrl(r.page.slug) })
  }
  if (body?.action === 'rotate') {
    const slug = await rotateCandidatePage(admin, jobId)
    return NextResponse.json({ slug, url: candidatePageUrl(slug) })
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
