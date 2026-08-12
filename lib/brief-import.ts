/**
 * Turns a hand-built scout brief HTML file into `BriefContent`.
 *
 * Briefs are authored as standalone HTML documents, and that is a good way to
 * write one — but the file cannot be versioned, gated, or shown next to the
 * mandate it describes. This reads the document once, on import, so the content
 * lands in the database and the app renders it from then on. The original is
 * kept in `partner_briefs.source_html` purely as a record; it is never served.
 *
 * The parser targets the class vocabulary those briefs are built from
 * (`.sec-head`, `.stats`, `.bar-block`, `table.facts`, `.q`, `.blurb-wrap`, …).
 * Anything it does not recognise degrades to a paragraph rather than being
 * dropped, so an import never silently loses a section — and an admin reviews
 * the result before publishing either way.
 */

import type {
  BarGroup,
  BriefBlock,
  BriefContent,
  BriefSection,
  CardItem,
  PersonItem,
  QuestionItem,
  RoleItem,
  StatItem,
} from '@/lib/brief'

// ── text ────────────────────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
  middot: '·',
  times: '×',
  check: '✓',
}

function decode(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body: string) => {
    if (body.startsWith('#')) {
      const code = body[1]?.toLowerCase() === 'x'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole
    }
    return ENTITIES[body.toLowerCase()] ?? whole
  })
}

function tidy(text: string): string {
  return decode(text).replace(/\s+/g, ' ').trim()
}

/**
 * Inner HTML → the brief's inline syntax (`**bold**`, `[label](href)`).
 * Everything else is flattened to text, which is the point: no third-party
 * markup survives the import.
 */
export function toInline(html: string): string {
  const converted = html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/?(?:b|strong)\s*>/gi, '**')
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, label: string) => {
      const text = tidy(stripTags(label))
      return text ? `[${text}](${href.trim()})` : ''
    })
  // `** **` from an empty <b> pair, or `****`, would read as literal asterisks.
  return tidy(stripTags(converted)).replace(/\*\*\s*\*\*/g, '').trim()
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, '')
}

function toPlain(html: string): string {
  return tidy(stripTags(html.replace(/<br\s*\/?>/gi, ' ')))
}

// ── a very small element scanner ────────────────────────────────────────────

const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'source', 'col'])

interface Element {
  tag: string
  attrs: string
  inner: string
  classes: string[]
  id: string | null
}

function attr(attrs: string, name: string): string | null {
  const match = attrs.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'))
  return match ? match[1] : null
}

/**
 * The direct element children of `html`, in document order.
 *
 * Depth-counted rather than regex-matched, so a `<div>` nested three deep does
 * not terminate its grandparent. Text between elements is ignored — every brief
 * block lives inside an element.
 */
function childElements(html: string): Element[] {
  const out: Element[] = []
  const openTag = /<([a-z][a-z0-9]*)\b([^>]*)>/gi
  let cursor = 0

  while (cursor < html.length) {
    openTag.lastIndex = cursor
    const open = openTag.exec(html)
    if (!open) break

    const tag = open[1].toLowerCase()
    const attrs = open[2] ?? ''
    const contentStart = open.index + open[0].length

    if (VOID_TAGS.has(tag) || attrs.trimEnd().endsWith('/')) {
      cursor = contentStart
      continue
    }

    // Walk forward counting same-tag opens and closes to find the real end.
    const boundary = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi')
    boundary.lastIndex = contentStart
    let depth = 1
    let contentEnd = html.length
    let cursorNext = html.length
    let step: RegExpExecArray | null
    while ((step = boundary.exec(html))) {
      if (step[1]) {
        depth -= 1
        if (depth === 0) {
          contentEnd = step.index
          cursorNext = step.index + step[0].length
          break
        }
      } else if (!step[0].trimEnd().endsWith('/>')) {
        depth += 1
      }
    }

    out.push({
      tag,
      attrs,
      inner: html.slice(contentStart, contentEnd),
      classes: (attr(attrs, 'class') ?? '').split(/\s+/).filter(Boolean),
      id: attr(attrs, 'id'),
    })
    cursor = cursorNext
  }

  return out
}

const has = (el: Element, ...names: string[]) => names.some(n => el.classes.includes(n))

/** First descendant matching a tag and/or class, searched breadth-first. */
function find(html: string, test: (el: Element) => boolean): Element | null {
  const queue = childElements(html)
  while (queue.length) {
    const el = queue.shift()!
    if (test(el)) return el
    queue.push(...childElements(el.inner))
  }
  return null
}

function findAll(html: string, test: (el: Element) => boolean): Element[] {
  const out: Element[] = []
  const queue = childElements(html)
  while (queue.length) {
    const el = queue.shift()!
    if (test(el)) out.push(el)
    else queue.push(...childElements(el.inner))
  }
  return out
}

const byClass = (name: string) => (el: Element) => el.classes.includes(name)
const byTag = (tag: string) => (el: Element) => el.tag === tag

function text(html: string, test: (el: Element) => boolean): string | undefined {
  const el = find(html, test)
  const value = el ? toPlain(el.inner) : ''
  return value || undefined
}

function inlineText(html: string, test: (el: Element) => boolean): string | undefined {
  const el = find(html, test)
  const value = el ? toInline(el.inner) : ''
  return value || undefined
}

// ── blocks ──────────────────────────────────────────────────────────────────

function statsFrom(el: Element): StatItem[] {
  return childElements(el.inner)
    .map(cell => ({
      value: text(cell.inner, byClass('n')) ?? '',
      label: text(cell.inner, byClass('l')) ?? '',
    }))
    .filter(s => s.value && s.label)
}

function peopleFrom(el: Element): PersonItem[] {
  return childElements(el.inner).flatMap<PersonItem>(card => {
    const name = text(card.inner, byTag('b'))
    if (!name) return []
    const link = find(card.inner, byTag('a'))
    return [
      {
        name,
        role: text(card.inner, byClass('role-t')),
        note: text(card.inner, byTag('span')),
        linkedin: link ? (attr(link.attrs, 'href') ?? undefined) : undefined,
      },
    ]
  })
}

function rolesFrom(el: Element): RoleItem[] {
  return childElements(el.inner)
    .filter(card => has(card, 'role'))
    .flatMap<RoleItem>(card => {
      const title = text(card.inner, byTag('h3'))
      if (!title) return []
      return [
        {
          title,
          tag: text(card.inner, byClass('tag')),
          scope: text(card.inner, byClass('scope')),
          points: findAll(card.inner, byTag('li')).map(li => toInline(li.inner)).filter(Boolean),
          want: inlineText(card.inner, byClass('want')),
          secondary: has(card, 'secondary'),
        },
      ]
    })
}

function barGroupFrom(el: Element): BarGroup | null {
  const heading = text(el.inner, byTag('h4'))
  const items = findAll(el.inner, byClass('txt')).map(t => toInline(t.inner)).filter(Boolean)
  if (!heading || !items.length) return null
  const tone: BarGroup['tone'] = has(el, 'nice') ? 'nice' : has(el, 'no') ? 'no' : 'must'
  return { tone, heading, items }
}

function factsFrom(el: Element): { label: string; value: string }[] {
  return findAll(el.inner, byTag('tr'))
    .map(row => {
      const cells = childElements(row.inner).filter(byTag('td'))
      if (cells.length < 2) return null
      const label = toPlain(cells[0].inner)
      const value = toInline(cells[1].inner)
      return label && value ? { label, value } : null
    })
    .filter((r): r is { label: string; value: string } => r !== null)
}

function cardsFrom(el: Element): CardItem[] {
  return childElements(el.inner).flatMap<CardItem>(card => {
    const title = text(card.inner, byTag('b'))
    return title ? [{ title, body: text(card.inner, byTag('span')) }] : []
  })
}

function questionFrom(el: Element): QuestionItem | null {
  const question = text(el.inner, byClass('question'))
  if (!question) return null
  return {
    question,
    tag: text(el.inner, byClass('num')),
    looking_for: inlineText(el.inner, byClass('look')),
  }
}

function blurbFrom(el: Element): Extract<BriefBlock, { kind: 'blurb' }> | null {
  const body = find(el.inner, e => e.id === 'blurbText' || has(e, 'blurb-body'))
  const paragraphs = body
    ? childElements(body.inner).filter(byTag('p')).map(p => toInline(p.inner)).filter(Boolean)
    : []
  if (!paragraphs.length) return null
  const head = find(el.inner, byClass('blurb-head'))
  return {
    kind: 'blurb',
    paragraphs,
    label: head ? text(head.inner, byClass('t')) : undefined,
    note: head ? text(head.inner, byClass('s')) : undefined,
  }
}

function stepsFrom(el: Element): string[] {
  return childElements(el.inner)
    .filter(step => has(step, 'step'))
    .map(step => {
      // A step is "<div class=n>i</div><div>the actual copy</div>" — the numeral
      // is presentation, so only the second cell carries content.
      const cells = childElements(step.inner)
      const body = cells.find(c => !has(c, 'n')) ?? cells[cells.length - 1]
      return body ? toInline(body.inner) : ''
    })
    .filter(Boolean)
}

/**
 * Walks a section's children in order, mapping each to a block. Consecutive
 * `.bar-block` and `.q` siblings collapse into one block each, which is how
 * they read on the page.
 */
function blocksFrom(sectionHtml: string): BriefBlock[] {
  const blocks: BriefBlock[] = []
  const children = childElements(sectionHtml)

  for (const el of children) {
    if (has(el, 'sec-head')) continue

    if (el.tag === 'p') {
      const value = toInline(el.inner)
      if (!value) continue
      if (has(el, 'lede')) blocks.push({ kind: 'lede', text: value })
      else if (has(el, 'note') || has(el, 'more-team'))
        blocks.push({ kind: 'paragraph', text: value, tone: 'note' })
      else blocks.push({ kind: 'paragraph', text: value })
      continue
    }

    if (has(el, 'stats')) {
      const items = statsFrom(el)
      if (items.length) blocks.push({ kind: 'stats', items })
      continue
    }

    if (el.tag === 'ul') {
      const items = findAll(el.inner, byTag('li')).map(li => toInline(li.inner)).filter(Boolean)
      if (items.length) blocks.push({ kind: 'bullets', items })
      continue
    }

    if (has(el, 'team')) {
      const items = peopleFrom(el)
      if (items.length) blocks.push({ kind: 'people', items })
      continue
    }

    if (has(el, 'roles')) {
      const items = rolesFrom(el)
      if (items.length) blocks.push({ kind: 'roles', items })
      continue
    }

    if (has(el, 'bar-block')) {
      const group = barGroupFrom(el)
      if (!group) continue
      const last = blocks[blocks.length - 1]
      if (last?.kind === 'bar') last.groups.push(group)
      else blocks.push({ kind: 'bar', groups: [group] })
      continue
    }

    if (el.tag === 'table') {
      const rows = factsFrom(el)
      if (rows.length) blocks.push({ kind: 'facts', rows })
      continue
    }

    if (has(el, 'geo')) {
      const items = cardsFrom(el)
      if (items.length) blocks.push({ kind: 'cards', items })
      continue
    }

    if (has(el, 'q')) {
      const item = questionFrom(el)
      if (!item) continue
      const last = blocks[blocks.length - 1]
      if (last?.kind === 'questions') last.items.push(item)
      else blocks.push({ kind: 'questions', items: [item] })
      continue
    }

    if (has(el, 'blurb-wrap')) {
      const blurb = blurbFrom(el)
      if (blurb) blocks.push(blurb)
      continue
    }

    if (has(el, 'steps')) {
      const items = stepsFrom(el)
      if (items.length) blocks.push({ kind: 'steps', items })
      continue
    }

    // Unrecognised container: keep whatever prose it holds rather than lose it.
    const fallback = toInline(el.inner)
    if (fallback && fallback.length > 2) blocks.push({ kind: 'paragraph', text: fallback })
  }

  return blocks
}

// ── document ────────────────────────────────────────────────────────────────

function slugify(value: string, index: number): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return slug || `section-${index + 1}`
}

export interface BriefImportResult {
  content: BriefContent
  /** What the parser could not place, so an admin knows what to check. */
  warnings: string[]
}

/**
 * Parses a scout brief document. Always returns content — an unparseable file
 * yields an empty brief plus a warning, never a thrown error, because this runs
 * behind an admin paste box.
 */
export function importBriefHtml(html: string): BriefImportResult {
  const warnings: string[] = []
  const body = html.match(/<body\b[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html
  // Scripts and styles carry no content and would otherwise be scanned as prose.
  const cleaned = body
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')

  const header = find(cleaned, e => e.tag === 'header' || has(e, 'hero'))
  const headerHtml = header?.inner ?? cleaned

  const title =
    text(headerHtml, byTag('h1')) ??
    text(cleaned, byTag('h1')) ??
    html.match(/<title>([^<]*)<\/title>/i)?.[1]?.split('·')[0]?.trim() ??
    ''
  if (!title) warnings.push('No <h1> found — the brief has no title.')

  const urlEl = find(headerHtml, byClass('url'))
  const urlLink = urlEl ? find(urlEl.inner, byTag('a')) : null

  const confEl = find(cleaned, byClass('conf'))
  const confidential = confEl
    ? {
        heading: text(confEl.inner, byClass('stamp')),
        paragraphs: childElements(confEl.inner)
          .filter(byTag('p'))
          .map(p => toInline(p.inner))
          .filter(Boolean),
      }
    : undefined

  const sectionEls = findAll(cleaned, byTag('section'))
  if (!sectionEls.length) warnings.push('No <section> elements found — nothing to render.')

  const sections: BriefSection[] = sectionEls
    .map((el, index) => {
      const head = find(el.inner, byClass('sec-head'))
      const heading =
        (head ? text(head.inner, byTag('h2')) : undefined) ??
        text(el.inner, byTag('h2')) ??
        `Section ${index + 1}`
      const blocks = blocksFrom(el.inner)
      if (!blocks.length) warnings.push(`Section “${heading}” imported with no content.`)
      return { id: el.id ?? slugify(heading, index), heading, blocks }
    })
    .filter(s => s.blocks.length)

  const signEl = find(cleaned, byClass('signoff'))
  const whoEl = signEl ? find(signEl.inner, byClass('who')) : null
  const signoff = whoEl
    ? {
        name: text(whoEl.inner, byTag('b')) ?? '',
        lines: findAll(whoEl.inner, byTag('span')).map(s => toInline(s.inner)).filter(Boolean),
        reminder: signEl ? text(signEl.inner, byClass('remind')) : undefined,
      }
    : undefined

  return {
    content: {
      kicker: text(headerHtml, byClass('kicker')),
      title,
      subtitle: text(headerHtml, byClass('sub')),
      url: urlLink ? (attr(urlLink.attrs, 'href') ?? undefined) : undefined,
      confidential: confidential?.paragraphs.length ? confidential : undefined,
      sections,
      signoff: signoff?.name ? signoff : undefined,
    },
    warnings,
  }
}
