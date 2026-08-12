import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { normalizeBrief } from '@/lib/brief'
import { importBriefHtml } from '@/lib/brief-import'
import { resolvePartnerAccess } from '@/lib/partners-access'

/**
 * Creating or replacing a scout brief.
 *
 * Accepts either the HTML document a brief was authored as — parsed once, here,
 * into structured content — or the content directly, for editing what a previous
 * import produced. Whatever came in as HTML is kept in `source_html` for the
 * record and never rendered; see lib/brief-import.ts.
 *
 * A brief is scoped to the company (covering all its roles, which is how they
 * are actually written) or to a single role. One of each per scope, enforced by
 * partial unique indexes, so re-importing replaces rather than accumulates.
 */
export async function POST(req: Request) {
  const access = await resolvePartnerAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const companyId = typeof body?.company_id === 'string' ? body.company_id : null
  const jobId = typeof body?.job_id === 'string' ? body.job_id : null
  const html = typeof body?.html === 'string' ? body.html : null
  const publish = body?.publish === true

  if (!companyId) return NextResponse.json({ error: 'company_id is required' }, { status: 400 })
  if (!html && !body?.content) {
    return NextResponse.json({ error: 'Paste the brief HTML, or send content.' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  // A role-scoped brief has to belong to the company it is filed under,
  // otherwise it would surface under a client it does not describe.
  if (jobId) {
    const { data: job } = await adminClient
      .from('jobs')
      .select('id, company_id')
      .eq('id', jobId)
      .maybeSingle()
    if (!job || job.company_id !== companyId) {
      return NextResponse.json({ error: 'That role does not belong to this company.' }, { status: 400 })
    }
  }

  const parsed = html ? importBriefHtml(html) : null
  const content = normalizeBrief(parsed ? parsed.content : body.content)

  if (!content.sections.length) {
    return NextResponse.json(
      {
        error: 'Nothing could be read out of that document.',
        warnings: parsed?.warnings ?? [],
      },
      { status: 422 },
    )
  }

  const title =
    (typeof body?.title === 'string' && body.title.trim()) || content.title || 'Scout brief'
  const now = new Date().toISOString()

  // Upsert by scope. `onConflict` cannot name a partial index, so the existing
  // row is looked up explicitly — one extra read, and it lets the version
  // counter carry forward instead of resetting on every re-import.
  const scopeQuery = adminClient
    .from('partner_briefs')
    .select('id, version')
    .eq('company_id', companyId)
  const { data: current } = jobId
    ? await scopeQuery.eq('job_id', jobId).maybeSingle()
    : await scopeQuery.is('job_id', null).maybeSingle()

  const record = {
    company_id: companyId,
    job_id: jobId,
    title,
    status: publish ? 'published' : 'draft',
    content,
    source_html: html ?? null,
    published_at: publish ? now : null,
    updated_at: now,
  }

  const { data, error } = current
    ? await adminClient
        .from('partner_briefs')
        .update({ ...record, version: (current.version as number) + 1 })
        .eq('id', current.id)
        .select('id, status, version')
        .maybeSingle()
    : await adminClient
        .from('partner_briefs')
        .insert({ ...record, created_by: access.appUser.id })
        .select('id, status, version')
        .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    brief: data,
    sections: content.sections.length,
    warnings: parsed?.warnings ?? [],
  })
}
