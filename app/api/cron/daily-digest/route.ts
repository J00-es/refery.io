import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { notifySlack, type SlackField } from '@/lib/slack'
import { loadFunnel, STALE_INTAKE_DAYS, DORMANT_PARTNER_DAYS } from '@/lib/funnel'

/**
 * Daily digest and stalled-work sweep.
 *
 * The per-event channels answer "what just happened". This answers the two
 * questions they cannot: what did the day add up to, and what is sitting still
 * that nobody will be told about, because silence never fires an event.
 *
 * That second question is the one that matters most at the top of the funnel.
 * An application announced once and never reacted to generates no further
 * events for the rest of its life, so without a sweep it is indistinguishable
 * from one that was handled. Sixty-odd of them accumulated that way.
 *
 * Runs on a Vercel cron at 23:00 UTC, which is 08:00 in Seoul.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000

/**
 * The nightly run is scheduled once a day, so anything past a day plus a
 * scheduling-drift allowance means a night was skipped, not delayed.
 */
const NIGHTLY_OVERDUE_MS = 26 * HOUR_MS

/** A run still 'running' after this long died without writing a status. */
const RUN_HUNG_MS = 6 * HOUR_MS

/**
 * The ATS ingest arrives in bursts every few days rather than nightly, and the
 * longest healthy gap observed is seven days. Past that it has stopped.
 */
const INGEST_STALE_DAYS = 8

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  // With no secret configured the endpoint would be open to anyone, and it
  // posts to Slack, so it stays shut instead.
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

/** Agrees the verb with a count that plural() has already rendered. */
function verb(n: number, one: string, many: string): string {
  return n === 1 ? one : many
}

/** Run errors carry full URLs and stack context, which no digest line needs. */
function truncateError(e: string): string {
  const firstLine = e.split('\n')[0]
  return firstLine.length > 160 ? `${firstLine.slice(0, 159)}...` : firstLine
}

export async function GET(request: NextRequest) {
  if (!authorised(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const since = new Date(Date.now() - DAY_MS).toISOString()
  // Not request.nextUrl.origin: the cron invokes this on the immutable
  // deployment hostname, so every link in the digest pointed at
  // v0-hr-tool-...-5sih8cwzu.vercel.app, which sits behind Vercel auth and is
  // superseded by the next deploy. The links have to outlive the deployment.
  const origin = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'https://refery.xyz'
  ).replace(/\/+$/, '')

  try {
    const [
      funnel,
      agreementRes,
      candidateRes,
      openLinksRes,
      lastRunRes,
      hungRunsRes,
      newestJobRes,
      unembeddedJobsRes,
      autoMatchedRes,
    ] = await Promise.all([
      // Covers sign-up sessions for the day plus the cumulative intake and
      // activation backlogs, which have no useful window.
      loadFunnel(admin, { windowDays: 1 }),
      admin
        .from('client_agreement_events')
        .select('event_type, seq, company_id, link_id')
        .gte('occurred_at', since),
      admin
        .from('candidates')
        .select('id, name, uploaded_by_user_id')
        .gte('created_at', since),
      // Everything still waiting on a client, regardless of when it was sent.
      admin
        .from('client_agreement_links')
        .select('company_name, recipient_name, status, sent_at, viewed_at, expires_at')
        .in('status', ['sent', 'viewed']),
      // The nightly run reports itself into daily_run_log, but nothing ever
      // read that table back. A run that dies leaves a row stuck at 'running'
      // and says nothing, which is indistinguishable from a quiet night.
      admin
        .from('daily_run_log')
        .select('run_date, status, started_at, finished_at, errors')
        .order('started_at', { ascending: false })
        .limit(1),
      admin
        .from('daily_run_log')
        .select('run_date, started_at', { count: 'exact' })
        .eq('status', 'running')
        .lt('started_at', new Date(Date.now() - RUN_HUNG_MS).toISOString()),
      // Job ingest happens outside this app entirely, so its silence is the
      // failure nothing here would otherwise notice.
      admin
        .from('jobs')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1),
      admin
        .from('jobs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'open')
        .is('embedding', null),
      admin
        .from('job_candidate_pipeline')
        .select('id', { count: 'exact', head: true })
        .eq('stage', 'auto_matched'),
    ])

    const agreements = agreementRes.data ?? []
    const candidates = candidateRes.data ?? []

    // A link past its expiry is not a chase, it is a reissue. Counting the two
    // together made six dead May and June links read as warm stalled revenue.
    const allPending = openLinksRes.data ?? []
    const isLive = (l: { expires_at: string | null }) =>
      !l.expires_at || new Date(l.expires_at) > new Date()
    const openLinks = allPending.filter(isLive)
    const expiredLinks = allPending.filter((l) => !isLive(l))

    // A drop-off is a session that reached the terms and never completed.
    const { signup, scouts, hiringManagers, partners } = funnel
    const stalledAtTerms = signup.stalledAtTerms

    // Two different failures, and they need different fixes: an application
    // nobody was told about is a wiring bug, one that was announced and
    // ignored is a queue nobody is working.
    const stalledIntake = [...hiringManagers.stalled, ...scouts.stalled].sort(
      (a, b) => b.ageDays - a.ageDays,
    )
    const unannounced = stalledIntake.filter((r) => !r.announced)

    // Pipeline health. Every check here answers the same question: is the
    // absence of news good news, or is a machine quietly not running?
    const lastRun = lastRunRes.data?.[0] ?? null
    const lastRunAgeMs = lastRun ? Date.now() - new Date(lastRun.started_at).getTime() : null
    const nightlyOverdue = lastRunAgeMs === null || lastRunAgeMs > NIGHTLY_OVERDUE_MS
    const hungRuns = hungRunsRes.data ?? []
    const newestJobAt = newestJobRes.data?.[0]?.created_at ?? null
    const ingestAgeDays = newestJobAt
      ? Math.floor((Date.now() - new Date(newestJobAt).getTime()) / DAY_MS)
      : null
    const unembeddedOpenJobs = unembeddedJobsRes.count ?? 0
    const autoMatchedBacklog = autoMatchedRes.count ?? 0

    const pipelineProblems: string[] = []

    if (nightlyOverdue) {
      pipelineProblems.push(
        lastRun
          ? `*The nightly run has not started since ${lastRun.run_date}*, ${Math.floor(
              (lastRunAgeMs as number) / HOUR_MS,
            )} hours ago. No jobs are being embedded or matched until it runs again.`
          : '*The nightly run has never reported in.* Nothing is being embedded or matched.',
      )
    } else if (lastRun && lastRun.status !== 'success') {
      pipelineProblems.push(
        `*Last night's run finished as \`${lastRun.status}\`.*${
          lastRun.errors?.length ? ` First error: ${truncateError(lastRun.errors[0])}` : ''
        }`,
      )
    }

    if (hungRuns.length) {
      pipelineProblems.push(
        `*${plural(hungRuns.length, 'nightly run')} died mid-flight and never wrote a result:* ${hungRuns
          .map((r) => r.run_date)
          .slice(0, 5)
          .join(', ')}. That night's work did not happen.`,
      )
    }

    if (ingestAgeDays !== null && ingestAgeDays >= INGEST_STALE_DAYS) {
      pipelineProblems.push(
        `*No new jobs have been ingested for ${plural(ingestAgeDays, 'day')}.* The ATS ingest runs outside Refery, so nothing else will tell you it stopped. Without it the match pipeline runs against a frozen board.`,
      )
    }

    if (unembeddedOpenJobs > 0) {
      pipelineProblems.push(
        `*${plural(unembeddedOpenJobs, 'open job')} ${verb(unembeddedOpenJobs, 'has', 'have')} no embedding*, so ${verb(unembeddedOpenJobs, 'it is', 'they are')} invisible to matching.`,
      )
    }

    const opens = agreements.filter((a) => a.event_type === 'viewed')
    const signed = agreements.filter((a) => a.event_type === 'signed')

    // Repeat opens are already alerted in real time on #refery-clients, so the
    // digest does not restate them. What it adds is the opposite: the links
    // nothing has happened to, which never fire an event at all.
    //
    // A day with a stalled queue is never "quiet", however little arrived, so
    // the backlog counts towards this too.
    // A morning where the machines were down is never "quiet" either. That was
    // the whole failure mode: nothing arrived, so nothing looked wrong.
    const nothingHappened =
      signup.roleSelected === 0 &&
      signup.completed === 0 &&
      opens.length === 0 &&
      signed.length === 0 &&
      candidates.length === 0 &&
      stalledIntake.length === 0 &&
      partners.dormant.length === 0 &&
      pipelineProblems.length === 0

    const fields: SlackField[] = [
      {
        label: 'Nightly pipeline',
        value: nightlyOverdue
          ? ':red_circle: not running'
          : `${lastRun?.status === 'success' ? 'Ran' : `Ran ${lastRun?.status}`} ${
              (lastRunAgeMs as number) < HOUR_MS
                ? 'under an hour ago'
                : `${plural(Math.floor((lastRunAgeMs as number) / HOUR_MS), 'hour')} ago`
            }`,
      },
      {
        label: 'Job board',
        value:
          ingestAgeDays === null
            ? 'No jobs ingested yet'
            : `${
                unembeddedOpenJobs === 0
                  ? 'All open jobs embedded'
                  : `${plural(unembeddedOpenJobs, 'open job')} unembedded`
              }, last ingest ${
                ingestAgeDays === 0 ? 'today' : `${plural(ingestAgeDays, 'day')} ago`
              }`,
      },
      {
        label: 'Matches awaiting review',
        value:
          autoMatchedBacklog === 0
            ? 'None'
            : `${autoMatchedBacklog} at auto_matched`,
      },
      {
        label: 'Waiting on a reply',
        value:
          scouts.untriaged === 0 && hiringManagers.untriaged === 0
            ? 'Nothing untriaged'
            : `${plural(scouts.untriaged, 'scout application')}, ${plural(
                hiringManagers.untriaged,
                'hiring lead',
              )}`,
      },
      {
        label: 'Partner sign-ups',
        value:
          signup.roleSelected === 0
            ? 'Nobody started'
            : `${plural(signup.roleSelected, 'start')}, ${signup.reachedTerms} reached the terms, ${signup.completed} finished`,
      },
      {
        label: 'Client agreements',
        value:
          opens.length === 0 && signed.length === 0
            ? 'No activity'
            : `${plural(opens.length, 'open')}, ${plural(signed.length, 'signature')}`,
      },
      {
        label: 'Candidates added',
        value: candidates.length === 0 ? 'None' : String(candidates.length),
      },
      {
        label: 'Agreements still out',
        value:
          openLinks.length === 0
            ? 'None live'
            : `${openLinks.length} live and unsigned${
                expiredLinks.length ? `, ${expiredLinks.length} expired` : ''
              }`,
      },
      {
        label: 'Partner activation',
        value: partners.active
          ? `${partners.activated} of ${partners.active} have submitted anyone`
          : 'No active partners',
      },
    ]

    // The part worth acting on. Named, not counted.
    // Broken machinery goes first: every other number below it is only as
    // trustworthy as the run that produced it.
    const actions: string[] = [...pipelineProblems]

    // First, because it is the widest leak: someone raised their hand and got
    // nothing back. Everything below this is a smaller number.
    if (stalledIntake.length) {
      const oldest = stalledIntake[0]
      const names = stalledIntake
        .slice(0, 6)
        .map((r) => `${r.name || r.email || 'unnamed'}${r.company ? ` (${r.company})` : ''} ${r.ageDays}d`)
      actions.push(
        `*${plural(stalledIntake.length, 'application')} untriaged for over ${STALE_INTAKE_DAYS} days.* ${names.join(
          ', ',
        )}${stalledIntake.length > 6 ? `, plus ${stalledIntake.length - 6} more` : ''}. The oldest has been waiting ${oldest.ageDays} days.`,
      )
    }

    if (unannounced.length) {
      actions.push(
        `*${unannounced.length} of those were never posted to Slack at all*, so nobody was ever told they existed. They will not appear in the intake channels no matter how long you wait: work them from the funnel page.`,
      )
    }

    if (stalledAtTerms.length) {
      const names = stalledAtTerms
        .map((s) => s.who)
        .filter((n): n is string => !!n)
        .slice(0, 5)
      actions.push(
        `*${plural(stalledAtTerms.length, 'person', 'people')} read the Partner Terms and did not finish.*${
          names.length ? ` ${names.join(', ')}.` : ''
        } This is the drop-off the rewrite was meant to fix, so it is the number to watch.`,
      )
    }

    const staleOpened = openLinks.filter(
      (l) => l.status === 'viewed' && l.viewed_at && Date.now() - new Date(l.viewed_at).getTime() > 5 * DAY_MS,
    )
    if (staleOpened.length) {
      actions.push(
        `*${plural(staleOpened.length, 'client')} opened an agreement over 5 days ago and ${verb(staleOpened.length, 'has', 'have')} not signed:* ${staleOpened
          .map((l) => l.company_name)
          .slice(0, 5)
          .join(', ')}.`,
      )
    }

    const neverOpened = openLinks.filter(
      (l) => l.status === 'sent' && Date.now() - new Date(l.sent_at).getTime() > 3 * DAY_MS,
    )
    if (neverOpened.length) {
      actions.push(
        `*${plural(neverOpened.length, 'agreement')} sent over 3 days ago and never opened:* ${neverOpened
          .map((l) => l.company_name)
          .slice(0, 5)
          .join(', ')}. Usually the email went astray rather than the deal going cold.`,
      )
    }

    if (expiredLinks.length) {
      actions.push(
        `*${plural(expiredLinks.length, 'link')} expired unsigned:* ${expiredLinks
          .map((l) => l.company_name)
          .slice(0, 6)
          .join(', ')}. These need reissuing, not chasing. A reissued link picks up the current terms automatically.`,
      )
    }

    // Last, because it is the slowest-moving of the four and the least urgent
    // on any given morning. It is still the difference between 54 partners and
    // 19 working ones.
    if (partners.dormant.length) {
      actions.push(
        `*${plural(partners.dormant.length, 'approved partner')} joined over ${DORMANT_PARTNER_DAYS} days ago and ${verb(partners.dormant.length, 'has', 'have')} never submitted anyone:* ${partners.dormant
          .slice(0, 6)
          .map((p) => `${p.name || p.email} (${p.ageDays}d)`)
          .join(', ')}${
          partners.dormant.length > 6 ? `, plus ${partners.dormant.length - 6} more` : ''
        }.`,
      )
    }

    const result = await notifySlack({
      stream: 'daily',
      // A broken pipeline should not open with a sunrise.
      emoji: pipelineProblems.length ? ':rotating_light:' : ':sunrise:',
      title: pipelineProblems.length
        ? 'Yesterday on Refery: the pipeline needs attention'
        : nothingHappened
          ? 'Yesterday was quiet'
          : 'Yesterday on Refery',
      fields,
      body: actions.length ? actions.join('\n\n') : undefined,
      context: actions.length
        ? undefined
        : 'Nothing is sitting still that needs chasing.',
      links: [
        { label: 'Funnel', url: `${origin}/admin/funnel` },
        { label: 'Open Refery', url: `${origin}/dashboard` },
      ],
    })

    return NextResponse.json({
      ok: true,
      posted: result.sent,
      error: result.error,
      summary: {
        pipelineProblems: pipelineProblems.length,
        nightlyOverdue,
        hungRuns: hungRuns.length,
        ingestAgeDays,
        unembeddedOpenJobs,
        autoMatchedBacklog,
        started: signup.roleSelected,
        reachedTerms: signup.reachedTerms,
        completed: signup.completed,
        stalledAtTerms: stalledAtTerms.length,
        stalledIntake: stalledIntake.length,
        unannouncedIntake: unannounced.length,
        dormantPartners: partners.dormant.length,
        opens: opens.length,
        signed: signed.length,
        candidates: candidates.length,
        openLinks: openLinks.length,
        expiredLinks: expiredLinks.length,
        staleOpened: staleOpened.length,
        neverOpened: neverOpened.length,
      },
    })
  } catch (err) {
    console.error('[cron/daily-digest] failed:', err)
    return NextResponse.json({ error: 'Digest failed' }, { status: 500 })
  }
}
