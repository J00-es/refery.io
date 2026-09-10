import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { draftMissingPages } from '@/lib/candidate-pages'

/**
 * Live searches without a candidate page get one, a few per call, so the
 * backfill and any search that went live without the hook both self-heal.
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return request.headers.get('authorization') === `Bearer ${secret}`
}

async function run(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const limit = Math.min(6, Math.max(1, Number(request.nextUrl.searchParams.get('limit') ?? 3)))
  const out = await draftMissingPages(createAdminClient(), limit)
  console.log('[candidate-pages]', JSON.stringify(out))
  return NextResponse.json({ ok: true, ...out })
}

export async function GET(request: NextRequest) {
  return run(request)
}
export async function POST(request: NextRequest) {
  return run(request)
}
