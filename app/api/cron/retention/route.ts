import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { notifySlack } from '@/lib/slack'
import { runRetention, retentionApplies, PROFILE_MONTHS } from '@/lib/retention'

/**
 * The daily retention sweep.
 *
 * Runs every day and, until RETENTION_APPLY is set, deletes nothing. That is
 * the point: counsel's instruction is not to publish a retention promise until
 * the job behind it works, so the job runs first and reports what it would do,
 * for as long as it takes to trust it.
 *
 * It reports to Slack only when it acted or failed. A daily message saying "nil"
 * is how a monitor becomes wallpaper, and then nobody reads the one that matters.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request: NextRequest) {
  if (!authorised(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  try {
    const run = await runRetention(admin)

    const worthSaying =
      run.deleted > 0 || run.failures.length > 0 || run.blockedByClaim > 0 || run.eligible > 0

    if (worthSaying) {
      await notifySlack({
        stream: 'daily',
        title: run.dryRun
          ? `Retention dry run: ${run.eligible} profile${run.eligible === 1 ? '' : 's'} past ${PROFILE_MONTHS} months`
          : `Retention: ${run.deleted} deleted`,
        fields: [
          { label: 'Past window', value: String(run.eligible) },
          { label: 'Held by a fee claim', value: String(run.blockedByClaim) },
          { label: 'Deleted', value: run.dryRun ? 'nothing, dry run' : String(run.deleted) },
          { label: 'Transcripts purged', value: String(run.transcriptsPurged) },
          ...(run.failures.length
            ? [{ label: 'Failed', value: run.failures.map(f => f.candidateId).join(', ').slice(0, 300) }]
            : []),
        ],
        context: run.dryRun
          ? 'Nothing was removed. Set RETENTION_APPLY=true when the numbers above look right.'
          : undefined,
      })
    }

    if (run.failures.length) {
      console.error('[retention] failures', run.failures)
    }

    return NextResponse.json({ ok: true, applying: retentionApplies(), ...run })
  } catch (err) {
    console.error('[retention] run failed:', err)
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
}
