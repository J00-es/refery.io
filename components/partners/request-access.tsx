'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Lock } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { FOCUS } from '@/lib/desk-ui'

/**
 * The way out of a locked card.
 *
 * An anonymised company with no action on it is a tease — a scout can see there
 * is work behind it and has no idea who to ask. The optional note is the part
 * that actually gets a request approved, so it is offered rather than hidden
 * behind a second screen.
 *
 * The note is asked for in a popover anchored to the button, never inline. This
 * button sits in the last column of a row and at the foot of a card; expanding
 * in place squeezed a textarea into a 140px column and broke the row around it.
 * A popover leaves the row exactly as it was, and on a phone it is the same
 * small panel under your thumb.
 */
export function RequestAccess({
  companyId,
  companyLabel,
  pending,
}: {
  companyId: string
  companyLabel: string
  pending: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)

  if (pending || state === 'sent') {
    return (
      <p className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-medium text-[#8A6A1F]">
        <Check className="h-3.5 w-3.5" />
        Access requested
      </p>
    )
  }

  async function submit() {
    setState('sending')
    setError(null)
    const res = await fetch('/api/partners/access-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company_id: companyId, message: message.trim() || undefined }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'Could not send that request.')
      setState('idle')
      return
    }
    setState('sent')
    setOpen(false)
    router.refresh()
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex min-h-[38px] items-center gap-1.5 whitespace-nowrap rounded-full border border-[#D2D1C7] bg-white px-3.5 text-[13px] font-semibold text-[#161613] transition-colors hover:border-[#1F3A2F] hover:text-[#1F3A2F] ${FOCUS}`}
        >
          <Lock className="h-3.5 w-3.5" />
          Request access
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[min(92vw,340px)] rounded-[16px] border-[#E4E3DC] bg-[#FAF9F5] p-4 shadow-[0_12px_32px_rgba(22,22,19,0.10)]"
      >
        <p className="text-[14px] font-semibold text-[#161613]">Ask to be put on this search</p>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-[#6E6E68]">
          Lily reads every request the same day. A line on why you is what gets it approved.
        </p>
        <textarea
          autoFocus
          rows={3}
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder={`e.g. I have three senior backend people who'd fit ${companyLabel}.`}
          className={`mt-3 w-full resize-none rounded-[12px] border border-[#E4E3DC] bg-white px-3 py-2 text-[13.5px] leading-relaxed text-[#161613] placeholder:text-[#B8B8B0] ${FOCUS}`}
        />
        {error && <p className="mt-2 text-[12.5px] text-[#A3423A]">{error}</p>}
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className={`min-h-[38px] px-2.5 text-[13px] font-medium text-[#6E6E68] hover:text-[#161613] ${FOCUS}`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={state === 'sending'}
            className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-full bg-[#1F3A2F] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#142E24] disabled:opacity-60 ${FOCUS}`}
          >
            {state === 'sending' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Send request
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
