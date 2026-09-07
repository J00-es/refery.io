'use client'

/**
 * "Your part": the founder's to-do list, read off the brief itself.
 *
 * Links (sign, Slack) are always to do, since we cannot see them happen here.
 * The delivery choice is done once it is saved. The questions count down as
 * answers land in the comment store, so a founder who answered two of four
 * sees "2 to go" rather than the same list every time they open the page.
 */

import { useMemo } from 'react'
import { useBriefComments } from './comments-provider'

export type TodoItem =
  | { kind: 'link'; label: string; href: string; external: boolean }
  | { kind: 'choice'; label: string; href: string; done: boolean; detail?: string }
  | { kind: 'questions'; label: string; href: string; asks: string[] }

function Tick({ done }: { done: boolean }) {
  return (
    <span
      aria-hidden
      className={`mt-[3px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border text-[11px] font-bold ${
        done ? 'border-[#1F3A2F] bg-[#1F3A2F] text-white' : 'border-[#D2D1C7] bg-white text-transparent'
      }`}
    >
      ✓
    </span>
  )
}

export function BriefTodo({ items, heading }: { items: TodoItem[]; heading: string }) {
  const { comments } = useBriefComments()
  const answered = useMemo(() => new Set(comments.filter(c => c.prompt).map(c => c.prompt as string)), [comments])

  const rows = items.map(item => {
    if (item.kind === 'questions') {
      const done = item.asks.filter(a => answered.has(a)).length
      const left = item.asks.length - done
      return {
        key: item.href + item.label,
        href: item.href,
        external: false,
        done: left === 0,
        label: left === 0 ? `${item.asks.length} questions answered. Thank you.` : done ? `${left} of ${item.asks.length} questions to go` : item.label,
        detail: undefined as string | undefined,
      }
    }
    if (item.kind === 'choice') {
      return { key: item.href + item.label, href: item.href, external: false, done: item.done, label: item.done ? `Candidates by ${item.detail}` : item.label, detail: undefined }
    }
    return { key: item.href, href: item.href, external: item.external, done: false, label: item.label, detail: undefined }
  })

  const left = rows.filter(r => !r.done).length

  return (
    <section className="mt-6 rounded-[12px] border border-[#1F3A2F] bg-white px-4 py-4 sm:px-6" aria-label={heading}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-[#161613]">{heading}</h2>
        <span className="text-[11.5px] text-[#9C9C95]">{left === 0 ? 'All done' : `${left} to do`}</span>
      </div>
      <ul className="mt-2.5 space-y-2">
        {rows.map(r => (
          <li key={r.key}>
            <a
              href={r.href}
              target={r.external ? '_blank' : undefined}
              rel={r.external ? 'noopener noreferrer' : undefined}
              className={`flex items-start gap-3 rounded-[8px] px-1 py-1 text-[14.5px] leading-snug transition-colors hover:bg-[#FAF9F5] ${
                r.done ? 'text-[#6E6E68]' : 'font-medium text-[#161613]'
              }`}
            >
              <Tick done={r.done} />
              <span className={r.done ? 'line-through decoration-[#D2D1C7]' : ''}>{r.label}</span>
              {r.external && !r.done && <span aria-hidden className="ml-auto text-[12px] text-[#9C9C95]">↗</span>}
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
