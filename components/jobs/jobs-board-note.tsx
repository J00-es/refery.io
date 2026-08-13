'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, Handshake, Radar, Route } from 'lucide-react'
import { FOCUS } from '@/lib/candidate-ui'

/**
 * Explains what this board actually is.
 *
 * Almost every role here was sourced by us, not sent to us — 31,066 of 31,094
 * open roles carry the ingester's default deal type. A scout reading a job
 * card has no way to tell that apart from a signed mandate, and the two call
 * for very different behaviour, so the distinction is stated on the page.
 *
 * Collapsed state is remembered per browser: this is worth reading once and
 * then getting out of the way of a board people visit daily.
 */

const STORAGE_KEY = 'refery.jobs.board-note.collapsed'

const STEPS = [
  {
    icon: Radar,
    title: 'We watch the market, not just our clients',
    body: 'We continuously pull open roles from companies we would want to place people into. Being listed here means we are tracking the role — it does not mean we have a contract for it.',
  },
  {
    icon: Route,
    title: 'We match before we approach',
    body: 'Every role is scored against the candidates in the network, so the strongest fits surface instead of you reading thirty thousand postings. A high-fit match is the signal we act on.',
  },
  {
    icon: Handshake,
    title: 'Then we go and open the door',
    body: 'When a match is strong we look for a real path to the hiring manager — a shared investor, a mutual contact, a direct approach — and turn a watched role into a live conversation.',
  },
]

export function JobsBoardNote() {
  // Starts expanded so a first-time reader always sees it; the stored
  // preference is applied after mount rather than guessed during render, which
  // would mismatch the server HTML.
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === '1') setCollapsed(true)
    } catch {
      // Private mode or blocked storage — expanded is the safe default.
    }
  }, [])

  const toggle = () => {
    setCollapsed(prev => {
      const next = !prev
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
      } catch {
        // Preference is a nicety, not a requirement.
      }
      return next
    })
  }

  return (
    <section className="overflow-hidden rounded-[18px] border border-[#ECECE6] bg-[#FAFAF6]">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        aria-controls="jobs-board-note-body"
        className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[#F4F4EE] ${FOCUS}`}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold text-[#161613]">
            How this board works
          </span>
          <span className="mt-0.5 block text-[13px] leading-[1.5] text-[#6E6E68]">
            These are roles we are eyeing — a sourced watchlist, not a list of searches we have
            been retained on.
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[#9C9C95] transition-transform ${
            collapsed ? '' : 'rotate-180'
          }`}
        />
      </button>

      {!collapsed && (
        <div id="jobs-board-note-body" className="border-t border-[#ECECE6] px-4 pb-4 pt-4">
          <ol className="grid gap-4 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <span
                  aria-hidden
                  className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-[#E9F0EC] text-[#1F4D3A]"
                >
                  <s.icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-[#161613]">
                    <span className="text-[#9C9C95]">{i + 1}. </span>
                    {s.title}
                  </span>
                  <span className="mt-1 block text-[12.5px] leading-[1.55] text-[#6E6E68]">
                    {s.body}
                  </span>
                </span>
              </li>
            ))}
          </ol>

          {/* This paragraph used to point at a "Partner roles" tile and a badge on
              each card. Both are gone: naming which companies we are retained by
              disclosed the client list to everyone with an account. */}
          <p className="mt-4 border-t border-[#ECECE6] pt-3.5 text-[12.5px] leading-[1.55] text-[#6E6E68]">
            <span className="font-semibold text-[#161613]">Treat every role here as ours to open.</span>{' '}
            Being listed does not mean we have an agreement — if we do, you will be briefed on it
            directly rather than reading it off this board.{' '}
            <span className="font-semibold text-[#161613]">Keep all of it confidential:</span>{' '}
            company names and role details stay private until a candidate clears vetting, and that is
            what keeps founders sending us their hardest roles.
          </p>
        </div>
      )}
    </section>
  )
}
