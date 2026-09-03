import Link from 'next/link'

/**
 * A link through to a role, or the same content unlinked when the viewer cannot
 * open it.
 *
 * /jobs is super-admin-only for now (JOBS_SUPER_ADMIN_ONLY), and a link that
 * lands everyone else on a 404 reads as a broken page rather than a hidden one.
 * The role and company still show; only the navigation goes away.
 */
export function JobLink({
  jobId,
  canOpen,
  className,
  children,
}: {
  jobId: string | null | undefined
  canOpen: boolean
  className?: string
  children: React.ReactNode
}) {
  if (!canOpen || !jobId) return <div className={className}>{children}</div>

  return (
    <Link href={`/jobs/${jobId}`} className={className}>
      {children}
    </Link>
  )
}
