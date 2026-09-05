'use client'

import { Fragment, useMemo } from 'react'

/**
 * Refery brand tokens — mirrored from app/page.tsx so this component
 * looks consistent on the public sign page and inside the admin dashboard.
 */
const C = {
  ink: '#161613',
  ink2: 'rgba(22,22,19,0.72)',
  ink3: 'rgba(22,22,19,0.48)',
  green: '#1F3A2F',
  greenBg: '#E7EDE9',
  border: 'rgba(22,22,19,0.10)',
  borderSoft: 'rgba(22,22,19,0.06)',
}

// The serif is retired platform-wide. Display and body are both DM Sans,
// loaded once in layout.tsx as --font-dm-sans; display type earns its
// contrast from weight and tracking rather than a second family.
const SANS = "var(--font-dm-sans), 'DM Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
const SERIF = SANS

type Block =
  | { type: 'h1'; text: string }
  | { type: 'h2'; num: string | null; rest: string }
  | { type: 'h3'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'table'; rows: string[][] }
  | { type: 'hr' }

/**
 * Lightweight markup parser for Refery agreements:
 *   "# "      document title
 *   "## "     numbered top-level section (e.g. "## 1. Your payout")
 *   "### "    sub-heading
 *   "- "      bullet item (consecutive lines collapse to one list)
 *   "**bold**" inline emphasis (lead-ins, defined terms)
 *   "---"     horizontal rule
 *
 * Plain text without markers (legacy v1.0 agreements signed before the v1.1
 * migration) renders gracefully as paragraphs so historical records remain
 * readable.
 */
function parse(content: string): Block[] {
  if (!content) return []

  const lines = content.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let pBuf: string[] = []
  let ulBuf: string[] = []
  let tableBuf: string[][] = []

  const flushP = () => {
    if (pBuf.length) {
      blocks.push({ type: 'paragraph', text: pBuf.join(' ') })
      pBuf = []
    }
  }
  const flushUl = () => {
    if (ulBuf.length) {
      blocks.push({ type: 'list', items: [...ulBuf] })
      ulBuf = []
    }
  }
  const flushTable = () => {
    if (tableBuf.length) {
      // Drop trailing empty/header rows (e.g. "| | |" or all-empty cells).
      const dataRows = tableBuf.filter((row) => row.some((c) => c.trim() !== ''))
      if (dataRows.length) blocks.push({ type: 'table', rows: dataRows })
      tableBuf = []
    }
  }
  const flushAll = () => {
    flushP()
    flushUl()
    flushTable()
  }

  // Parse one "| a | b | c |" line into cells, trimmed.
  const parseTableRow = (line: string): string[] | null => {
    if (!line.startsWith('|') || !line.endsWith('|')) return null
    return line
      .slice(1, -1)
      .split('|')
      .map((c) => c.trim())
  }
  // Separator row: cells are all dashes (and optional colons for alignment).
  const isTableSeparator = (cells: string[]): boolean =>
    cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c))

  for (const raw of lines) {
    const line = raw.trim()

    if (!line) {
      flushAll()
      continue
    }
    if (line === '---' || line === '***' || line === '___') {
      flushAll()
      blocks.push({ type: 'hr' })
      continue
    }
    if (line.startsWith('# ')) {
      flushAll()
      blocks.push({ type: 'h1', text: line.slice(2).trim() })
      continue
    }
    if (line.startsWith('## ')) {
      flushAll()
      const rest = line.slice(3).trim()
      const m = rest.match(/^(\d+)\.\s+(.+)$/)
      blocks.push(
        m
          ? { type: 'h2', num: m[1], rest: m[2] }
          : { type: 'h2', num: null, rest },
      )
      continue
    }
    if (line.startsWith('### ')) {
      flushAll()
      blocks.push({ type: 'h3', text: line.slice(4).trim() })
      continue
    }
    if (line.startsWith('- ')) {
      flushP()
      flushTable()
      ulBuf.push(line.slice(2).trim())
      continue
    }
    const cells = parseTableRow(line)
    if (cells) {
      flushP()
      flushUl()
      // Skip the markdown separator row.
      if (!isTableSeparator(cells)) tableBuf.push(cells)
      continue
    }
    flushUl()
    flushTable()
    pBuf.push(line)
  }
  flushAll()
  return blocks
}

function renderInline(text: string, keyPrefix: string) {
  if (!text.includes('**')) return text
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong
          key={`${keyPrefix}-b-${i}`}
          style={{
            fontWeight: 600,
            color: C.ink,
            letterSpacing: '-0.005em',
          }}
        >
          {part.slice(2, -2)}
        </strong>
      )
    }
    return <Fragment key={`${keyPrefix}-t-${i}`}>{part}</Fragment>
  })
}

interface AgreementContentProps {
  content: string
  /** Tighter spacing/typography for compact contexts (e.g. dashboard dialog). */
  density?: 'comfortable' | 'compact'
  /** Show the small "REFERY · PARTNER AGREEMENT" eyebrow above the title. */
  showEyebrow?: boolean
  className?: string
}

export function AgreementContent({
  content,
  density = 'comfortable',
  showEyebrow = true,
  className,
}: AgreementContentProps) {
  const blocks = useMemo(() => parse(content), [content])

  // Detect legacy plain-text agreements (no markdown structure at all) so we
  // can still render them readably with a clean paragraph-only fallback.
  const hasStructure = blocks.some(
    (b) =>
      b.type === 'h1' ||
      b.type === 'h2' ||
      b.type === 'h3' ||
      b.type === 'list',
  )

  const compact = density === 'compact'
  const bodySize = compact ? 14 : 16
  const bodyLine = compact ? 1.7 : 1.78
  const sectionGap = compact ? 36 : 56
  const titleSize = compact
    ? 'clamp(28px, 3.4vw, 36px)'
    : 'clamp(36px, 4.4vw, 48px)'
  const h2Size = compact
    ? 'clamp(20px, 2.4vw, 24px)'
    : 'clamp(24px, 3vw, 30px)'

  // ----- Legacy fallback render (plain v1.0 paragraphs) -----
  if (!hasStructure) {
    const paragraphs = content
      .replace(/\r\n/g, '\n')
      .split(/\n\n+/)
      .map((p) => p.trim())
      .filter(Boolean)
    return (
      <article
        className={className}
        style={{
          fontFamily: SANS,
          color: C.ink2,
          fontSize: bodySize,
          lineHeight: bodyLine,
        }}
      >
        {paragraphs.map((p, i) => (
          <p
            key={i}
            style={{
              margin: '0 0 16px 0',
              whiteSpace: 'pre-wrap',
            }}
          >
            {p}
          </p>
        ))}
      </article>
    )
  }

  // ----- Structured render (v1.1+) -----
  let h2Index = 0
  return (
    <article
      className={className}
      style={{
        fontFamily: SANS,
        color: C.ink,
        fontSize: bodySize,
        lineHeight: bodyLine,
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
      }}
    >
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'h1':
            return (
              <header
                key={i}
                style={{
                  marginBottom: compact ? 28 : 40,
                  paddingBottom: compact ? 20 : 28,
                  borderBottom: `1px solid ${C.border}`,
                }}
              >
                {showEyebrow && (
                  <div
                    style={{
                      fontFamily: SANS,
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      color: C.green,
                      marginBottom: 14,
                    }}
                  >
                    Refery
                    <span style={{ color: C.ink3, margin: '0 8px' }}>·</span>
                    Partner Agreement
                  </div>
                )}
                <h1
                  style={{
                    fontFamily: SERIF,
                    fontWeight: 600,
                    fontSize: titleSize,
                    lineHeight: 1.04,
                    letterSpacing: '-0.018em',
                    color: C.ink,
                    margin: 0,
                  }}
                >
                  {block.text}
                </h1>
              </header>
            )

          case 'h2': {
            const isFirst = h2Index === 0
            h2Index += 1
            return (
              <h2
                key={i}
                style={{
                  fontFamily: SERIF,
                  fontWeight: 600,
                  fontSize: h2Size,
                  lineHeight: 1.18,
                  letterSpacing: '-0.012em',
                  color: C.ink,
                  marginTop: isFirst ? (compact ? 8 : 16) : sectionGap,
                  marginBottom: compact ? 14 : 20,
                  paddingTop: isFirst ? 0 : compact ? 24 : 36,
                  borderTop: isFirst ? 'none' : `1px solid ${C.borderSoft}`,
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: compact ? 10 : 14,
                  flexWrap: 'wrap',
                }}
              >
                {block.num && (
                  <em
                    style={{
                      fontStyle: 'italic',
                      color: C.green,
                      fontWeight: 400,
                      fontFamily: SERIF,
                      flexShrink: 0,
                    }}
                  >
                    {block.num}.
                  </em>
                )}
                <span style={{ color: C.ink }}>{block.rest}</span>
              </h2>
            )
          }

          case 'h3':
            return (
              <h3
                key={i}
                style={{
                  fontFamily: SANS,
                  fontWeight: 600,
                  fontSize: compact ? 14 : 15,
                  lineHeight: 1.4,
                  letterSpacing: '-0.005em',
                  color: C.ink,
                  marginTop: compact ? 22 : 32,
                  marginBottom: compact ? 8 : 10,
                }}
              >
                {block.text}
              </h3>
            )

          case 'paragraph':
            return (
              <p
                key={i}
                style={{
                  margin: '0 0 16px 0',
                  color: C.ink2,
                  fontSize: bodySize,
                  lineHeight: bodyLine,
                }}
              >
                {renderInline(block.text, String(i))}
              </p>
            )

          case 'list':
            return (
              <ul
                key={i}
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: '0 0 18px 0',
                }}
              >
                {block.items.map((it, j) => (
                  <li
                    key={j}
                    style={{
                      position: 'relative',
                      paddingLeft: 24,
                      marginBottom: 10,
                      color: C.ink2,
                      fontSize: bodySize,
                      lineHeight: bodyLine,
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        position: 'absolute',
                        left: 6,
                        top: '0.7em',
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: C.green,
                      }}
                    />
                    {renderInline(it, `${i}-${j}`)}
                  </li>
                ))}
              </ul>
            )

          case 'table':
            return (
              <div
                key={i}
                style={{
                  margin: '0 0 24px 0',
                  border: `1px solid ${C.border}`,
                  borderRadius: 10,
                  background: '#fff',
                  overflow: 'hidden',
                }}
              >
                {block.rows.map((row, r) => {
                  const isLast = r === block.rows.length - 1
                  // Two-column "label | value" row (used by "At a glance" tables).
                  if (row.length === 2) {
                    return (
                      <div
                        key={r}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'minmax(140px, 32%) 1fr',
                          alignItems: 'baseline',
                          gap: 16,
                          padding: compact ? '12px 16px' : '16px 22px',
                          borderBottom: isLast ? 'none' : `1px solid ${C.borderSoft}`,
                        }}
                      >
                        <div
                          style={{
                            fontFamily: SANS,
                            fontSize: 11,
                            fontWeight: 600,
                            letterSpacing: '0.1em',
                            textTransform: 'uppercase',
                            color: C.ink3,
                          }}
                        >
                          {renderInline(row[0], `${i}-${r}-l`)}
                        </div>
                        <div
                          style={{
                            fontFamily: SANS,
                            fontSize: bodySize,
                            lineHeight: bodyLine,
                            color: C.ink,
                          }}
                        >
                          {renderInline(row[1], `${i}-${r}-v`)}
                        </div>
                      </div>
                    )
                  }
                  // Generic N-column row (fallback).
                  return (
                    <div
                      key={r}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${row.length}, 1fr)`,
                        gap: 16,
                        padding: compact ? '12px 16px' : '16px 22px',
                        borderBottom: isLast ? 'none' : `1px solid ${C.borderSoft}`,
                        fontFamily: SANS,
                        fontSize: bodySize,
                        lineHeight: bodyLine,
                        color: C.ink,
                      }}
                    >
                      {row.map((cell, c) => (
                        <div key={c}>{renderInline(cell, `${i}-${r}-${c}`)}</div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )

          case 'hr':
            return (
              <hr
                key={i}
                style={{
                  border: 'none',
                  borderTop: `1px solid ${C.border}`,
                  margin: compact ? '24px 0' : '40px 0',
                }}
              />
            )
        }
      })}
    </article>
  )
}
