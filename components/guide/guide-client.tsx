'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { Search, X } from 'lucide-react'
import type { GuideLaunch, GuidePath, GuideSection, GuideTopic } from '@/lib/guide/types'
import { Letter } from '@/components/guide/mocks'
import { FOCUS } from '@/lib/desk-ui'

/**
 * The guide: one page, every partner-facing feature, one search box.
 *
 * Search is instant and local: the topic list is small, so a scored substring
 * match over title, summary, steps, rules, emails and keywords is enough and
 * never leaves the browser. "/" focuses the box; Escape clears it. On a phone
 * the section list becomes a scrolling row of chips above the topics.
 */

const NEW_DAYS = 45
const SUGGESTED = ['consent', 'send the intro', 'payout', 'your link', 'not moving forward', 'Sunday recap']

function isNew(since?: string): boolean {
  if (!since) return false
  return Date.now() - new Date(since).getTime() < NEW_DAYS * 86_400_000
}

function textOf(t: GuideTopic): string {
  return [
    t.title,
    t.summary,
    ...(t.steps ?? []).flatMap(s => [s.do, s.then ?? '']),
    ...(t.then ?? []),
    ...(t.rules ?? []),
    ...(t.emails ?? []).flatMap(e => [e.subject, e.body]),
    ...(t.keywords ?? []),
  ]
    .join(' \n ')
    .toLowerCase()
}

function terms(q: string): string[] {
  return q
    .toLowerCase()
    .split(/\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 1)
}

function score(t: GuideTopic, ts: string[], body: string): number {
  if (!ts.length) return 1
  let s = 0
  const title = t.title.toLowerCase()
  const kw = (t.keywords ?? []).join(' ').toLowerCase()
  for (const term of ts) {
    if (title.includes(term)) s += 5
    else if (kw.includes(term)) s += 3
    else if (body.includes(term)) s += 1
    else return 0
  }
  return s
}

function Marked({ text, ts }: { text: string; ts: string[] }) {
  if (!ts.length) return <>{text}</>
  const re = new RegExp(`(${ts.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'ig')
  const parts = text.split(re)
  return (
    <>
      {parts.map((p, i) => (i % 2 === 1 ? <mark key={i} className="rounded-sm bg-[#F5EEDD] px-0.5 text-[#5B4A0F]">{p}</mark> : <span key={i}>{p}</span>))}
    </>
  )
}

/** Copy with **button labels** in bold, matched terms marked. */
function Highlight({ text, ts }: { text: string; ts: string[] }) {
  const parts = text.split('**')
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="font-semibold text-[#161613]">
            <Marked text={p} ts={ts} />
          </strong>
        ) : (
          <Marked key={i} text={p} ts={ts} />
        ),
      )}
    </>
  )
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function GuideClient({ sections, launches, paths, viewerFirst }: { sections: GuideSection[]; launches: GuideLaunch[]; paths: GuidePath[]; viewerFirst: string }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const box = useRef<HTMLInputElement>(null)
  const ts = useMemo(() => terms(q), [q])
  const bodies = useMemo(() => new Map(sections.flatMap(s => s.topics.map(t => [t.id, textOf(t)] as const))), [sections])

  const visible = useMemo(() => {
    if (!ts.length) return sections
    return sections
      .map(s => ({ ...s, topics: s.topics.map(t => ({ t, s: score(t, ts, bodies.get(t.id) ?? '') })).filter(x => x.s > 0).sort((a, b) => b.s - a.s).map(x => x.t) }))
      .filter(s => s.topics.length)
  }, [sections, ts, bodies])
  const count = visible.reduce((n, s) => n + s.topics.length, 0)
  const searching = ts.length > 0

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')
      if (e.key === '/' && !typing) {
        e.preventDefault()
        box.current?.focus()
      }
      if (e.key === 'Escape' && el === box.current) {
        setQ('')
        box.current?.blur()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Open a topic from a #hash (a link from an email or from Start).
  useEffect(() => {
    const id = window.location.hash.replace('#', '')
    if (id) {
      setOpen(o => ({ ...o, [id]: true }))
      // The topic expands on the next render; scroll once it has its full height.
      const t = setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 350)
      return () => clearTimeout(t)
    }
  }, [])

  function toggle(id: string) {
    setOpen(o => ({ ...o, [id]: !o[id] }))
  }

  return (
    <div className="mx-auto max-w-[1100px] px-1 sm:px-2">
      <header className="pb-4 sm:pb-6">
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-[#161613] sm:text-[34px]">The guide</h1>
        <p className="mt-1.5 max-w-[640px] text-[13.5px] leading-relaxed text-[#6E6E68]">
          {viewerFirst ? `${viewerFirst}, this` : 'This'} is every part of Refery you touch, one question at a time: what it is, what to press, what happens next, and what lands in whose inbox. People in the examples are made up.
        </p>
      </header>

      <div className="sticky top-14 z-20 -mx-1 bg-[#F2F1EB]/95 px-1 py-2 backdrop-blur sm:top-16 sm:-mx-2 sm:px-2">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9C9C95]" />
          <input
            ref={box}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search: consent, intro, payout, pipeline, your link…"
            aria-label="Search the guide"
            className={`h-12 w-full rounded-full border border-[#D2D1C7] bg-white pl-11 pr-11 text-[15px] text-[#161613] placeholder:text-[#9C9C95] ${FOCUS}`}
          />
          {q ? (
            <button type="button" onClick={() => setQ('')} aria-label="Clear" className="absolute right-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-[#6E6E68] hover:bg-[#EAE9E1]">
              <X className="h-4 w-4" />
            </button>
          ) : (
            <span className="absolute right-4 top-1/2 hidden -translate-y-1/2 rounded-md border border-[#E4E3DC] px-1.5 py-0.5 font-mono text-[11px] text-[#9C9C95] sm:block">/</span>
          )}
        </label>
        {!searching && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 px-1">
            <span className="text-[11.5px] text-[#9C9C95]">Try</span>
            {SUGGESTED.map(w => (
              <button key={w} type="button" onClick={() => setQ(w)} className={`rounded-full border border-[#E4E3DC] bg-white px-2.5 py-1 text-[12px] text-[#2A2A26] hover:border-[#1F3A2F] ${FOCUS}`}>
                {w}
              </button>
            ))}
          </div>
        )}
        {searching && (
          <p className="mt-1.5 px-1 text-[12.5px] text-[#6E6E68]">
            {count === 0 ? 'Nothing matches. Try one word, or the name of the button you are looking at.' : `${count} ${count === 1 ? 'topic' : 'topics'}`}
          </p>
        )}
      </div>

      {/* Sections as a scrolling row on a phone, a sticky list on a desktop. */}
      <nav aria-label="Sections" className="-mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-2 sm:mx-0 sm:px-0 lg:hidden">
        {sections.map(s => (
          <a key={s.id} href={`#${s.id}`} className="shrink-0 rounded-full border border-[#D2D1C7] bg-white px-3 py-1.5 text-[12.5px] font-medium text-[#161613]">
            {s.title}
          </a>
        ))}
      </nav>

      <div className="mt-2 grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8">
        <aside className="hidden lg:block">
          <div className="sticky top-[136px] space-y-4">
            {sections.map(s => (
              <div key={s.id}>
                <a href={`#${s.id}`} className="block text-[12px] font-semibold uppercase tracking-[0.06em] text-[#9C9C95] hover:text-[#161613]">
                  {s.title}
                </a>
                <ul className="mt-1.5 space-y-1">
                  {s.topics.map(t => (
                    <li key={t.id}>
                      <a href={`#${t.id}`} onClick={() => setOpen(o => ({ ...o, [t.id]: true }))} className="block text-[12.5px] leading-snug text-[#6E6E68] hover:text-[#1F3A2F]">
                        {t.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </aside>

        <div className="min-w-0 space-y-10">
          {!searching && paths.length > 0 && (
            <section id="start-here" className="grid gap-3 sm:grid-cols-3">
              {paths.map(p => (
                <div key={p.title} className="rounded-[16px] border border-[#E4E3DC] bg-white p-4">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[#9C9C95]">Start here</p>
                  <p className="mt-1 text-[15px] font-semibold leading-snug text-[#161613]">{p.title}</p>
                  <ol className="mt-2.5 space-y-1.5">
                    {p.topicIds.map((id, i) => {
                      const t = sections.flatMap(x => x.topics).find(x => x.id === id)
                      if (!t) return null
                      return (
                        <li key={id} className="flex gap-2 text-[13px] leading-snug">
                          <span className="w-4 shrink-0 font-mono text-[11.5px] text-[#9C9C95]">{i + 1}</span>
                          <a href={`#${id}`} onClick={() => setOpen(o => ({ ...o, [id]: true }))} className="text-[#2A2A26] hover:text-[#1F3A2F]">
                            {t.title}
                          </a>
                        </li>
                      )
                    })}
                  </ol>
                </div>
              ))}
            </section>
          )}

          {!searching && launches.length > 0 && (
            <section id="new" className="rounded-[16px] border border-[#E4E3DC] bg-white p-4 sm:p-5">
              <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[#9C9C95]">Launched recently</p>
              <ul className="mt-2 divide-y divide-[#E9E8E1]">
                {launches.map(l => (
                  <li key={l.topicId + l.date} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-baseline sm:gap-4">
                    <span className="w-[64px] shrink-0 font-mono text-[11.5px] text-[#9C9C95]">{fmt(l.date)}</span>
                    <span className="min-w-0 flex-1 text-[13.5px] text-[#2A2A26]">
                      <a href={`#${l.topicId}`} onClick={() => setOpen(o => ({ ...o, [l.topicId]: true }))} className="font-semibold text-[#161613] hover:text-[#1F3A2F]">
                        {l.title}
                      </a>{' '}
                      <span className="text-[#6E6E68]">{l.text}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {visible.map(s => (
            <section key={s.id} id={s.id} className="scroll-mt-[150px]">
              <h2 className="text-[21px] font-semibold leading-tight text-[#161613]">{s.title}</h2>
              <p className="mt-1 text-[13.5px] text-[#6E6E68]">{s.lede}</p>
              <div className="mt-4 space-y-3">
                {s.topics.map(t => (
                  <Topic key={t.id} t={t} ts={ts} open={searching || !!open[t.id]} onToggle={() => toggle(t.id)} />
                ))}
              </div>
            </section>
          ))}

          {searching && count === 0 && (
            <div className="rounded-[16px] border border-dashed border-[#D2D1C7] p-6 text-center">
              <p className="text-[14px] font-semibold text-[#161613]">Not in the guide yet</p>
              <p className="mt-1 text-[13px] text-[#6E6E68]">
                Ask in Slack or reply to any email from Lily; the answer usually ends up here. <Link href="/slack" className="font-semibold text-[#1F3A2F] underline underline-offset-2">Open Slack</Link>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Topic({ t, ts, open, onToggle }: { t: GuideTopic; ts: string[]; open: boolean; onToggle: () => void }) {
  return (
    <article id={t.id} className="scroll-mt-[150px] rounded-[16px] border border-[#E4E3DC] bg-white">
      <button type="button" onClick={onToggle} aria-expanded={open} className={`flex w-full items-start justify-between gap-3 rounded-[16px] px-4 py-3.5 text-left sm:px-5 ${FOCUS}`}>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[15.5px] font-semibold leading-snug text-[#161613]">
              <Highlight text={t.title} ts={ts} />
            </span>
            {isNew(t.since) && <span className="rounded-full bg-[#E7EDE9] px-2 py-0.5 text-[10.5px] font-semibold leading-none text-[#1F3A2F]">New</span>}
          </span>
          {!open && (
            <span className="mt-1 block text-[13px] leading-relaxed text-[#6E6E68]">
              <Highlight text={t.summary} ts={ts} />
            </span>
          )}
        </span>
        <span aria-hidden className={`mt-1 shrink-0 text-[#9C9C95] transition-transform ${open ? 'rotate-180' : ''}`}>
          ⌄
        </span>
      </button>

      {open && (
        <div className="border-t border-[#E9E8E1] px-4 pb-5 pt-4 sm:px-5">
          <p className="text-[14px] leading-relaxed text-[#2A2A26]">
            <Highlight text={t.summary} ts={ts} />
          </p>
          {(t.where || t.since) && (
            <p className="mt-2 text-[12.5px] text-[#6E6E68]">
              {t.where && (
                <>
                  Where: <Link href={t.where.href} className="font-semibold text-[#1F3A2F] underline underline-offset-2">{t.where.label}</Link>
                </>
              )}
              {t.where && t.since ? ' · ' : ''}
              {t.since && <>Since {fmt(t.since)}</>}
            </p>
          )}

          {t.visual && <div className="mt-4">{t.visual}</div>}

          {t.steps && t.steps.length > 0 && (
            <div className="mt-5">
              <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[#9C9C95]">Step by step</p>
              <ol className="mt-2 space-y-2">
                {t.steps.map((s, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#E7EDE9] font-mono text-[11.5px] font-semibold text-[#1F3A2F]">{i + 1}</span>
                    <span className="min-w-0 text-[13.5px] leading-relaxed text-[#2A2A26]">
                      <Highlight text={s.do} ts={ts} />
                      {s.then && (
                        <span className="block text-[12.5px] text-[#6E6E68]">
                          <Highlight text={s.then} ts={ts} />
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {t.then && t.then.length > 0 && (
            <div className="mt-5">
              <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[#9C9C95]">What happens next</p>
              <ul className="mt-2 space-y-1.5">
                {t.then.map((x, i) => (
                  <li key={i} className="flex gap-2 text-[13.5px] leading-relaxed text-[#2A2A26]">
                    <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#1F3A2F]" />
                    <span>
                      <Highlight text={x} ts={ts} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {t.rules && t.rules.length > 0 && (
            <div className="mt-5">
              <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[#9C9C95]">Good to know</p>
              <ul className="mt-2 space-y-1.5">
                {t.rules.map((x, i) => (
                  <li key={i} className="flex gap-2 text-[13.5px] leading-relaxed text-[#2A2A26]">
                    <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#C8A24B]" />
                    <span>
                      <Highlight text={x} ts={ts} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {t.emails && t.emails.length > 0 && (
            <div className="mt-5">
              <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[#9C9C95]">What lands in the inbox</p>
              <div className="mt-2 grid gap-3">
                {t.emails.map((e, i) => (
                  <div key={i}>
                    <p className="mb-1 text-[12px] font-medium text-[#6E6E68]">To {e.to}</p>
                    <Letter from={e.from ?? 'Lily Joo <lily@refery.io>'} to={e.to} subject={e.subject} body={e.body} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {t.related && t.related.length > 0 && (
            <p className="mt-5 text-[12.5px] text-[#6E6E68]">
              See also:{' '}
              {t.related.map((id, i) => (
                <span key={id}>
                  {i > 0 ? ' · ' : ''}
                  <a href={`#${id}`} className="font-semibold text-[#1F3A2F] underline underline-offset-2">
                    {id.replace(/-/g, ' ')}
                  </a>
                </span>
              ))}
            </p>
          )}
        </div>
      )}
    </article>
  )
}

export type { ReactNode }
