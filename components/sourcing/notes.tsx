'use client'

/**
 * Notes on a seat: market research pasted from Claude Desktop or ChatGPT, a
 * founder's aside, a correction. Each becomes a source the next profile
 * build reads and cites.
 */

import { useState } from 'react'
import { FIELD, FIELD_LABEL } from '@/lib/desk-ui'
import { ActionButton, Note, useSourcing } from '@/components/sourcing/actions'

const SMALL_PRIMARY = 'inline-flex min-h-[34px] items-center justify-center gap-1.5 rounded-full bg-[#1F3A2F] px-3 text-[13px] font-semibold text-white hover:bg-[#142E24] disabled:opacity-50'

export function AddNoteForm({ jobId }: { jobId: string }) {
  const { run, pending, note } = useSourcing()
  const [kind, setKind] = useState<'market' | 'note'>('market')
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  return (
    <form
      className="space-y-2"
      onSubmit={e => {
        e.preventDefault()
        void run('note.add', { jobId, kind, title, text }, 'Saved. Press "Rebuild from sources" to read it into the profile.').then(r => {
          if (!r.error) {
            setTitle('')
            setText('')
          }
        })
      }}
    >
      <div className="flex flex-wrap gap-2">
        <select className={`${FIELD} mt-0 w-[220px] py-2 text-[13.5px]`} value={kind} onChange={e => setKind(e.target.value as 'market' | 'note')}>
          <option value="market">Market research (pasted)</option>
          <option value="note">A note or correction</option>
        </select>
        <input className={`${FIELD} mt-0 flex-1 py-2 text-[13.5px]`} placeholder="Title, optional: 'ChatGPT, 12 Sep: comp and talent pools'" value={title} onChange={e => setTitle(e.target.value)} />
      </div>
      <label className="block">
        <span className={FIELD_LABEL}>Text</span>
        <textarea className={`${FIELD} min-h-[140px] text-[13.5px]`} placeholder="Paste the whole answer. It is read as claims, attributed to you, and cited in the profile." value={text} onChange={e => setText(e.target.value)} />
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending || text.trim().length < 20} className={SMALL_PRIMARY}>
          Save note
        </button>
        <Note text={note} />
      </div>
    </form>
  )
}

export function DeleteNote({ noteId }: { noteId: string }) {
  return (
    <ActionButton op="note.delete" payload={{ noteId }} kind="text" confirm="Remove this note? The next rebuild will not read it.">
      remove
    </ActionButton>
  )
}
