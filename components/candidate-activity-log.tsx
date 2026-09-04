'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Textarea } from '@/components/ui/textarea'
import { formatDistanceToNow } from 'date-fns'
import { CARD, FOCUS } from '@/lib/candidate-ui'

interface ActivityLog {
  id: string
  activity_type: string
  description: string
  source: string | null
  from_state: string | null
  to_state: string | null
  created_at: string
}

interface CandidateActivityLogProps {
  candidateId: string
}

/**
 * Only the types a person would sit down and record. The table permits
 * seventeen, but the rest are written by automation — offering "Job Matched" or
 * "Stage Changed" in a human's dropdown invites someone to hand-write a fact the
 * system is already asserting, and then the two disagree.
 */
const LOGGABLE = [
  { key: 'call_transcript', label: 'Call' },
  { key: 'email_sent', label: 'Email' },
  { key: 'contact_made', label: 'Contact' },
  { key: 'note_added', label: 'Note' },
] as const

/** Human-readable names for what the timeline shows. */
const TYPE_LABELS: Record<string, string> = {
  journey_stage_changed: 'Stage',
  internal_stage_changed: 'Internal stage',
  stage_changed: 'Pipeline',
  status_changed: 'Status',
  call_transcript: 'Call',
  email_sent: 'Email',
  contact_made: 'Contact',
  note_added: 'Note',
  job_matched: 'Matched',
  opportunity_sent: 'Opportunity sent',
  profile_viewed: 'Viewed',
  document_uploaded: 'Document',
  interview_scheduled: 'Interview',
  offer_made: 'Offer',
  hired: 'Hired',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
}

/** Sources that mean "nobody typed this". */
const AUTOMATED = new Set(['rule', 'automation', 'gmail', 'calendar', 'granola', 'panel', 'backfill'])

export function CandidateActivityLog({ candidateId }: CandidateActivityLogProps) {
  const [activities, setActivities] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<string>(LOGGABLE[0].key)
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const supabase = createClient()

  const fetchActivities = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('candidate_activity_log')
      .select('id, activity_type, description, source, from_state, to_state, created_at')
      .eq('candidate_id', candidateId)
      .order('created_at', { ascending: false })
      .limit(50)
    setActivities(data || [])
    setLoading(false)
  }, [candidateId, supabase])

  useEffect(() => {
    fetchActivities()
  }, [fetchActivities])

  async function add() {
    if (!description.trim()) return
    setSubmitting(true)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    await supabase.from('candidate_activity_log').insert({
      candidate_id: candidateId,
      activity_type: type,
      description: description.trim(),
      source: 'human',
      performed_by: user?.id,
    })

    setDescription('')
    setOpen(false)
    setSubmitting(false)
    fetchActivities()
  }

  return (
    <section className={`${CARD} p-5`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-[#161613]">Activity</h2>
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className={`rounded-full border border-[#D2D1C7] px-3 py-1.5 text-[12.5px] font-semibold text-[#161613] transition-colors hover:border-[#9C9C95] ${FOCUS}`}
        >
          {open ? 'Cancel' : 'Log'}
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-2.5 rounded-xl border border-[#E4E3DC] bg-[#FAF9F5] p-3">
          <div className="flex flex-wrap gap-1.5">
            {LOGGABLE.map(t => (
              <button
                key={t.key}
                type="button"
                onClick={() => setType(t.key)}
                className={`rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors ${FOCUS} ${
                  type === t.key
                    ? 'bg-[#1F3A2F] text-white'
                    : 'border border-[#D2D1C7] text-[#6E6E68] hover:border-[#9C9C95]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <Textarea
            placeholder="What happened?"
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="min-h-[70px] resize-y border-[#D2D1C7] bg-white text-[13.5px]"
          />
          <button
            type="button"
            onClick={add}
            disabled={!description.trim() || submitting}
            className={`w-full rounded-full bg-[#1F3A2F] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#142E24] disabled:opacity-50 ${FOCUS}`}
          >
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}

      {loading ? (
        <p className="py-6 text-center text-[13px] text-[#9C9C95]">Loading…</p>
      ) : activities.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-[#9C9C95]">Nothing logged yet.</p>
      ) : (
        <ol className="mt-4 space-y-3.5">
          {activities.map(a => {
            const automated = AUTOMATED.has(a.source ?? '')
            return (
              <li key={a.id} className="flex gap-3">
                {/* One neutral dot rather than a coloured icon per type. With
                    seventeen types the palette became decoration — the reader
                    scans the sentence, not the badge. */}
                <span
                  aria-hidden
                  className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${
                    automated ? 'bg-[#C9C9C1]' : 'bg-[#1F3A2F]'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-[13px] font-medium text-[#161613]">
                      {TYPE_LABELS[a.activity_type] ?? a.activity_type.replace(/_/g, ' ')}
                    </span>
                    {a.to_state && (
                      <span className="text-[12.5px] text-[#6E6E68]">
                        → {a.to_state.replace(/_/g, ' ')}
                      </span>
                    )}
                    <span className="text-[11.5px] text-[#9C9C95]">
                      {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                    </span>
                    {/* Whether a person or the system did this. It is the first
                        thing you want to know before trusting or undoing it. */}
                    {automated && (
                      <span className="rounded bg-[#EAE9E1] px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-wide text-[#9C9C95]">
                        auto
                      </span>
                    )}
                  </div>
                  {a.description && (
                    <p className="mt-0.5 text-[13px] leading-snug text-[#6E6E68]">{a.description}</p>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
