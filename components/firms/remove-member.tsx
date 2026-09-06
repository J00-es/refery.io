'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FOCUS } from '@/lib/candidate-ui'

/**
 * Removing someone from the firm.
 *
 * Two clicks rather than one, and the second one names them. Removal ends
 * somebody's access immediately and moves their records, so a mis-click on a
 * row in a list is exactly the mistake worth making harder.
 *
 * No modal: a confirm step inline keeps the row you are acting on in view,
 * which is the thing a dialog covers up.
 */
export function RemoveMember({ userId, name }: { userId: string; name: string }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function remove() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/firms/members/${userId}`, { method: 'DELETE' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error ?? 'Could not remove them.')
        setConfirming(false)
        return
      }
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  if (error) {
    return (
      <span className="text-right text-[12px] leading-[1.4] text-[#8E4239]">
        {error}
      </span>
    )
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className={`shrink-0 rounded-full border border-[#D2D1C7] px-3 py-1.5 text-[12px] font-semibold text-[#6E6E68] transition-colors hover:border-[#A8564C] hover:text-[#A8564C] ${FOCUS}`}
      >
        Remove
      </button>
    )
  }

  return (
    <span className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        onClick={remove}
        disabled={busy}
        className={`rounded-full bg-[#A8564C] px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-[#8E4239] disabled:opacity-60 ${FOCUS}`}
      >
        {busy ? 'Removing…' : `Remove ${name.split(' ')[0]}`}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={busy}
        className={`text-[12px] font-medium text-[#6E6E68] underline underline-offset-2 ${FOCUS}`}
      >
        Cancel
      </button>
    </span>
  )
}
