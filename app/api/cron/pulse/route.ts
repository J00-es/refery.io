import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { postMessage, esc, type SlackBlock } from '@/lib/slack-bot'
import { deviceWord, loadActivity, type ActivityRow } from '@/lib/activity'
import {
  areaOf,
  daysAgo,
  describeVisit,
  describeWrites,
  dwellByPage,
  loadCandidateCounts,
  loadEntityNames,
  loadEverWorking,
  loadNeedsYou,
  loadPeople,
  loadPresence,
  loadVisits,
  loadVisitsThisWeek,
  loadWaiting,
  loadWrites,
  ordinal,
  plural,
  QUIET_WRITE_DAYS,
  shortDate,
  slackDay,
  slackTime,
  visitsPhrase,
  type Area,
} from '@/lib/pulse'

/**
 * The pulse, two cards into #refery-pulse.
 *
 * Every 15 minutes (pg_cron `desk-pulse`): who came in, one line each.
 *   amber  needs Lily: first sign-in, pending approval, an open request
 *   green  did something: a write happened during the visit, named
 *   grey   only looked: what they read and for how long, then what is
 *          waiting on them and how many visits this week without acting
 *
 * Every morning (pg_cron `desk-pulse-daily`, ?daily=1): the day added up.
 * Who did something, who keeps coming back without acting, who needs a
 * decision, where the time went, who signed up and never came back.
 *
 * A watermark in pulse_cursor advances only after a successful post, so a
 * batch is never announced twice and nothing is lost while the bot is out
 * of the channel, capped at a day. ?dry=1 renders without posting.
 *
 * Nothing here calls a model. Every sentence is a count or a lookup.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** #refery-pulse, private, created 7 Sep 2026. */
const PULSE_CHANNEL = 'C0C087E7C4U'
const CURSOR_KEY = 'sign-ins'
const MAX_LOOKBACK_MS = 24 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://refery.xyz').replace(/\/$/, '')

const AMBER = ':large_yellow_circle:'
const GREEN = ':large_green_circle:'
const GREY = ':white_circle:'

const ROLE_WORD: Record<string, string> = {
  recruiter: 'recruiter',
  scout: 'scout',
  hiring_manager: 'hiring manager',
  admin: 'admin',
  super_admin: 'admin',
  viewer: 'viewer',
}

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

function section(text: string): SlackBlock {
  return { type: 'section', text: { type: 'mrkdwn', text: text.slice(0, 2900) } }
}

function context(text: string): SlackBlock {
  return { type: 'context', elements: [{ type: 'mrkdwn', text }] }
}

// ── the 15-minute card ───────────────────────────────────────────────────────

interface Line {
  tone: 'amber' | 'green' | 'grey'
  text: string
}

async function buildLive(since: Date, now: Date) {
  const admin = createAdminClient()
  const people = await loadPeople(admin)
  const visits = await loadVisits(admin, people, since, now)
  if (visits.length === 0) return { lines: [] as Line[], people: 0 }

  const ids = visits.map((v) => v.userId)
  const [writes, waiting, presence, weekVisits, candidateCounts, everWorking, needs, names] =
    await Promise.all([
      loadWrites(admin, ids, since, now),
      loadWaiting(admin, ids),
      loadPresence(admin),
      loadVisitsThisWeek(admin, ids),
      loadCandidateCounts(admin, ids),
      loadEverWorking(admin, ids),
      loadNeedsYou(admin, people, ids),
      loadEntityNames(admin, visits.flatMap((v) => v.rows)),
    ])

  const lines: Line[] = []
  for (const v of visits) {
    const p = people.get(v.userId)!
    const w = writes.get(v.userId) ?? []
    const pr = presence.get(v.userId)
    const firstEver = Boolean(pr?.first_sign_in_at && new Date(pr.first_sign_in_at) >= since)
    const need = needs.get(v.userId) ?? []

    const tags: string[] = [ROLE_WORD[p.role] ?? p.role]
    const device = deviceWord(v.userAgent)
    if (device) tags.push(device)
    if (firstEver) tags.push('first sign-in')
    const head = (tone: string) =>
      `${tone} *${esc(p.name)}* · ${esc(tags.join(' · '))} · ${slackTime(v.startedAt)}`

    if (w.length) {
      const counts = candidateCounts.get(v.userId)
      const history: string[] = []
      if (counts && counts.last30 > 0) history.push(`${plural(counts.last30, 'candidate')} in 30 days`)
      const acceptedNow = w.some((x) => x.kind === 'accepted')
      // everWorking includes this visit's acceptance, so "first" means exactly one.
      if (acceptedNow && everWorking.has(v.userId) && !(await hadWorkingBefore(admin, v.userId, since))) {
        history.push('first search accepted')
      }
      lines.push({
        tone: 'green',
        text: [head(GREEN), `      ${esc(describeWrites(w) ?? '')}`, history.length ? `      _${esc(history.join('. '))}._` : '']
          .filter(Boolean)
          .join('\n'),
      })
      continue
    }

    if (need.length || firstEver) {
      const reasons = need.map((n) => `${n.reason} since ${shortDate(n.since)}`)
      const visitsWeek = weekVisits.get(v.userId) ?? 1
      const body = reasons.length
        ? `${capital(reasons.join('; '))}. ${visitsWeek > 1 ? `Signed in ${plural(visitsWeek, 'time')} this week to check.` : ''}`
        : `New account, first time in.${p.status === 'active' ? '' : ` Status: ${p.status}.`}`
      const link =
        p.status === 'pending'
          ? `<${APP_URL}/admin/users/${p.adminId}|Approve or decline>`
          : need.some((n) => n.reason.startsWith('asked for access'))
            ? `<${APP_URL}/searches/requests|Decide>`
            : ''
      lines.push({
        tone: 'amber',
        text: [head(AMBER), `      ${esc(body.trim())}`, link ? `      ${link}` : ''].filter(Boolean).join('\n'),
      })
      continue
    }

    const visitsWeek = weekVisits.get(v.userId) ?? 1
    const looked = describeVisit(v.rows, names, { uploadedNothing: true })
    const wait = waiting.get(v.userId)
    const tail: string[] = []
    tail.push(visitsWeek > 1 ? `${ordinal(visitsWeek)} visit this week, nothing done yet` : 'first visit this week')
    if (wait) {
      tail.push(
        `${plural(wait.count, 'search', 'searches')} waiting on them since ${shortDate(wait.oldest)}${
          wait.companies.length ? ` (${wait.companies.slice(0, 3).join(', ')})` : ''
        }`,
      )
    }
    lines.push({
      tone: 'grey',
      text: [head(GREY), looked ? `      ${esc(looked)}` : '', `      _${esc(tail.join('. '))}._`]
        .filter(Boolean)
        .join('\n'),
    })
  }

  const order = { amber: 0, green: 1, grey: 2 }
  lines.sort((a, b) => order[a.tone] - order[b.tone])
  return { lines, people: visits.length }
}

async function hadWorkingBefore(admin: ReturnType<typeof createAdminClient>, userId: string, before: Date) {
  const { count } = await admin
    .from('search_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('status', ['working', 'paused'])
    .lt('confirmed_at', before.toISOString())
  return (count ?? 0) > 0
}

function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ── the morning card ─────────────────────────────────────────────────────────

async function buildDaily(since: Date, now: Date): Promise<{ blocks: SlackBlock[]; text: string; empty: boolean }> {
  const admin = createAdminClient()
  const people = await loadPeople(admin)
  const allIds = [...people.keys()]

  const [visits, writesDay, writes14, presence, weekVisits, waiting, candidateCounts, activity] = await Promise.all([
    loadVisits(admin, people, since, now),
    loadWrites(admin, allIds, since, now),
    loadWrites(admin, allIds, new Date(now.getTime() - QUIET_WRITE_DAYS * DAY_MS), now),
    loadPresence(admin),
    loadVisitsThisWeek(admin, allIds),
    loadWaiting(admin, allIds),
    loadCandidateCounts(admin, allIds),
    loadActivity(admin, allIds, since),
  ])
  const needs = await loadNeedsYou(admin, people, allIds)
  const allRows: ActivityRow[] = [...activity.values()].flat().filter((r) => new Date(r.at) < now)
  const names = await loadEntityNames(admin, allRows)

  const visitors = new Set<string>([...visits.map((v) => v.userId), ...activity.keys()])
  const did = [...writesDay.keys()].filter((id) => people.has(id))
  const didSet = new Set(did)
  const firstTimers = [...visitors].filter((id) => {
    const f = presence.get(id)?.first_sign_in_at
    return f && new Date(f) >= since
  })
  const lookedOnly = [...visitors].filter((id) => !didSet.has(id) && !firstTimers.includes(id))

  const blocks: SlackBlock[] = []
  const summary = `*Yesterday on refery.xyz* · ${slackDay(since.toISOString())}\n${
    visitors.size === 0
      ? 'Nobody came in.'
      : `${plural(visitors.size, 'person', 'people')} came in. ${plural(did.length, 'did', 'did')} something, ${lookedOnly.length} only looked${
          firstTimers.length ? `, ${firstTimers.length} ${firstTimers.length === 1 ? 'was' : 'were'} new` : ''
        }.`.replace(/(\d+) did did/, '$1 did')
  }`
  blocks.push(section(summary))

  // Did something
  if (did.length) {
    const lines = did
      .sort((a, b) => (writesDay.get(b)?.length ?? 0) - (writesDay.get(a)?.length ?? 0))
      .slice(0, 8)
      .map((id) => `*${esc(people.get(id)!.name)}* ${esc(describeWrites(writesDay.get(id)!) ?? '')}`)
    blocks.push(section(`${GREEN} *Did something*\n${lines.join('\n')}${did.length > 8 ? `\nand ${did.length - 8} more` : ''}`))
  }

  // Keep coming back, have not acted
  const quiet = allIds
    .filter((id) => {
      const p = people.get(id)!
      if (p.status !== 'active' || !['scout', 'recruiter'].includes(p.role)) return false
      if ((weekVisits.get(id) ?? 0) < 2) return false
      return !(writes14.get(id)?.length)
    })
    .sort((a, b) => (weekVisits.get(b) ?? 0) - (weekVisits.get(a) ?? 0))
  if (quiet.length) {
    let expires: string | null = null
    const lines = quiet.slice(0, 8).map((id) => {
      const p = people.get(id)!
      const w = waiting.get(id)
      const c = candidateCounts.get(id)
      if (w?.expires && (!expires || w.expires < expires)) expires = w.expires
      const bits = [visitsPhrase(weekVisits.get(id) ?? 0)]
      if (w) bits.push(`${plural(w.count, 'search', 'searches')} waiting since ${shortDate(w.oldest)}`)
      bits.push(c?.ever ? `${plural(c.ever, 'candidate')} ever` : 'no candidate yet')
      const read = describeReadOnly(activity.get(id) ?? [], names)
      if (read) bits.push(read)
      return `*${esc(p.name)}* ${esc(bits.join(' · '))}`
    })
    const note = expires ? `\n_The waiting proposals expire ${shortDate(expires)}._` : ''
    blocks.push(
      section(
        `${GREY} *Keep coming back, have not acted in ${QUIET_WRITE_DAYS} days*\n${lines.join('\n')}${
          quiet.length > 8 ? `\nand ${quiet.length - 8} more` : ''
        }${note}`,
      ),
    )
  }

  // Needs you
  const needLines: string[] = []
  for (const [id, list] of needs) {
    const p = people.get(id)
    if (!p) continue
    const recent = (presence.get(id)?.last_active_at && daysAgo(presence.get(id)!.last_active_at!) <= 7) || false
    for (const n of list) {
      if (n.reason.startsWith('waiting for your approval') && !recent) continue
      const link =
        n.reason.startsWith('waiting for your approval')
          ? `<${APP_URL}/admin/users/${p.adminId}|decide>`
          : n.reason.startsWith('asked for access')
            ? `<${APP_URL}/searches/requests|decide>`
            : `<${APP_URL}/searches|answer>`
      const visitsWeek = weekVisits.get(id) ?? 0
      needLines.push(
        `*${esc(p.name)}* ${esc(n.reason)} since ${shortDate(n.since)}${
          visitsWeek > 1 && n.reason.startsWith('waiting for your approval') ? `, has signed in ${plural(visitsWeek, 'time')} to check` : ''
        } · ${link}`,
      )
    }
  }
  if (needLines.length) blocks.push(section(`${AMBER} *Needs you*\n${needLines.slice(0, 8).join('\n')}`))

  // Where the time went
  if (allRows.length) {
    const byArea = new Map<Area, number>()
    const byCompany = new Map<string, { ms: number; people: Set<string> }>()
    for (const [userId, rows] of activity) {
      for (const d of dwellByPage(rows.filter((r) => new Date(r.at) < now))) {
        byArea.set(areaOf(d.route), (byArea.get(areaOf(d.route)) ?? 0) + d.ms)
        const isSearchPage = d.route === '/searches/[companyId]' || d.route === '/searches/[companyId]/brief'
        if (isSearchPage && d.entityId && names.get(d.entityId)) {
          const name = names.get(d.entityId)!
          const c = byCompany.get(name) ?? { ms: 0, people: new Set<string>() }
          c.ms += d.ms
          c.people.add(userId)
          byCompany.set(name, c)
        }
      }
    }
    const total = [...byArea.values()].reduce((a, b) => a + b, 0) || 1
    const rows = [...byArea.entries()]
      .sort((a, b) => b[1] - a[1])
      .filter(([, ms]) => ms / total >= 0.03)
      .map(([area, ms]) => {
        const pct = Math.round((ms / total) * 100)
        const bar = '▇'.repeat(Math.max(1, Math.round(pct / 8)))
        return `${area.padEnd(11)}${bar.padEnd(13)}${String(pct).padStart(3)}%`
      })
    const most = [...byCompany.entries()]
      .filter(([, c]) => c.ms >= 60_000)
      .sort((a, b) => b[1].ms - a[1].ms)
      .slice(0, 3)
      .map(([name, c]) => `${name} (${plural(c.people.size, 'person', 'people')}, ${Math.round(c.ms / 60_000)} min)`)
    blocks.push(
      section(
        `*Where the time went*\n\`\`\`${rows.join('\n')}\`\`\`${most.length ? `\nMost read: ${esc(most.join(', '))}.` : ''}`,
      ),
    )
  }

  // Signed up, never came back
  const gone = allIds
    .filter((id) => {
      const p = people.get(id)!
      const pr = presence.get(id)
      if (!pr?.first_sign_in_at || !pr.last_active_at) return false
      if (!['scout', 'recruiter'].includes(p.role)) return false
      const first = daysAgo(pr.first_sign_in_at)
      const span = new Date(pr.last_active_at).getTime() - new Date(pr.first_sign_in_at).getTime()
      return first >= 7 && first <= 30 && span < DAY_MS
    })
    .sort((a, b) => daysAgo(presence.get(b)!.first_sign_in_at!) - daysAgo(presence.get(a)!.first_sign_in_at!))
  if (gone.length) {
    blocks.push(
      section(
        `*Signed in once, never came back*\n${plural(gone.length, 'person', 'people')}, 7 to 30 days ago: ${esc(
          gone.slice(0, 8).map((id) => people.get(id)!.name).join(', '),
        )}${gone.length > 8 ? `, and ${gone.length - 8} more` : ''}.`,
      ),
    )
  }

  blocks.push(context(`<${APP_URL}/admin/users|Everyone, last seen> · <${APP_URL}/admin/funnel|Funnel>`))
  const text = `Yesterday on refery.xyz: ${visitors.size} came in, ${did.length} did something.`
  return { blocks, text, empty: visitors.size === 0 && did.length === 0 && quiet.length === 0 && needLines.length === 0 }
}

/** For the quiet list: the one thing they read most, if it has a name. */
function describeReadOnly(rows: ActivityRow[], names: Map<string, string>): string | null {
  const top = dwellByPage(rows)
    .filter((d) => d.entityId && names.get(d.entityId) && d.route.startsWith('/searches/[companyId]'))
    .sort((a, b) => b.ms - a.ms)[0]
  return top ? `reads ${names.get(top.entityId!)}` : null
}

// ── handler ──────────────────────────────────────────────────────────────────

async function run(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const now = new Date()
  const daily = request.nextUrl.searchParams.get('daily') === '1'
  const dry = request.nextUrl.searchParams.get('dry') === '1'
  const channel = process.env.SLACK_CHANNEL_PULSE || PULSE_CHANNEL

  if (daily) {
    const since = new Date(now.getTime() - DAY_MS)
    const card = await buildDaily(since, now)
    if (dry) return NextResponse.json({ ok: true, dry: true, blocks: card.blocks })
    if (card.empty) return NextResponse.json({ ok: true, posted: false, reason: 'quiet day' })
    const res = await postMessage(channel, card.text, card.blocks)
    return NextResponse.json({ ok: res.ok, posted: res.ok, error: res.error }, { status: res.ok ? 200 : 502 })
  }

  const { data: cursor } = await admin.from('pulse_cursor').select('through').eq('key', CURSOR_KEY).maybeSingle()
  const floor = new Date(now.getTime() - MAX_LOOKBACK_MS)
  const since = cursor?.through && new Date(cursor.through) > floor ? new Date(cursor.through) : floor

  const { lines, people } = await buildLive(since, now)
  const advance = () =>
    admin.from('pulse_cursor').upsert({ key: CURSOR_KEY, through: now.toISOString(), updated_at: now.toISOString() })

  if (dry) return NextResponse.json({ ok: true, dry: true, since, lines })

  if (lines.length === 0) {
    await advance()
    return NextResponse.json({ ok: true, posted: false, people: 0 })
  }

  const header = `*Pulse* · ${slackTime(since.toISOString())} to ${slackTime(now.toISOString())} · ${people} in`
  const blocks: SlackBlock[] = [
    section(header),
    ...lines.map((l) => section(l.text)),
    context(`<${APP_URL}/admin/users|Everyone, last seen>`),
  ]
  const res = await postMessage(channel, `${people} in: ${lines.map((l) => l.text.split('\n')[0].replace(/[*_:]|large_\w+_circle|white_circle/g, '')).join('; ')}`, blocks)
  if (!res.ok) {
    console.error('[cron/pulse] post failed:', res.error)
    return NextResponse.json({ ok: false, error: res.error, people }, { status: 502 })
  }
  await advance()
  return NextResponse.json({ ok: true, posted: true, people })
}

export async function GET(request: NextRequest) {
  return run(request)
}

export async function POST(request: NextRequest) {
  return run(request)
}
