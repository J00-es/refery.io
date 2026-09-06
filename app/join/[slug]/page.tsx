import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getAppUser } from '@/lib/current-user'
import { AGREEMENT_VERSIONS } from '@/lib/agreements'
import { findOpenInvite, firmsEnabled, getMembership } from '@/lib/firms'
import { JoinForm } from '@/components/firms/join-form'

/**
 * Accepting an invitation to a firm.
 *
 * Deliberately outside the dashboard layout. Someone arriving here has just made
 * an account and is still `pending`, and the dashboard would bounce them to the
 * waiting screen before they could accept the very thing that activates them.
 *
 * Never indexed: the URL carries a single-use token.
 */

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata: Metadata = {
  title: 'Join a firm on Refery',
  robots: { index: false, follow: false },
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh bg-[#F2F1EB] px-4 py-10 sm:py-16">
      <div className="mx-auto w-full max-w-[560px]">
        <Link href="/" className="text-[20px] font-bold tracking-[-0.03em] text-[#1F3A2F]">
          Refery<span className="italic">.</span>
        </Link>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  )
}

function Message({ title, body, cta }: { title: string; body: string; cta?: React.ReactNode }) {
  return (
    <div className="rounded-[14px] border border-[#E4E3DC] bg-white p-6">
      <p className="text-[18px] font-semibold tracking-[-0.015em] text-[#161613]">{title}</p>
      <p className="mt-2 text-[14px] leading-[1.6] text-[#6E6E68]">{body}</p>
      {cta && <div className="mt-5">{cta}</div>}
    </div>
  )
}

export default async function JoinFirmPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ token?: string }>
}) {
  const { slug } = await params
  const { token } = await searchParams

  if (!token) {
    return (
      <Shell>
        <Message
          title="This link is incomplete"
          body="An invitation link carries a one-time token. Ask whoever invited you to send it again."
        />
      </Shell>
    )
  }

  const appUser = await getAppUser()
  if (!appUser) {
    // Come back here with the token intact once they have an account.
    redirect(`/auth/login?next=${encodeURIComponent(`/join/${slug}?token=${token}`)}`)
  }
  if (!firmsEnabled(appUser)) {
    return (
      <Shell>
        <Message
          title="Not available yet"
          body="Firm accounts are still in testing. Ask Lily to switch them on for you."
        />
      </Shell>
    )
  }

  const admin = createAdminClient()

  const already = await getMembership(admin, appUser.id)
  if (already) {
    return (
      <Shell>
        <Message
          title={`You are already in ${already.firm.name}`}
          body="A person belongs to one firm on Refery. If this is wrong, tell us and we will move you deliberately rather than by accident."
          cta={
            <Link
              href="/candidates"
              className="inline-flex min-h-[44px] items-center rounded-[10px] bg-[#1F3A2F] px-5 text-[14.5px] font-semibold text-white"
            >
              Open the workspace
            </Link>
          }
        />
      </Shell>
    )
  }

  const invite = await findOpenInvite(admin, token)
  // Expired, revoked, used and never-existed answer identically on purpose.
  if (!invite) {
    return (
      <Shell>
        <Message
          title="That invitation is no longer valid"
          body="Invitations work once and expire after seven days. Ask whoever invited you for a fresh one."
        />
      </Shell>
    )
  }

  if (invite.email !== appUser.email) {
    return (
      <Shell>
        <Message
          title="Signed in as someone else"
          body={`This invitation was sent to ${invite.email}. Sign out and back in as that address to accept it.`}
        />
      </Shell>
    )
  }

  return (
    <Shell>
      <JoinForm
        token={token}
        firmName={invite.firm.name}
        legalName={invite.firm.legal_name}
        version={AGREEMENT_VERSIONS.firmUser}
      />
    </Shell>
  )
}
