'use client'

/**
 * A one-tap answer on the public hiring-manager brief.
 *
 * Today it asks one thing: how they want to receive candidates. The answer is
 * saved against the brief and mirrored onto the client record, and Lily hears
 * about it in Slack the same way she hears about a comment. Tapping again
 * changes the answer; nothing here needs an account.
 */

import { useState } from 'react'
import type { ChoiceBlock } from '@/lib/brief'
import { useBriefComments } from './comments-provider'

export interface BriefAnswer {
  value: string
  authorName: string | null
  updatedAt: string
}

export function BriefChoice({
  slug,
  block,
  initial,
}: {
  slug: string
  block: ChoiceBlock
  initial: BriefAnswer | null
}) {
  const { authorName, rememberName, sessionId } = useBriefComments()
  const [value, setValue] = useState<string | null>(initial?.value ?? null)
  const [busy, setBusy] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function choose(next: string) {
    if (busy) return
    setBusy(next)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch(`/api/b/${slug}/answers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: block.key, value: next, authorName, sessionId }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error ?? 'Could not save that.')
      setValue(next)
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="my-5 rounded-[10px] border border-[#E6E4DC] bg-white px-5 py-4 sm:px-6">
      <p className="text-[14.5px] font-semibold leading-relaxed text-[#161613]">{block.prompt}</p>
      {block.note && <p className="mt-1 text-[13px] leading-relaxed text-[#6E6E68]">{block.note}</p>}

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {block.options.map(o => {
          const active = value === o.value
          return (
            <button
              key={o.value}
              type="button"
              disabled={busy !== null}
              onClick={() => void choose(o.value)}
              aria-pressed={active}
              className={`rounded-[8px] border px-3.5 py-3 text-left transition-colors disabled:cursor-wait ${
                active
                  ? 'border-[#1F3A2F] bg-[#E7EDE9]'
                  : 'border-[#E6E4DC] bg-[#FBFAF7] hover:border-[#1F3A2F]'
              }`}
            >
              <span className="flex items-center gap-2 text-[14px] font-semibold text-[#173B2D]">
                <span
                  aria-hidden
                  className={`inline-block h-3.5 w-3.5 shrink-0 rounded-full border ${
                    active ? 'border-[#1F3A2F] bg-[#1F3A2F]' : 'border-[#C9C8BF] bg-white'
                  }`}
                />
                {busy === o.value ? 'Saving…' : o.label}
              </span>
              {o.detail && <span className="mt-1 block text-[12.5px] leading-snug text-[#6E6E68]">{o.detail}</span>}
            </button>
          )
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <input
          type="text"
          value={authorName}
          onChange={e => rememberName(e.target.value)}
          placeholder="Your name (optional)"
          maxLength={80}
          className="w-full max-w-[260px] rounded-[8px] border border-[#E6E4DC] bg-[#FBFAF7] px-3 py-1.5 text-[13px] text-[#1D1F1D] outline-none placeholder:text-[#A9ADA2] focus:border-[#1F3A2F]"
        />
        {saved && <span className="text-[12.5px] font-medium text-[#1F3A2F]">Saved. Lily has been told.</span>}
        {!saved && value && initial?.value === value && (
          <span className="text-[12.5px] text-[#9C9C95]">Answered. Tap another option to change it.</span>
        )}
        {error && <span className="text-[13px] text-[#B0483C]">{error}</span>}
      </div>
    </div>
  )
}
