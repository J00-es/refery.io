/**
 * The bench worker: every five minutes for seats that just went live, and
 * Monday 07:00 UTC with ?weekly=1 for every live seat. See lib/desk/bench.ts.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { processBenchQueue } from '@/lib/desk/bench'

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
    const out = await processBenchQueue(createAdminClient(), req.nextUrl.searchParams.get('weekly') === '1')
    return NextResponse.json({ ok: true, ...out })
  } catch (err) {
    console.error('[desk:bench] run threw:', err)
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
