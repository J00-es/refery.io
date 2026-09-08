/** One onboarding run, for the page that started it to poll. Super admin only. */

import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireSuperAdmin } from '@/lib/admin-auth'
import { briefUrl } from '@/lib/hm-brief'

export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status })
  const { id } = await ctx.params
  const db = createAdminClient()
  const { data: run } = await db
    .from('onboarding_runs')
    .select('id, status, error, cost_usd, model, company_id, hm_brief_id, slack_channel_name, research, copy, sources, created_at, updated_at, published_at')
    .eq('id', id)
    .maybeSingle()
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let briefSlug: string | null = null
  if (run.hm_brief_id) {
    const { data: hm } = await db.from('hm_briefs').select('slug').eq('id', run.hm_brief_id).maybeSingle()
    briefSlug = (hm?.slug as string | null) ?? null
  }
  const copy = run.copy as { roles?: { headline: string; comp: string }[] } | null
  const research = run.research as { unknowns?: string[]; conflicts?: string[]; company?: { name?: string } } | null
  return NextResponse.json(
    {
      id: run.id,
      status: run.status,
      error: run.error,
      costUsd: Number(run.cost_usd ?? 0),
      model: run.model,
      companyId: run.company_id,
      companyName: research?.company?.name ?? null,
      clientUrl: run.company_id ? `/searches/${run.company_id}` : null,
      briefUrl: briefSlug ? briefUrl(briefSlug) : null,
      slackChannel: run.slack_channel_name,
      roles: copy?.roles?.map(r => ({ headline: r.headline, comp: r.comp })) ?? [],
      unknowns: research?.unknowns ?? [],
      conflicts: research?.conflicts ?? [],
      sources: Array.isArray(run.sources) ? (run.sources as { ok?: boolean }[]).filter(s => s.ok !== false).length : 0,
      createdAt: run.created_at,
      updatedAt: run.updated_at,
      publishedAt: run.published_at,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
