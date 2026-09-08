/**
 * Daily: one reminder to each client whose candidate has waited past their
 * response window, in their Slack room or by email, then silence.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { nudgeWaitingClients } from '@/lib/client-delivery'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const result = await nudgeWaitingClients()
  return NextResponse.json(result)
}
