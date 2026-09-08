'use client'

import { useEffect, useState } from 'react'

/**
 * How we reach you. Four optional kinds and one always-on line, so nobody
 * discovers a message category by receiving it.
 */
interface Prefs {
  needs_you: boolean
  suggestions: boolean
  movement: boolean
  sunday: boolean
  setup_reminders: boolean
  whatsapp: string
}

const ROWS: Array<{ key: keyof Omit<Prefs, 'whatsapp'>; title: string; blurb: string }> = [
  { key: 'needs_you', title: 'Something needs you', blurb: 'An intro to forward, a question from a client. Same day.' },
  { key: 'suggestions', title: 'A search suggested for you', blurb: 'When a new search matches what you told us. A few a month at most.' },
  { key: 'movement', title: 'Your people moved', blurb: 'Sent to a client, interview booked, offer. As it happens.' },
  { key: 'sunday', title: 'Sunday recap', blurb: 'Your searches, your people, anything waiting on you. Only if there is something to say.' },
  { key: 'setup_reminders', title: 'Setup reminders', blurb: 'Two at most, only while a step is yours to finish.' },
]

export function NotificationPrefs() {
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/partners/notification-prefs').then(r => (r.ok ? r.json() : null)).then(p => p && setPrefs(p)).catch(() => {})
  }, [])

  async function save(next: Prefs) {
    setPrefs(next)
    setSaved(null)
    const res = await fetch('/api/partners/notification-prefs', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) })
    setSaved(res.ok ? 'Saved' : 'That did not save')
  }

  if (!prefs) return null

  return (
    <section className="rounded-[16px] border border-[#E4E3DC] bg-white">
      <div className="border-b border-[#E4E3DC] px-4 py-3">
        <h2 className="text-[15px] font-semibold">How we reach you</h2>
        <p className="text-[12.5px] text-[#6E6E68]">Confirmations and decisions on your people are always sent. These are optional. Never more than one optional email in three days.</p>
      </div>
      <ul className="divide-y divide-[#E4E3DC]">
        {ROWS.map(r => (
          <li key={r.key} className="flex min-h-[60px] items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold">{r.title}</p>
              <p className="text-[12.5px] text-[#6E6E68]">{r.blurb}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={prefs[r.key]}
              onClick={() => save({ ...prefs, [r.key]: !prefs[r.key] })}
              className={`relative h-[26px] w-[44px] shrink-0 rounded-full transition-colors ${prefs[r.key] ? 'bg-[#1F3A2F]' : 'bg-[#E4E3DC]'}`}
            >
              <span className={`absolute top-[3px] h-5 w-5 rounded-full bg-white transition-all ${prefs[r.key] ? 'left-[21px]' : 'left-[3px]'}`} />
            </button>
          </li>
        ))}
        <li className="flex min-h-[60px] flex-wrap items-center gap-3 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold">WhatsApp</p>
            <p className="text-[12.5px] text-[#6E6E68]">For "something needs you" only. Leave empty to keep it off.</p>
          </div>
          <input
            value={prefs.whatsapp}
            onChange={e => setPrefs({ ...prefs, whatsapp: e.target.value })}
            onBlur={() => save(prefs)}
            placeholder="+1 …"
            className="h-10 w-40 rounded-md border border-[#D2D1C7] px-3 text-[13px]"
          />
        </li>
      </ul>
      {saved && <p className="px-4 py-2 text-[12px] text-[#9C9C95]">{saved}</p>}
    </section>
  )
}
