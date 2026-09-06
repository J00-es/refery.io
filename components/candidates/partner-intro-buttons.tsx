'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { FOCUS } from '@/lib/candidate-ui'

/** The two things a partner can do when Lily has asked them for an intro. */
export function PartnerIntroButtons({ candidateId }: { candidateId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  async function act(action: 'made' | 'send_for_me') {
    setBusy(action)
    setMsg(null)
    try {
      const res = await fetch(`/api/candidates/${candidateId}/intro`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
      const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string }
      setMsg(data.message ?? data.error ?? null)
      if (res.ok) router.refresh()
    } finally {
      setBusy(null)
    }
  }

  const btn = (cls: string) => `inline-flex min-h-[38px] items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold transition-colors disabled:opacity-50 ${FOCUS} ${cls}`

  return (
    <div className="mt-4 rounded-[12px] border border-[#1F3A2F]/30 bg-[#E7EDE9] p-4">
      <p className="text-[13.5px] font-semibold text-[#1F3A2F]">Lily asked you for a warm intro</p>
      <p className="mt-1 text-[12.5px] text-[#2A2A26]">An email with the two of them on it is perfect. Or let Refery write to them and say it came from you.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={!!busy} className={btn('bg-[#1F3A2F] text-white hover:bg-[#142E24]')} onClick={() => act('made')}>
          {busy === 'made' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}I made the intro
        </button>
        <button type="button" disabled={!!busy} className={btn('border border-[#1F3A2F] text-[#1F3A2F] hover:bg-white')} onClick={() => act('send_for_me')}>
          {busy === 'send_for_me' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Send the intro email for me
        </button>
      </div>
      {msg && <p className="mt-2 text-[12.5px] text-[#2A2A26]">{msg}</p>}
    </div>
  )
}
