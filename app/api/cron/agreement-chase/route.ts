/**
 * Daily: one batch card of client agreements that went out and never came
 * back, with the chase, resend or reissue each one needs. Nothing sends until
 * :+1:. See lib/agreement-chase.ts.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { postAgreementChase } from '@/lib/agreement-chase'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

async function run(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const channel = process.env.SLACK_CHANNEL_HIRING_LEADS
  if (!channel) return NextResponse.json({ error: 'SLACK_CHANNEL_HIRING_LEADS unset' }, { status: 500 })
  const out = await postAgreementChase(createAdminClient(), channel)
  return NextResponse.json({ ok: true, ...out })
}

export async function GET(req: NextRequest) {
  return run(req)
}
export async function POST(req: NextRequest) {
  return run(req)
}
