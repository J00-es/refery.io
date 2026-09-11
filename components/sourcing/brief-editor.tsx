'use client'

/**
 * Lily's edits on the profile: each one is an override with her name, the
 * time and a reason, kept on top of every later version. A requirement can
 * flip between must and prefer, or be removed; the two prose fields can be
 * rewritten; the search lists can be replaced.
 */

import { useState } from 'react'
import { FIELD } from '@/lib/desk-ui'
import { Note, useSourcing } from '@/components/sourcing/actions'

const SMALL = 'inline-flex min-h-[30px] items-center justify-center gap-1 rounded-full border border-[#D2D1C7] bg-white px-2.5 text-[12px] font-semibold text-[#161613] hover:border-[#1F3A2F] disabled:opacity-50'
const SMALL_PRIMARY = 'inline-flex min-h-[30px] items-center justify-center gap-1 rounded-full bg-[#1F3A2F] px-2.5 text-[12px] font-semibold text-white hover:bg-[#142E24] disabled:opacity-50'

export function RequirementToggle({ briefId, reqKey, mandatory }: { briefId: string; reqKey: string; mandatory: boolean }) {
  const { run, pending, note } = useSourcing()
  return (
    <span className="inline-flex items-center gap-1.5">
      <button type="button" disabled={pending} className={SMALL} title="Flip between must and prefer" onClick={() => void run('brief.override', { briefId, path: `requirements.${reqKey}.mandatory`, value: !mandatory, reason: 'flipped on the page' })}>
        {mandatory ? 'must' : 'prefer'}
      </button>
      <button type="button" disabled={pending} className={SMALL} title="Remove this requirement" onClick={() => void run('brief.override', { briefId, path: `requirements.${reqKey}`, value: null, reason: 'removed on the page' })}>
        remove
      </button>
      <Note text={note} />
    </span>
  )
}

export function ProseOverride({ briefId, path, value, label }: { briefId: string; path: string; value: string; label: string }) {
  const { run, pending, note } = useSourcing()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(value)
  const [reason, setReason] = useState('')
  if (!open)
    return (
      <button type="button" className={SMALL} onClick={() => setOpen(true)}>
        Edit {label}
      </button>
    )
  return (
    <div className="mt-2 space-y-2">
      <textarea className={`${FIELD} min-h-[120px] text-[14px]`} value={text} onChange={e => setText(e.target.value)} />
      <div className="flex flex-wrap items-center gap-2">
        <input className={`${FIELD} mt-0 w-[280px] py-1.5 text-[13px]`} placeholder="Why (kept with your name)" value={reason} onChange={e => setReason(e.target.value)} />
        <button type="button" disabled={pending} className={SMALL_PRIMARY} onClick={() => void run('brief.override', { briefId, path, value: text, reason }).then(() => setOpen(false))}>
          Save
        </button>
        <button type="button" className={SMALL} onClick={() => setOpen(false)}>
          Cancel
        </button>
        <Note text={note} />
      </div>
    </div>
  )
}

export function ListOverride({ briefId, path, values, label }: { briefId: string; path: string; values: string[]; label: string }) {
  const { run, pending, note } = useSourcing()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(values.join('\n'))
  if (!open)
    return (
      <button type="button" className={SMALL} onClick={() => setOpen(true)}>
        Edit {label}
      </button>
    )
  return (
    <div className="mt-2 space-y-2">
      <textarea className={`${FIELD} min-h-[100px] text-[13.5px]`} value={text} onChange={e => setText(e.target.value)} placeholder="One per line" />
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          className={SMALL_PRIMARY}
          onClick={() => void run('brief.override', { briefId, path, value: text.split('\n').map(s => s.trim()).filter(Boolean), reason: `edited ${label} on the page` }).then(() => setOpen(false))}
        >
          Save
        </button>
        <button type="button" className={SMALL} onClick={() => setOpen(false)}>
          Cancel
        </button>
        <Note text={note} />
      </div>
    </div>
  )
}

/** Employers are objects; the list editor takes "Name, domain" lines. */
export function EmployerOverride({ briefId, values }: { briefId: string; values: { name: string; domain: string | null; why: string }[] }) {
  const { run, pending, note } = useSourcing()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(values.map(v => `${v.name}${v.domain ? `, ${v.domain}` : ''}`).join('\n'))
  if (!open)
    return (
      <button type="button" className={SMALL} onClick={() => setOpen(true)}>
        Edit employers
      </button>
    )
  const parse = () =>
    text
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .map(l => {
        const [name, domain] = l.split(',').map(s => s.trim())
        const prev = values.find(v => v.name.toLowerCase() === name.toLowerCase())
        return { name, domain: domain || prev?.domain || null, why: prev?.why ?? 'added on the page' }
      })
  return (
    <div className="mt-2 space-y-2">
      <textarea className={`${FIELD} min-h-[120px] text-[13.5px]`} value={text} onChange={e => setText(e.target.value)} placeholder="Name, domain (one per line)" />
      <div className="flex items-center gap-2">
        <button type="button" disabled={pending} className={SMALL_PRIMARY} onClick={() => void run('brief.override', { briefId, path: 'employers', value: parse(), reason: 'edited employers on the page' }).then(() => setOpen(false))}>
          Save
        </button>
        <button type="button" className={SMALL} onClick={() => setOpen(false)}>
          Cancel
        </button>
        <Note text={note} />
      </div>
    </div>
  )
}
