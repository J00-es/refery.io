'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, MessageCircle } from 'lucide-react'
import { BTN_PRIMARY, BTN_QUIET, CARD, FIELD, FOCUS, H2, LEDE, META, MUTED } from '@/lib/desk-ui'
import { shortAge } from '@/lib/job-ui'

export interface QuestionRow {
  id: string
  question: string
  answer: string | null
  answered_at: string | null
  created_at: string
  is_visible: boolean
  /** True for the viewer's own question. Never who else asked. */
  mine: boolean
}

/**
 * Questions and answers on one search.
 *
 * A partner asks here instead of on Slack, Refery answers once, and everyone on
 * the search reads it. Nobody but Refery sees who asked. An admin can also hide
 * a question that should never have been public.
 */
export function SearchQuestions({
  jobId,
  questions,
  canAsk,
  canManage,
  canDelete = false,
}: {
  jobId: string
  questions: QuestionRow[]
  canAsk: boolean
  canManage: boolean
  /** Super admin only. An admin hides; deleting is for questions that should never have existed. */
  canDelete?: boolean
}) {
  const router = useRouter()
  const [asking, setAsking] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function ask() {
    setBusy(true)
    setError(null)
    const res = await fetch('/api/partners/questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: jobId, question: text.trim() }),
    })
    const body = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) {
      setError(body.error ?? 'Could not send that.')
      return
    }
    setText('')
    setAsking(false)
    router.refresh()
  }

  const visible = questions.filter(q => q.is_visible || canManage || q.mine)

  return (
    <section className="mt-9">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className={H2}>
            Questions and answers
            <span className={`ml-2 text-[15px] ${MUTED}`}>{visible.length}</span>
          </h2>
          <p className={`mt-1 ${LEDE}`}>
            Ask here and the answer is added for everyone on the search. Lily replies inside a day and you get an email when she does.
          </p>
        </div>
        {canAsk && !asking && (
          <button type="button" onClick={() => setAsking(true)} className={`${BTN_QUIET} min-h-[38px] px-4 text-[13px]`}>
            <MessageCircle className="h-3.5 w-3.5" />
            Ask a question
          </button>
        )}
      </div>

      {asking && (
        <div className={`mt-4 p-4 ${CARD}`}>
          <label className="block text-[13px] font-medium text-[#2A2A26]">
            Your question
            <textarea
              autoFocus
              rows={2}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Would they consider someone strong on RL environments but light on customer-facing work?"
              className={`${FIELD} resize-none`}
            />
          </label>
          {error && <p className="mt-1.5 text-[12.5px] text-[#A3423A]">{error}</p>}
          <div className="mt-3 flex items-center gap-2">
            <button type="button" disabled={busy || text.trim().length < 10} onClick={ask} className={`${BTN_PRIMARY} min-h-[38px] px-4 text-[13px]`}>
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Send
            </button>
            <button type="button" onClick={() => setAsking(false)} className={`min-h-[38px] px-2 text-[13px] font-medium text-[#6E6E68] hover:text-[#161613] ${FOCUS}`}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {visible.length === 0 ? (
        <p className={`mt-4 ${LEDE}`}>Nothing asked yet.</p>
      ) : (
        <ul className={`mt-4 divide-y divide-[#E4E3DC] ${CARD} px-5`}>
          {visible.map(q => (
            <li key={q.id} className="py-4">
              <QuestionItem q={q} canManage={canManage} canDelete={canDelete} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function QuestionItem({ q, canManage, canDelete }: { q: QuestionRow; canManage: boolean; canDelete: boolean }) {
  const router = useRouter()
  const [answer, setAnswer] = useState(q.answer ?? '')
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function save(patch: Record<string, unknown>) {
    setBusy(true)
    await fetch(`/api/partners/questions/${q.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    setBusy(false)
    setEditing(false)
    router.refresh()
  }

  async function remove() {
    setBusy(true)
    await fetch(`/api/partners/questions/${q.id}`, { method: 'DELETE' })
    setBusy(false)
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[14.5px] font-semibold text-[#161613]">{q.question}</p>
        <span className={`shrink-0 ${META}`}>
          {q.mine ? 'you · ' : ''}
          {shortAge(q.created_at)}
          {!q.is_visible && ' · hidden'}
        </span>
      </div>

      {q.answer && !editing ? (
        <p className="rounded-[10px] bg-[#FAF9F5] px-3 py-2.5 text-[13.5px] leading-relaxed text-[#2A2A26]">
          <span className="font-semibold">Refery{q.answered_at ? `, ${shortAge(q.answered_at)}` : ''}: </span>
          {q.answer}
        </p>
      ) : !canManage ? (
        <p className={META}>Waiting on Refery.</p>
      ) : null}

      {canManage && (
        <div className="flex flex-col gap-2">
          {editing || !q.answer ? (
            <>
              <textarea
                rows={2}
                value={answer}
                onChange={e => setAnswer(e.target.value)}
                placeholder="The answer, once, for everyone on the search."
                className={`${FIELD} resize-none`}
              />
              <div className="flex items-center gap-2">
                <button type="button" disabled={busy || !answer.trim()} onClick={() => save({ answer })} className={`${BTN_PRIMARY} min-h-[36px] px-4 text-[13px]`}>
                  {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {q.answer ? 'Update answer' : 'Answer'}
                </button>
                {q.answer && (
                  <button type="button" onClick={() => setEditing(false)} className={`min-h-[36px] px-2 text-[13px] text-[#6E6E68] ${FOCUS}`}>
                    Cancel
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => setEditing(true)} className={`text-[12.5px] font-medium text-[#6E6E68] hover:text-[#161613] ${FOCUS}`}>
                Edit answer
              </button>
              <button type="button" onClick={() => save({ is_visible: !q.is_visible })} className={`text-[12.5px] font-medium text-[#6E6E68] hover:text-[#161613] ${FOCUS}`}>
                {q.is_visible ? 'Hide from partners' : 'Show to partners'}
              </button>
            </div>
          )}
          {canDelete && (
            <div className="flex items-center gap-3">
              {confirmDelete ? (
                <>
                  <span className={META}>Delete this question and its answer for everyone?</span>
                  <button type="button" disabled={busy} onClick={remove} className={`text-[12.5px] font-semibold text-[#A3423A] ${FOCUS}`}>
                    Yes, delete
                  </button>
                  <button type="button" onClick={() => setConfirmDelete(false)} className={`text-[12.5px] font-medium text-[#6E6E68] ${FOCUS}`}>
                    Keep it
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => setConfirmDelete(true)} className={`text-[12.5px] font-medium text-[#9C9C95] hover:text-[#A3423A] ${FOCUS}`}>
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
