import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'
import { linkedinKey } from '@/lib/onboarding/identity'
import { normalizeEmail } from '@/lib/current-user'
import { featuredSearches, namesClient, outreachFunction, anonymisedTitle } from '@/lib/outreach/featured'

export const dynamic = 'force-dynamic'

/**
 * Outbound links: one universal link per audience, for the mass LinkedIn DMs
 * Marj sends and for cold email.
 *
 * A general link shows the two most urgent live searches (one engineering,
 * one GTM), chosen by rule when the page renders, so the same link serves
 * every outreach. A search link shows one search, and creating it also
 * approves the anonymised preview on that search, because the same words are
 * what the page shows.
 */
export async function GET() {
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status })
  const admin = createAdminClient()

  const [{ data: campaigns }, { data: roles }, { data: previews }, featured] = await Promise.all([
    admin.from('outbound_campaigns').select('*').order('created_at', { ascending: false }),
    admin
      .from('partner_roles_v')
      .select('job_id, title, headline, company_name, department, location, priority, search_stage, live_submission_count, is_live, job_status')
      .eq('is_live', true)
      .eq('job_status', 'open'),
    admin.from('partner_roles').select('job_id, preview_summary, preview_approved, outreach_pinned_at'),
    featuredSearches(admin),
  ])
  const ids = (campaigns ?? []).map(c => c.id)
  const [{ data: audience }, { data: apps }] = ids.length
    ? await Promise.all([
        admin.from('campaign_audience').select('campaign_id, matched_application_id').in('campaign_id', ids),
        admin.from('scout_applications').select('source_campaign, status').in('source_campaign', (campaigns ?? []).map(c => c.slug)),
      ])
    : [{ data: [] }, { data: [] }]

  const rows = (campaigns ?? []).map(c => {
    const aud = (audience ?? []).filter(a => a.campaign_id === c.id)
    const mine = (apps ?? []).filter(a => a.source_campaign === c.slug)
    return {
      ...c,
      audience: aud.length,
      matched: aud.filter(a => a.matched_application_id).length,
      unmatched: mine.filter(a => a.status === 'new' || a.status === 'clarification').length,
      joined: mine.filter(a => a.status === 'onboarded').length,
      link: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://refery.xyz'}/go/${c.slug}`,
    }
  })
  const previewByJob = new Map((previews ?? []).map(p => [p.job_id as string, p]))
  const searches = (roles ?? []).map(r => {
    const p = previewByJob.get(r.job_id)
    return {
      ...r,
      fn: outreachFunction(r),
      public_title: anonymisedTitle(r),
      preview_summary: (p?.preview_summary as string | null) ?? null,
      preview_approved: Boolean(p?.preview_approved),
      pinned: Boolean(p?.outreach_pinned_at),
      featured: featured.engineering?.jobId === r.job_id ? 'engineering' : featured.gtm?.jobId === r.job_id ? 'gtm' : null,
    }
  })
  return NextResponse.json({
    campaigns: rows,
    roles: searches,
    featured: {
      engineering: featured.engineering && { jobId: featured.engineering.jobId, title: featured.engineering.title, facts: featured.engineering.facts, summary: featured.engineering.summary, companyName: featured.engineering.companyName },
      gtm: featured.gtm && { jobId: featured.gtm.jobId, title: featured.gtm.title, facts: featured.gtm.facts, summary: featured.gtm.summary, companyName: featured.gtm.companyName },
    },
  })
}

export async function POST(req: Request) {
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status })
  const body = await req.json().catch(() => ({}))

  const slug = String(body.slug ?? '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '')
  const name = String(body.name ?? '').trim()
  const kind = body.kind === 'search' ? 'search' : 'general'
  const jobId = kind === 'search' ? String(body.job_id ?? '').trim() : null
  const summary = String(body.summary ?? '').trim()
  const senderName = String(body.sender_name ?? 'Lily').trim() || 'Lily'
  const channel = ['linkedin', 'email', 'other'].includes(body.channel) ? body.channel : 'linkedin'
  if (!slug || !name) return NextResponse.json({ error: 'A slug and a name.' }, { status: 400 })
  if (kind === 'search' && (!jobId || summary.length < 40)) {
    return NextResponse.json({ error: 'A search link needs the search and a summary of at least a sentence.' }, { status: 400 })
  }

  const admin = createAdminClient()
  if (kind === 'search' && jobId) {
    // The rule for what a preview may say lives with the person writing it; the
    // one check the server can make is that nothing in it names the client.
    const { data: role } = await admin.from('partner_roles_v').select('job_id, company_name, is_live, job_status').eq('job_id', jobId).maybeSingle()
    if (!role || !role.is_live || role.job_status !== 'open') return NextResponse.json({ error: 'That search is not live.' }, { status: 400 })
    const hit = namesClient(summary, role.company_name)
    if (hit) return NextResponse.json({ error: `The summary names the client ("${hit}"). Take that out.` }, { status: 400 })
  }

  const { data: campaign, error } = await admin
    .from('outbound_campaigns')
    .insert({ slug, name, kind, job_id: jobId, summary, sender_name: senderName, channel, created_by: gate.userId, active_to: body.active_to || null })
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.code === '23505' ? 'That slug is taken.' : error.message }, { status: 400 })

  if (kind === 'search' && jobId) {
    await admin.from('partner_roles').update({ preview_summary: summary, preview_approved: true }).eq('job_id', jobId)
  }

  const added = await addAudience(admin, campaign.id as string, String(body.audience ?? ''))
  return NextResponse.json({ ok: true, campaign, audienceAdded: added })
}

/** Append people to a campaign's audience. One per line: name, LinkedIn URL, optional email. */
export async function PUT(req: Request) {
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status })
  const body = await req.json().catch(() => ({}))
  const admin = createAdminClient()
  const { data: campaign } = await admin.from('outbound_campaigns').select('id').eq('slug', String(body.slug ?? '')).maybeSingle()
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const added = await addAudience(admin, campaign.id as string, String(body.audience ?? ''))
  return NextResponse.json({ ok: true, audienceAdded: added })
}

/**
 * The anonymised preview on one search: save the words, approve or withdraw
 * them, pin the search to the general link for its function. Approving is what
 * lets the general link and the recruiter email (C) show the summary; the
 * title and facts show regardless, because they cannot name the client.
 */
export async function PATCH(req: Request) {
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status })
  const body = await req.json().catch(() => ({}))
  const jobId = String(body.job_id ?? '').trim()
  if (!jobId) return NextResponse.json({ error: 'Which search?' }, { status: 400 })
  const admin = createAdminClient()
  const { data: role } = await admin.from('partner_roles_v').select('job_id, company_name').eq('job_id', jobId).maybeSingle()
  if (!role) return NextResponse.json({ error: 'That search does not exist.' }, { status: 404 })

  const patch: Record<string, unknown> = {}
  if (typeof body.summary === 'string') {
    const summary = body.summary.trim()
    const hit = namesClient(summary, role.company_name)
    if (hit) return NextResponse.json({ error: `The summary names the client ("${hit}"). Take that out.` }, { status: 400 })
    patch.preview_summary = summary || null
    if (!summary) patch.preview_approved = false
  }
  if (typeof body.approved === 'boolean') {
    if (body.approved) {
      const { data: cur } = await admin.from('partner_roles').select('preview_summary').eq('job_id', jobId).maybeSingle()
      const words = (patch.preview_summary as string | null | undefined) ?? (cur?.preview_summary as string | null)
      if (!words || words.length < 40) return NextResponse.json({ error: 'Write the summary before approving it.' }, { status: 400 })
    }
    patch.preview_approved = body.approved
  }
  if (typeof body.pinned === 'boolean') {
    if (body.pinned) {
      // One pin per function: pinning this search unpins its sibling.
      const { data: live } = await admin.from('partner_roles_v').select('job_id, title, headline, department').eq('is_live', true).eq('job_status', 'open')
      const me = (live ?? []).find(r => r.job_id === jobId)
      const myFn = me ? outreachFunction(me) : null
      const siblings = (live ?? []).filter(r => r.job_id !== jobId && outreachFunction(r) === myFn).map(r => r.job_id)
      if (siblings.length) await admin.from('partner_roles').update({ outreach_pinned_at: null }).in('job_id', siblings)
    }
    patch.outreach_pinned_at = body.pinned ? new Date().toISOString() : null
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 })
  const { error } = await admin.from('partner_roles').update(patch).eq('job_id', jobId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

async function addAudience(admin: ReturnType<typeof createAdminClient>, campaignId: string, raw: string): Promise<number> {
  const rows = raw
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const parts = line.split(/[,\t]/).map(p => p.trim())
      const url = parts.find(p => /linkedin\.com\/in\//i.test(p)) ?? null
      const email = parts.find(p => p.includes('@')) ?? null
      const name = parts.find(p => p !== url && p !== email) ?? null
      const key = linkedinKey(url)
      if (!key && !email) return null
      return { campaign_id: campaignId, full_name: name, linkedin_url: url, linkedin_key: key ?? `email:${normalizeEmail(email)}`, email: email ? normalizeEmail(email) : null }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
  if (!rows.length) return 0
  const { data } = await admin.from('campaign_audience').upsert(rows, { onConflict: 'campaign_id,linkedin_key', ignoreDuplicates: true }).select('id')
  return data?.length ?? 0
}
