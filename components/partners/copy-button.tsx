'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { FOCUS } from '@/lib/candidate-ui'

/**
 * Copies a block of text and says so. Used for the candidate blurb, which is
 * the one thing in a brief a scout actually takes away with them.
 *
 * `navigator.clipboard` needs a secure context and can be refused outright, so
 * failure is shown rather than swallowed — a button that silently does nothing
 * is worse than one that admits it.
 */
export function CopyButton({
  text,
  label = 'Copy',
  className = '',
}: {
  text: string
  label?: string
  className?: string
}) {
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle')

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setState('done')
    } catch {
      setState('failed')
    }
    setTimeout(() => setState('idle'), 2200)
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-live="polite"
      className={`inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-full bg-[#C8A24B] px-4 text-[12.5px] font-semibold text-[#173B2D] transition-colors hover:bg-[#D8B45C] ${FOCUS} ${className}`}
    >
      {state === 'done' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {state === 'done' ? 'Copied' : state === 'failed' ? 'Copy failed' : label}
    </button>
  )
}
