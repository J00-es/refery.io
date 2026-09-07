/**
 * The hiring-manager brief, laid out for a founder on a phone.
 *
 * Same content model as the scout brief (`lib/brief.ts`, blocks drawn by
 * `Block` in brief-document.tsx), different shape around it. A founder reads
 * this between meetings, so the page leads with what they have to do, folds
 * every section down to its "in short" line, and keeps the actions one thumb
 * away at the bottom of a phone screen. Nothing here is a second copy of the
 * content; it is the same JSON, opened differently.
 *
 * Palette and type are the app's own (app/globals.css): cream ground, forest
 * ink, one amber accent, DM Sans throughout.
 */

import type { BriefContent, BriefSection, ChoiceBlock } from '@/lib/brief'
import { Block } from '@/components/partners/brief-document'
import { Inline } from '@/components/partners/brief-inline'
import { BriefTodo, type TodoItem } from './brief-todo'
import { OpenOnHash } from './open-on-hash'
import type { BriefAnswer } from './brief-choice'

const T = {
  ink: 'text-[#161613]',
  body: 'text-[#2A2A26]',
  muted: 'text-[#6E6E68]',
  faint: 'text-[#9C9C95]',
  forest: 'text-[#1F3A2F]',
  amber: 'text-[#8A6A1F]',
  line: 'border-[#E4E3DC]',
}

/** Sections a founder should see open without tapping: the actions, the questions, and the first one. */
function opensByDefault(section: BriefSection, index: number): boolean {
  if (section.open === true) return true
  if (section.open === false) return false
  return index === 0 || section.id === 'start' || section.id === 'confirm'
}

/** Rough words in a section, for the "1 min" tag. Counts every string in the JSON. */
function words(value: unknown): number {
  if (typeof value === 'string') return value.split(/\s+/).filter(Boolean).length
  if (Array.isArray(value)) return value.reduce((n, v) => n + words(v), 0)
  if (value && typeof value === 'object') return Object.values(value).reduce((n, v) => n + words(v), 0)
  return 0
}
const minutes = (w: number) => Math.max(1, Math.round(w / 220))

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** What the founder has to do, read straight off the content. */
function todoItems(content: BriefContent, answers: Record<string, BriefAnswer>): TodoItem[] {
  const items: TodoItem[] = []
  for (const section of content.sections) {
    for (const block of section.blocks) {
      if (block.kind === 'cta') {
        items.push({ kind: 'link', label: block.label, href: block.url, external: /^https?:/.test(block.url) })
      }
      if (block.kind === 'choice') {
        const a = answers[block.key]
        const chosen = a ? block.options.find(o => o.value === a.value)?.label ?? a.value : null
        items.push({ kind: 'choice', label: block.prompt, href: `#${section.id}`, done: Boolean(chosen), detail: chosen ?? undefined })
      }
      if (block.kind === 'checklist') {
        items.push({ kind: 'questions', label: `Answer ${block.items.length} quick ${block.items.length === 1 ? 'question' : 'questions'}`, href: `#${section.id}`, asks: block.items.map(i => i.ask) })
      }
    }
  }
  return items
}

export interface FounderBriefProps {
  content: BriefContent
  ribbonNote: string
  recipientName: string | null
  publishedAt: string | null
  answers: Record<string, BriefAnswer>
  sectionSlots?: Record<string, React.ReactNode>
  checklistSlot?: (ask: string, section: { id: string; label: string }) => React.ReactNode
  choiceSlot?: (block: ChoiceBlock, section: { id: string; label: string }) => React.ReactNode
  footerSlot?: React.ReactNode
}

export function FounderBrief({
  content,
  ribbonNote,
  recipientName,
  publishedAt,
  answers,
  sectionSlots,
  checklistSlot,
  choiceSlot,
  footerSlot,
}: FounderBriefProps) {
  const sections = content.sections.filter(s => s.blocks.length)
  const totalMinutes = minutes(words(sections))
  const todo = todoItems(content, answers)
  const primary = todo.find(t => t.kind === 'link')
  const questions = todo.find(t => t.kind === 'questions')
  const firstName = recipientName?.split(/[\s&,]+/)[0] ?? null

  return (
    <div className="min-h-screen bg-[#F2F1EB]">
      <OpenOnHash />

      <div className="sticky top-0 z-40 flex items-center justify-between gap-3 bg-[#1F3A2F] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#FAF9F5] sm:px-8 print:static">
        <span className="flex items-center gap-2">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#DCC894]" />
          Private link
        </span>
        <span className="truncate text-[11.5px] font-medium normal-case tracking-[0.02em] text-[#C6D6CC]">{ribbonNote}</span>
      </div>

      <div className="mx-auto max-w-[720px] px-4 pb-28 sm:px-6 sm:pb-16">
        <header className="pt-8 sm:pt-12">
          {content.kicker && (
            <p className={`text-[10.5px] font-bold uppercase tracking-[0.18em] ${T.forest}`}>{content.kicker}</p>
          )}
          <h1 className={`mt-2 text-[34px] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-[48px] ${T.ink}`}>
            {content.title}
          </h1>
          {content.subtitle && (
            <p className={`mt-2 text-[15px] font-medium leading-snug sm:text-[17px] ${T.body}`}>{content.subtitle}</p>
          )}
          <p className={`mt-3 text-[12.5px] ${T.muted}`}>
            {[
              recipientName ? `For ${recipientName}` : null,
              publishedAt ? formatDate(publishedAt) : null,
              `${totalMinutes} min read, less if you only open what you need`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </header>

        {content.confidential && (
          <div className={`mt-6 border-l-[3px] border-l-[#1F3A2F] pl-4 ${T.body}`}>
            {content.confidential.paragraphs.map((p, i) => (
              <p key={i} className="text-[14.5px] leading-relaxed [&+p]:mt-2">
                <Inline text={p} />
              </p>
            ))}
          </div>
        )}

        {todo.length > 0 && (
          <BriefTodo items={todo} heading={firstName ? `${firstName}, your part` : 'Your part'} />
        )}

        <div className="mt-6 space-y-2.5">
          {sections.map((section, index) => {
            const label = section.nav ?? section.heading
            const mins = minutes(words(section))
            return (
              <details
                key={section.id}
                id={section.id}
                open={opensByDefault(section, index)}
                className="group scroll-mt-14 rounded-[12px] border border-[#E4E3DC] bg-white open:shadow-[0_1px_0_#E4E3DC]"
              >
                <summary className="flex cursor-pointer select-none list-none items-start gap-3 px-4 py-3.5 sm:px-6 [&::-webkit-details-marker]:hidden">
                  <span aria-hidden className={`mt-[3px] w-5 shrink-0 text-[12px] font-semibold ${T.amber}`}>
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className={`text-[17px] font-semibold leading-snug tracking-[-0.01em] sm:text-[19px] ${T.ink}`}>
                        {section.heading}
                      </span>
                      <span className={`shrink-0 text-[11.5px] ${T.faint}`}>
                        <span className="group-open:hidden">{mins} min</span>
                        <span className="hidden group-open:inline">Close</span>
                      </span>
                    </span>
                    {section.summary && (
                      <span className={`mt-1 block text-[13.5px] leading-relaxed group-open:hidden ${T.muted}`}>
                        <Inline text={section.summary} />
                      </span>
                    )}
                  </span>
                </summary>
                <div className="border-t border-[#E4E3DC] px-4 pb-5 pt-4 sm:px-6">
                  {section.summary && (
                    <p className={`mb-4 text-[13.5px] leading-relaxed ${T.muted}`}>
                      <span className={`mr-2 text-[10.5px] font-bold uppercase tracking-[0.14em] ${T.amber}`}>In short</span>
                      <Inline text={section.summary} />
                    </p>
                  )}
                  {section.blocks.map((block, i) => (
                    <Block
                      key={i}
                      block={block}
                      checklistSlot={checklistSlot && (ask => checklistSlot(ask, { id: section.id, label }))}
                      choiceSlot={choiceSlot && (block => choiceSlot(block, { id: section.id, label }))}
                    />
                  ))}
                  {sectionSlots?.[section.id]}
                </div>
              </details>
            )
          })}
        </div>

        {content.signoff && (
          <footer className="mt-10 border-t-2 border-[#1F3A2F] pt-5">
            <p className={`text-[17px] font-semibold ${T.ink}`}>{content.signoff.name}</p>
            {content.signoff.lines.map((line, i) => (
              <p key={i} className={`text-[13px] leading-relaxed ${T.muted}`}>
                <Inline text={line} />
              </p>
            ))}
          </footer>
        )}

        {footerSlot}
      </div>

      {(primary || questions) && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-[#E4E3DC] bg-[#FAF9F5]/95 px-4 py-2.5 backdrop-blur sm:hidden print:hidden">
          {primary && (
            <a
              href={primary.href}
              target={primary.external ? '_blank' : undefined}
              rel={primary.external ? 'noopener noreferrer' : undefined}
              className="flex-1 rounded-full bg-[#1F3A2F] px-4 py-2.5 text-center text-[13.5px] font-semibold text-white"
            >
              {primary.label}
            </a>
          )}
          {questions && (
            <a
              href={questions.href}
              className="rounded-full border border-[#1F3A2F] bg-white px-4 py-2.5 text-center text-[13.5px] font-semibold text-[#1F3A2F]"
            >
              Questions
            </a>
          )}
        </div>
      )}
    </div>
  )
}
