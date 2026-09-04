'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Lock } from 'lucide-react'
import { FOCUS } from '@/lib/desk-ui'

/**
 * The way out of a locked card.
 *
 * An anonymised company with no action on it is a tease — a scout can see there
 * is work behind it and has no idea who to ask. The optional note is the part
 * that actually gets a request approved, so it is offered rather than hidden
 * behind a second screen.
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
      <p className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#8A6A1F]">
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
    router.refresh()
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-full border border-[#D2D1C7] px-3.5 text-[13px] font-semibold text-[#161613] transition-colors hover:border-[#1F3A2F] hover:text-[#1F3A2F] ${FOCUS}`}
      >
        <Lock className="h-3.5 w-3.5" />
        Request access
      </button>
    )
  }

  return (
    <div className="w-full space-y-2">
      <label className="block text-[12px] font-medium text-[#6E6E68]">
        Why you? One line is plenty.
        <textarea
          autoFocus
          rows={2}
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder={`e.g. I have three senior backend people who'd fit ${companyLabel}.`}
          className={`mt-1.5 w-full resize-none rounded-[12px] border border-[#E4E3DC] bg-white px-3 py-2 text-[13.5px] text-[#161613] placeholder:text-[#B8B8B0] ${FOCUS}`}
        />
      </label>
      {error && <p className="text-[12.5px] text-[#A3423A]">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={state === 'sending'}
          className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-full bg-[#1F3A2F] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#142E24] disabled:opacity-60 ${FOCUS}`}
        >
          {state === 'sending' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Send request
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className={`min-h-[38px] px-2 text-[13px] font-medium text-[#6E6E68] hover:text-[#161613] ${FOCUS}`}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
