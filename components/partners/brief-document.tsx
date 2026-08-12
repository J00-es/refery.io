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
import { briefNav } from '@/lib/brief'
import { Inline } from './brief-inline'
import { CopyButton } from './copy-button'

// The document's palette, kept as literals because Tailwind needs finished
// class names. Mirrors the authored briefs: forest green, gold accent, warm
// paper, hairline rules.
const DOC = {
  ink: 'text-[#1D1F1D]',
  body: 'text-[#3C403C]',
  muted: 'text-[#75796F]',
  faint: 'text-[#A9ADA2]',
  green: 'text-[#1F4D3A]',
  deep: 'text-[#173B2D]',
  gold: 'text-[#9A7B2E]',
  line: 'border-[#E6E4DC]',
  card: 'bg-white border border-[#E6E4DC] rounded-[10px]',
}

const romanise = (n: number) => ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'][n] ?? String(n + 1)

// ── blocks ──────────────────────────────────────────────────────────────────

function Stats({ items }: { items: StatItem[] }) {
  return (
    <dl className="my-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((s, i) => (
        <div key={i} className={`${DOC.card} px-4 py-4`}>
          <dt className={`font-serif text-[20px] leading-tight tracking-[-0.02em] sm:text-[23px] ${DOC.deep}`}>
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
          className={`relative border-b border-[#E6E4DC] py-2.5 pl-6 text-[14.5px] leading-relaxed last:border-b-0 ${DOC.body}`}
        >
          <span
            aria-hidden
            className="absolute left-0.5 top-[15px] h-1.5 w-1.5 rounded-full bg-[#1F4D3A]"
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
            <p className={`mt-1 font-serif text-[16.5px] ${DOC.deep}`}>{p.name}</p>
            {p.note && <p className={`mt-1.5 text-[13px] leading-relaxed ${DOC.muted}`}>{p.note}</p>}
            {p.linkedin && (
              <a
                href={p.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2.5 inline-block border-b border-[#CBDDD2] text-[12.5px] font-semibold text-[#1F4D3A] transition-colors hover:border-[#1F4D3A]"
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
          className={`${DOC.card} border-t-[3px] px-6 py-6 ${
            r.secondary ? 'border-t-[#CBDDD2]' : 'border-t-[#1F4D3A]'
          }`}
        >
          {r.tag && (
            <span
              className={`mb-3.5 inline-block rounded-full px-3 py-1 text-[9.5px] font-bold uppercase tracking-[0.14em] ${
                r.secondary
                  ? 'border border-[#E6E4DC] bg-[#FBFAF7] text-[#75796F]'
                  : 'bg-[#1F4D3A] text-white'
              }`}
            >
              {r.tag}
            </span>
          )}
          <h3 className={`font-serif text-[20px] leading-snug ${DOC.ink}`}>{r.title}</h3>
          {r.scope && (
            <p className={`mt-1 text-[11px] font-bold uppercase tracking-[0.1em] ${DOC.gold}`}>{r.scope}</p>
          )}
          {!!r.points?.length && (
            <ul className="mt-4 space-y-2">
              {r.points.map((point, j) => (
                <li key={j} className={`relative pl-5 text-[14px] leading-relaxed ${DOC.body}`}>
                  <span aria-hidden className="absolute left-0 top-0 text-[13px] text-[#1F4D3A]">
                    →
                  </span>
                  <Inline text={point} />
                </li>
              ))}
            </ul>
          )}
          {r.want && (
            <p className={`mt-4 border-t border-[#E6E4DC] pt-3.5 text-[13.5px] leading-relaxed ${DOC.body}`}>
              <Inline text={r.want} />
            </p>
          )}
        </article>
      ))}
    </div>
  )
}

const BAR_TONES: Record<BarGroup['tone'], { rule: string; heading: string; mark: string; glyph: string }> = {
  must: { rule: 'border-l-[#1F4D3A]', heading: 'text-[#1F4D3A]', mark: 'text-[#1F4D3A]', glyph: '✓' },
  nice: { rule: 'border-l-[#C8A24B]', heading: 'text-[#9A7B2E]', mark: 'text-[#C8A24B]', glyph: '○' },
  no: { rule: 'border-l-[#B0483C]', heading: 'text-[#B0483C]', mark: 'text-[#B0483C]', glyph: '✕' },
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
                  className="flex gap-3.5 border-b border-[#FBFAF7] py-2 last:border-b-0"
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
                className={`w-[210px] border-b border-[#E6E4DC] bg-[#EDF3EF] px-4 py-3.5 text-left align-top text-[12.5px] font-semibold tracking-[0.03em] ${DOC.deep}`}
              >
                {row.label}
              </th>
              <td className={`border-b border-[#E6E4DC] px-4 py-3.5 align-top text-[14.5px] leading-relaxed ${DOC.body}`}>
                <Inline text={row.value} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className={`${DOC.card} divide-y divide-[#E6E4DC] sm:hidden`}>
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
          <p className={`font-serif text-[16.5px] ${DOC.deep}`}>{c.title}</p>
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
          <p className={`mt-1.5 font-serif text-[17px] italic leading-snug ${DOC.deep}`}>{q.question}</p>
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
    <div className="my-5 overflow-hidden rounded-[12px] border border-[#CBDDD2] bg-white shadow-[0_10px_34px_rgba(31,77,58,0.07)]">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#173B2D] px-5 py-4 sm:px-7">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-white">
            {block.label ?? 'Copy to adapt'}
          </p>
          {block.note && <p className="mt-0.5 text-[12.5px] text-[#B9CDC2]">{block.note}</p>}
        </div>
        <CopyButton text={block.paragraphs.join('\n\n')} label="Copy blurb" />
      </div>
      <div className="px-5 py-6 sm:px-7">
        {block.paragraphs.map((p, i) => (
          <p
            key={i}
            className={`mb-4 font-serif text-[16px] leading-[1.7] last:mb-0 ${
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

function Steps({ items }: { items: string[] }) {
  return (
    <ol className="my-5 space-y-3">
      {items.map((item, i) => (
        <li key={i} className={`${DOC.card} flex gap-4 px-5 py-4 sm:px-6`}>
          <span aria-hidden className={`w-6 shrink-0 font-serif text-[18px] italic ${DOC.gold}`}>
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

function Block({ block }: { block: BriefBlock }) {
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
}

export function BriefDocument({
  content,
  variant = 'standalone',
  ribbonNote = "Refery scouts only · please don't forward",
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
    <div className={standalone ? 'bg-[#FBFAF7]' : ''}>
      {standalone && (
        <div className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-2 bg-[#173B2D] px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.13em] text-white sm:px-8 print:static">
          <span className="flex items-center gap-2">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#C8A24B]" />
            Confidential
          </span>
          <span className="text-[12px] font-medium normal-case tracking-[0.04em] text-[#B9CDC2]">
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
              className={`mt-4 font-serif text-[40px] font-normal leading-[1.02] tracking-[-0.015em] sm:text-[64px] lg:text-[80px] ${DOC.deep}`}
            >
              {content.title}
            </h1>
            {content.subtitle && (
              <p className={`mt-3 font-serif text-[19px] leading-snug sm:text-[24px] ${DOC.ink}`}>
                {content.subtitle}
              </p>
            )}
            {content.url && (
              <p className="mt-2.5">
                <a
                  href={content.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`border-b border-[#E6E4DC] text-[14px] transition-colors hover:text-[#1F4D3A] ${DOC.faint}`}
                >
                  {content.url.replace(/^https?:\/\/(www\.)?/, '')}
                </a>
              </p>
            )}
            <div
              aria-hidden
              className="mt-9 h-[3px] bg-[linear-gradient(90deg,#1F4D3A_0_64px,#E6E4DC_64px_100%)]"
            />
          </header>
        )}

        {content.confidential && (
          <aside className="mt-10 rounded-[8px] border border-[#CBDDD2] border-l-[4px] border-l-[#1F4D3A] bg-[#EDF3EF] px-5 py-5 sm:px-7">
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
          </aside>
        )}

        {standalone && nav.length > 1 && (
          <nav
            aria-label="Brief contents"
            className="mt-8 flex flex-wrap gap-2 border-b border-[#E6E4DC] pb-5 print:hidden"
          >
            {nav.map(item => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className={`rounded-full border border-[#E6E4DC] bg-white px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors hover:border-[#1F4D3A] hover:bg-[#1F4D3A] hover:text-white ${DOC.muted}`}
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
              <div className="mb-5 flex items-baseline gap-3.5 border-b-2 border-[#1F4D3A] pb-3">
                <span aria-hidden className={`font-serif text-[15px] italic ${DOC.gold}`}>
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h2
                  className={`font-serif text-[21px] font-normal leading-snug tracking-[-0.01em] sm:text-[27px] ${DOC.deep}`}
                >
                  {section.heading}
                </h2>
              </div>
              {section.blocks.map((block, i) => (
                <Block key={i} block={block} />
              ))}
            </section>
          ))}
        </div>

        {content.signoff && (
          <footer className="mt-16 flex flex-wrap items-end justify-between gap-4 border-t-[3px] border-[#1F4D3A] pt-6">
            <div>
              <p className={`font-serif text-[20px] ${DOC.deep}`}>{content.signoff.name}</p>
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
      </div>
    </div>
  )
}
