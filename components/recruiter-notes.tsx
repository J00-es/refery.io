'use client'

import { useState, useEffect, useCallback } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import type { RecruiterNote } from '@/lib/types'
import { Trash2 } from 'lucide-react'
import { CARD, FOCUS } from '@/lib/candidate-ui'

const NOTE_TYPES = [
  { key: 'general', label: 'General' },
  { key: 'call', label: 'Call' },
  { key: 'feedback', label: 'Feedback' },
  { key: 'salary', label: 'Salary' },
  { key: 'location', label: 'Location' },
  { key: 'availability', label: 'Availability' },
] as const

const TYPE_LABELS: Record<string, string> = Object.fromEntries(
  NOTE_TYPES.map(t => [t.key, t.label])
)

interface RecruiterNotesProps {
  candidateId: string
}

/**
 * Notes are the richest thing on a candidate: 886 of them across the roster,
 * and the panel's write-ups run to full paragraphs. So the list is built for
 * reading — long notes clamp to four lines with an expander rather than pushing
 * everything else off the page, and the six types are quiet chips rather than
 * six badge colours competing down the column.
 */
export function RecruiterNotes({ candidateId }: RecruiterNotesProps) {
  const [notes, setNotes] = useState<RecruiterNote[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdding, setIsAdding] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [noteType, setNoteType] = useState<string>('general')
  const [content, setContent] = useState('')

  const fetchNotes = useCallback(async () => {
    try {
      const res = await fetch(`/api/candidates/${candidateId}/notes`)
      if (res.ok) {
        const data = await res.json()
        setNotes(data.notes)
      }
    } catch (error) {
      console.error('Error fetching notes:', error)
    } finally {
      setLoading(false)
    }
  }, [candidateId])

  useEffect(() => {
    fetchNotes()
  }, [fetchNotes])

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault()
    if (!content.trim()) return

    setIsAdding(true)
    try {
      const res = await fetch(`/api/candidates/${candidateId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note_type: noteType, content }),
      })
      if (res.ok) {
        await fetchNotes()
        setContent('')
        setNoteType('general')
        setShowForm(false)
      }
    } catch (error) {
      console.error('Error adding note:', error)
    } finally {
      setIsAdding(false)
    }
  }

  async function handleDeleteNote(noteId: string) {
    if (!confirm('Delete this note?')) return
    try {
      const res = await fetch(`/api/candidates/${candidateId}/notes/${noteId}`, {
        method: 'DELETE',
      })
      if (res.ok) setNotes(notes.filter(n => n.id !== noteId))
    } catch (error) {
      console.error('Error deleting note:', error)
    }
  }

  return (
    <section className={`${CARD} p-5`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-[#161613]">Notes</h2>
          <p className="text-[12px] text-[#9C9C95]">Private to the team</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(v => !v)}
          className={`shrink-0 rounded-full border border-[#D8D8D0] px-3 py-1.5 text-[12.5px] font-semibold text-[#161613] transition-colors hover:border-[#9C9C95] ${FOCUS}`}
        >
          {showForm ? 'Cancel' : 'Add'}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleAddNote}
          className="mt-3 space-y-2.5 rounded-xl border border-[#ECECE6] bg-[#FAFAF6] p-3"
        >
          <div className="flex flex-wrap gap-1.5">
            {NOTE_TYPES.map(t => (
              <button
                key={t.key}
                type="button"
                onClick={() => setNoteType(t.key)}
                className={`rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors ${FOCUS} ${
                  noteType === t.key
                    ? 'bg-[#1F4D3A] text-white'
                    : 'border border-[#D8D8D0] text-[#6E6E68] hover:border-[#9C9C95]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <Textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="What did you learn?"
            rows={3}
            className="resize-y border-[#D8D8D0] bg-white text-[13.5px]"
          />
          <button
            type="submit"
            disabled={isAdding || !content.trim()}
            className={`flex w-full items-center justify-center gap-2 rounded-full bg-[#1F4D3A] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#173D2E] disabled:opacity-50 ${FOCUS}`}
          >
            {isAdding && <Spinner className="h-3.5 w-3.5" />}
            Save
          </button>
        </form>
      )}

      {loading ? (
        <p className="py-6 text-center text-[13px] text-[#9C9C95]">Loading…</p>
      ) : notes.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-[#9C9C95]">
          No notes yet. The first one usually comes out of a call.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {notes.map(note => (
            <NoteItem key={note.id} note={note} onDelete={handleDeleteNote} />
          ))}
        </ul>
      )}
    </section>
  )
}

function NoteItem({
  note,
  onDelete,
}: {
  note: RecruiterNote
  onDelete: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const long = note.content.length > 260

  return (
    <li className="rounded-xl border border-[#ECECE6] p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 rounded-full bg-[#F0F0EA] px-2 py-0.5 text-[11px] font-medium text-[#6E6E68]">
            {TYPE_LABELS[note.note_type] || 'Note'}
          </span>
          <span className="truncate text-[11.5px] text-[#9C9C95]">
            {formatDate(note.created_at)}
          </span>
        </div>
        {/* Was hover-only, which meant it did not exist on a phone. Always
            present, quiet until you reach for it. */}
        <button
          type="button"
          onClick={() => onDelete(note.id)}
          aria-label="Delete note"
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[#C9C9C1] transition-colors hover:bg-[#F7EDEC] hover:text-[#9C4038] ${FOCUS}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <p
        className={`mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-[#161613] ${
          long && !expanded ? 'line-clamp-4' : ''
        }`}
      >
        {note.content}
      </p>

      {long && (
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className={`mt-1.5 text-[12.5px] font-medium text-[#1F4D3A] hover:underline ${FOCUS}`}
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </li>
  )
}

function formatDate(dateString: string) {
  const date = new Date(dateString)
  const diffDays = Math.floor((Date.now() - date.getTime()) / 86_400_000)
  if (diffDays === 0) return `Today, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}
