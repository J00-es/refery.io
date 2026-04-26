'use client'

import { Fragment, useMemo } from 'react'
import { cn } from '@/lib/utils'

type Block =
  | { type: 'h1'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'hr' }

/**
 * Parses lightweight markup used in agreement texts:
 *   "# "   document title
 *   "## "  numbered top-level section
 *   "### " sub-heading
 *   "- "   bullet item (consecutive lines = single list)
 *   "**bold**" inline emphasis
 *   "---"  horizontal rule
 *
 * Plain text without markers (legacy v1.0 agreements) renders as
 * paragraphs separated by blank lines, so old signed agreements still
 * display readably.
 */
function parse(content: string): Block[] {
  if (!content) return []
  
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let paraBuffer: string[] = []
  let listBuffer: string[] = []

  const flushParagraph = () => {
    if (paraBuffer.length) {
      blocks.push({ type: 'paragraph', text: paraBuffer.join(' ') })
      paraBuffer = []
    }
  }
  const flushList = () => {
    if (listBuffer.length) {
      blocks.push({ type: 'list', items: [...listBuffer] })
      listBuffer = []
    }
  }
  const flushAll = () => {
    flushParagraph()
    flushList()
  }

  for (const raw of lines) {
    const trimmed = raw.trim()

    if (!trimmed) {
      flushAll()
      continue
    }

    // Document title: # Title
    if (trimmed.startsWith('# ')) {
      flushAll()
      blocks.push({ type: 'h1', text: trimmed.slice(2).trim() })
      continue
    }
    
    // Section heading: ## 1. Section Name
    if (trimmed.startsWith('## ')) {
      flushAll()
      blocks.push({ type: 'h2', text: trimmed.slice(3).trim() })
      continue
    }
    
    // Sub-heading: ### Sub-section
    if (trimmed.startsWith('### ')) {
      flushAll()
      blocks.push({ type: 'h3', text: trimmed.slice(4).trim() })
      continue
    }
    
    // Horizontal rule
    if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
      flushAll()
      blocks.push({ type: 'hr' })
      continue
    }
    
    // Bullet list item: - Item text
    if (trimmed.startsWith('- ')) {
      flushParagraph()
      listBuffer.push(trimmed.slice(2).trim())
      continue
    }

    // Regular paragraph line
    flushList()
    paraBuffer.push(trimmed)
  }

  flushAll()
  return blocks
}

function renderInline(text: string, keyPrefix: string) {
  // Split on **bold** markers, preserving the markers for identification
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean)
  
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      const innerText = part.slice(2, -2)
      return (
        <strong
          key={`${keyPrefix}-${i}`}
          className="font-semibold text-foreground"
        >
          {innerText}
        </strong>
      )
    }
    return <Fragment key={`${keyPrefix}-${i}`}>{part}</Fragment>
  })
}

interface AgreementContentProps {
  content: string
  className?: string
  /** Adds a subtle top border above each numbered section heading. Defaults to true. */
  sectionDividers?: boolean
}

export function AgreementContent({
  content,
  className,
  sectionDividers = true,
}: AgreementContentProps) {
  const blocks = useMemo(() => parse(content), [content])
  let h2Count = 0

  // If no structured blocks were detected (legacy plain text), show as prose
  const hasStructuredContent = blocks.some(
    (b) => b.type === 'h1' || b.type === 'h2' || b.type === 'h3' || b.type === 'list'
  )

  if (!hasStructuredContent && blocks.length > 0) {
    // Fallback: render as simple prose paragraphs
    return (
      <article
        className={cn(
          'prose prose-slate prose-sm max-w-none',
          'prose-p:my-3 prose-p:leading-relaxed',
          className,
        )}
      >
        {blocks.map((block, i) => {
          if (block.type === 'paragraph') {
            return (
              <p key={i} className="text-foreground/80">
                {renderInline(block.text, String(i))}
              </p>
            )
          }
          return null
        })}
      </article>
    )
  }

  return (
    <article
      className={cn(
        'text-[15px] leading-7 text-foreground/80',
        className,
      )}
    >
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'h1':
            return (
              <h1
                key={i}
                className="font-serif text-2xl sm:text-3xl md:text-4xl font-normal text-foreground tracking-tight text-balance mb-4 sm:mb-6"
              >
                {block.text}
              </h1>
            )
          case 'h2': {
            const isFirst = h2Count === 0
            h2Count += 1
            return (
              <h2
                key={i}
                className={cn(
                  'font-serif text-lg sm:text-xl md:text-2xl font-normal text-foreground tracking-tight text-balance',
                  isFirst ? 'mt-6 sm:mt-8' : 'mt-10 sm:mt-12',
                  sectionDividers && !isFirst && 'pt-6 sm:pt-8 border-t border-border/60',
                  'mb-3',
                )}
              >
                {block.text}
              </h2>
            )
          }
          case 'h3':
            return (
              <h3
                key={i}
                className="text-base md:text-[17px] font-semibold text-foreground tracking-tight mt-5 sm:mt-6 mb-2"
              >
                {block.text}
              </h3>
            )
          case 'hr':
            return (
              <hr
                key={i}
                className="my-6 sm:my-8 border-border/50"
              />
            )
          case 'list':
            return (
              <ul key={i} className="my-3 sm:my-4 space-y-2 sm:space-y-2.5">
                {block.items.map((item, j) => (
                  <li
                    key={j}
                    className="flex gap-2.5 sm:gap-3 pl-0.5 sm:pl-1"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-[11px] inline-block h-1 w-1 sm:h-1.5 sm:w-1.5 flex-shrink-0 rounded-full bg-emerald-500/70"
                    />
                    <span className="flex-1">
                      {renderInline(item, `${i}-${j}`)}
                    </span>
                  </li>
                ))}
              </ul>
            )
          case 'paragraph':
          default:
            return (
              <p key={i} className="my-3 sm:my-4 first:mt-0">
                {renderInline(block.text, String(i))}
              </p>
            )
        }
      })}
    </article>
  )
}
