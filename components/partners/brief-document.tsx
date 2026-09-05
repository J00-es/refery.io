/**
 * The scout brief, rendered.
 *
 * This is the same document the briefs were always written as — the confidential
 * ribbon, the numbered sections, the bar blocks, the copyable candidate blurb —
 * except it is drawn from `partner_briefs.content` rather than served as a file.
 * Which means: it sits next to the mandate it describes, it obeys who is allowed
 * to see the client, it reflows on a phone, and it prints.
 *
 * Two presentations, one renderer:
 *   embedded    inside the app shell, on a role or company page.
 *   standalone  its own page, for reading end to end or printing to PDF.
 *
 * The palette is the brief's own rather than the app's. A brief is a document a
 * scout reads at length, not a screen they operate, and it should look like one.
 */

import type {
  BarGroup,
  BriefBlock,
  BriefContent,
  CardItem,
  PersonItem,
  QuestionItem,
  RoleItem,
  StatItem,
} from '@/lib/brief'
import { briefNav, jdPlainText } from '@/lib/brief'
import { Inline } from './brief-inline'
import { CopyButton } from './copy-button'

// The document's palette, kept as literals because Tailwind needs finished
// class names. Mirrors the authored briefs: forest green, gold accent, warm
// paper, hairline rules.
const DOC = {
  ink: 'text-[#161613]',
  body: 'text-[#2A2A26]',
  muted: 'text-[#6E6E68]',
  faint: 'text-[#9C9C95]',
  green: 'text-[#1F3A2F]',
  deep: 'text-[#142E24]',
  gold: 'text-[#9A7B2E]',
  line: 'border-[#E4E3DC]',
  card: 'bg-white border border-[#E4E3DC] rounded-[10px]',
}

const romanise = (n: number) => ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'][n] ?? String(n + 1)

// ── blocks ──────────────────────────────────────────────────────────────────

function Stats({ items }: { items: StatItem[] }) {
  return (
    <dl className="my-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((s, i) => (
        <div key={i} className={`${DOC.card} px-4 py-4`}>
          <dt className={`font-semibold text-[20px] leading-tight tracking-[-0.02em] sm:text-[23px] ${DOC.deep}`}>
            {s.value}
          </dt>
          <dd className={`mt-1.5 text-[10.5px] font-semibold uppercase leading-snug tracking-[0.09em] ${DOC.muted}`}>
            {s.label}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="my-5">
      {items.map((item, i) => (
        <li
          key={i}
          className={`relative border-b border-[#E4E3DC] py-2.5 pl-6 text-[14.5px] leading-relaxed last:border-b-0 ${DOC.body}`}
        >
          <span
            aria-hidden
            className="absolute left-0.5 top-[15px] h-1.5 w-1.5 rounded-full bg-[#1F3A2F]"
          />
          <Inline text={item} />
        </li>
      ))}
    </ul>
  )
}

function People({ items, footer }: { items: PersonItem[]; footer?: string }) {
  return (
    <div className="my-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((p, i) => (
          <div key={i} className={`${DOC.card} px-5 py-4`}>
            {p.role && (
              <p className={`text-[10px] font-bold uppercase tracking-[0.12em] ${DOC.gold}`}>{p.role}</p>
            )}
            <p className={`mt-1 font-semibold text-[16.5px] ${DOC.deep}`}>{p.name}</p>
            {p.note && <p className={`mt-1.5 text-[13px] leading-relaxed ${DOC.muted}`}>{p.note}</p>}
            {p.linkedin && (
              <a
                href={p.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2.5 inline-block border-b border-[#C6D6CC] text-[12.5px] font-semibold text-[#1F3A2F] transition-colors hover:border-[#1F3A2F]"
              >
                LinkedIn
              </a>
            )}
          </div>
        ))}
      </div>
      {footer && (
        <p className={`mt-3.5 text-[13.5px] ${DOC.muted}`}>
          <Inline text={footer} />
        </p>
      )}
    </div>
  )
}

function Roles({ items }: { items: RoleItem[] }) {
  return (
    <div className="my-5 grid gap-4 lg:grid-cols-2">
      {items.map((r, i) => (
        <article
          key={i}
          className={`${DOC.card} flex flex-col border-t-[3px] px-6 py-6 ${
            r.secondary ? 'border-t-[#C6D6CC]' : 'border-t-[#1F3A2F]'
          }`}
        >
          {r.tag && (
            <span
              className={`mb-3.5 inline-block rounded-full px-3 py-1 text-[9.5px] font-bold uppercase tracking-[0.14em] ${
                r.secondary
                  ? 'border border-[#E4E3DC] bg-[#FAF9F5] text-[#6E6E68]'
                  : 'bg-[#1F3A2F] text-white'
              }`}
            >
              {r.tag}
            </span>
          )}
          <h3 className={`font-semibold text-[20px] leading-snug ${DOC.ink}`}>{r.title}</h3>
          {r.scope && (
            <p className={`mt-1 text-[11px] font-bold uppercase tracking-[0.1em] ${DOC.gold}`}>{r.scope}</p>
          )}
          {!!r.points?.length && (
            <ul className="mt-4 space-y-2">
              {r.points.map((point, j) => (
                <li key={j} className={`relative pl-5 text-[14px] leading-relaxed ${DOC.body}`}>
                  <span aria-hidden className="absolute left-0 top-0 text-[13px] text-[#1F3A2F]">
                    →
                  </span>
                  <Inline text={point} />
                </li>
              ))}
            </ul>
          )}
          {r.want && (
            <p className={`mt-4 border-t border-[#E4E3DC] pt-3.5 text-[13.5px] leading-relaxed ${DOC.body}`}>
              <Inline text={r.want} />
            </p>
          )}
          {r.exclude && (
            <p className="mt-2.5 flex gap-2.5 text-[13px] leading-relaxed text-[#8E4239]">
              <span aria-hidden className="shrink-0 font-bold">
                ✕
              </span>
              <span>
                <Inline text={r.exclude} />
              </span>
            </p>
          )}
          {/*
            `mt-auto` on a flex column pins the band to the bottom edge, so comp
            lines up across a row of cards whatever length the bullets ran to.
          */}
          {r.comp && (
            <p className={`mt-auto border-t border-[#E4E3DC] pt-3.5 text-[13.5px] font-semibold ${DOC.deep}`}>
              <Inline text={r.comp} />
            </p>
          )}
        </article>
      ))}
    </div>
  )
}

const BAR_TONES: Record<BarGroup['tone'], { rule: string; heading: string; mark: string; glyph: string }> = {
  must: { rule: 'border-l-[#1F3A2F]', heading: 'text-[#1F3A2F]', mark: 'text-[#1F3A2F]', glyph: '✓' },
  nice: { rule: 'border-l-[#C8A24B]', heading: 'text-[#9A7B2E]', mark: 'text-[#C8A24B]', glyph: '○' },
  no: { rule: 'border-l-[#A8564C]', heading: 'text-[#A8564C]', mark: 'text-[#A8564C]', glyph: '✕' },
}

function Bar({ groups }: { groups: BarGroup[] }) {
  return (
    <div className="my-5 space-y-3.5">
      {groups.map((g, i) => {
        const tone = BAR_TONES[g.tone]
        return (
          <section key={i} className={`${DOC.card} border-l-[3px] px-5 py-5 sm:px-7 ${tone.rule}`}>
            <h4 className={`text-[11px] font-bold uppercase tracking-[0.16em] ${tone.heading}`}>
              {g.heading}
            </h4>
            <ul className="mt-3">
              {g.items.map((item, j) => (
                <li
                  key={j}
                  className="flex gap-3.5 border-b border-[#FAF9F5] py-2 last:border-b-0"
                >
                  <span aria-hidden className={`w-4 shrink-0 text-center text-[13px] font-bold ${tone.mark}`}>
                    {tone.glyph}
                  </span>
                  <span className={`text-[14.5px] leading-relaxed ${DOC.body}`}>
                    <Inline text={item} />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

/**
 * A fact table on a desktop, a definition list on a phone.
 *
 * A two-column table with a 200px label column is unreadable under 400px, and
 * horizontal scroll on a reading document is worse. So the same rows render
 * twice, one presentation hidden at each breakpoint.
 */
function Facts({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <div className="my-5">
      <table className={`hidden w-full border-separate border-spacing-0 overflow-hidden sm:table ${DOC.card}`}>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <th
                scope="row"
                className={`w-[210px] border-b border-[#E4E3DC] bg-[#E7EDE9] px-4 py-3.5 text-left align-top text-[12.5px] font-semibold tracking-[0.03em] ${DOC.deep}`}
              >
                {row.label}
              </th>
              <td className={`border-b border-[#E4E3DC] px-4 py-3.5 align-top text-[14.5px] leading-relaxed ${DOC.body}`}>
                <Inline text={row.value} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className={`${DOC.card} divide-y divide-[#E4E3DC] sm:hidden`}>
        {rows.map((row, i) => (
          <div key={i} className="px-4 py-3.5">
            <dt className={`text-[11px] font-semibold uppercase tracking-[0.09em] ${DOC.green}`}>
              {row.label}
            </dt>
            <dd className={`mt-1 text-[14.5px] leading-relaxed ${DOC.body}`}>
              <Inline text={row.value} />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function Cards({ items }: { items: CardItem[] }) {
  return (
    <div className="my-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((c, i) => (
        <div key={i} className={`${DOC.card} px-5 py-4`}>
          <p className={`font-semibold text-[16.5px] ${DOC.deep}`}>{c.title}</p>
          {c.body && <p className={`mt-1.5 text-[13.5px] leading-relaxed ${DOC.muted}`}>{c.body}</p>}
        </div>
      ))}
    </div>
  )
}

function Questions({ items }: { items: QuestionItem[] }) {
  return (
    <div className="my-5 space-y-3.5">
      {items.map((q, i) => (
        <div key={i} className={`${DOC.card} px-5 py-5 sm:px-6`}>
          {q.tag && (
            <p className={`text-[10px] font-bold uppercase tracking-[0.16em] ${DOC.gold}`}>{q.tag}</p>
          )}
          <p className={`mt-1.5 font-semibold text-[17px] italic leading-snug ${DOC.deep}`}>{q.question}</p>
          {q.looking_for && (
            <p className={`mt-2 text-[13.5px] leading-relaxed ${DOC.muted}`}>
              <Inline text={q.looking_for} />
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

function Blurb({ block }: { block: Extract<BriefBlock, { kind: 'blurb' }> }) {
  return (
    <div className="my-5 overflow-hidden rounded-[12px] border border-[#C6D6CC] bg-white shadow-[0_10px_34px_rgba(31,77,58,0.07)]">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#142E24] px-5 py-4 sm:px-7">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-white">
            {block.label ?? 'Copy to adapt'}
          </p>
          {block.note && <p className="mt-0.5 text-[12.5px] text-[#B4C7BC]">{block.note}</p>}
        </div>
        <CopyButton text={block.paragraphs.join('\n\n')} label="Copy blurb" />
      </div>
      <div className="px-5 py-6 sm:px-7">
        {block.paragraphs.map((p, i) => (
          <p
            key={i}
 className={`mb-4 font-semibold text-[16px] leading-[1.7] last:mb-0 ${
              i === block.paragraphs.length - 1 && block.paragraphs.length > 1
                ? `italic ${DOC.muted}`
                : DOC.ink
            }`}
          >
            <Inline text={p} />
          </p>
        ))}
      </div>
    </div>
  )
}

/** "$150K". Bands are quoted in whole thousands everywhere else in a brief. */
function money(n: number): string {
  return n >= 1000 ? `$${Math.round(n / 1000)}K` : `$${n}`
}

/**
 * Salary bands drawn on one scale.
 *
 * The argument a comp section makes is comparative, and a column of "$150K to
 * $250K" strings does not make it: the reader has to hold eight ranges in their
 * head. Drawn against a shared axis, the gap between their band and the
 * companies they named is the first thing they see, which is the point.
 *
 * Bars are positioned with inline styles because the percentages come from the
 * data; Tailwind only ships class names it can see at build time.
 */
function CompBars({ block }: { block: Extract<BriefBlock, { kind: 'compbars' }> }) {
  const lo = block.min ?? Math.min(...block.rows.map(r => r.low))
  const hi = block.max ?? Math.max(...block.rows.map(r => r.high))
  // Round out to whole $100K so the axis ticks land on readable numbers.
  const floor = Math.floor(lo / 100_000) * 100_000
  const ceil = Math.ceil(hi / 100_000) * 100_000
  const span = Math.max(ceil - floor, 1)
  const pct = (v: number) => ((v - floor) / span) * 100

  const ticks: number[] = []
  for (let t = floor; t <= ceil; t += 100_000) ticks.push(t)

  const fill = {
    ours: 'bg-[#1F3A2F]',
    peer: 'bg-[#B4C7BC]',
    named: 'bg-[#DCC894]',
  }

  return (
    <figure className={`my-6 ${DOC.card} px-4 py-5 sm:px-6`}>
      {(block.caption || block.note) && (
        <figcaption className="mb-4">
          {block.caption && (
            <p className={`text-[11px] font-bold uppercase tracking-[0.15em] ${DOC.green}`}>
              <Inline text={block.caption} />
            </p>
          )}
          {block.note && <p className={`mt-1 text-[12.5px] ${DOC.muted}`}>{block.note}</p>}
        </figcaption>
      )}

      <div className="space-y-3.5">
        {block.rows.map((row, i) => (
          <div key={i} className="sm:flex sm:items-center sm:gap-4">
            <div className="sm:w-[190px] sm:shrink-0">
              <p className={`text-[13px] font-semibold leading-snug ${DOC.deep}`}>{row.label}</p>
              {row.note && <p className={`text-[11.5px] leading-snug ${DOC.muted}`}>{row.note}</p>}
            </div>
            <div className="relative mt-1.5 h-[26px] flex-1 rounded-[4px] bg-[#F2F1EB] sm:mt-0">
              <div
                className={`absolute inset-y-0 rounded-[4px] ${fill[row.tone ?? 'peer']}`}
                style={{ left: `${pct(row.low)}%`, width: `${pct(row.high) - pct(row.low)}%` }}
              />
              <span
                className={`absolute inset-y-0 flex items-center whitespace-nowrap px-2 text-[11.5px] font-semibold tabular-nums ${
                  row.tone === 'ours' ? 'text-white' : DOC.deep
                }`}
                style={{ left: `${pct(row.low)}%` }}
              >
                {money(row.low)} to {money(row.high)}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div aria-hidden className="mt-3 sm:ml-[206px]">
        <div className="flex justify-between border-t border-[#E4E3DC] pt-1.5">
          {ticks.map(t => (
            <span key={t} className={`text-[10.5px] tabular-nums ${DOC.faint}`}>
              {money(t)}
            </span>
          ))}
        </div>
      </div>

      {block.legend && (
        <p className={`mt-3 text-[12px] leading-relaxed ${DOC.muted}`}>
          <Inline text={block.legend} />
        </p>
      )}
    </figure>
  )
}

/**
 * A grid of market data. Scrolls sideways inside its own box on a phone rather
 * than making the whole document scroll, which is what a reader would blame the
 * document for.
 */
function DataTable({ block }: { block: Extract<BriefBlock, { kind: 'table' }> }) {
  return (
    <figure className="my-6">
      {block.caption && (
        <figcaption className={`mb-2 text-[11px] font-bold uppercase tracking-[0.15em] ${DOC.green}`}>
          <Inline text={block.caption} />
        </figcaption>
      )}
      <div className={`overflow-x-auto ${DOC.card}`}>
        <table className="w-full min-w-[560px] border-separate border-spacing-0">
          <thead>
            <tr>
              {block.columns.map((c, i) => (
                <th
                  key={i}
                  scope="col"
                  className={`border-b border-[#E4E3DC] bg-[#E7EDE9] px-4 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-[0.09em] ${DOC.deep}`}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, i) => (
              <tr key={i} className={row.emphasis ? 'bg-[#FAF9F5]' : undefined}>
                {row.cells.map((cell, j) => (
                  <td
                    key={j}
                    className={`border-b border-[#E4E3DC] px-4 py-3 align-top text-[13px] leading-relaxed tabular-nums ${
                      row.emphasis && j === 0 ? `font-semibold ${DOC.deep}` : DOC.body
                    }`}
                  >
                    <Inline text={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {block.note && <p className={`mt-2 text-[12.5px] ${DOC.muted}`}>{block.note}</p>}
    </figure>
  )
}

/**
 * The drafted job descriptions, collapsed.
 *
 * `<details>` rather than state: it opens without JavaScript, it prints open in
 * some browsers, and find-in-page reaches inside it. The copy button gives the
 * plain text, because the thing a client wants from a JD draft is to paste it.
 */
function Jds({ block }: { block: Extract<BriefBlock, { kind: 'jd' }> }) {
  return (
    <div className="my-6 space-y-3">
      {block.note && (
        <p className={`rounded-[8px] border border-[#E4E3DC] bg-[#FAF9F5] px-4 py-3 text-[13.5px] leading-relaxed ${DOC.body}`}>
          <Inline text={block.note} />
        </p>
      )}
      {block.items.map((item, i) => (
        <details key={i} className={`group ${DOC.card} overflow-hidden`}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 sm:px-6">
            <span className="min-w-0">
              <span className={`block font-semibold text-[18px] leading-snug ${DOC.deep}`}>
                {item.title}
              </span>
              {item.meta && (
                <span className={`mt-0.5 block text-[12.5px] ${DOC.muted}`}>{item.meta}</span>
              )}
            </span>
            <span
              className={`shrink-0 text-[11px] font-bold uppercase tracking-[0.13em] ${DOC.gold}`}
            >
              <span className="group-open:hidden">Open draft</span>
              <span className="hidden group-open:inline">Close</span>
            </span>
          </summary>

          <div className="border-t border-[#E4E3DC] px-5 py-5 sm:px-6">
            {item.parts.map((part, j) => (
              <div key={j} className="mb-5 last:mb-0">
                <h4 className={`text-[11px] font-bold uppercase tracking-[0.14em] ${DOC.green}`}>
                  {part.heading}
                </h4>
                {part.paragraphs?.map((p, k) => (
                  <p key={k} className={`mt-2 text-[14.5px] leading-relaxed ${DOC.body}`}>
                    <Inline text={p} />
                  </p>
                ))}
                {!!part.items?.length && (
                  <ul className="mt-2">
                    {part.items.map((li, k) => (
                      <li key={k} className="flex gap-3 py-1">
                        <span aria-hidden className={`w-2 shrink-0 text-[13px] ${DOC.gold}`}>
                          ·
                        </span>
                        <span className={`text-[14.5px] leading-relaxed ${DOC.body}`}>
                          <Inline text={li} />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-[#E4E3DC] pt-4">
              <CopyButton text={jdPlainText(item)} label="Copy this JD" />
              <span className={`text-[12.5px] ${DOC.muted}`}>
                Copies the plain text, ready to paste into your ATS.
              </span>
            </div>
          </div>
        </details>
      ))}
    </div>
  )
}

function Steps({ items }: { items: string[] }) {
  return (
    <ol className="my-5 space-y-3">
      {items.map((item, i) => (
        <li key={i} className={`${DOC.card} flex gap-4 px-5 py-4 sm:px-6`}>
          <span aria-hidden className={`w-6 shrink-0 font-semibold text-[18px] italic ${DOC.gold}`}>
            {romanise(i)}
          </span>
          <span className={`text-[14.5px] leading-relaxed ${DOC.body}`}>
            <Inline text={item} />
          </span>
        </li>
      ))}
    </ol>
  )
}

/**
 * The open questions, one per row.
 *
 * `slot` is how the public hiring-manager page hangs an answer box off each
 * question. Without it this is a plain numbered list, which is all a scout
 * reading the same brief needs.
 */
function Checklist({
  block,
  slot,
}: {
  block: Extract<BriefBlock, { kind: 'checklist' }>
  slot?: (ask: string) => React.ReactNode
}) {
  return (
    <div className="my-5">
      {block.note && (
        <p className={`mb-4 text-[14px] leading-relaxed ${DOC.muted}`}>
          <Inline text={block.note} />
        </p>
      )}
      <ol className="space-y-3">
        {block.items.map((item, i) => (
          <li key={i} className={`${DOC.card} flex gap-3.5 px-5 py-4 sm:px-6`}>
            <span aria-hidden className={`w-5 shrink-0 pt-px font-semibold text-[14px] italic ${DOC.gold}`}>
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`text-[14.5px] leading-relaxed ${DOC.ink}`}>
                <Inline text={item.ask} />
              </p>
              {item.why && (
                <p className={`mt-1 text-[13px] leading-relaxed ${DOC.muted}`}>
                  <Inline text={item.why} />
                </p>
              )}
              {slot?.(item.ask)}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** One block. Exported so the client-brief page can fall back to it for the rare kinds. */
export function Block({ block, checklistSlot }: { block: BriefBlock; checklistSlot?: (ask: string) => React.ReactNode }) {
  switch (block.kind) {
    case 'lede':
      return (
        <p className={`mb-4 text-[16.5px] leading-relaxed ${DOC.ink}`}>
          <Inline text={block.text} />
        </p>
      )
    case 'paragraph':
      return (
        <p
          className={`mb-4 leading-relaxed ${
            block.tone === 'note' ? `text-[14px] ${DOC.muted}` : `text-[15px] ${DOC.body}`
          }`}
        >
          <Inline text={block.text} />
        </p>
      )
    case 'stats':
      return <Stats items={block.items} />
    case 'bullets':
      return <Bullets items={block.items} />
    case 'people':
      return <People items={block.items} footer={block.footer} />
    case 'roles':
      return <Roles items={block.items} />
    case 'bar':
      return <Bar groups={block.groups} />
    case 'facts':
      return <Facts rows={block.rows} />
    case 'cards':
      return <Cards items={block.items} />
    case 'questions':
      return <Questions items={block.items} />
    case 'blurb':
      return <Blurb block={block} />
    case 'steps':
      return <Steps items={block.items} />
    case 'checklist':
      return <Checklist block={block} slot={checklistSlot} />
    case 'callout':
      return (
        <aside className="my-5 rounded-r-[8px] border-l-[3px] border-l-[#1F3A2F] bg-[#E7EDE9] px-5 py-4 sm:px-6">
          <p className={`font-semibold text-[15.5px] leading-[1.65] ${DOC.body}`}>
            <Inline text={block.text} />
          </p>
        </aside>
      )
    case 'heading':
      return (
        <h3
 className={`mb-3 mt-8 border-b border-[#E4E3DC] pb-2 font-semibold text-[19px] leading-snug sm:text-[21px] ${DOC.deep}`}
        >
          {block.text}
        </h3>
      )
    case 'compbars':
      return <CompBars block={block} />
    case 'table':
      return <DataTable block={block} />
    case 'jd':
      return <Jds block={block} />
  }
}

// ── document ────────────────────────────────────────────────────────────────

export interface BriefDocumentProps {
  content: BriefContent
  /**
   * `standalone` gets the confidential ribbon, the full hero and the contents
   * rail. `embedded` drops all three — the page around it already says whose
   * brief this is, and a second ribbon inside a card is just noise.
   */
  variant?: 'standalone' | 'embedded'
  /** Shown on the standalone ribbon, e.g. "Refery scouts only · please don't forward". */
  ribbonNote?: string
  /** Left of the ribbon note. "Confidential" unless the audience needs otherwise. */
  ribbonLabel?: string
  /**
   * Rendered at the foot of the section whose id matches the key. The public
   * hiring-manager page hangs its per-section comment thread here, so a
   * correction lands against the thing it corrects rather than in one long
   * thread at the bottom.
   */
  sectionSlots?: Record<string, React.ReactNode>
  /**
   * Rendered under each checklist question — see `Checklist`. Handed the
   * section it sits in, so an answer can be filed against that section as well
   * as against the question.
   */
  checklistSlot?: (ask: string, section: { id: string; label: string }) => React.ReactNode
  /** Rendered after the signoff, e.g. the general comment thread. */
  footerSlot?: React.ReactNode
}

export function BriefDocument({
  content,
  variant = 'standalone',
  ribbonNote = "Refery scouts only · please don't forward",
  ribbonLabel = 'Confidential',
  sectionSlots,
  checklistSlot,
  footerSlot,
}: BriefDocumentProps) {
  const standalone = variant === 'standalone'
  const nav = briefNav(content)
  const sections = content.sections.filter(s => s.blocks.length)

  if (!sections.length) {
    return (
      <p className={`text-[14px] ${DOC.muted}`}>
        This brief has no content yet.
      </p>
    )
  }

  return (
    <div className={standalone ? 'bg-[#FAF9F5]' : ''}>
      {standalone && (
        <div className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-2 bg-[#142E24] px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.13em] text-white sm:px-8 print:static">
          <span className="flex items-center gap-2">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#C8A24B]" />
            {ribbonLabel}
          </span>
          <span className="text-[12px] font-medium normal-case tracking-[0.04em] text-[#B4C7BC]">
            {ribbonNote}
          </span>
        </div>
      )}

      <div className={standalone ? 'mx-auto max-w-[920px] px-5 pb-24 sm:px-8' : ''}>
        {standalone && (
          <header className="pt-12 sm:pt-16">
            {content.kicker && (
              <p className={`text-[11px] font-bold uppercase tracking-[0.2em] ${DOC.green}`}>
                {content.kicker}
              </p>
            )}
            <h1
 className={`mt-4 text-[40px] font-semibold leading-[1.02] tracking-[-0.035em] sm:text-[64px] lg:text-[80px] ${DOC.deep}`}
            >
              {content.title}
            </h1>
            {content.subtitle && (
              <p className={`mt-3 font-semibold text-[19px] leading-snug sm:text-[24px] ${DOC.ink}`}>
                {content.subtitle}
              </p>
            )}
            {content.url && (
              <p className="mt-2.5">
                <a
                  href={content.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`border-b border-[#E4E3DC] text-[14px] transition-colors hover:text-[#1F3A2F] ${DOC.faint}`}
                >
                  {content.url.replace(/^https?:\/\/(www\.)?/, '')}
                </a>
              </p>
            )}
            <div
              aria-hidden
              className="mt-9 h-[3px] bg-[linear-gradient(90deg,#1F3A2F_0_64px,#E4E3DC_64px_100%)]"
            />
          </header>
        )}

        {content.confidential && (
          <aside className="mt-10 rounded-[8px] border border-[#C6D6CC] border-l-[4px] border-l-[#1F3A2F] bg-[#E7EDE9] px-5 py-5 sm:px-7">
            {content.confidential.heading && (
              <p className={`text-[10.5px] font-bold uppercase tracking-[0.18em] ${DOC.green}`}>
                {content.confidential.heading}
              </p>
            )}
            <div className="mt-3 space-y-2.5">
              {content.confidential.paragraphs.map((p, i) => (
                <p key={i} className={`text-[14.5px] leading-relaxed ${DOC.body}`}>
                  <Inline text={p} />
                </p>
              ))}
            </div>
            {!!content.confidential.points?.length && (
              <div className="mt-4 border-t border-[#C6D6CC] pt-3.5">
                <p className={`text-[10.5px] font-bold uppercase tracking-[0.18em] ${DOC.green}`}>
                  {content.confidential.pointsHeading ?? 'If you have two minutes'}
                </p>
                <ul className="mt-2">
                  {content.confidential.points.map((p, i) => (
                    <li key={i} className="flex gap-3 py-1">
                      <span aria-hidden className={`w-3 shrink-0 font-semibold text-[14px] italic ${DOC.gold}`}>
                        {i + 1}
                      </span>
                      <span className={`text-[14px] leading-relaxed ${DOC.body}`}>
                        <Inline text={p} />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        )}

        {standalone && nav.length > 1 && (
          <nav
            aria-label="Brief contents"
            className="mt-8 flex flex-wrap gap-2 border-b border-[#E4E3DC] pb-5 print:hidden"
          >
            {nav.map(item => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className={`rounded-full border border-[#E4E3DC] bg-white px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors hover:border-[#1F3A2F] hover:bg-[#1F3A2F] hover:text-white ${DOC.muted}`}
              >
                {item.label}
              </a>
            ))}
          </nav>
        )}

        <div className={standalone ? '' : 'space-y-8'}>
          {sections.map((section, index) => (
            <section
              key={section.id}
              id={section.id}
              className={standalone ? 'scroll-mt-16 pt-12 sm:pt-14' : ''}
            >
              <div className="mb-5 flex items-baseline gap-3.5 border-b-2 border-[#1F3A2F] pb-3">
                <span aria-hidden className={`font-semibold text-[15px] italic ${DOC.gold}`}>
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h2
 className={`text-[21px] font-semibold leading-snug tracking-[-0.01em] sm:text-[27px] ${DOC.deep}`}
                >
                  {section.heading}
                </h2>
              </div>
              {section.summary && (
                <p
                  className={`mb-5 rounded-[8px] border border-[#E4E3DC] bg-[#FAF9F5] px-4 py-3 text-[13.5px] leading-relaxed ${DOC.body}`}
                >
                  <span
                    className={`mr-2 text-[10.5px] font-bold uppercase tracking-[0.14em] ${DOC.gold}`}
                  >
                    In short
                  </span>
                  <Inline text={section.summary} />
                </p>
              )}
              {section.blocks.map((block, i) => (
                <Block
                  key={i}
                  block={block}
                  checklistSlot={
                    checklistSlot &&
                    (ask => checklistSlot(ask, { id: section.id, label: section.nav ?? section.heading }))
                  }
                />
              ))}
              {sectionSlots?.[section.id]}
            </section>
          ))}
        </div>

        {content.signoff && (
          <footer className="mt-16 flex flex-wrap items-end justify-between gap-4 border-t-[3px] border-[#1F3A2F] pt-6">
            <div>
              <p className={`font-semibold text-[20px] ${DOC.deep}`}>{content.signoff.name}</p>
              {content.signoff.lines.map((line, i) => (
                <p key={i} className={`text-[13.5px] ${DOC.muted}`}>
                  <Inline text={line} />
                </p>
              ))}
            </div>
            {content.signoff.reminder && (
              <p className={`text-[10.5px] uppercase tracking-[0.13em] ${DOC.faint}`}>
                {content.signoff.reminder}
              </p>
            )}
          </footer>
        )}

        {footerSlot}
      </div>
    </div>
  )
}
