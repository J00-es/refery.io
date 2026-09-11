'use client'

import { useState } from 'react'
import { FIELD, FIELD_LABEL } from '@/lib/desk-ui'
import { Note, useSourcing } from '@/components/sourcing/actions'
import type { MailboxRow, SequenceRow, SequenceStep } from '@/lib/sourcing/types'

const DAYS = [
  { n: 1, label: 'Mon' },
  { n: 2, label: 'Tue' },
  { n: 3, label: 'Wed' },
  { n: 4, label: 'Thu' },
  { n: 5, label: 'Fri' },
]

const SMALL_PRIMARY = 'inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-full bg-[#1F3A2F] px-4 text-[13.5px] font-semibold text-white transition-colors hover:bg-[#142E24] disabled:opacity-50'
const SMALL = 'inline-flex min-h-[34px] items-center justify-center gap-1.5 rounded-full border border-[#D2D1C7] bg-white px-3 text-[13px] font-semibold text-[#161613] hover:border-[#1F3A2F] disabled:opacity-50'

export function SequenceEditor({ jobId, seq, mailboxes }: { jobId: string; seq: SequenceRow; mailboxes: MailboxRow[] }) {
  const { run, pending, note } = useSourcing()
  const [steps, setSteps] = useState<SequenceStep[]>(seq.steps)
  const [mailboxIds, setMailboxIds] = useState<string[]>(seq.mailbox_ids)
  const [pref, setPref] = useState(seq.address_preference)
  const [sendDays, setSendDays] = useState<number[]>(seq.send_days)
  const [followupDays, setFollowupDays] = useState<number[]>(seq.followup_days)
  const [winStart, setWinStart] = useState(seq.window_start)
  const [winEnd, setWinEnd] = useState(seq.window_end)
  const [mode, setMode] = useState(seq.mode)
  const [sending, setSending] = useState(seq.sending)

  const setStep = (i: number, patch: Partial<SequenceStep>) => setSteps(s => s.map((st, j) => (j === i ? { ...st, ...patch } : st)))
  const toggle = (list: number[], n: number) => (list.includes(n) ? list.filter(x => x !== n) : [...list, n].sort())

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <div className="space-y-4">
        {steps.map((st, i) => (
          <div key={st.n} className="rounded-[16px] border border-[#E4E3DC] bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#1F3A2F] text-[12px] font-bold text-white">{st.n}</span>
                <span className="text-[15px] font-semibold text-[#161613]">{i === 0 ? 'Day 0' : `Day ${st.day}, in the same thread`}</span>
              </div>
              {i > 0 && (
                <label className="flex items-center gap-2 text-[12.5px] text-[#6E6E68]">
                  days after step {st.n - 1}
                  <input type="number" min={1} max={30} className={`${FIELD} mt-0 w-[70px] py-1 text-[13px]`} value={st.day} onChange={e => setStep(i, { day: Number(e.target.value) })} />
                  {steps.length > 2 && (
                    <button type="button" className={SMALL} onClick={() => setSteps(s => s.filter((_, j) => j !== i).map((x, j) => ({ ...x, n: j + 1 })))}>
                      Remove
                    </button>
                  )}
                </label>
              )}
            </div>
            {i === 0 ? (
              <label className="mt-4 block">
                <span className={FIELD_LABEL}>Subject</span>
                <input className={FIELD} value={st.subject} onChange={e => setStep(i, { subject: e.target.value })} />
              </label>
            ) : (
              <p className="mt-3 text-[12.5px] text-[#9C9C95]">Sent as a reply to the first email, so it keeps the first subject.</p>
            )}
            <label className="mt-3 block">
              <span className={FIELD_LABEL}>Body</span>
              <textarea className={`${FIELD} min-h-[220px] font-mono text-[13.5px] leading-relaxed`} value={st.body} onChange={e => setStep(i, { body: e.target.value })} />
            </label>
          </div>
        ))}
        {steps.length < 4 && (
          <button type="button" className={SMALL} onClick={() => setSteps(s => [...s, { n: s.length + 1, day: 7, subject: '', body: `Last note from me, {first}. If you know someone who fits this better than you do, I would be glad of the name. Otherwise I will leave you be.\n\nBest,\n{signer}` }])}>
            + Add a step
          </button>
        )}
        <p className="text-[12.5px] leading-relaxed text-[#6E6E68]">
          Merge fields: <code>{'{first}'}</code> <code>{'{opener}'}</code> (the checked hook, or a plain line) <code>{'{company}'}</code> <code>{'{title}'}</code> <code>{'{pay_line}'}</code> <code>{'{location_line}'}</code> <code>{'{employer}'}</code> <code>{'{signer}'}</code>. A field the record cannot fill stops that person from being enrolled. Saving a template change makes a new sequence version; batches already approved keep the text they were approved with.
        </p>
      </div>

      <aside className="space-y-4">
        <div className="rounded-[16px] border border-[#E4E3DC] bg-white p-5">
          <div className="text-[13px] font-semibold text-[#161613]">Sends from</div>
          <div className="mt-3 space-y-2">
            {mailboxes.map(m => (
              <label key={m.id} className="flex items-center justify-between gap-2 text-[13.5px] text-[#2A2A26]">
                <span className="flex items-center gap-2">
                  <input type="checkbox" checked={mailboxIds.includes(m.id)} onChange={() => setMailboxIds(ids => (ids.includes(m.id) ? ids.filter(x => x !== m.id) : [...ids, m.id]))} disabled={m.status !== 'active'} />
                  {m.address}
                </span>
                <span className="text-[12px] text-[#9C9C95]">
                  signs as {m.signs_as}
                  {m.status !== 'active' ? ` · ${m.status}` : ''}
                </span>
              </label>
            ))}
            {!mailboxes.length && <p className="text-[12.5px] text-[#9C9C95]">No mailbox yet. Add one on the Mailboxes page.</p>}
          </div>
          <p className="mt-3 text-[12.5px] leading-relaxed text-[#6E6E68]">Round-robin across the ones ticked. A person&apos;s whole sequence stays on the mailbox that sent step 1.</p>
          <label className="mt-4 block">
            <span className={FIELD_LABEL}>Which address</span>
            <select className={FIELD} value={pref} onChange={e => setPref(e.target.value as SequenceRow['address_preference'])}>
              <option value="personal_first">Personal first, then work</option>
              <option value="work_first">Work first, then personal</option>
              <option value="work_only">Work only</option>
            </select>
          </label>
        </div>

        <div className="rounded-[16px] border border-[#E4E3DC] bg-white p-5">
          <div className="text-[13px] font-semibold text-[#161613]">When</div>
          <div className="mt-3 text-[12.5px] text-[#6E6E68]">First emails on</div>
          <div className="mt-1 flex gap-2">
            {DAYS.map(d => (
              <label key={d.n} className="flex items-center gap-1 text-[13px]">
                <input type="checkbox" checked={sendDays.includes(d.n)} onChange={() => setSendDays(l => toggle(l, d.n))} /> {d.label}
              </label>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2 text-[13px] text-[#2A2A26]">
            between <input className={`${FIELD} mt-0 w-[80px] py-1 text-[13px]`} value={winStart} onChange={e => setWinStart(e.target.value)} /> and <input className={`${FIELD} mt-0 w-[80px] py-1 text-[13px]`} value={winEnd} onChange={e => setWinEnd(e.target.value)} />
          </div>
          <div className="mt-3 text-[12.5px] text-[#6E6E68]">Follow-ups on</div>
          <div className="mt-1 flex gap-2">
            {DAYS.map(d => (
              <label key={d.n} className="flex items-center gap-1 text-[13px]">
                <input type="checkbox" checked={followupDays.includes(d.n)} onChange={() => setFollowupDays(l => toggle(l, d.n))} /> {d.label}
              </label>
            ))}
          </div>
          <p className="mt-3 text-[12.5px] leading-relaxed text-[#6E6E68]">Times are in the seat&apos;s time zone (the person&apos;s is unknown). A few go out every ten minutes, never a burst.</p>
        </div>

        <div className="rounded-[16px] border border-[#E4E3DC] bg-white p-5">
          <div className="text-[13px] font-semibold text-[#161613]">Mode</div>
          <select className={FIELD} value={mode} onChange={e => setMode(e.target.value as SequenceRow['mode'])}>
            <option value="learning">Learning: every batch approved by hand</option>
            <option value="batches">Batches: approve exact lists, on the page or in Slack</option>
            <option value="auto" disabled>
              Automatic within rules (not yet)
            </option>
          </select>
          <label className="mt-4 flex items-center gap-2 text-[13.5px] text-[#2A2A26]">
            <input type="checkbox" checked={sending} onChange={e => setSending(e.target.checked)} /> Sending is on
          </label>
          <p className="mt-2 text-[12.5px] leading-relaxed text-[#6E6E68]">Off pauses every run on this search, including follow-ups. Replies are still read.</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={pending}
            className={SMALL_PRIMARY}
            onClick={() =>
              void run('sequence.save', { jobId, steps, mailbox_ids: mailboxIds, address_preference: pref, send_days: sendDays, followup_days: followupDays, window_start: winStart, window_end: winEnd, mode, sending }, 'Saved as v{version}')
            }
          >
            {pending ? 'Saving' : 'Save sequence'}
          </button>
          <Note text={note} />
        </div>
      </aside>
    </div>
  )
}
