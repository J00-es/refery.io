import Link from 'next/link'

/**
 * The way back to "how does this actually work".
 *
 * Present on every firm surface, and on the sign-up form before anyone has
 * committed to anything, because the question it answers does not arrive once
 * at the start: it arrives again at the acceptance screen, and again when a
 * colleague is deciding whether to click the invitation.
 *
 * Opens in a new tab from the sign-up and acceptance screens deliberately.
 * Losing a half-filled form to a curiosity click is a real way to lose a firm.
 */
export function GuideLink({
  className = '',
  label = 'How firm accounts work',
  newTab = true,
}: {
  className?: string
  label?: string
  newTab?: boolean
}) {
  return (
    <Link
      href="/firm/guide"
      {...(newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className={`inline-flex min-h-[36px] items-center gap-1.5 text-[13px] font-medium text-[#1F3A2F] underline underline-offset-2 transition-opacity hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F3A2F]/40 ${className}`}
    >
      <span
        aria-hidden
        className="grid h-[17px] w-[17px] shrink-0 place-items-center rounded-full border border-[#1F3A2F] text-[10px] font-bold leading-none"
      >
        ?
      </span>
      {label}
    </Link>
  )
}
