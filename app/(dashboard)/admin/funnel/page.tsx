'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { AlertTriangle, ArrowDown } from 'lucide-react'
import type { FunnelSnapshot, StalledIntake, DormantPartner } from '@/lib/funnel'

/**
 * Where partners are lost, stage by stage.
 *
 * Every stage shows a conversion against the stage above it rather than
 * against the top of the funnel, because the question is always "what did this
 * step cost us", not "what fraction of the world signed up".
 */

const WINDOWS = [7, 30, 90]

function Pct({ part, whole }: { part: number; whole: number }) {
  if (!whole) return <span className="text-muted-foreground">—</span>
  const value = Math.round((part / whole) * 100)
  const tone = value >= 60 ? 'text-foreground' : value >= 25 ? 'text-amber-600' : 'text-red-600'
  return <span className={`font-medium ${tone}`}>{value}%</span>
}

function Stage({
  label,
  count,
  of,
  note,
  warn,
}: {
  label: string
  count: number
  of?: number
  note?: string
  warn?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          {warn && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />}
          <span className="truncate">{label}</span>
        </div>
        {note && <div className="text-xs text-muted-foreground mt-0.5">{note}</div>}
      </div>
      <div className="flex items-baseline gap-3 shrink-0">
        <span className="text-xl font-bold tabular-nums">{count}</span>
        {of !== undefined && (
          <span className="text-xs w-10 text-right">
            <Pct part={count} whole={of} />
          </span>
        )}
      </div>
    </div>
  )
}

function Divider() {
  return (
    <div className="flex justify-center py-0.5">
      <ArrowDown className="h-3 w-3 text-muted-foreground/40" />
    </div>
  )
}

function StalledList({ rows, empty }: { rows: StalledIntake[]; empty: string }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>
  }
  return (
    <ul className="divide-y">
      {rows.slice(0, 12).map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
          <div className="min-w-0">
            <div className="truncate font-medium">{r.name || r.email || 'Unnamed'}</div>
            <div className="truncate text-xs text-muted-foreground">
              {r.company ? `${r.company} · ` : ''}
              {r.email}
              {!r.announced && ' · never posted to Slack'}
            </div>
          </div>
          <span
            className={`shrink-0 text-xs tabular-nums ${
              r.ageDays >= 14 ? 'font-medium text-red-600' : 'text-muted-foreground'
            }`}
          >
            {r.ageDays}d
          </span>
        </li>
      ))}
      {rows.length > 12 && (
        <li className="pt-2 text-xs text-muted-foreground">plus {rows.length - 12} more</li>
      )}
    </ul>
  )
}

function DormantList({ rows }: { rows: DormantPartner[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Every approved partner has submitted someone.</p>
  }
  return (
    <ul className="divide-y">
      {rows.slice(0, 12).map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
          <div className="min-w-0">
            <div className="truncate font-medium">{r.name || r.email || 'Unnamed'}</div>
            <div className="truncate text-xs text-muted-foreground capitalize">
              {r.role} · {r.email}
            </div>
          </div>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {r.ageDays}d in
          </span>
        </li>
      ))}
      {rows.length > 12 && (
        <li className="pt-2 text-xs text-muted-foreground">plus {rows.length - 12} more</li>
      )}
    </ul>
  )
}

export default function FunnelPage() {
  const [days, setDays] = useState(30)
  const [data, setData] = useState<FunnelSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/admin/funnel?days=${days}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load funnel'))))
      .then((d) => {
        if (!cancelled) {
          setData(d)
          setError('')
        }
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [days])

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive">
        {error}
      </div>
    )
  }

  if (!data) return null

  const { scouts, hiringManagers, signup, partners } = data

  return (
    <div className="space-y-4 sm:space-y-6 px-4 sm:px-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Applications and partner accounts are cumulative. Sign-up sessions are for the window.
        </p>
        <div className="flex gap-1 rounded-lg border p-1">
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setDays(w)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                days === w ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
              }`}
            >
              {w}d
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Scouts</CardTitle>
            <CardDescription>From the application form to a first candidate</CardDescription>
          </CardHeader>
          <CardContent className="divide-y pt-0">
            <Stage label="Applied" count={scouts.total} />
            <Divider />
            <Stage
              label="Announced in Slack"
              count={scouts.total - scouts.neverAnnounced}
              of={scouts.total}
              note={scouts.neverAnnounced > 0 ? `${scouts.neverAnnounced} never reached anyone` : undefined}
              warn={scouts.neverAnnounced > 0}
            />
            <Divider />
            <Stage
              label="Triaged"
              count={scouts.total - scouts.untriaged}
              of={scouts.total}
              note={scouts.untriaged > 0 ? `${scouts.untriaged} still at "new"` : undefined}
              warn={scouts.untriaged > 0}
            />
            <Divider />
            <Stage label="Replied to" count={scouts.answered} of={scouts.total} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Hiring managers</CardTitle>
            <CardDescription>Inbound leads from the start-hiring form</CardDescription>
          </CardHeader>
          <CardContent className="divide-y pt-0">
            <Stage label="Submitted" count={hiringManagers.total} />
            <Divider />
            <Stage
              label="Announced in Slack"
              count={hiringManagers.total - hiringManagers.neverAnnounced}
              of={hiringManagers.total}
              note={
                hiringManagers.neverAnnounced > 0
                  ? `${hiringManagers.neverAnnounced} never reached anyone`
                  : undefined
              }
              warn={hiringManagers.neverAnnounced > 0}
            />
            <Divider />
            <Stage
              label="Triaged"
              count={hiringManagers.total - hiringManagers.untriaged}
              of={hiringManagers.total}
              note={
                hiringManagers.untriaged > 0
                  ? `${hiringManagers.untriaged} still at "new"`
                  : undefined
              }
              warn={hiringManagers.untriaged > 0}
            />
            <Divider />
            <Stage label="Replied to" count={hiringManagers.answered} of={hiringManagers.total} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Sign-up form</CardTitle>
            <CardDescription>Sessions on /auth/sign-up, last {signup.windowDays} days</CardDescription>
          </CardHeader>
          <CardContent className="divide-y pt-0">
            <Stage label="Landed" count={signup.sessions} />
            <Divider />
            <Stage label="Picked a role" count={signup.roleSelected} of={signup.sessions} />
            <Divider />
            <Stage label="Reached the terms" count={signup.reachedTerms} of={signup.roleSelected} />
            <Divider />
            <Stage
              label="Finished"
              count={signup.completed}
              of={signup.reachedTerms}
              note={signup.failed > 0 ? `${signup.failed} errored on submit` : undefined}
              warn={signup.failed > 0}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Approved partners</CardTitle>
            <CardDescription>Accounts that can submit today</CardDescription>
          </CardHeader>
          <CardContent className="divide-y pt-0">
            <Stage label="Active" count={partners.active} note={`${partners.pending} awaiting approval`} />
            <Divider />
            <Stage
              label="Ever submitted a candidate"
              count={partners.activated}
              of={partners.active}
              note={
                partners.dormant.length > 0
                  ? `${partners.dormant.length} have been in over two weeks and submitted nobody`
                  : undefined
              }
              warn={partners.dormant.length > 0}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Waiting on a reply</CardTitle>
            <CardDescription>Untriaged for more than 3 days, oldest first</CardDescription>
          </CardHeader>
          <CardContent>
            <StalledList
              rows={[...hiringManagers.stalled, ...scouts.stalled].sort((a, b) => b.ageDays - a.ageDays)}
              empty="Nothing is sitting still."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Approved but silent</CardTitle>
            <CardDescription>In over two weeks, no candidate yet</CardDescription>
          </CardHeader>
          <CardContent>
            <DormantList rows={partners.dormant} />
          </CardContent>
        </Card>
      </div>

      {signup.stalledAtTerms.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Read the terms and did not finish</CardTitle>
            <CardDescription>Last {signup.windowDays} days</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-wrap gap-2">
              {signup.stalledAtTerms.map((s, i) => (
                <li key={i} className="rounded-full bg-muted px-3 py-1 text-sm">
                  {s.who || 'Anonymous'}
                  {s.role && <span className="text-muted-foreground"> · {s.role}</span>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
