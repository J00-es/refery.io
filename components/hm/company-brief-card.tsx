/**
 * The hiring-manager brief, as it appears on a company page.
 *
 * Two questions get answered here and nothing else: what is the link, and what
 * has happened on it. The reading trail is summarised rather than listed — the
 * useful line is "opened three times, stopped at The bar", not forty rows of
 * scroll beats.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { createAdminClient } from '@/lib/supabase/server'
import { briefUrl, describeDuration, describePlace } from '@/lib/hm-brief'
import { BriefLinkControls, CreateBriefButton } from './brief-link-controls'

function when(iso: string | null): string {
  if (!iso) return 'never'
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`
  const days = Math.round(mins / (60 * 24))
  return days === 1 ? 'yesterday' : `${days}d ago`
}

export async function CompanyBriefCard({
  companyId,
  companyName,
}: {
  companyId: string
  companyName: string
}) {
  const db = createAdminClient()

  const { data: brief } = await db
    .from('hm_briefs')
    .select('id, slug, title, status, published_at, updated_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!brief) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Hiring manager brief</CardTitle>
          <CardDescription>
            A public link {companyName} can open without an account. The brief as you would send
            it, with a box under every section for corrections.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateBriefButton companyId={companyId} />
        </CardContent>
      </Card>
    )
  }

  const [{ data: events }, { data: comments }] = await Promise.all([
    db
      .from('hm_brief_events')
      .select('kind, furthest_label, scroll_pct, dwell_ms, created_at, city, region, country')
      .eq('brief_id', brief.id)
      .order('created_at', { ascending: false })
      .limit(400),
    db
      .from('hm_brief_comments')
      .select('id, section_label, prompt, author_name, body, created_at')
      .eq('brief_id', brief.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const views = (events ?? []).filter(e => e.kind === 'view')
  const closes = (events ?? []).filter(e => e.kind === 'close')
  const lastView = views[0] ?? null
  const lastRead = closes[0] ?? null

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              Hiring manager brief
              <Badge variant={brief.status === 'published' ? 'default' : 'secondary'}>
                {brief.status === 'published' ? 'Live' : brief.status}
              </Badge>
            </CardTitle>
            <CardDescription>
              {brief.status === 'published'
                ? 'Anyone with this link can read it and write back. No login.'
                : 'Not reachable yet. Publish it to hand the link over.'}
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <BriefLinkControls briefId={brief.id} url={briefUrl(brief.slug)} status={brief.status} />

        <div className="grid gap-3 border-t pt-4 sm:grid-cols-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Opens
            </p>
            <p className="mt-0.5 text-[15px] font-medium">
              {views.length}
              {lastView && (
                <span className="ml-1.5 text-[13px] font-normal text-muted-foreground">
                  last {when(lastView.created_at)}
                </span>
              )}
            </p>
            {lastView && (
              <p className="mt-0.5 text-[12.5px] text-muted-foreground">{describePlace(lastView)}</p>
            )}
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Read to
            </p>
            <p className="mt-0.5 text-[15px] font-medium">{lastRead?.furthest_label ?? 'Not yet'}</p>
            {lastRead && (
              <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                {lastRead.scroll_pct != null ? `${lastRead.scroll_pct}% · ` : ''}
                {describeDuration(lastRead.dwell_ms)}
              </p>
            )}
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Comments
            </p>
            <p className="mt-0.5 text-[15px] font-medium">{comments?.length ?? 0}</p>
          </div>
        </div>

        {!!comments?.length && (
          <div className="space-y-2 border-t pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Latest back from them
            </p>
            {comments.map(c => (
              <div key={c.id} className="rounded-md border bg-muted/30 px-3 py-2">
                <p className="text-[12.5px] text-muted-foreground">
                  {c.author_name?.trim() || 'Anonymous'} · {c.prompt ?? c.section_label ?? 'General'} ·{' '}
                  {when(c.created_at)}
                </p>
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[13.5px]">{c.body}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
