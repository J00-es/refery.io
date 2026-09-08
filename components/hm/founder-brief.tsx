/**
 * The hiring-manager brief, laid out like the desk.
 *
 * Same content model as the scout brief (`lib/brief.ts`, blocks drawn by
 * `Block` in brief-document.tsx), wrapped in the desk's own language: the
 * masthead with chips, a title, a meta line and the actions on the right; a
 * figures strip; a main column of cards with a sticky rail beside it. The rail
 * carries the founder's to-do list, the contents, and who to write to.
 *
 * On a phone the rail's to-do list moves above the content, every section is
 * a card that folds to its "in short" line, and the primary action rides in a
 * bar at the bottom of the screen.
 *
 * Palette and type are the app's (lib/desk-ui.ts, app/globals.css): cream
 * ground, forest ink, one amber accent, DM Sans throughout.
 */

import type { BriefContent, BriefSection, ChoiceBlock, InviteBlock } from '@/lib/brief'
import { Block } from '@/components/partners/brief-document'
import { Inline } from '@/components/partners/brief-inline'
import { BTN_PRIMARY, BTN_QUIET, CARD, CHIP, CHIP_VALUE, H1, H2, LEDE, META, MUTED } from '@/lib/desk-ui'
import { BriefTodo, type TodoItem } from './brief-todo'
import { OpenOnHash } from './open-on-hash'
import type { BriefAnswer } from './brief-choice'
import type { BriefInvite } from './brief-invite'

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
function todoItems(content: BriefContent, answers: Record<string, BriefAnswer>, invites: BriefInvite[]): TodoItem[] {
  const items: TodoItem[] = []
  for (const section of content.sections) {
    for (const block of section.blocks) {
      if (block.kind === 'cta') {
        items.push({ kind: 'link', label: block.label, href: block.url, external: /^https?:/.test(block.url) })
      }
      if (block.kind === 'invite') {
        items.push({ kind: 'invite', label: block.prompt, href: `#${section.id}`, done: invites.length > 0, detail: invites[0]?.email })
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
  invites: BriefInvite[]
  sectionSlots?: Record<string, React.ReactNode>
  checklistSlot?: (ask: string, section: { id: string; label: string }) => React.ReactNode
  choiceSlot?: (block: ChoiceBlock, section: { id: string; label: string }) => React.ReactNode
  inviteSlot?: (block: InviteBlock, section: { id: string; label: string }) => React.ReactNode
  footerSlot?: React.ReactNode
}

export function FounderBrief({
  content,
  ribbonNote,
  recipientName,
  publishedAt,
  answers,
  invites,
  sectionSlots,
  checklistSlot,
  choiceSlot,
  inviteSlot,
  footerSlot,
}: FounderBriefProps) {
  const sections = content.sections.filter(s => s.blocks.length)
  const totalMinutes = minutes(words(sections))
  const todo = todoItems(content, answers, invites)
  const primary = todo.find(t => t.kind === 'link')
  const questions = todo.find(t => t.kind === 'questions')
  const firstName = recipientName?.split(/[\s&,]+/)[0] ?? null
  const roleCount = content.sections.flatMap(s => s.blocks).filter(b => b.kind === 'roles').flatMap(b => (b.kind === 'roles' ? b.items : [])).length

  const meta = [
    recipientName ? `For ${recipientName}` : null,
    publishedAt ? formatDate(publishedAt) : null,
    `${totalMinutes} min in full, less if you only open what you need`,
  ].filter(Boolean)

  return (
    <div className="min-h-screen bg-[#F2F1EB] text-[#161613]">
      <OpenOnHash />

      {/* Top strip: the wordmark, and whose link this is. */}
      <div className="border-b border-[#E4E3DC] bg-white">
        <div className="mx-auto flex max-w-[1120px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <span className="text-[19px] font-semibold tracking-[-0.02em] text-[#161613]">Refery.</span>
          <span className={`truncate ${META}`}>{ribbonNote}</span>
        </div>
      </div>

      <div className="mx-auto max-w-[1120px] px-4 pb-28 pt-6 sm:px-6 sm:pt-9 lg:pb-16">
        {/* Masthead, in the shape of the role page. */}
        <header>
          <div className="flex flex-wrap items-center gap-2">
            <span className={CHIP_VALUE}>Private brief · {content.title}</span>
            {roleCount > 0 && <span className={CHIP}>{roleCount} {roleCount === 1 ? 'search' : 'searches'}</span>}
            {content.kicker && <span className={CHIP}>{content.kicker.replace(/^Refery\s*·\s*/i, '')}</span>}
          </div>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className={H1}>{content.title}</h1>
              {content.subtitle && <p className={`mt-2 text-[15px] leading-snug text-[#2A2A26] sm:text-[16px]`}>{content.subtitle}</p>}
              <p className={`mt-2 ${META}`}>{meta.join(' · ')}</p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {primary && (
                <a
                  href={primary.href}
                  target={primary.external ? '_blank' : undefined}
                  rel={primary.external ? 'noopener noreferrer' : undefined}
                  className={`${BTN_PRIMARY} min-h-[40px] px-4 text-[13.5px]`}
                >
                  {primary.label}
                </a>
              )}
              {questions && (
                <a href={questions.href} className={`${BTN_QUIET} min-h-[40px] px-4 text-[13.5px]`}>
                  Questions
                </a>
              )}
            </div>
          </div>
        </header>

        {content.confidential && (
          <div className={`mt-6 max-w-[720px] space-y-2 ${LEDE} text-[14.5px] text-[#2A2A26]`}>
            {content.confidential.paragraphs.map((p, i) => (
              <p key={i}>
                <Inline text={p} />
              </p>
            ))}
          </div>
        )}

        <div className="mt-7 grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
          {/* Main column: one card per section, folded to its "in short" line. */}
          <div className="min-w-0 space-y-4">
            {sections.map((section, index) => {
              const label = section.nav ?? section.heading
              const mins = minutes(words(section))
              return (
                <details
                  key={section.id}
                  id={section.id}
                  open={opensByDefault(section, index)}
                  className={`group scroll-mt-6 ${CARD}`}
                >
                  <summary className="flex cursor-pointer select-none list-none items-start gap-3 px-5 py-4 sm:px-6 [&::-webkit-details-marker]:hidden">
                    <span aria-hidden className="mt-[5px] w-6 shrink-0 text-[11.5px] font-semibold text-[#8A6A1F]">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-3">
                        <span className={H2}>{section.heading}</span>
                        <span aria-hidden className="mt-1 shrink-0 text-[#9C9C95] transition-transform group-open:rotate-180">
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3.5 6l4.5 4.5L12.5 6" />
                          </svg>
                        </span>
                      </span>
                      {section.summary && (
                        <span className={`mt-1 block ${LEDE}`}>
                          <Inline text={section.summary} />
                          <span className={`ml-2 ${META}`}>{mins} min</span>
                        </span>
                      )}
                    </span>
                  </summary>
                  <div className="border-t border-[#E9E8E1] px-5 pb-5 pt-4 sm:px-6">
                    {section.blocks.map((block, i) => (
                      <Block
                        key={i}
                        block={block}
                        checklistSlot={checklistSlot && (ask => checklistSlot(ask, { id: section.id, label }))}
                        choiceSlot={choiceSlot && (block => choiceSlot(block, { id: section.id, label }))}
                        inviteSlot={inviteSlot && (block => inviteSlot(block, { id: section.id, label }))}
                      />
                    ))}
                    {sectionSlots?.[section.id]}
                  </div>
                </details>
              )
            })}

            {content.signoff && (
              <div className="pt-2 lg:hidden">
                <p className="text-[15px] font-semibold text-[#161613]">{content.signoff.name}</p>
                {content.signoff.lines.map((line, i) => (
                  <p key={i} className={`text-[13px] leading-relaxed ${MUTED}`}>
                    <Inline text={line} />
                  </p>
                ))}
              </div>
            )}

            {footerSlot}
          </div>
          {/* Rail: first on a phone, beside the content on a desk. */}
          <aside className="order-first space-y-4 lg:order-none lg:sticky lg:top-6">
            {todo.length > 0 && <BriefTodo items={todo} heading={firstName ? `${firstName}, your part` : 'Your part'} />}
            <nav aria-label="On this page" className={`hidden p-4 lg:block ${CARD}`}>
              <p className="text-[12.5px] font-semibold text-[#6E6E68]">On this page</p>
              <ol className="mt-2 space-y-1">
                {sections.map((s, i) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`} className={`flex items-baseline gap-2 py-0.5 text-[13.5px] text-[#2A2A26] transition-colors hover:text-[#1F3A2F]`}>
                      <span className="w-5 shrink-0 text-[11.5px] font-semibold text-[#8A6A1F]">{String(i + 1).padStart(2, '0')}</span>
                      <span>{s.nav ?? s.heading}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
            {content.signoff && (
              <div className={`hidden p-4 lg:block ${CARD}`}>
                <p className="text-[12.5px] font-semibold text-[#6E6E68]">Written by</p>
                <p className="mt-1.5 text-[15px] font-semibold text-[#161613]">{content.signoff.name}</p>
                {content.signoff.lines.map((line, i) => (
                  <p key={i} className={`mt-0.5 text-[13px] leading-relaxed ${MUTED}`}>
                    <Inline text={line} />
                  </p>
                ))}
              </div>
            )}
          </aside>

        </div>
      </div>

      {(primary || questions) && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-[#E4E3DC] bg-[#FAF9F5]/95 px-4 py-2.5 backdrop-blur lg:hidden print:hidden">
          {primary && (
            <a
              href={primary.href}
              target={primary.external ? '_blank' : undefined}
              rel={primary.external ? 'noopener noreferrer' : undefined}
              className={`${BTN_PRIMARY} flex-1`}
            >
              {primary.label}
            </a>
          )}
          {questions && (
            <a href={questions.href} className={`${BTN_QUIET} bg-white`}>
              Questions
            </a>
          )}
        </div>
      )}
    </div>
  )
}
