'use client'

/**
 * The places a hiring manager can write back.
 *
 * Three surfaces, one behaviour: a section thread, an answer under a checklist
 * question, and the open thread at the foot of the document. Each is a filtered
 * view of the same store (`comments-provider.tsx`), so a note written under a
 * question also shows in the section it belongs to.
 *
 * The composer stays shut until asked for. A brief is a document to read, and a
 * page that opens with eight empty textareas reads as a form to fill in.
 */

import { useEffect, useMemo, useState } from 'react'
import { useBriefComments, type BriefComment } from './comments-provider'

const CARD = 'rounded-[10px] border border-[#E6E4DC] bg-white'
const GREEN = '#1F3A2F'

// ── time ────────────────────────────────────────────────────────────────────

/**
 * Rendered only after mount.
 *
 * The server formats in UTC and the browser in the reader's zone; printing that
 * during SSR is a guaranteed hydration mismatch. A timestamp that arrives one
 * frame late costs nothing.
 */
function Timestamp({ iso, edited }: { iso: string; edited: boolean }) {
  const [text, setText] = useState('')

  useEffect(() => {
    const then = new Date(iso)
    const mins = Math.round((Date.now() - then.getTime()) / 60000)
    const label =
      mins < 1
        ? 'just now'
        : mins < 60
          ? `${mins}m ago`
          : mins < 60 * 24
            ? `${Math.round(mins / 60)}h ago`
            : then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    setText(edited ? `${label} · edited` : label)
  }, [iso, edited])

  return (
    <span className="text-[11.5px] text-[#A9ADA2]" suppressHydrationWarning>
      {text}
    </span>
  )
}

// ── composer ────────────────────────────────────────────────────────────────

function Composer({
  onSubmit,
  onCancel,
  initialBody = '',
  placeholder,
  submitLabel = 'Send',
  askName = true,
}: {
  onSubmit: (body: string) => Promise<void>
  onCancel: () => void
  initialBody?: string
  placeholder: string
  submitLabel?: string
  askName?: boolean
}) {
  const { authorName, rememberName } = useBriefComments()
  const [body, setBody] = useState(initialBody)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!body.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      await onSubmit(body.trim())
      setBody('')
      onCancel()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3">
      {askName && (
        <input
          type="text"
          value={authorName}
          onChange={e => rememberName(e.target.value)}
          placeholder="Your name (optional)"
          maxLength={80}
          className="mb-2 w-full rounded-[8px] border border-[#E6E4DC] bg-[#FBFAF7] px-3 py-2 text-[13.5px] text-[#1D1F1D] outline-none placeholder:text-[#A9ADA2] focus:border-[#1F3A2F]"
        />
      )}
      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        placeholder={placeholder}
        rows={3}
        maxLength={4000}
        autoFocus
        // Cmd/Ctrl+Enter sends. Plain Enter has to stay a newline: these are
        // corrections, and they run to several lines more often than not.
        onKeyDown={e => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void submit()
          if (e.key === 'Escape') onCancel()
        }}
        className="w-full resize-y rounded-[8px] border border-[#E6E4DC] bg-white px-3 py-2.5 text-[14.5px] leading-relaxed text-[#1D1F1D] outline-none placeholder:text-[#A9ADA2] focus:border-[#1F3A2F]"
      />
      {error && <p className="mt-1.5 text-[13px] text-[#B0483C]">{error}</p>}
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || !body.trim()}
          className="rounded-full bg-[#1F3A2F] px-4 py-1.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? 'Sending…' : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full px-3 py-1.5 text-[13px] font-medium text-[#75796F] transition-colors hover:text-[#1D1F1D]"
        >
          Cancel
        </button>
        <span className="ml-auto hidden text-[11.5px] text-[#A9ADA2] sm:inline">⌘↵ to send</span>
      </div>
    </div>
  )
}

// ── one comment ─────────────────────────────────────────────────────────────

function Comment({ comment }: { comment: BriefComment }) {
  const { owned, edit, remove } = useBriefComments()
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mine = owned.has(comment.id)

  if (editing) {
    return (
      <li className={`${CARD} px-4 py-3`}>
        <Composer
          initialBody={comment.body}
          placeholder="Edit your note"
          submitLabel="Save"
          askName={false}
          onSubmit={body => edit(comment.id, body)}
          onCancel={() => setEditing(false)}
        />
      </li>
    )
  }

  return (
    <li className={`${CARD} border-l-[3px] px-4 py-3`} style={{ borderLeftColor: GREEN }}>
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="text-[13px] font-semibold text-[#173B2D]">
          {comment.authorName?.trim() || 'Anonymous'}
        </span>
        <Timestamp iso={comment.createdAt} edited={!!comment.editedAt} />
      </div>
      {comment.prompt && (
        <p className="mt-1 text-[12px] italic leading-snug text-[#9A7B2E]">
          Answering: {comment.prompt}
        </p>
      )}
      <p className="mt-1.5 whitespace-pre-wrap text-[14.5px] leading-relaxed text-[#3C403C]">
        {comment.body}
      </p>
      {error && <p className="mt-1.5 text-[13px] text-[#B0483C]">{error}</p>}
      {mine && (
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setError(null)
              setEditing(true)
            }}
            className="text-[12.5px] font-medium text-[#75796F] underline-offset-2 transition-colors hover:text-[#1F3A2F] hover:underline"
          >
            Edit
          </button>
          {confirming ? (
            <>
              <button
                type="button"
                onClick={async () => {
                  setError(null)
                  try {
                    await remove(comment.id)
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Could not delete that.')
                    setConfirming(false)
                  }
                }}
                className="text-[12.5px] font-semibold text-[#B0483C] underline underline-offset-2"
              >
                Really delete
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="text-[12.5px] font-medium text-[#75796F]"
              >
                Keep
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="text-[12.5px] font-medium text-[#75796F] underline-offset-2 transition-colors hover:text-[#B0483C] hover:underline"
            >
              Delete
            </button>
          )}
        </div>
      )}
    </li>
  )
}

function Thread({ comments }: { comments: BriefComment[] }) {
  if (!comments.length) return null
  return (
    <ul className="mt-3 space-y-2.5">
      {comments.map(c => (
        <Comment key={c.id} comment={c} />
      ))}
    </ul>
  )
}

// ── surfaces ────────────────────────────────────────────────────────────────

/**
 * The thread under a section.
 *
 * Shows notes written against the section itself. Answers to that section's
 * checklist questions sit under the question they answer, not here, or the same
 * text would appear twice on one screen.
 */
export function SectionComments({
  sectionId,
  sectionLabel,
}: {
  sectionId: string
  sectionLabel: string
}) {
  const { comments, add } = useBriefComments()
  const [open, setOpen] = useState(false)

  const mine = useMemo(
    () => comments.filter(c => c.sectionId === sectionId && !c.prompt),
    [comments, sectionId],
  )

  return (
    <div className="mt-6 border-t border-dashed border-[#E6E4DC] pt-4 print:hidden">
      <Thread comments={mine} />
      {open ? (
        <Composer
          placeholder={`Anything wrong or missing in "${sectionLabel}"? A line is plenty.`}
          onSubmit={body => add({ body, sectionId, sectionLabel })}
          onCancel={() => setOpen(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#E6E4DC] bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-[#75796F] transition-colors hover:border-[#1F3A2F] hover:text-[#1F3A2F]"
        >
          <span aria-hidden>+</span>
          {mine.length ? 'Add another note' : 'Correct or add something'}
        </button>
      )}
    </div>
  )
}

/** The answer box under a single checklist question. */
export function ChecklistAnswer({
  sectionId,
  sectionLabel,
  ask,
}: {
  sectionId: string
  sectionLabel: string
  ask: string
}) {
  const { comments, add } = useBriefComments()
  const [open, setOpen] = useState(false)

  const answers = useMemo(() => comments.filter(c => c.prompt === ask), [comments, ask])

  return (
    <div className="mt-2.5 print:hidden">
      {answers.length > 0 && (
        <ul className="mb-2 space-y-2">
          {answers.map(c => (
            <Comment key={c.id} comment={c} />
          ))}
        </ul>
      )}
      {open ? (
        <Composer
          placeholder="One line is plenty."
          submitLabel="Answer"
          onSubmit={body => add({ body, sectionId, sectionLabel, prompt: ask })}
          onCancel={() => setOpen(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-[12.5px] font-semibold text-[#1F3A2F] underline decoration-[#C8A24B] underline-offset-4 transition-opacity hover:opacity-70"
        >
          {answers.length ? 'Add to this answer' : 'Answer this'}
        </button>
      )}
    </div>
  )
}

/** The open thread at the foot of the document, for anything unattached. */
export function GeneralComments() {
  const { comments, add } = useBriefComments()
  const [open, setOpen] = useState(false)

  const general = useMemo(() => comments.filter(c => !c.sectionId), [comments])

  return (
    <section id="comments" className="mt-14 scroll-mt-16 print:hidden">
      <div className="mb-4 flex items-baseline gap-3.5 border-b-2 border-[#1F3A2F] pb-3">
        <span aria-hidden className="font-semibold text-[15px] italic text-[#9A7B2E]">
          ✎
        </span>
        <h2 className="text-[21px] font-semibold leading-snug tracking-[-0.01em] text-[#173B2D] sm:text-[27px]">
          Anything else
        </h2>
      </div>
      <p className="text-[14px] leading-relaxed text-[#75796F]">
        Everything you write here reaches me straight away, and you can edit or delete it afterwards.
        No account, no reply address needed.
      </p>
      <Thread comments={general} />
      {open ? (
        <Composer
          placeholder="Corrections, things I have missed, or anything that has changed since we spoke."
          onSubmit={body => add({ body })}
          onCancel={() => setOpen(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 rounded-full bg-[#1F3A2F] px-5 py-2 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90"
        >
          Write a note
        </button>
      )}
    </section>
  )
}
