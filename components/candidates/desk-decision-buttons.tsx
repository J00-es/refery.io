'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { FOCUS } from '@/lib/candidate-ui'
import type { JourneyStage } from '@/lib/journey'

/**
 * The same three decisions the Slack card takes, from the profile. The email
 * goes the moment the button is pressed, exactly as a reaction would send it,
 * and the Slack thread is told.
 */
export function DeskDecisionButtons({ candidateId, journeyStage, hasPanel }: { candidateId: string; journeyStage: JourneyStage; hasPanel: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [askReason, setAskReason] = useState(false)

  const decidable = ['uploaded', 'calibrating', 'decision_pending', 'ready_for_intro', 'bench', 'not_fit', 'dormant'].includes(journeyStage)

  async function post(path: string, body: Record<string, unknown>, key: string) {
    setBusy(key)
    setMsg(null)
    try {
      const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string }
      setMsg(data.message ?? data.error ?? (res.ok ? 'Done.' : 'Something went wrong.'))
      if (res.ok) {
        setAskReason(false)
        router.refresh()
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(null)
    }
  }

  const btn = (cls: string) => `inline-flex min-h-[38px] items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold transition-colors disabled:opacity-50 ${FOCUS} ${cls}`

  return (
    <div className="mt-4 border-t border-[#E4E3DC] pt-4">
      <div className="flex flex-wrap items-center gap-2">
        {hasPanel && decidable && (
          <>
            <button type="button" disabled={!!busy} className={btn('bg-[#1F3A2F] text-white hover:bg-[#142E24]')} onClick={() => post(`/api/candidates/${candidateId}/decision`, { decision: 'intro_now' }, 'intro_now')}>
              {busy === 'intro_now' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}🔥 Intro now
            </button>
            <button type="button" disabled={!!busy} className={btn('border border-[#1F3A2F] text-[#1F3A2F] hover:bg-[#E7EDE9]')} onClick={() => post(`/api/candidates/${candidateId}/decision`, { decision: 'bench' }, 'bench')}>
              {busy === 'bench' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}👍 Bench
            </button>
            <button type="button" disabled={!!busy} className={btn('border border-[#D2D1C7] text-[#161613] hover:border-[#C2544B] hover:text-[#C2544B]')} onClick={() => setAskReason(v => !v)}>
              👎 Not a fit
            </button>
          </>
        )}
        <button type="button" disabled={!!busy} className={btn('border border-[#D2D1C7] text-[#6E6E68] hover:border-[#9C9C95]')} onClick={() => post(`/api/candidates/${candidateId}/panel`, {}, 'panel')}>
          {busy === 'panel' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {hasPanel ? 'Run the panel again' : 'Run the panel'}
        </button>
      </div>
      {askReason && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="One line on why. The owner reads it. Leave blank to use the panel's draft."
            className={`flex-1 rounded-[12px] border border-[#D2D1C7] px-3 py-2 text-[13.5px] ${FOCUS}`}
          />
          <button type="button" disabled={!!busy} className={btn('bg-[#C2544B] text-white hover:bg-[#A8453D]')} onClick={() => post(`/api/candidates/${candidateId}/decision`, { decision: 'not_fit', reason: reason.trim() || null }, 'not_fit')}>
            {busy === 'not_fit' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Send the note
          </button>
        </div>
      )}
      {msg && <p className="mt-2 text-[12.5px] text-[#6E6E68]">{msg}</p>}
    </div>
  )
}
