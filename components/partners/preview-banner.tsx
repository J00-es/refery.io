'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, Loader2, X } from 'lucide-react'
import { FOCUS } from '@/lib/desk-ui'
import type { PartnerPreview } from '@/lib/partners'

/**
 * The band across the top while previewing.
 *
 * Loud on purpose, and on every page of the desk rather than only the one where
 * the preview started. A super admin who forgets they are previewing will read an
 * anonymised, half-empty desk as the truth and conclude the product is broken —
 * so the state has to be impossible to lose track of, and leaving it has to be
 * one click from wherever they got to.
 *
 * It also says that actions taken here count as the partner's. The buttons
 * underneath are live: a submission made while viewing as Gina is Gina's
 * submission, with the super admin's name on the trail. Better to say that up
 * front than to have someone discover it afterwards.
 */
export function PreviewBanner({ preview }: { preview: PartnerPreview }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function leave() {
    setBusy(true)
    try {
      await fetch('/api/partners/preview', { method: 'DELETE' })
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sticky top-14 z-40 -mx-3 mb-5 flex flex-wrap items-center gap-x-3 gap-y-1.5 bg-[#173B2D] px-4 py-2.5 text-white sm:top-16 sm:-mx-4">
      <Eye className="h-4 w-4 shrink-0 text-[#C8A24B]" aria-hidden />
      <p className="text-[13.5px]">
        Viewing the desk as{' '}
        <strong className="font-semibold">{preview.name}</strong>
        <span className="text-[#B9CDC2]">
          {' '}· {preview.role.replace(/_/g, ' ')} · what you do here is recorded as theirs, with your name alongside
        </span>
      </p>
      <button
        type="button"
        onClick={leave}
        disabled={busy}
        className={`ml-auto inline-flex min-h-[32px] shrink-0 items-center gap-1.5 rounded-full bg-white/15 px-3 text-[12.5px] font-semibold transition-colors hover:bg-white/25 disabled:opacity-60 ${FOCUS}`}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
        Back to my view
      </button>
    </div>
  )
}
