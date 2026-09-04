import { parseInline } from '@/lib/brief'

/**
 * Renders a brief's inline syntax as React elements.
 *
 * Every node becomes an element — there is no `dangerouslySetInnerHTML` path
 * anywhere in the brief renderer, which is what makes it safe to import a
 * document someone else authored.
 */
export function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((node, i) => {
        if (node.t === 'b') {
          return (
            <strong key={i} className="font-semibold text-[#1D1F1D]">
              {node.v}
            </strong>
          )
        }
        if (node.t === 'a') {
          const external = node.href.startsWith('http')
          return (
            <a
              key={i}
              href={node.href}
              {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              className="border-b border-[#CBDDD2] text-[#1F3A2F] transition-colors hover:border-[#1F3A2F]"
            >
              {node.v}
            </a>
          )
        }
        return <span key={i}>{node.v}</span>
      })}
    </>
  )
}
