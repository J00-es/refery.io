import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'
import { linkedinKey } from '@/lib/onboarding/identity'
import { normalizeEmail } from '@/lib/current-user'

export const dynamic = 'force-dynamic'

/**
 * Outbound campaigns: one universal link per audience, for the mass LinkedIn
 * DMs Marj sends. Creating one also approves the anonymised preview on the
 * search it points at, because the same words are what the page shows.
 */
export async function GET() {
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status })
  const admin = createAdminClient()

  const [{ data: campaigns }, { data: roles }] = await Promise.all([
    admin.from('outbound_campaigns').select('*').order('created_at', { ascending: false }),
    admin
      .from('partner_roles_v')
      .select('job_id, title, headline, company_name, location, priority, search_stage, is_live, job_status')
      .eq('is_live', true)
      .eq('job_status', 'open'),
  ])
  const ids = (campaigns ?? []).map(c => c.id)
  const [{ data: audience }, { data: apps }] = ids.length
    ? await Promise.all([
        admin.from('campaign_audience').select('campaign_id, matched_application_id').in('campaign_id', ids),
        admin.from('scout_applications').select('source_campaign, status').in('source_campaign', (campaigns ?? []).map(c => c.slug)),
      ])
    : [{ data: [] }, { data: [] }]
  const { data: previews } = await admin.from('partner_roles').select('job_id, preview_summary, preview_approved')

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
  return NextResponse.json({ campaigns: rows, roles: roles ?? [], previews: previews ?? [] })
}

export async function POST(req: Request) {
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status })
  const body = await req.json().catch(() => ({}))

  const slug = String(body.slug ?? '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '')
  const name = String(body.name ?? '').trim()
  const jobId = String(body.job_id ?? '').trim()
  const summary = String(body.summary ?? '').trim()
  const senderName = String(body.sender_name ?? 'Marj').trim() || 'Marj'
  const channel = ['linkedin', 'email', 'other'].includes(body.channel) ? body.channel : 'linkedin'
  if (!slug || !name || !jobId || summary.length < 40) {
    return NextResponse.json({ error: 'A slug, a name, a search, and a summary of at least a sentence.' }, { status: 400 })
  }
  // The rule for what a preview may say lives with the person writing it; the
  // one check the server can make is that nothing in it names the client.
  const admin = createAdminClient()
  const { data: role } = await admin.from('partner_roles_v').select('job_id, company_name, is_live, job_status').eq('job_id', jobId).maybeSingle()
  if (!role || !role.is_live || role.job_status !== 'open') return NextResponse.json({ error: 'That search is not live.' }, { status: 400 })
  if (role.company_name && summary.toLowerCase().includes(String(role.company_name).toLowerCase())) {
    return NextResponse.json({ error: `The summary names the client (${role.company_name}). Take that out.` }, { status: 400 })
  }

  const { data: campaign, error } = await admin
    .from('outbound_campaigns')
    .insert({ slug, name, job_id: jobId, summary, sender_name: senderName, channel, created_by: gate.userId, active_to: body.active_to || null })
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.code === '23505' ? 'That slug is taken.' : error.message }, { status: 400 })

  await admin.from('partner_roles').update({ preview_summary: summary, preview_approved: true }).eq('job_id', jobId)

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
