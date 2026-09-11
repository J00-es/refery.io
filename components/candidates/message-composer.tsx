'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Mail } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { FOCUS } from '@/lib/desk-ui'

/**
 * Write to a candidate, in the partner's name, from their page.
 *
 * One sheet, seven moments. The route decides what is possible and fills the
 * draft; every word is editable here. From is fixed ("Name via Refery"), the
 * reply goes to the partner's own inbox, and "Open in Gmail instead" carries
 * the same draft into Gmail for anyone who wants their own Sent folder.
 */

type MomentKey = 'received' | 'consent' | 'intro' | 'interview' | 'pass' | 'hired' | 'blank'

interface DraftResponse {
  first: string
  to: string | null
  from: string
  replyTo: string
  hasSignature: boolean
  blocked: string | null
  suggested: MomentKey
  moments: { key: MomentKey; label: string; unavailable: string | null }[]
  submissions: { id: string; status: string; jobTitle: string; company: string }[]
  draft: { moment: MomentKey; submissionId: string | null; subject: string; body: string; ccLily: boolean; effect: string } | null
  error?: string
}

export function MessageComposer({
  candidateId,
  first,
  hasEmail,
  initialMoment,
  autoOpen = false,
  trigger = 'pill',
  label,
  preview = false,
}: {
  candidateId: string
  first: string
  hasEmail: boolean
  /** The moment the sheet opens on; the route's suggestion otherwise. */
  initialMoment?: MomentKey
  /** Open on mount (from ?write=… on the page). */
  autoOpen?: boolean
  trigger?: 'pill' | 'primary' | 'text' | 'none'
  label?: string
  /** Lily's view of what the partner sees. Nothing here sends. */
  preview?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [moment, setMoment] = useState<MomentKey | null>(initialMoment ?? null)
  const [data, setData] = useState<DraftResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [ccLily, setCcLily] = useState(false)
  const [submissionId, setSubmissionId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [dirty, setDirty] = useState(false)

  const load = useCallback(
    async (m: MomentKey | null, sub?: string | null) => {
      setLoading(true)
      setResult(null)
      try {
        const q = new URLSearchParams()
        if (m) q.set('moment', m)
        if (sub) q.set('submission', sub)
        const res = await fetch(`/api/candidates/${candidateId}/messages?${q.toString()}`)
        const d = (await res.json().catch(() => ({}))) as DraftResponse
        if (!res.ok) {
          setResult({ ok: false, text: d.error ?? 'Could not load the draft.' })
          return
        }
        setData(d)
        const chosen = m ?? d.suggested
        setMoment(chosen)
        if (d.draft) {
          setSubject(d.draft.subject)
          setBody(d.draft.body)
          setCcLily(d.draft.ccLily)
          setSubmissionId(d.draft.submissionId)
        } else {
          setSubject('')
          setBody('')
        }
        setDirty(false)
      } finally {
        setLoading(false)
      }
    },
    [candidateId],
  )

  useEffect(() => {
    if (autoOpen && hasEmail) setOpen(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (open) load(moment)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function pick(m: MomentKey) {
    if (m === moment) return
    if (dirty && !window.confirm('Switch the moment? Your edits to this draft will be replaced.')) return
    load(m)
  }

  async function send() {
    if (preview) {
      setResult({ ok: true, text: 'Preview only. The partner presses this on their side.' })
      return
    }
    if (!moment) return
    setBusy(true)
    setResult(null)
    try {
      const res = await fetch(`/api/candidates/${candidateId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moment, subject, body, ccLily, submissionId }),
      })
      const d = (await res.json().catch(() => ({}))) as { message?: string; error?: string }
      if (!res.ok) {
        setResult({ ok: false, text: d.error ?? 'That did not send.' })
        return
      }
      setResult({ ok: true, text: d.message ?? 'Sent.' })
      setDirty(false)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  const gmailUrl = (() => {
    if (!data?.to) return null
    const q = new URLSearchParams({ view: 'cm', fs: '1', to: data.to, su: subject, body })
    if (ccLily) q.set('cc', 'lily@refery.io')
    return `https://mail.google.com/mail/?${q.toString().replace(/\+/g, '%20')}`
  })()

  const current = data?.moments.find(m => m.key === moment) ?? null
  const cannot = data?.blocked ?? current?.unavailable ?? null
  const sent = result?.ok === true && !preview

  const triggerEl =
    trigger === 'none' ? null : trigger === 'primary' ? (
      <button type="button" disabled={!hasEmail} onClick={() => setOpen(true)} className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-[#1F3A2F] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#142E24] disabled:opacity-50 ${FOCUS}`}>
        <Mail className="h-3.5 w-3.5" />
        {label ?? `Write to ${first}`}
      </button>
    ) : trigger === 'text' ? (
      <button type="button" disabled={!hasEmail} onClick={() => setOpen(true)} className={`text-[13px] font-semibold text-[#1F3A2F] hover:underline disabled:opacity-50 ${FOCUS}`}>
        {label ?? `Write to ${first}`}
      </button>
    ) : (
      <button
        type="button"
        disabled={!hasEmail}
        onClick={() => setOpen(true)}
        title={hasEmail ? undefined : `No email on ${first}'s profile`}
        className={`inline-flex items-center gap-1.5 rounded-full bg-[#1F3A2F] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#142E24] disabled:cursor-not-allowed disabled:opacity-45 ${FOCUS}`}
      >
        <Mail className="h-3.5 w-3.5" />
        {label ?? `Write to ${first}`}
      </button>
    )

  return (
    <>
      {triggerEl}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[560px]">
          <SheetHeader className="border-b border-[#E4E3DC] px-5 py-4">
            <SheetTitle className="text-left text-[19px] font-semibold text-[#161613]">Write to {first}</SheetTitle>
            <p className="text-left text-[13px] text-[#6E6E68]">
              {data ? (
                <>
                  In your name, through Refery. Replies go to <span className="text-[#161613]">{data.replyTo}</span>.
                </>
              ) : (
                'In your name, through Refery.'
              )}
            </p>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {loading && !data ? (
              <p className="text-[13.5px] text-[#6E6E68]">Loading the draft…</p>
            ) : data ? (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-1.5">
                  {data.moments.map(m => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => pick(m.key)}
                      title={m.unavailable ?? undefined}
                      className={`rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${FOCUS} ${
                        m.key === moment ? 'border-[#1F3A2F] bg-[#E7EDE9] text-[#1F3A2F]' : m.unavailable ? 'border-[#E4E3DC] text-[#9C9C95]' : 'border-[#D2D1C7] bg-white text-[#161613] hover:border-[#1F3A2F]'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                {cannot ? (
                  <p className="rounded-[12px] bg-[#F5EEDD] px-3.5 py-2.5 text-[13px] text-[#8A6A1F]">{cannot}</p>
                ) : (
                  <>
                    <dl className="grid grid-cols-[56px_1fr] items-center gap-y-2 text-[13.5px]">
                      <dt className="text-[#9C9C95]">To</dt>
                      <dd className="text-[#161613]">{data.to}</dd>
                      <dt className="text-[#9C9C95]">From</dt>
                      <dd className="text-[#161613]">
                        {data.from} <span className="text-[#9C9C95]">&lt;partners@refery.io&gt;</span>
                      </dd>
                      <dt className="text-[#9C9C95]">Cc</dt>
                      <dd>
                        <label className="inline-flex cursor-pointer items-center gap-2 text-[13.5px] text-[#161613]">
                          <input type="checkbox" checked={ccLily} onChange={e => setCcLily(e.target.checked)} className="h-4 w-4 accent-[#1F3A2F]" />
                          Lily Joo <span className="text-[#9C9C95]">&lt;lily@refery.io&gt;</span>
                        </label>
                      </dd>
                    </dl>

                    {data.submissions.length > 1 && ['consent', 'interview', 'pass', 'hired'].includes(moment ?? '') && (
                      <div>
                        <label className="block text-[13px] font-medium text-[#2A2A26]">About</label>
                        <select
                          value={submissionId ?? ''}
                          onChange={e => load(moment, e.target.value || null)}
                          className="mt-1.5 w-full rounded-[12px] border border-[#D2D1C7] bg-white px-3 py-2.5 text-[14px]"
                        >
                          {data.submissions.map(s => (
                            <option key={s.id} value={s.id}>
                              {s.jobTitle} · {s.company}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="block text-[13px] font-medium text-[#2A2A26]">Subject</label>
                      <input
                        value={subject}
                        onChange={e => {
                          setSubject(e.target.value)
                          setDirty(true)
                        }}
                        className={`mt-1.5 w-full rounded-[12px] border border-[#D2D1C7] bg-white px-3 py-2.5 text-[14.5px] text-[#161613] ${FOCUS}`}
                      />
                    </div>
                    <div>
                      <label className="block text-[13px] font-medium text-[#2A2A26]">Message</label>
                      <textarea
                        value={body}
                        onChange={e => {
                          setBody(e.target.value)
                          setDirty(true)
                        }}
                        rows={14}
                        className={`mt-1.5 w-full rounded-[12px] border border-[#D2D1C7] bg-white px-3 py-2.5 text-[14.5px] leading-relaxed text-[#161613] ${FOCUS}`}
                      />
                      {!data.hasSignature && (
                        <p className="mt-1 text-[12px] text-[#9C9C95]">
                          Save a signature once under <a href="/profile" className="underline underline-offset-2">Profile</a> and it fills in here.
                        </p>
                      )}
                    </div>
                    {data.draft?.effect && (
                      <p className="flex items-start gap-2 text-[12.5px] text-[#6E6E68]">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#1F3A2F]" />
                        <span>{data.draft.effect}</span>
                      </p>
                    )}
                  </>
                )}
                {result && <p className={`text-[13px] ${result.ok ? 'text-[#1F3A2F]' : 'text-[#8A3B2B]'}`} role="alert">{result.text}</p>}
              </div>
            ) : (
              result && <p className="text-[13px] text-[#8A3B2B]">{result.text}</p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E4E3DC] px-5 py-3.5">
            {gmailUrl && !cannot ? (
              <a href={gmailUrl} target="_blank" rel="noreferrer" className={`text-[13px] font-semibold text-[#1F3A2F] hover:underline ${FOCUS}`}>
                Open in Gmail instead
              </a>
            ) : (
              <span />
            )}
            {sent ? (
              <button type="button" onClick={() => setOpen(false)} className={`inline-flex min-h-[44px] items-center rounded-full border border-[#D2D1C7] px-5 text-[14px] font-semibold text-[#161613] ${FOCUS}`}>
                Done
              </button>
            ) : (
              <button
                type="button"
                disabled={busy || loading || !!cannot || !subject.trim() || !body.trim()}
                onClick={send}
                className={`inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[#1F3A2F] px-5 text-[14px] font-semibold text-white transition-colors hover:bg-[#142E24] disabled:opacity-50 ${FOCUS}`}
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Send
              </button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
