'use client'

import { useEffect, useState } from 'react'
import type { ApplyAnswers } from '@/lib/apply/options'
import { saysLine } from '@/lib/apply/options'
import { profileColumnsFromClient } from '@/components/apply/profile-columns'
import { RolesFields, WantsFields } from '@/components/apply/answer-fields'
import type { ProfileStatus } from '@/lib/apply/profile'

/** Status, what you told us (editable), pause, delete. One-tap links from CS6 land here with ?do=. */

const PILL: Record<ProfileStatus['key'], string> = {
  reading: 'bg-[#E7EDF2] text-[#3F5A70]',
  kept: 'bg-[#E7EDE9] text-[#1F3A2F]',
  talking: 'bg-[#E7EDE9] text-[#1F3A2F]',
  closed: 'bg-[#EAE9E1] text-[#2A2A26]',
  paused: 'bg-[#F5EEDD] text-[#8A6A1F]',
  deleted: 'bg-[#FBEDEB] text-[#A3423A]',
}

const Row = ({ l, r }: { l: string; r: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-3 border-t border-[#E4E3DC] py-2.5 text-[13px] first:border-t-0">
    <span className="text-[#6E6E68]">{l}</span>
    <span className="text-right">{r}</span>
  </div>
)

export function ProfileEditor({ token, initialStatus, initialAnswers, sharedCount, keptUntil, cv, initialAction }: { token: string; initialStatus: ProfileStatus; initialAnswers: ApplyAnswers; sharedCount: number; keptUntil: string | null; cv: string | null; initialAction: 'looking' | 'pause' | 'delete' | null }) {
  const [status, setStatus] = useState(initialStatus)
  const [answers, setAnswers] = useState(initialAnswers)
  const [draft, setDraft] = useState<ApplyAnswers | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(initialAction === 'delete')
  const [gone, setGone] = useState(status.key === 'deleted')

  async function act(action: 'pause' | 'resume' | 'renew' | 'delete') {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/me/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Could not save that.')
      setMsg(json.message ?? null)
      if (action === 'delete') setGone(true)
      else if (action === 'pause') setStatus({ key: 'paused', label: 'Paused', detail: 'Nothing is suggested to you until you resume.' })
      else setStatus({ key: 'kept', label: 'Kept in mind', detail: 'You hear from Lily when a search fits what you told us.' })
      setConfirmDelete(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (initialAction === 'looking') void act('renew')
    if (initialAction === 'pause') void act('pause')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function save() {
    if (!draft || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/me/${token}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers: draft }) })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Could not save that.')
      setAnswers(draft)
      setDraft(null)
      setMsg('Saved. The match re-runs today.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that.')
    } finally {
      setBusy(false)
    }
  }

  if (gone) {
    return <section className="mt-5 rounded-[16px] border border-[#E4E3DC] bg-white p-5 text-[14px]">{msg ?? 'Your CV and answers are deleted.'} Thank you for having considered Refery.</section>
  }

  const says = saysLine(profileColumnsFromClient(answers))

  return (
    <div className="mt-5 grid gap-3">
      {msg && <p className="rounded-[12px] bg-[#E7EDE9] px-4 py-3 text-[13.5px] text-[#1F3A2F]">{msg}</p>}
      {error && <p className="rounded-[12px] bg-[#FBEDEB] px-4 py-3 text-[13.5px] text-[#A3423A]">{error}</p>}

      <section className="rounded-[14px] border border-[#E4E3DC] bg-white px-4 py-1">
        <Row l="Status" r={<span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${PILL[status.key]}`}>{status.label}</span>} />
        <Row l="Shared with a company" r={sharedCount === 0 ? 'Never, so far' : `${sharedCount} time${sharedCount === 1 ? '' : 's'}, each with your yes`} />
        <Row l="Profile kept until" r={keptUntil ? `${keptUntil}, unless you say otherwise` : 'not set'} />
      </section>
      <p className="px-1 text-[12.5px] text-[#6E6E68]">{status.detail}</p>

      <section className="rounded-[14px] border border-[#E4E3DC] bg-white p-4">
        <div className="flex items-center justify-between">
          <p className="text-[14px] font-semibold">What you told us</p>
          {!draft && <button type="button" onClick={() => setDraft(answers)} className="text-[12.5px] font-semibold text-[#1F3A2F]">Edit</button>}
        </div>
        {draft ? (
          <div className="mt-3 grid gap-4">
            <WantsFields value={draft} onChange={setDraft} />
            <RolesFields value={draft} onChange={setDraft} />
            <button type="button" onClick={save} disabled={busy} className="min-h-[48px] rounded-full bg-[#1F3A2F] text-[14px] font-semibold text-white disabled:opacity-60">{busy ? 'Saving' : 'Save'}</button>
            <button type="button" onClick={() => setDraft(null)} disabled={busy} className="min-h-[44px] rounded-full border border-[#D2D1C7] bg-white text-[13px] font-semibold">Cancel</button>
          </div>
        ) : (
          <>
            <p className="mt-2 text-[13px] text-[#2A2A26]">{says || 'Nothing yet.'}</p>
            {answers.neverCompanies && <p className="mt-1 text-[12.5px] text-[#6E6E68]">Never: {answers.neverCompanies}</p>}
            {answers.notes && <p className="mt-1 text-[12.5px] text-[#6E6E68]">&ldquo;{answers.notes}&rdquo;</p>}
            <p className="mt-2 text-[12px] text-[#9C9C95]">Changing any of these re-runs the match the same day.</p>
          </>
        )}
      </section>

      <section className="rounded-[14px] border border-[#E4E3DC] bg-white p-4">
        <p className="text-[14px] font-semibold">Your CV</p>
        <p className="mt-1 text-[13px] text-[#6E6E68]">{cv ?? 'on file'}. To replace it, email the new PDF to lily@refery.io from this address.</p>
      </section>

      <section className="grid gap-3 rounded-[14px] border border-[#E4E3DC] bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div><p className="text-[14px] font-semibold">{status.key === 'paused' ? 'Resume matching' : 'Pause matching'}</p><p className="text-[12px] text-[#6E6E68]">{status.key === 'paused' ? 'You hear from Lily again when a search fits.' : 'Nothing suggested until you come back.'}</p></div>
          <button type="button" disabled={busy} onClick={() => act(status.key === 'paused' ? 'resume' : 'pause')} className="min-h-[40px] rounded-full border border-[#D2D1C7] bg-white px-4 text-[13px] font-semibold">{status.key === 'paused' ? 'Resume' : 'Pause'}</button>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-[#E4E3DC] pt-3">
          <div><p className="text-[14px] font-semibold">Delete my profile</p><p className="text-[12px] text-[#6E6E68]">CV and answers gone within 30 days. No questions.</p></div>
          {confirmDelete ? (
            <button type="button" disabled={busy} onClick={() => act('delete')} className="min-h-[40px] rounded-full bg-[#A3423A] px-4 text-[13px] font-semibold text-white">Yes, delete</button>
          ) : (
            <button type="button" disabled={busy} onClick={() => setConfirmDelete(true)} className="min-h-[40px] rounded-full border border-[#D2D1C7] bg-white px-4 text-[13px] font-semibold text-[#A3423A]">Delete</button>
          )}
        </div>
        {confirmDelete && <p className="text-[12.5px] text-[#A3423A]">This cannot be undone. Tap &ldquo;Yes, delete&rdquo; to confirm, or anything else to keep your profile.</p>}
      </section>
    </div>
  )
}
