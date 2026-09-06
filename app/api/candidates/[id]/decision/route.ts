import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getAppUser } from '@/lib/current-user'
import { applyDecision, type Decision } from '@/lib/desk/decide'
import { postThreadReply } from '@/lib/slack-bot'

const DECISIONS = new Set<Decision>(['intro_now', 'bench', 'not_fit', 'manual', 'snooze', 'route_elsewhere'])

/**
 * The same decision the Slack card takes, from the profile page. Super admin
 * only: it sends email over Lily's name. The Slack thread is told so the two
 * surfaces never disagree about what happened.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const appUser = await getAppUser()
  if (!appUser?.isSuperAdmin) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = (await request.json().catch(() => ({}))) as { decision?: string; reason?: string; body?: string; job_ids?: string[] }
  const decision = body.decision as Decision
  if (!DECISIONS.has(decision)) return NextResponse.json({ error: 'Unknown decision' }, { status: 400 })

  const admin = createAdminClient()
  const r = await applyDecision(admin, {
    candidateId: id,
    decision,
    by: appUser.email,
    via: 'web',
    reasonLine: body.reason ?? null,
    bodyOverride: body.body ?? null,
    jobIds: Array.isArray(body.job_ids) ? body.job_ids : undefined,
  })

  const { data: c } = await admin.from('candidates').select('desk_card_channel, desk_card_ts').eq('id', id).maybeSingle()
  if (c?.desk_card_channel && c.desk_card_ts) {
    await postThreadReply(c.desk_card_channel as string, c.desk_card_ts as string, `${r.ok ? ':white_check_mark:' : ':warning:'} From the profile page: ${r.message}`)
  }
  return NextResponse.json(r, { status: r.ok ? 200 : 409 })
}
