/**
 * Posts the intake backlog as batch cards: scout applications to the scout
 * channel, hiring leads to the leads channel. Run by hand or on a schedule;
 * rows already on an open card are never listed twice, so running it twice
 * is safe. `?kind=scouts|leads` limits it to one side.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { postScoutBacklog } from '@/lib/backlog/scouts'
import { postLeadBacklog } from '@/lib/backlog/leads'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

async function run(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const kind = req.nextUrl.searchParams.get('kind')
  const limit = Number(req.nextUrl.searchParams.get('limit') ?? '60')
  const admin = createAdminClient()
  const out: Record<string, unknown> = {}
  const scouts = process.env.SLACK_CHANNEL_SCOUT_APPS
  const leads = process.env.SLACK_CHANNEL_HIRING_LEADS
  if (kind !== 'leads') out.scouts = scouts ? await postScoutBacklog(admin, scouts, limit) : { error: 'SLACK_CHANNEL_SCOUT_APPS unset' }
  if (kind !== 'scouts') out.leads = leads ? await postLeadBacklog(admin, leads) : { error: 'SLACK_CHANNEL_HIRING_LEADS unset' }
  return NextResponse.json({ ok: true, ...out })
}

export async function GET(req: NextRequest) {
  return run(req)
}
export async function POST(req: NextRequest) {
  return run(req)
}
