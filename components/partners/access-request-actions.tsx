'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { FOCUS } from '@/lib/candidate-ui'

export function AccessRequestActions({ requestId }: { requestId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState<'approved' | 'denied' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function decide(status: 'approved' | 'denied') {
    setBusy(status)
    setError(null)
    try {
      const res = await fetch(`/api/partners/access-requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'Could not save that.')
        return
      }
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => decide('denied')}
          className={`min-h-[38px] px-2.5 text-[13px] font-medium text-[#6E6E68] transition-colors hover:text-[#A3423A] disabled:opacity-60 ${FOCUS}`}
        >
          {busy === 'denied' ? 'Declining…' : 'Decline'}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => decide('approved')}
          className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-full bg-[#1F4D3A] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#173D2E] disabled:opacity-60 ${FOCUS}`}
        >
          {busy === 'approved' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Approve
        </button>
      </div>
      {error && <p className="text-[12px] text-[#A3423A]">{error}</p>}
    </div>
  )
}
