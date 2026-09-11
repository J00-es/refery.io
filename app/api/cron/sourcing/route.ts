/**
 * The sourcing desk's tick, every ten minutes from pg_cron.
 *
 * Order matters: replies are read before anything is sent, so a "no" that
 * arrived a minute ago stops the follow-up that was due. Then what is due
 * goes out, a few per mailbox. Then people already read from Apollo are
 * graded. Nothing here spends an Apollo credit: enrichment is a button.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { ensureDeskMailbox } from '@/lib/sourcing/mailboxes'
import { syncAll } from '@/lib/sourcing/sync'
import { runDue } from '@/lib/sourcing/send'
import { gradePromising, screenPending } from '@/lib/sourcing/grade'
// Registers the Slack applier for sourcing batch cards.
import '@/lib/sourcing/sequence'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

async function run(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const admin = createAdminClient()
  await ensureDeskMailbox(admin)
  const sync = await syncAll(admin)
  const sent = await runDue(admin)

  // Grade what is already read, for every seat with an approved profile.
  const { data: briefs } = await admin.from('sourcing_briefs').select('job_id').eq('status', 'approved')
  const graded: Record<string, unknown>[] = []
  for (const b of briefs ?? []) {
    const s = await screenPending(admin, b.job_id, 60)
    const g = await gradePromising(admin, b.job_id, 15)
    if (s.screened || g.graded || s.notes.length || g.notes.length) graded.push({ job_id: b.job_id, ...s, ...g })
  }
  const out = { sync, sent, graded }
  console.log('[sourcing:cron]', JSON.stringify(out))
  return NextResponse.json({ ok: true, ...out })
}

export async function GET(req: NextRequest) {
  return run(req)
}
export async function POST(req: NextRequest) {
  return run(req)
}
