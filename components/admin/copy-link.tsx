'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

/**
 * A link shown in full with a copy button beside it. The address is the thing
 * that gets pasted into an email, so it is selectable text, not a button label.
 */
export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  const shown = url.replace(/^https?:\/\//, '')

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* the address is on screen; they can select it */
    }
  }

  return (
    <div className="mt-1 flex items-center gap-2">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="truncate font-mono text-[13.5px] text-[#161613] hover:underline"
        title={url}
      >
        {shown}
      </a>
      <button
        type="button"
        onClick={() => void copy()}
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[#E4E3DC] bg-white px-2 py-0.5 text-[12px] text-[#6E6E68] hover:bg-[#F2F1EB]"
        aria-label="Copy link"
      >
        {copied ? <Check className="h-3 w-3 text-[#2F6B3A]" /> : <Copy className="h-3 w-3" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}
