'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, Copy, ExternalLink, Eye, Share2 } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { BTN_QUIET, BTN_TEXT, FOCUS, LEDE, META } from '@/lib/desk-ui'

/**
 * "Share with a candidate": the one panel on the role page that hands a
 * partner the candidate version of the search. Their copy of the link
 * carries their code, so a person who taps "I'm interested" lands as theirs.
 */
export function ShareSearch({ url, opens, lastAt, editHref, state }: { url: string | null; opens: number; lastAt: string | null; editHref: string | null; state: 'live' | 'preparing' | 'off' }) {
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle')

  async function copy() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied('done')
    } catch {
      setCopied('failed')
    }
    setTimeout(() => setCopied('idle'), 2200)
  }

  if (state === 'off') return null
  if (state === 'preparing' || !url) {
    return (
      <span className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-[#E4E3DC] px-4 text-[13.5px] font-semibold text-[#9C9C95]" title="The candidate version of this search is being prepared">
        <Share2 className="h-4 w-4" />
        Candidate page: being prepared
      </span>
    )
  }
  const last = lastAt ? relative(lastAt) : null
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={`${BTN_QUIET} min-h-[40px] border-[#1F3A2F] px-4 text-[13.5px] text-[#1F3A2F]`}>
          <Share2 className="h-4 w-4" />
          Share with a candidate
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,420px)] rounded-[16px] border-[#E4E3DC] bg-white p-4 shadow-[0_12px_32px_rgba(22,22,19,0.12)]">
        <p className="text-[17px] font-semibold leading-snug text-[#161613]">The candidate version of this search</p>
        <p className={`mt-1 ${LEDE}`}>The company is not named; the name comes with the first conversation. Nothing from the intake call, the fee or the bar is on it.</p>
        <div className="mt-3.5 flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate rounded-[12px] border border-[#D2D1C7] bg-white px-3 py-2.5 font-mono text-[12.5px] text-[#161613]">{url.replace(/^https?:\/\//, '')}</span>
          <button type="button" onClick={copy} aria-live="polite" className={`inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-full bg-[#C8A24B] px-4 text-[12.5px] font-semibold text-[#173B2D] transition-colors hover:bg-[#D8B45C] ${FOCUS}`}>
            {copied === 'done' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied === 'done' ? 'Copied' : copied === 'failed' ? 'Copy failed' : 'Copy link'}
          </button>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1">
          <a href={url} target="_blank" rel="noopener noreferrer" className={BTN_TEXT}><Eye className="h-3.5 w-3.5" /> See what they see</a>
          <a href={url} target="_blank" rel="noopener noreferrer" className={BTN_TEXT}><ExternalLink className="h-3.5 w-3.5" /> Open</a>
          {editHref && <Link href={editHref} className={BTN_TEXT}>Edit the page</Link>}
        </div>
        <p className={`mt-3 border-t border-[#E4E3DC] pt-3 ${META}`}>
          Your link carries your code, so anyone who taps &ldquo;I&rsquo;m interested&rdquo; lands in your Candidates as yours. Opens so far: <b className="text-[#161613]">{opens}</b>{last ? ` · last opened ${last}` : ''}.
        </p>
      </PopoverContent>
    </Popover>
  )
}

function relative(iso: string): string {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  return days === 1 ? 'yesterday' : `${days} days ago`
}
