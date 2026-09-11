'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * "You started setting up a firm. Finish it."
 *
 * Shown on every dashboard page to a partner who described a firm on the
 * sign-up form and has not created it yet. They may have arrived here through
 * a password reset or a bookmark rather than the "Sign in to continue" button,
 * and without this the firm they typed out would never be mentioned again.
 * Hidden on the firm pages themselves, where the form is already in view.
 */
export function FirmDraftBanner({ firmName }: { firmName: string }) {
  const pathname = usePathname()
  if (pathname?.startsWith('/firm')) return null
  return (
    <div className="mb-4 flex flex-col gap-2 rounded-lg border bg-muted/30 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="text-foreground/80">
        You started setting up <strong className="text-foreground">{firmName}</strong> as a firm on the
        sign-up form. What you typed is saved.
      </p>
      <Link href="/firm/new" className="shrink-0 font-medium text-primary underline-offset-4 hover:underline">
        Finish setting up the firm
      </Link>
    </div>
  )
}
