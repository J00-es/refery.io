'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, Loader2, Mail, Send, X } from 'lucide-react'
import { CARD, FOCUS, avatarTint, initialsOf, relativeTime } from '@/lib/candidate-ui'

interface Draft {
  id: string
  candidate_id: string
  candidate_name: string
  recipient_email: string
  recipient_name: string | null
  subject: string
  grade: string | null
  status: string
  created_at: string
  send_error: string | null
}

const TABS = [
  { key: 'draft', label: 'Awaiting review' },
  { key: 'sent', label: 'Sent' },
  { key: 'dismissed', label: 'Dismissed' },
  { key: 'failed', label: 'Failed' },
] as const

function gradeTint(grade: string | null) {
  const g = (grade || '').toUpperCase()
  if (g.startsWith('PASS')) return 'bg-[#F7EDEC] text-[#9C4038]'
  if (g.startsWith('A')) return 'bg-[#E7EDE9] text-[#1F3A2F]'
  if (g.startsWith('B')) return 'bg-[#F5EEDD] text-[#8A6A1F]'
  return 'bg-[#EAE9E1] text-[#6E6E68]'
}

export function BriefReview() {
  const [tab, setTab] = useState<string>('draft')
  const [drafts, setDrafts] = useState<Draft[] | null>(null)
  const [selected, setSelected] = useState<Draft | null>(null)
  const [html, setHtml] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async (status: string) => {
    setDrafts(null)
    setSelected(null)
    setHtml(null)
    const r = await fetch(`/api/brief-drafts?status=${status}`)
    const d = await r.json()
    setDrafts(d.drafts ?? [])
  }, [])

  useEffect(() => { load(tab) }, [tab, load])

  async function open(d: Draft) {
    setSelected(d)
    setHtml(null)
    const r = await fetch(`/api/brief-drafts/${d.id}`)
    const j = await r.json()
    setHtml(j.draft?.html_body ?? '<p>Could not load preview.</p>')
  }

  async function act(action: 'send' | 'dismiss') {
    if (!selected) return
    setBusy(true)
    setNotice(null)
    try {
      const r = await fetch(`/api/brief-drafts/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const j = await r.json()
      if (!r.ok) {
        setNotice(j.error || 'Something went wrong.')
      } else {
        setNotice(action === 'send' ? `Sent to ${selected.recipient_email}` : 'Dismissed')
        setDrafts(prev => (prev ?? []).filter(d => d.id !== selected.id))
        setSelected(null)
        setHtml(null)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 border-b border-[#E4E3DC]">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`relative px-3 pb-2.5 pt-2 text-[13.5px] font-medium transition-colors ${FOCUS} ${
              tab === t.key ? 'text-[#161613]' : 'text-[#9C9C95] hover:text-[#6E6E68]'
            }`}
          >
            {t.label}
            {tab === t.key && (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[#1F3A2F]" />
            )}
          </button>
        ))}
      </div>

      {notice && (
        <div className="rounded-[12px] border border-[#E4E3DC] bg-[#FAF9F5] px-4 py-2.5 text-[13px] text-[#161613]">
          {notice}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        {/* queue */}
        <div className={`${CARD} divide-y divide-[#E4E3DC] overflow-hidden`}>
          {drafts === null ? (
            <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-[#9C9C95]">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading
            </div>
          ) : drafts.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <Mail className="mx-auto mb-3 h-5 w-5 text-[#9C9C95]" />
              <p className="text-[14px] font-medium text-[#161613]">Nothing here</p>
              <p className="mt-1 text-[13px] text-[#6E6E68]">
                {tab === 'draft'
                  ? 'The nightly run drafts a brief for each newly graded candidate.'
                  : 'No briefs in this state yet.'}
              </p>
            </div>
          ) : (
            drafts.map(d => (
              <button
                key={d.id}
                onClick={() => open(d)}
                className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[#FAF9F5] ${FOCUS} ${
                  selected?.id === d.id ? 'bg-[#FAF9F5]' : ''
                }`}
              >
                <span
                  aria-hidden
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-[12px] font-semibold ${avatarTint(d.candidate_name)}`}
                >
                  {initialsOf(d.candidate_name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[14px] font-semibold text-[#161613]">
                      {d.candidate_name}
                    </span>
                    {d.grade && (
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold ${gradeTint(d.grade)}`}>
                        {d.grade}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-[12.5px] text-[#6E6E68]">
                    to {d.recipient_email}
                  </span>
                  {d.send_error && (
                    <span className="mt-0.5 block truncate text-[12px] text-[#9C4038]">
                      {d.send_error}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-[12px] text-[#9C9C95]">
                  {relativeTime(d.created_at)}
                </span>
              </button>
            ))
          )}
        </div>

        {/* preview */}
        <div className={`${CARD} overflow-hidden`}>
          {!selected ? (
            <div className="grid h-full min-h-[320px] place-items-center px-6 text-center">
              <p className="text-[13.5px] text-[#6E6E68]">
                Pick a brief to read it exactly as the recipient will.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E4E3DC] px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold text-[#161613]">{selected.subject}</p>
                  <p className="mt-0.5 truncate text-[12.5px] text-[#6E6E68]">
                    To {selected.recipient_email} ·{' '}
                    <Link href={`/candidates/${selected.candidate_id}`} className="underline underline-offset-2">
                      open candidate
                    </Link>
                  </p>
                </div>
                {selected.status === 'draft' && (
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => act('dismiss')}
                      disabled={busy}
                      className={`flex h-10 items-center gap-1.5 rounded-full border border-[#D2D1C7] px-3.5 text-[13.5px] font-medium text-[#161613] transition-colors hover:border-[#9C9C95] disabled:opacity-50 ${FOCUS}`}
                    >
                      <X className="h-4 w-4" /> Dismiss
                    </button>
                    <button
                      onClick={() => act('send')}
                      disabled={busy}
                      className={`flex h-10 items-center gap-1.5 rounded-full bg-[#1F3A2F] px-4 text-[13.5px] font-semibold text-white transition-colors hover:bg-[#142E24] disabled:opacity-50 ${FOCUS}`}
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Send
                    </button>
                  </div>
                )}
                {selected.status === 'sent' && (
                  <span className="flex items-center gap-1.5 text-[13px] font-medium text-[#1F3A2F]">
                    <Check className="h-4 w-4" /> Sent
                  </span>
                )}
              </div>
              {/* Sandboxed: the body is generated HTML and is rendered here
                  purely for review, so it gets no script access to the app. */}
              {html === null ? (
                <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-[#9C9C95]">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading preview
                </div>
              ) : (
                <iframe
                  title="Brief preview"
                  sandbox=""
                  srcDoc={html}
                  className="h-[70vh] w-full border-0 bg-white"
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
