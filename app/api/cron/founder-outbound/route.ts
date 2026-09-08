/**
 * Founder outreach. `?mode=batch` (Mondays) posts the week's card;
 * `?mode=followups` (daily) reads replies and sends the next touch.
 * See lib/founder-outbound.ts.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { postFounderBatch, runFounderFollowups } from '@/lib/founder-outbound'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

async function run(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const channel = process.env.SLACK_CHANNEL_HIRING_LEADS
  if (!channel) return NextResponse.json({ error: 'SLACK_CHANNEL_HIRING_LEADS unset' }, { status: 500 })
  const admin = createAdminClient()
  const mode = req.nextUrl.searchParams.get('mode') ?? 'followups'
  const out = mode === 'batch' ? await postFounderBatch(admin, channel) : await runFounderFollowups(admin, channel)
  console.log(`[founder-outbound:${mode}]`, JSON.stringify(out))
  return NextResponse.json({ ok: true, mode, ...out })
}

export async function GET(req: NextRequest) {
  return run(req)
}
export async function POST(req: NextRequest) {
  return run(req)
}
