'use client'

/**
 * The sourcing desk's buttons. Every one posts one verb to /api/sourcing,
 * shows what came back in a line of text, and refreshes the page. No client
 * state outlives the refresh: the database is the record.
 */

import { useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { BTN_PRIMARY, BTN_QUIET, BTN_TEXT, FIELD } from '@/lib/desk-ui'

type Result = { ok?: boolean; error?: string } & Record<string, unknown>

/**
 * A result line from a template: `{key}` is the value the API returned, and
 * any `skipped` or `notes` array is appended so a server page never has to
 * pass a function across the client boundary.
 */
export function formatResult(template: string | undefined, r: Result): string {
  let text = template ? template.replace(/\{([a-zA-Z_]+)\}/g, (_, k: string) => (r[k] === undefined || r[k] === null ? '' : String(r[k]))) : 'Done'
  const skipped = r.skipped as { name: string; why: string }[] | undefined
  if (Array.isArray(skipped) && skipped.length) text += ` Not included: ${skipped.map(x => `${x.name} (${x.why})`).join('; ')}.`
  const notes = r.notes as string[] | undefined
  if (Array.isArray(notes) && notes.length) text += ` ${notes.join(' ')}`
  if (r.already) text = 'Already approved; nothing more was queued.'
  return text.trim()
}

export function useSourcing() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [note, setNote] = useState<string | null>(null)
  const run = (op: string, payload: Record<string, unknown>, describe?: string) =>
    new Promise<Result>(resolve => {
      start(async () => {
        setNote('Working')
        try {
          const res = await fetch('/api/sourcing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op, ...payload }) })
          const r = (await res.json()) as Result
          setNote(r.error ? `Did not work: ${r.error}` : formatResult(describe, r))
          router.refresh()
          resolve(r)
        } catch (err) {
          setNote(`Did not work: ${err instanceof Error ? err.message : 'network error'}`)
          resolve({ error: 'network' })
        }
      })
    })
  return { run, pending, note, setNote }
}

const SMALL = 'inline-flex min-h-[34px] items-center justify-center gap-1.5 rounded-full border border-[#D2D1C7] bg-white px-3 text-[13px] font-semibold text-[#161613] transition-colors hover:border-[#1F3A2F] disabled:opacity-50'
const SMALL_PRIMARY = 'inline-flex min-h-[34px] items-center justify-center gap-1.5 rounded-full bg-[#1F3A2F] px-3 text-[13px] font-semibold text-white transition-colors hover:bg-[#142E24] disabled:opacity-50'

export function Note({ text }: { text: string | null }) {
  if (!text) return null
  return <span className="text-[12.5px] text-[#6E6E68]">{text}</span>
}

export function ActionButton({
  op,
  payload,
  children,
  kind = 'quiet',
  confirm,
  describe,
  className,
}: {
  op: string
  payload: Record<string, unknown>
  children: ReactNode
  kind?: 'primary' | 'quiet' | 'small' | 'small-primary' | 'text'
  confirm?: string
  /** A template for the result line: "Drafted v{version}". */
  describe?: string
  className?: string
}) {
  const { run, pending, note } = useSourcing()
  const cls = kind === 'primary' ? BTN_PRIMARY : kind === 'quiet' ? BTN_QUIET : kind === 'small' ? SMALL : kind === 'small-primary' ? SMALL_PRIMARY : BTN_TEXT
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        className={`${cls} ${className ?? ''}`}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return
          void run(op, payload, describe)
        }}
      >
        {pending ? 'Working' : children}
      </button>
      <Note text={note} />
    </span>
  )
}

/** A button that needs a reason first: "Not a fit" and "Stop". */
export function ReasonButton({ op, payload, label, placeholder, kind = 'small' }: { op: string; payload: Record<string, unknown>; label: string; placeholder: string; kind?: 'small' | 'text' }) {
  const { run, pending, note } = useSourcing()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  if (!open)
    return (
      <span className="inline-flex items-center gap-2">
        <button type="button" className={kind === 'small' ? SMALL : BTN_TEXT} onClick={() => setOpen(true)}>
          {label}
        </button>
        <Note text={note} />
      </span>
    )
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <input className={`${FIELD} mt-0 w-[260px] py-1.5 text-[13px]`} placeholder={placeholder} value={reason} onChange={e => setReason(e.target.value)} autoFocus />
      <button
        type="button"
        disabled={pending || reason.trim().length < 3}
        className={SMALL_PRIMARY}
        onClick={() => {
          void run(op, { ...payload, reason: reason.trim() }).then(() => setOpen(false))
        }}
      >
        {pending ? 'Working' : label}
      </button>
      <button type="button" className={BTN_TEXT} onClick={() => setOpen(false)}>
        Cancel
      </button>
      <Note text={note} />
    </span>
  )
}

export function PoolRowActions({ poolId, jobId, decision, relocation }: { poolId: string; jobId: string; decision: string; relocation: string }) {
  const { run, pending, note } = useSourcing()
  return (
    <div className="flex flex-wrap items-center gap-2">
      {decision !== 'ready' && (
        <button type="button" disabled={pending} className={SMALL_PRIMARY} onClick={() => void run('pool.decide', { jobId, poolIds: [poolId], decision: 'ready' })}>
          Ready
        </button>
      )}
      {decision !== 'held' && (
        <button type="button" disabled={pending} className={SMALL} onClick={() => void run('pool.decide', { jobId, poolIds: [poolId], decision: 'held' })}>
          Hold
        </button>
      )}
      {decision !== 'not_fit' && <ReasonButton op="pool.decide" payload={{ jobId, poolIds: [poolId], decision: 'not_fit' }} label="Not a fit" placeholder="Why, in a few words (it teaches the next run)" />}
      {decision !== 'none' && (
        <button type="button" disabled={pending} className={BTN_TEXT} onClick={() => void run('pool.decide', { jobId, poolIds: [poolId], decision: 'none' })}>
          Undo
        </button>
      )}
      <label className="ml-2 inline-flex items-center gap-1.5 text-[12.5px] text-[#6E6E68]">
        Relocation
        <select className="rounded-md border border-[#D2D1C7] bg-white px-1.5 py-1 text-[12.5px]" defaultValue={relocation} onChange={e => void run('pool.relocation', { poolId, relocation: e.target.value })}>
          <option value="unknown">unknown</option>
          <option value="willing">willing</option>
          <option value="unwilling">unwilling</option>
        </select>
      </label>
      <Note text={note} />
    </div>
  )
}

export function AddPersonForm({ jobId }: { jobId: string }) {
  const { run, pending, note } = useSourcing()
  const [name, setName] = useState('')
  const [linkedin, setLinkedin] = useState('')
  const [email, setEmail] = useState('')
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={e => {
        e.preventDefault()
        void run('person.add', { jobId, name, linkedin, email }, 'Added: {added}').then(() => {
          setName('')
          setLinkedin('')
          setEmail('')
        })
      }}
    >
      <input className={`${FIELD} mt-0 w-[200px] py-2 text-[13.5px]`} placeholder="Full name" value={name} onChange={e => setName(e.target.value)} required />
      <input className={`${FIELD} mt-0 w-[280px] py-2 text-[13.5px]`} placeholder="LinkedIn URL (Apollo resolves it)" value={linkedin} onChange={e => setLinkedin(e.target.value)} />
      <input className={`${FIELD} mt-0 w-[220px] py-2 text-[13.5px]`} placeholder="Email, if you have one" value={email} onChange={e => setEmail(e.target.value)} />
      <button type="submit" disabled={pending || !name.trim()} className={SMALL}>
        Add a person
      </button>
      <Note text={note} />
    </form>
  )
}

export function RunActions({ runId, state }: { runId: string; state: string }) {
  const live = ['queued', 'active', 'ooo'].includes(state)
  const resumable = state === 'paused' || state === 'error'
  return (
    <div className="flex flex-wrap items-center gap-2">
      {live && (
        <ActionButton op="run.pause" payload={{ runId }} kind="small">
          Pause
        </ActionButton>
      )}
      {resumable && (
        <ActionButton op="run.resume" payload={{ runId }} kind="small">
          Resume
        </ActionButton>
      )}
      {(live || resumable) && <ReasonButton op="run.stop" payload={{ runId }} label="Stop" placeholder="Why" />}
    </div>
  )
}

export function SuppressForm() {
  const { run, pending, note } = useSourcing()
  const [email, setEmail] = useState('')
  const [reason, setReason] = useState('')
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={e => {
        e.preventDefault()
        void run('suppress', { email, reason }, 'On the never list').then(() => {
          setEmail('')
          setReason('')
        })
      }}
    >
      <input className={`${FIELD} mt-0 w-[240px] py-2 text-[13.5px]`} placeholder="email@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
      <input className={`${FIELD} mt-0 w-[260px] py-2 text-[13.5px]`} placeholder="Why" value={reason} onChange={e => setReason(e.target.value)} />
      <button type="submit" disabled={pending || !email.includes('@')} className={SMALL}>
        Never write to this address
      </button>
      <Note text={note} />
    </form>
  )
}
