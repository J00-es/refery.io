/**
 * The follow-up engine, every half hour from pg_cron. See lib/desk/followups.ts.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { runFollowups } from '@/lib/desk/followups'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  return run(req)
}
export async function POST(req: NextRequest) {
  return run(req)
}

async function run(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const out = await runFollowups(createAdminClient())
    return NextResponse.json({ ok: true, ...out })
  } catch (err) {
    console.error('[desk:followups] run threw:', err)
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
