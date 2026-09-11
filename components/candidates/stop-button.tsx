'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function StopButton({ token }: { token: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function stop() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/stop/${token}`, { method: 'POST' })
      if (!res.ok) {
        setError('That did not save. Try again, or write to lily@refery.io.')
        return
      }
      router.refresh()
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="mt-6">
      <button type="button" disabled={busy} onClick={stop} className="inline-flex min-h-[44px] items-center rounded-full bg-[#1F3A2F] px-6 text-[14px] font-semibold text-white hover:bg-[#142E24] disabled:opacity-50">
        Stop email from Refery
      </button>
      {error && <p className="mt-3 text-[13px] text-[#8A3B2B]">{error}</p>}
    </div>
  )
}
