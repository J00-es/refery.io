'use client'

import { useEffect, useState } from 'react'
import { Check, ChevronDown, Minus } from 'lucide-react'
import { FOCUS } from '@/lib/candidate-ui'

/**
 * What a good introduction looks like.
 *
 * Partners kept sending profiles that were never going to place: big-company
 * career paths, people who want to manage rather than build, remote-only, and
 * candidates needing sponsorship we cannot arrange. None of that was written
 * down anywhere they would see it, so the page said what it wanted only after
 * the fact, one rejection at a time.
 *
 * Collapsed state is remembered per browser, the same deal the jobs board note
 * makes: worth reading once, then out of the way of a page people open daily.
 * The collapsed header still carries the one-line version, so a closed panel is
 * a reminder rather than a mystery.
 *
 * Deliberately shown to everyone, super admin included. There is no second code
 * path to keep honest, and seeing it in production is how we know it renders.
 */

const STORAGE_KEY = 'refery.candidates.intro-note.collapsed'

const FIT = [
  {
    lead: 'Hands-on builders and sellers',
    body: ', usually 2 to 5 years in. Individual contributors, not leadership.',
  },
  {
    lead: 'Ex-founders',
    body: ', founding-team members, or early startup operators with clear zero-to-one ownership.',
  },
  {
    lead: 'Engineering:',
    body: ' Founding Engineer, AI/ML, Applied AI or Research, Full-Stack, Backend, DevOps or Deployment, Forward-Deployed Engineer.',
  },
  {
    lead: 'GTM:',
    body: ' Founding GTM, Founding AE, technical B2B or Enterprise Sales, Account Manager or customer ownership.',
  },
  {
    lead: 'In the role’s city',
    body: ', or ready to relocate. Most US demand is San Francisco and New York, onsite.',
  },
]

const NOT_FIT = [
  'Big-company-only backgrounds with no meaningful startup experience.',
  'Candidates who mainly want to manage rather than work hands-on.',
  'Remote-only candidates.',
  'Candidates who need new visa sponsorship.',
]

export function CandidatesIntroNote() {
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
        aria-controls="candidates-intro-note-body"
        className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[#F4F4EE] ${FOCUS}`}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold text-[#161613]">Who to introduce</span>
          <span className="mt-0.5 block text-[13px] leading-[1.5] text-[#6E6E68]">
            People you would personally vouch for, with or without a specific role in mind.
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[#9C9C95] transition-transform ${
            collapsed ? '' : 'rotate-180'
          }`}
        />
      </button>

      {!collapsed && (
        <div
          id="candidates-intro-note-body"
          className="border-t border-[#ECECE6] px-4 pb-4 pt-4"
        >
          <p className="max-w-[68ch] text-[13px] leading-[1.6] text-[#6E6E68]">
            This is the place to introduce exceptional talent you know and would personally vouch
            for, even when you do not have a specific job in mind.{' '}
            <span className="font-semibold text-[#161613]">We review every profile</span> and match
            strong candidates across the best-fit current and future Refery roles.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 sm:gap-6">
            <div>
              <h3 className="mb-2.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.07em] text-[#1F4D3A]">
                <span
                  aria-hidden
                  className="grid h-4 w-4 shrink-0 place-items-center rounded-[5px] bg-[#E9F0EC]"
                >
                  <Check className="h-2.5 w-2.5" strokeWidth={3.2} />
                </span>
                A strong fit
              </h3>
              <ul className="grid gap-1.5">
                {FIT.map(item => (
                  <li
                    key={item.lead}
                    className="relative pl-[15px] text-[12.5px] leading-[1.55] text-[#6E6E68] before:absolute before:left-0 before:top-[7.5px] before:h-[5px] before:w-[5px] before:rounded-full before:bg-[#2E9E6B] before:content-['']"
                  >
                    <span className="font-semibold text-[#161613]">{item.lead}</span>
                    {item.body}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="mb-2.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.07em] text-[#A8564C]">
                <span
                  aria-hidden
                  className="grid h-4 w-4 shrink-0 place-items-center rounded-[5px] bg-[#F5E9E7]"
                >
                  <Minus className="h-2.5 w-2.5" strokeWidth={3.2} />
                </span>
                Not right now
              </h3>
              <ul className="grid gap-1.5">
                {NOT_FIT.map(item => (
                  <li
                    key={item}
                    className="relative pl-[15px] text-[12.5px] leading-[1.55] text-[#6E6E68] before:absolute before:left-0 before:top-[7.5px] before:h-[5px] before:w-[5px] before:rounded-full before:bg-[#D8D8D0] before:content-['']"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-4 grid gap-2 border-t border-[#ECECE6] pt-3.5">
            <p className="text-[12.5px] leading-[1.55] text-[#6E6E68]">
              <span className="font-semibold text-[#161613]">On work authorization.</span> Most US
              roles require existing authorization. A straightforward H-1B transfer may be possible.
              OPT is considered only in exceptional cases with at least 2.5 years remaining.
            </p>
            <p className="text-[12.5px] leading-[1.55] text-[#6E6E68]">
              <span className="font-semibold text-[#161613]">Two ways in.</span> If our team has
              agreed you will support a particular search, add the candidate here, or email the PDF
              CV to{' '}
              <a
                href="mailto:lily@refery.io"
                className={`text-[#1F4D3A] underline underline-offset-2 ${FOCUS}`}
              >
                lily@refery.io
              </a>{' '}
              copying{' '}
              <a
                href="mailto:candidates@refery.io"
                className={`text-[#1F4D3A] underline underline-offset-2 ${FOCUS}`}
              >
                candidates@refery.io
              </a>
              . Emailed CVs land in your candidate list automatically.
            </p>
            <p className="text-[12.5px] leading-[1.55] text-[#6E6E68]">
              <span className="font-semibold text-[#161613]">Coming soon.</span> A dedicated jobs
              page, so you can match candidates straight to a specific role.
            </p>
          </div>

          <p className="mt-3 border-t border-[#ECECE6] pt-3 font-serif text-[17px] leading-[1.35] text-[#161613]">
            Quality over volume. One exceptional profile beats a batch of maybes.
          </p>
        </div>
      )}
    </section>
  )
}
