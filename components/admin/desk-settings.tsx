'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Inbox } from 'lucide-react'
import { FOCUS } from '@/lib/candidate-ui'

/**
 * The timers the desk runs on, and the one automation that is off by default.
 */
export function DeskSettings() {
  const [s, setS] = useState<Record<string, unknown> | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

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
