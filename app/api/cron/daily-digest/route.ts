import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { notifySlack, type SlackField } from '@/lib/slack'

/**
 * Daily digest and stalled-work sweep.
 *
 * The per-event channels answer "what just happened". This answers the two
 * questions they cannot: what did the day add up to, and what is sitting still
 * that nobody will be told about, because silence never fires an event.
 *
 * Runs on a Vercel cron at 23:00 UTC, which is 08:00 in Seoul.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const DAY_MS = 24 * 60 * 60 * 1000

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

export async function GET(request: NextRequest) {
  if (!authorised(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const since = new Date(Date.now() - DAY_MS).toISOString()
  const origin = request.nextUrl.origin

  try {
    const [signupRes, agreementRes, candidateRes, openLinksRes] = await Promise.all([
      admin
        .from('signup_events')
        .select('session_id, step, role, full_name, email')
        .gte('occurred_at', since),
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
    ])

    const signups = signupRes.data ?? []
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
    const sessions = new Map<string, { steps: Set<string>; who: string | null; role: string | null }>()
    for (const e of signups) {
      const s = sessions.get(e.session_id) ?? { steps: new Set<string>(), who: null, role: null }
      s.steps.add(e.step)
      s.who = s.who ?? e.full_name ?? e.email ?? null
      s.role = s.role ?? e.role ?? null
      sessions.set(e.session_id, s)
    }

    const started = [...sessions.values()].filter((s) => s.steps.has('role_selected'))
    const reachedTerms = [...sessions.values()].filter((s) => s.steps.has('agreement_viewed'))
    const completed = [...sessions.values()].filter((s) => s.steps.has('completed'))
    const stalledAtTerms = reachedTerms.filter((s) => !s.steps.has('completed'))

    const opens = agreements.filter((a) => a.event_type === 'viewed')
    const signed = agreements.filter((a) => a.event_type === 'signed')

    // Repeat opens are already alerted in real time on #refery-clients, so the
    // digest does not restate them. What it adds is the opposite: the links
    // nothing has happened to, which never fire an event at all.
    const nothingHappened =
      started.length === 0 &&
      completed.length === 0 &&
      opens.length === 0 &&
      signed.length === 0 &&
      candidates.length === 0

    const fields: SlackField[] = [
      {
        label: 'Partner sign-ups',
        value:
          started.length === 0
            ? 'Nobody started'
            : `${plural(started.length, 'start')}, ${reachedTerms.length} reached the terms, ${completed.length} finished`,
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
    ]

    // The part worth acting on. Named, not counted.
    const actions: string[] = []

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
        `*${plural(staleOpened.length, 'client')} opened an agreement over 5 days ago and has not signed:* ${staleOpened
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

    const result = await notifySlack({
      stream: 'daily',
      emoji: ':sunrise:',
      title: nothingHappened ? 'Yesterday was quiet' : 'Yesterday on Refery',
      fields,
      body: actions.length ? actions.join('\n\n') : undefined,
      context: actions.length
        ? undefined
        : 'Nothing is sitting still that needs chasing.',
      links: [{ label: 'Open Refery', url: `${origin}/dashboard` }],
    })

    return NextResponse.json({
      ok: true,
      posted: result.sent,
      error: result.error,
      summary: {
        started: started.length,
        reachedTerms: reachedTerms.length,
        completed: completed.length,
        stalledAtTerms: stalledAtTerms.length,
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
