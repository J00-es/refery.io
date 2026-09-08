import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { flushQueue } from '@/lib/comms'

/**
 * Sends everything in the communications ledger that is due. Every minute,
 * from pg_cron via desk_cron_post, the same way the desk runs.
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return request.headers.get('authorization') === `Bearer ${secret}`
}

async function run(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const result = await flushQueue(createAdminClient())
  if (result.sent || result.failed || result.cancelled) console.log('[comms]', JSON.stringify(result))
  return NextResponse.json({ ok: true, ...result })
}

export async function GET(request: NextRequest) {
  return run(request)
}
export async function POST(request: NextRequest) {
  return run(request)
}
