import type { Metadata } from 'next'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { AGREEMENT_VERSIONS } from '@/lib/agreements'
import { findFirmAwaitingSignature } from '@/lib/firms'
import { SignFirmForm } from '@/components/firms/sign-firm-form'

/**
 * Signing for the company, without an account.
 *
 * The person who can bind a recruiting firm is often not the person who brings
 * Refery into it, and making them sign up first would mean an MD creating a
 * recruiter account they will never open in order to sign one agreement. So
 * this page takes a name-and-email clickwrap instead, exactly as the client
 * services agreement already does.
 *
 * Outside the dashboard layout for the obvious reason: there is nobody signed
 * in, and there does not need to be.
 *
 * Never indexed: the URL carries a single-use token.
 */

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata: Metadata = {
  title: 'Sign for your firm on Refery',
  robots: { index: false, follow: false },
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh bg-[#F2F1EB] px-4 py-10 sm:py-16">
      <div className="mx-auto w-full max-w-[640px]">
        <Link href="/" className="text-[20px] font-bold tracking-[-0.03em] text-[#1F3A2F]">
          Refery<span className="italic">.</span>
        </Link>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  )
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[14px] border border-[#E4E3DC] bg-white p-6">
      <p className="text-[18px] font-semibold tracking-[-0.015em] text-[#161613]">{title}</p>
      <p className="mt-2 text-[14px] leading-[1.6] text-[#6E6E68]">{body}</p>
    </div>
  )
}

export default async function SignFirmPage({
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams

  if (!token) {
    return (
      <Shell>
        <Message
          title="This link is incomplete"
          body="A signing link carries a one-time token. Ask whoever sent it to you to send it again."
        />
      </Shell>
    )
  }

  const firm = await findFirmAwaitingSignature(createAdminClient(), token)

  // Expired, already signed, and never existed answer identically on purpose.
  if (!firm) {
    return (
      <Shell>
        <Message
          title="This link is no longer valid"
          body="Signing links work once and expire after fourteen days. If the agreement has already been signed, there is nothing more for you to do. Otherwise ask your colleague to send a fresh link."
        />
      </Shell>
    )
  }

  return (
    <Shell>
      <SignFirmForm
        token={token}
        firmName={firm.name}
        legalName={firm.legal_name}
        suggestedName={firm.signer_name ?? ''}
        versions={{
          partner: AGREEMENT_VERSIONS.partner,
          submission: AGREEMENT_VERSIONS.partnerSubmission,
          addendum: AGREEMENT_VERSIONS.firmAddendum,
        }}
      />
    </Shell>
  )
}
