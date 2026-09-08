/**
 * Daily: hiring leads in conversation get their day-4 and day-9 follow-ups,
 * and any reply on record stops them. See lib/lead-followups.ts.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { runLeadFollowups } from '@/lib/lead-followups'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

async function run(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const out = await runLeadFollowups(createAdminClient())
  if (out.sent || out.replied || out.errors.length) console.log('[lead-followups]', JSON.stringify(out))
  return NextResponse.json({ ok: true, ...out })
}

export async function GET(req: NextRequest) {
  return run(req)
}
export async function POST(req: NextRequest) {
  return run(req)
}
