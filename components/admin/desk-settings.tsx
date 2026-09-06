'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Inbox, Mail } from 'lucide-react'
import { FOCUS } from '@/lib/candidate-ui'

type GoogleStatus = { configured: boolean; connected: boolean; env_token: boolean }
type GoogleAccount = { email?: string; scopes?: string[]; connected_at?: string }

const NEEDED = ['gmail.compose', 'gmail.send', 'gmail.readonly']

/** The mailbox the desk sends from, and the one button that connects it. */
function GoogleMailbox({ status, account, notice }: { status?: GoogleStatus; account?: GoogleAccount; notice?: { ok: boolean; msg: string } }) {
  const granted = account?.scopes ?? []
  const missing = NEEDED.filter(n => !granted.some(g => g.endsWith(n)))
  const state = !status?.configured
    ? { tone: 'text-[#8A3B2B]', text: 'Google client id and secret are not set on the server yet. Run scripts/push-google-env.sh once, then redeploy.' }
    : status.connected && missing.length === 0
      ? { tone: 'text-[#1F3A2F]', text: `Connected as ${account?.email ?? 'the mailbox'}. The desk can send, draft and read replies.` }
      : status.connected
        ? { tone: 'text-[#8A3B2B]', text: `Connected as ${account?.email ?? 'the mailbox'}, but missing ${missing.join(', ')}. Reconnect and approve everything.` }
        : status.env_token
          ? { tone: 'text-[#8A3B2B]', text: 'Only the old draft-only token is set. Connect the mailbox so the desk can send.' }
          : { tone: 'text-[#8A3B2B]', text: 'Not connected. Emails are written and recorded but nothing is sent.' }
  return (
    <div className="rounded-lg border p-3 sm:p-4">
      <p className="flex items-center gap-2 font-medium"><Mail className="h-4 w-4" /> Mailbox the desk sends from</p>
      <p className={`mt-1 text-[12.5px] ${state.tone}`}>{state.text}</p>
      {notice && <p className={`mt-1 text-[12.5px] ${notice.ok ? 'text-[#1F3A2F]' : 'text-[#8A3B2B]'}`}>{notice.msg}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <a
          href="/api/admin/google/connect"
          aria-disabled={!status?.configured}
          className={`inline-flex min-h-[36px] items-center rounded-full border px-3.5 text-[12.5px] font-semibold ${FOCUS} ${status?.configured ? 'border-[#1F3A2F] bg-[#1F3A2F] text-white' : 'pointer-events-none border-[#D2D1C7] text-[#9C9C95]'}`}
        >
          {status?.connected ? 'Reconnect lily@refery.io' : 'Connect lily@refery.io'}
        </a>
        <span className="text-[12px] text-[#9C9C95]">Choose the lily@refery.io account and tick every box Google shows.</span>
      </div>
    </div>
  )
}

/**
 * The timers the desk runs on, and the one automation that is off by default.
 */
export function DeskSettings() {
  const [s, setS] = useState<Record<string, unknown> | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; msg: string } | undefined>()

  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const g = q.get('google')
    if (g) setNotice({ ok: g === 'connected', msg: q.get('msg') ?? (g === 'connected' ? 'Connected.' : 'Something went wrong.') })
  }, [])

  useEffect(() => {
    fetch('/api/admin/desk-settings')
      .then(r => r.json())
      .then(d => setS(d.settings ?? {}))
      .catch(() => setS({}))
  }, [])

  async function save(patch: Record<string, unknown>) {
    setS(prev => ({ ...(prev ?? {}), ...patch }))
    const res = await fetch('/api/admin/desk-settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
    setMsg(res.ok ? 'Saved.' : 'Could not save.')
    setTimeout(() => setMsg(null), 2000)
  }

  const days = (k: string, fallback: number[]) => (Array.isArray(s?.[k]) ? (s![k] as number[]) : fallback)
  const numList = (k: string, fallback: number[]) => (
    <input
      defaultValue={days(k, fallback).join(', ')}
      onBlur={e => {
        const arr = e.target.value.split(/[,\s]+/).map(Number).filter(n => Number.isFinite(n) && n > 0)
        if (arr.length) save({ [k]: arr })
      }}
      className={`w-32 rounded-md border border-[#D2D1C7] px-2 py-1 text-[13px] ${FOCUS}`}
    />
  )
  const auto = s?.bench_autosend_hours as number | null | undefined

  return (
    <Card>
      <CardHeader className="px-4 sm:px-6">
        <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
          <Inbox className="h-4 w-4 sm:h-5 sm:w-5" />
          Candidate desk
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">The timers behind the follow-up engine, and the one thing that may send itself.</CardDescription>
      </CardHeader>
      <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
        {!s ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-4 text-[13.5px]">
            <GoogleMailbox status={s.google_status as GoogleStatus | undefined} account={s.google_account as GoogleAccount | undefined} notice={notice} />
            <div className="rounded-lg border p-3 sm:p-4">
              <p className="font-medium">Bench note may send itself</p>
              <p className="mt-1 text-[12.5px] text-[#6E6E68]">When a card suggests "bench" and you have not reacted, the note to the owner goes on its own after this many hours. Off by default; turn on when you travel.</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {[null, 24, 48, 72].map(h => (
                  <button
                    key={String(h)}
                    type="button"
                    onClick={() => save({ bench_autosend_hours: h })}
                    className={`rounded-full border px-3 py-1 text-[12.5px] font-semibold ${FOCUS} ${(auto ?? null) === h ? 'border-[#1F3A2F] bg-[#E7EDE9] text-[#1F3A2F]' : 'border-[#D2D1C7]'}`}
                  >
                    {h === null ? 'Off' : `${h} h`}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="rounded-lg border p-3">
                <span className="block font-medium">Referrer nudges, days after the ask</span>
                <span className="mt-1 block text-[12.5px] text-[#6E6E68]">nudge 1, nudge 2, then you are asked</span>
                <div className="mt-2">{numList('referrer_nudge_days', [3, 7, 12])}</div>
              </label>
              <label className="rounded-lg border p-3">
                <span className="block font-medium">Candidate nudges, days after the email</span>
                <span className="mt-1 block text-[12.5px] text-[#6E6E68]">one nudge, then you are asked</span>
                <div className="mt-2">{numList('candidate_nudge_days', [4, 10])}</div>
              </label>
              <label className="rounded-lg border p-3">
                <span className="block font-medium">Hiring manager chase, hours after the blurb</span>
                <span className="mt-1 block text-[12.5px] text-[#6E6E68]">nudge, then you are asked</span>
                <div className="mt-2">{numList('hm_chase_hours', [48, 120])}</div>
              </label>
              <label className="rounded-lg border p-3">
                <span className="block font-medium">Decision reminders, days after the card</span>
                <span className="mt-1 block text-[12.5px] text-[#6E6E68]">first reminder, then weekly</span>
                <div className="mt-2">{numList('decision_reminder_days', [2, 7])}</div>
              </label>
            </div>
            {msg && <p className="text-[12.5px] text-[#6E6E68]">{msg}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
