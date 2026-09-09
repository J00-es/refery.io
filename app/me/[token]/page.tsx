import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { answersFrom, profileByToken, profileStatus } from '@/lib/apply/profile'
import { ProfileEditor } from '@/components/apply/profile-editor'

/** The person's private page. No login; the token is the credential. */
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Your Refery profile', robots: { index: false, follow: false, nocache: true } }
}

export default async function ProfilePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ do?: string }> }) {
  const { token } = await params
  const { do: action } = await searchParams
  const view = await profileByToken(createAdminClient(), token)
  if (!view) notFound()
  const status = profileStatus(view)
  const first = view.candidate.name.split(/\s+/)[0]
  const keptUntil = view.profile.consent_until ? new Date(view.profile.consent_until).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : null
  return (
    <div className="min-h-svh bg-[#F2F1EB] text-[#161613]">
      <div className="border-b border-[#E4E3DC] bg-white">
        <div className="mx-auto flex max-w-md items-center justify-between px-5 py-3">
          <span className="text-[18px] font-semibold">Refery<span className="text-[#1F3A2F]">.</span></span>
          <span className="text-[12px] text-[#9C9C95]">Private · for {first}</span>
        </div>
      </div>
      <div className="mx-auto w-full max-w-md px-5 pb-12 pt-8">
        <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#1F3A2F]">Your Refery profile</p>
        <h1 className="mt-1 text-[24px] font-semibold leading-tight tracking-[-0.02em]">Hi {first}.</h1>
        <ProfileEditor
          token={token}
          initialStatus={status}
          initialAnswers={answersFrom(view.profile)}
          sharedCount={view.sharedCount}
          keptUntil={keptUntil}
          cv={view.candidate.resume_filename}
          initialAction={['looking', 'pause', 'delete'].includes(action ?? '') ? (action as 'looking' | 'pause' | 'delete') : null}
        />
        <p className="mt-6 text-[12px] text-[#9C9C95]">No password. This link is yours alone; if you lose it, ask for a new one from refery.xyz/apply. Questions: lily@refery.io.</p>
      </div>
    </div>
  )
}
