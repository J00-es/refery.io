/**
 * The candidate's one-tap page. No login; the token is the credential.
 * Names the partner and the role, never the company, and asks one thing.
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { loadConsent } from '@/lib/candidate-consent'
import { ConsentAnswer } from '@/components/hm/consent-answer'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'A quick yes or no · Refery', robots: { index: false, follow: false, nocache: true } }
}

export default async function ConsentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const view = await loadConsent(createAdminClient(), token)
  if (!view) notFound()

  return (
    <div className="min-h-screen bg-[#F2F1EB] text-[#161613]">
      <div className="border-b border-[#E4E3DC] bg-white">
        <div className="mx-auto flex max-w-[640px] items-center justify-between px-4 py-3 sm:px-6">
          <span className="text-[19px] font-semibold tracking-[-0.02em]">Refery.</span>
          <span className="text-[12.5px] text-[#9C9C95]">Private · for {view.candidateFirstName}</span>
        </div>
      </div>
      <div className="mx-auto max-w-[640px] px-4 py-10 sm:px-6">
        <p className="text-[12.5px] font-semibold uppercase tracking-[0.12em] text-[#1F3A2F]">A quick yes or no</p>
        <h1 className="mt-2 text-[29px] font-semibold leading-[1.1] tracking-[-0.02em] sm:text-[34px]">
          {view.partnerName} would like to put you forward for a role
        </h1>
        <div className="mt-6 rounded-[16px] border border-[#E4E3DC] bg-white p-5">
          <p className="text-[15px] leading-relaxed text-[#2A2A26]">
            <strong>{view.roleTitle}</strong> at {view.anonCompany}
            {view.location ? `, ${view.location}` : ''}. Nothing about you is shared with the company until you say so, and the company name comes with the first conversation.
          </p>
          <ConsentAnswer token={view.token} partnerFirstName={view.partnerFirstName} initial={view.status} />
        </div>
        <p className="mt-6 text-[13px] leading-relaxed text-[#6E6E68]">
          Refery is a network of founders and recruiters who put people forward for roles they personally rate. Your tap is recorded with the date so nobody can claim to represent you without your say. Questions: reply to the email, or write to lily@refery.io.
        </p>
      </div>
    </div>
  )
}
