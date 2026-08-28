/**
 * The scout brief, as data.
 *
 * A brief has always been a hand-built HTML file emailed round — beautiful, and
 * completely opaque to the product: you cannot tell from the app whether a
 * mandate has one, who has read it, or which version a scout is working from.
 * So the document is modelled as content and rendered by the app
 * (components/partners/brief-document.tsx) in the same visual language the file
 * already used.
 *
 * Nothing is ever rendered from stored HTML. `partner_briefs.source_html` keeps
 * whatever was imported for the record, but the page draws from `content`
 * alone — which means no third-party markup, scripts or styles reach a viewer,
 * and the brief inherits the app's responsive and print behaviour for free.
 *
 * ── Inline markup ──────────────────────────────────────────────────────────
 * Brief prose needs bold and links and nothing else, so text fields accept a
 * deliberately tiny syntax rather than HTML:
 *
 *     **bold**            →  <strong>
 *     [label](https://…)  →  <a>  (http/https/mailto only)
 *
 * Anything else is literal text. See `parseInline`.
 */

// ── inline text ─────────────────────────────────────────────────────────────

export type InlineNode =
  | { t: 'text'; v: string }
  | { t: 'b'; v: string }
  | { t: 'a'; v: string; href: string }

const INLINE_PATTERN = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g

/** Only schemes that cannot execute. `javascript:` and friends fall through to text. */
function safeHref(href: string): string | null {
  const trimmed = href.trim()
  return /^(https?:\/\/|mailto:|#)/i.test(trimmed) ? trimmed : null
}

/**
 * Splits brief text into renderable nodes. Never returns markup — the caller
 * renders each node as a React element, so there is no HTML injection path.
 */
export function parseInline(raw: string): InlineNode[] {
  const nodes: InlineNode[] = []
  let cursor = 0

  for (const match of raw.matchAll(INLINE_PATTERN)) {
    const at = match.index ?? 0
    if (at > cursor) nodes.push({ t: 'text', v: raw.slice(cursor, at) })

    if (match[1] != null) {
      nodes.push({ t: 'b', v: match[1] })
    } else {
      const href = safeHref(match[3] ?? '')
      nodes.push(href ? { t: 'a', v: match[2], href } : { t: 'text', v: match[0] })
    }
    cursor = at + match[0].length
  }

  if (cursor < raw.length) nodes.push({ t: 'text', v: raw.slice(cursor) })
  return nodes
}

// ── blocks ──────────────────────────────────────────────────────────────────

export interface StatItem {
  value: string
  label: string
}
export interface PersonItem {
  name: string
  role?: string
  note?: string
  linkedin?: string
}
export interface RoleItem {
  tag?: string
  title: string
  scope?: string
  points?: string[]
  want?: string
  /**
   * The disqualifiers — "I will filter out …". Stated as plainly as the bar
   * itself, because a hiring manager corrects a wrong exclusion far faster than
   * they correct a vague requirement.
   */
  exclude?: string
  /** Band and equity, e.g. "$180K to $240K base + 0.25 to 0.75% equity". */
  comp?: string
  /** Rendered with a lighter top rule — a secondary track rather than the priority hire. */
  secondary?: boolean
}
export interface ChecklistItem {
  /** The open question. One line, answerable in one line. */
  ask: string
  /** Why it matters, shown under the question. */
  why?: string
}
export interface BarGroup {
  tone: 'must' | 'nice' | 'no'
  heading: string
  items: string[]
}
export interface FactRow {
  label: string
  value: string
}
export interface CardItem {
  title: string
  body?: string
}
export interface QuestionItem {
  tag?: string
  question: string
  looking_for?: string
}
/**
 * One salary band on the comparison chart.
 *
 * Amounts are whole dollars rather than thousands, because a brief that quotes
 * "$150K to $250K" in prose and stores `150` invites exactly one bug, and it is
 * the expensive kind to find in front of a client.
 */
export interface CompBarRow {
  label: string
  /** The second line: what the band is drawn from, e.g. "28 SF/NY postings". */
  note?: string
  low: number
  high: number
  /**
   * `ours` is the client's own band and is drawn solid; `peer` is the market at
   * the same stage; `named` is the specific companies they said they hire from,
   * which is the comparison that actually changes a mind.
   */
  tone?: 'ours' | 'peer' | 'named'
}
export interface TableRow {
  cells: string[]
  /** Drawn as the client's own line rather than as market data. */
  emphasis?: boolean
}
export interface JdPart {
  heading: string
  paragraphs?: string[]
  items?: string[]
}
/**
 * A job description drafted for the client, collapsed until they open it.
 *
 * Two full JDs inline would bury the sections after them, and the hiring manager
 * reads this on a phone. Collapsed, they are two lines; opened, they are the
 * thing that gets posted.
 */
export interface JdItem {
  title: string
  meta?: string
  parts: JdPart[]
}

export type BriefBlock =
  | { kind: 'lede'; text: string }
  | { kind: 'paragraph'; text: string; tone?: 'default' | 'note' }
  | { kind: 'stats'; items: StatItem[] }
  | { kind: 'bullets'; items: string[] }
  | { kind: 'people'; items: PersonItem[]; footer?: string }
  | { kind: 'roles'; items: RoleItem[] }
  | { kind: 'bar'; groups: BarGroup[] }
  | { kind: 'facts'; rows: FactRow[] }
  | { kind: 'cards'; items: CardItem[] }
  | { kind: 'questions'; items: QuestionItem[] }
  | { kind: 'blurb'; label?: string; note?: string; paragraphs: string[] }
  | { kind: 'steps'; items: string[] }
  | { kind: 'checklist'; items: ChecklistItem[]; note?: string }
  /** A tinted aside inside a section — the aside you'd read out loud. */
  | { kind: 'callout'; text: string }
  /** A sub-heading, for the one or two sections long enough to need turning. */
  | { kind: 'heading'; text: string }
  /** Salary bands on one scale: theirs against the market and against names. */
  | {
      kind: 'compbars'
      rows: CompBarRow[]
      caption?: string
      note?: string
      /** Scale ends. Derived from the rows when absent. */
      min?: number
      max?: number
      /** The legend line, e.g. "your bands · seed peers · hunting grounds". */
      legend?: string
    }
  | { kind: 'table'; columns: string[]; rows: TableRow[]; caption?: string; note?: string }
  | { kind: 'jd'; items: JdItem[]; note?: string }

export interface BriefSection {
  /** Anchor id, used by the in-page contents rail. */
  id: string
  heading: string
  /** Short label for the contents rail; falls back to the heading. */
  nav?: string
  /**
   * The "in short" line. A hiring manager skims the ten headings first and
   * reads the two sections that worry them, so every section says its own
   * conclusion before arguing it.
   */
  summary?: string
  blocks: BriefBlock[]
}

export interface BriefContent {
  kicker?: string
  title: string
  subtitle?: string
  /** The company's own site. Rendered only to viewers who are unlocked. */
  url?: string
  /**
   * `points` is the "if you have two minutes" list: the three or four
   * conclusions, each linking to the section that argues them.
   */
  confidential?: { heading?: string; paragraphs: string[]; pointsHeading?: string; points?: string[] }
  sections: BriefSection[]
  signoff?: { name: string; lines: string[]; reminder?: string }
}

export const EMPTY_BRIEF: BriefContent = { title: '', sections: [] }

/**
 * Coerces whatever is in the JSONB column into something the renderer can walk
 * without exploding. A brief that was hand-edited into an invalid shape should
 * degrade to the sections that survived, not blank the page.
 */
export function normalizeBrief(raw: unknown): BriefContent {
  if (!raw || typeof raw !== 'object') return EMPTY_BRIEF
  const obj = raw as Record<string, unknown>
  const sections = Array.isArray(obj.sections) ? obj.sections : []

  return {
    kicker: str(obj.kicker),
    title: str(obj.title) ?? '',
    subtitle: str(obj.subtitle),
    url: str(obj.url),
    confidential: normalizeConfidential(obj.confidential),
    sections: sections
      .map((s, i) => normalizeSection(s, i))
      .filter((s): s is BriefSection => s !== null),
    signoff: normalizeSignoff(obj.signoff),
  }
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v : undefined
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()) : []
}

/**
 * Table cells keep their blanks. `strList` drops empties, which is right for a
 * bullet list and wrong for a row: dropping one blank cell shifts every cell
 * after it into the wrong column.
 */
function cellList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

/** Finite numbers only. A band whose end is null would draw a bar to nowhere. */
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function normalizeConfidential(v: unknown): BriefContent['confidential'] {
  if (!v || typeof v !== 'object') return undefined
  const o = v as Record<string, unknown>
  const paragraphs = strList(o.paragraphs)
  if (!paragraphs.length) return undefined
  const points = strList(o.points)
  return {
    heading: str(o.heading),
    paragraphs,
    pointsHeading: points.length ? str(o.pointsHeading) : undefined,
    points: points.length ? points : undefined,
  }
}

function normalizeSignoff(v: unknown): BriefContent['signoff'] {
  if (!v || typeof v !== 'object') return undefined
  const o = v as Record<string, unknown>
  const name = str(o.name)
  if (!name) return undefined
  return { name, lines: strList(o.lines), reminder: str(o.reminder) }
}

function normalizeSection(v: unknown, index: number): BriefSection | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const heading = str(o.heading)
  if (!heading) return null
  const blocks = Array.isArray(o.blocks) ? o.blocks : []
  return {
    id: str(o.id) ?? `section-${index + 1}`,
    heading,
    nav: str(o.nav),
    summary: str(o.summary),
    blocks: blocks.map(normalizeBlock).filter((b): b is BriefBlock => b !== null),
  }
}

function normalizeBlock(v: unknown): BriefBlock | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>

  switch (o.kind) {
    case 'lede': {
      const text = str(o.text)
      return text ? { kind: 'lede', text } : null
    }
    case 'paragraph': {
      const text = str(o.text)
      return text ? { kind: 'paragraph', text, tone: o.tone === 'note' ? 'note' : 'default' } : null
    }
    case 'stats': {
      const items = objList(o.items, i => {
        const value = str(i.value)
        const label = str(i.label)
        return value && label ? { value, label } : null
      })
      return items.length ? { kind: 'stats', items } : null
    }
    case 'bullets': {
      const items = strList(o.items)
      return items.length ? { kind: 'bullets', items } : null
    }
    case 'people': {
      const items = objList(o.items, i => {
        const name = str(i.name)
        return name
          ? { name, role: str(i.role), note: str(i.note), linkedin: str(i.linkedin) }
          : null
      })
      return items.length ? { kind: 'people', items, footer: str(o.footer) } : null
    }
    case 'roles': {
      const items = objList(o.items, i => {
        const title = str(i.title)
        return title
          ? {
              title,
              tag: str(i.tag),
              scope: str(i.scope),
              points: strList(i.points),
              want: str(i.want),
              exclude: str(i.exclude),
              comp: str(i.comp),
              secondary: i.secondary === true,
            }
          : null
      })
      return items.length ? { kind: 'roles', items } : null
    }
    case 'bar': {
      const groups = objList<BarGroup>(o.groups, g => {
        const heading = str(g.heading)
        const items = strList(g.items)
        // `g.tone` is unknown, which `===` does not narrow — hence the explicit
        // annotation rather than relying on the ternary's inferred type.
        const tone: BarGroup['tone'] = g.tone === 'nice' ? 'nice' : g.tone === 'no' ? 'no' : 'must'
        return heading && items.length ? { tone, heading, items } : null
      })
      return groups.length ? { kind: 'bar', groups } : null
    }
    case 'facts': {
      const rows = objList(o.rows, r => {
        const label = str(r.label)
        const value = str(r.value)
        return label && value ? { label, value } : null
      })
      return rows.length ? { kind: 'facts', rows } : null
    }
    case 'cards': {
      const items = objList(o.items, i => {
        const title = str(i.title)
        return title ? { title, body: str(i.body) } : null
      })
      return items.length ? { kind: 'cards', items } : null
    }
    case 'questions': {
      const items = objList(o.items, i => {
        const question = str(i.question)
        return question ? { question, tag: str(i.tag), looking_for: str(i.looking_for) } : null
      })
      return items.length ? { kind: 'questions', items } : null
    }
    case 'blurb': {
      const paragraphs = strList(o.paragraphs)
      return paragraphs.length
        ? { kind: 'blurb', paragraphs, label: str(o.label), note: str(o.note) }
        : null
    }
    case 'steps': {
      const items = strList(o.items)
      return items.length ? { kind: 'steps', items } : null
    }
    case 'checklist': {
      const items = objList(o.items, i => {
        const ask = str(i.ask)
        return ask ? { ask, why: str(i.why) } : null
      })
      return items.length ? { kind: 'checklist', items, note: str(o.note) } : null
    }
    case 'callout': {
      const text = str(o.text)
      return text ? { kind: 'callout', text } : null
    }
    case 'heading': {
      const text = str(o.text)
      return text ? { kind: 'heading', text } : null
    }
    case 'compbars': {
      const rows = objList<CompBarRow>(o.rows, r => {
        const label = str(r.label)
        const low = num(r.low)
        const high = num(r.high)
        // A zero-width or inverted band is a typo, not a design; drop it rather
        // than draw a bar that reads as a precise number it never was.
        if (!label || low === null || high === null || high <= low) return null
        const tone: CompBarRow['tone'] =
          r.tone === 'ours' ? 'ours' : r.tone === 'named' ? 'named' : 'peer'
        return { label, note: str(r.note), low, high, tone }
      })
      if (!rows.length) return null
      return {
        kind: 'compbars',
        rows,
        caption: str(o.caption),
        note: str(o.note),
        min: num(o.min) ?? undefined,
        max: num(o.max) ?? undefined,
        legend: str(o.legend),
      }
    }
    case 'table': {
      const columns = strList(o.columns)
      const rows = objList<TableRow>(o.rows, r => {
        const cells = cellList(r.cells)
        return cells.length ? { cells, emphasis: r.emphasis === true } : null
      })
      if (!columns.length || !rows.length) return null
      return { kind: 'table', columns, rows, caption: str(o.caption), note: str(o.note) }
    }
    case 'jd': {
      const items = objList<JdItem>(o.items, i => {
        const title = str(i.title)
        const parts = objList<JdPart>(i.parts, p => {
          const heading = str(p.heading)
          const paragraphs = strList(p.paragraphs)
          const list = strList(p.items)
          if (!heading || (!paragraphs.length && !list.length)) return null
          return {
            heading,
            paragraphs: paragraphs.length ? paragraphs : undefined,
            items: list.length ? list : undefined,
          }
        })
        return title && parts.length ? { title, meta: str(i.meta), parts } : null
      })
      return items.length ? { kind: 'jd', items, note: str(o.note) } : null
    }
    default:
      return null
  }
}

function objList<T>(v: unknown, map: (o: Record<string, unknown>) => T | null): T[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map(map)
    .filter((x): x is T => x !== null)
}

/** Sections worth showing in the contents rail — one with no blocks is noise. */
export function briefNav(content: BriefContent): { id: string; label: string }[] {
  return content.sections
    .filter(s => s.blocks.length)
    .map(s => ({ id: s.id, label: s.nav ?? s.heading }))
}

/**
 * A drafted JD as plain text, for the clipboard.
 *
 * The point of the copy button is that the client pastes this straight into
 * their ATS, so it carries none of the brief's inline syntax: `**bold**` would
 * arrive as literal asterisks in a job post.
 */
export function jdPlainText(item: JdItem): string {
  const lines: string[] = [item.title]
  if (item.meta) lines.push(item.meta)

  for (const part of item.parts) {
    lines.push('', part.heading)
    for (const p of part.paragraphs ?? []) lines.push(plainInline(p))
    for (const i of part.items ?? []) lines.push(`- ${plainInline(i)}`)
  }
  return lines.join('\n')
}

/** Inline syntax stripped back to the words. `[label](href)` keeps the label. */
function plainInline(raw: string): string {
  return parseInline(raw)
    .map(n => n.v)
    .join('')
}

/** The copy-to-candidate block, if the brief has one. Surfaced on the role page. */
export function findBlurb(content: BriefContent): Extract<BriefBlock, { kind: 'blurb' }> | null {
  for (const section of content.sections) {
    for (const block of section.blocks) {
      if (block.kind === 'blurb') return block
    }
  }
  return null
}
