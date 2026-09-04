'use client'

import { useEffect, useRef, useState } from 'react'
import { EyeOff } from 'lucide-react'
import { avatarTint, initialsOf } from '@/lib/candidate-ui'
import { usableLogo } from '@/lib/company-ui'

/**
 * A company mark that never leaves a broken image on the card.
 *
 * `usableLogo` drops the 10,612 dead Clearbit URLs, but plenty of the rest are
 * 404s or hosts that no longer resolve. Only the browser knows which, so the
 * fallback to initials has to happen on the client — the `complete &&
 * naturalWidth === 0` check catches an image that failed before hydration, which
 * `onError` alone misses.
 *
 * A locked company gets neither logo nor initials: initials are the company's
 * name, one letter at a time.
 */
export function CompanyLogo({
  name,
  url,
  locked = false,
  size = 'md',
}: {
  name: string
  url?: string | null
  locked?: boolean
  size?: 'md' | 'lg'
}) {
  const src = usableLogo(url)
  const [failed, setFailed] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    const img = imgRef.current
    if (img?.complete && img.naturalWidth === 0) setFailed(true)
  }, [src])

  const box =
    size === 'lg'
      ? 'h-14 w-14 rounded-[14px] text-[16px]'
      : 'h-11 w-11 rounded-[12px] text-[14px]'

  if (locked) {
    return (
      <span
        aria-hidden
        className={`grid shrink-0 place-items-center border border-dashed border-[#D2D1C7] bg-[#FAF9F5] text-[#9C9C95] ${box}`}
      >
        <EyeOff className="h-4 w-4" />
      </span>
    )
  }

  if (!src || failed) {
    return (
      <span
        aria-hidden
        className={`grid shrink-0 place-items-center font-semibold ${box} ${avatarTint(name)}`}
      >
        {initialsOf(name)}
      </span>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={imgRef}
      src={src}
      alt=""
      onError={() => setFailed(true)}
      className={`shrink-0 border border-[#E4E3DC] object-contain p-1 ${box}`}
    />
  )
}
