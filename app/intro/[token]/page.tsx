import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveIntroLink, APP_URL } from '@/lib/desk/intro'
import { properName } from '@/lib/desk/people'
import { IntroConfirm } from './intro-confirm'

export const metadata: Metadata = { title: 'Warm intro | Refery', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

/**
 * The page behind "Have Lily reach out, saying it came from you" in the intro
 * request email. Opening it changes nothing; the button does the work. No
 * sign-in: the token is the proof, and it can only do this one thing for this
 * one person, once.
 */
export default async function IntroLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const admin = createAdminClient()
  const r = await resolveIntroLink(admin, token)

  const shell = (title: string, body: React.ReactNode) => (
    <main className="min-h-screen bg-[#F2F1EB] px-5 py-12 text-[#161613]">
      <div className="mx-auto w-full max-w-[520px]">
        <p className="text-[13px] font-semibold tracking-tight">Refery.</p>
        <h1 className="mt-6 text-[26px] font-semibold leading-tight tracking-[-0.015em] [text-wrap:balance]">{title}</h1>
        <div className="mt-4 text-[14.5px] leading-relaxed text-[#2A2A26]">{body}</div>
      </div>
    </main>
  )

  if (r.state === 'invalid') {
    return shell('This link does not work.', <p>It may have been copied incompletely. Sign in to Refery and use the buttons on the candidate&apos;s page instead: <a className="underline" href={`${APP_URL}/candidates`}>{APP_URL}/candidates</a></p>)
  }
  const name = properName(r.candidate.name as string)
  const first = name.split(/\s+/)[0]
  const pageUrl = `${APP_URL}/candidates/${r.candidate.id}`

  if (r.state === 'expired') {
    return shell(`This link has expired.`, <p>Links last 30 days. Sign in to Refery and use the button on {first}&apos;s page, which does the same thing: <a className="underline" href={pageUrl}>open {first}&apos;s page</a>.</p>)
  }
  if (r.state === 'used') {
    return shell(`Already done.`, <p>Lily has already written to {first}. You are in copy on that email, and Lily keeps you posted at every step. <a className="underline" href={pageUrl}>Open {first}&apos;s page</a> to see where things are.</p>)
  }
  if (r.state === 'moved_on') {
    const stage = String(r.candidate.journey_stage).replace(/_/g, ' ')
    return shell(`${first} has moved on from here.`, <p>The intro is no longer waiting on you: {first} is now &ldquo;{stage}&rdquo;. <a className="underline" href={pageUrl}>Open {first}&apos;s page</a> to see the latest.</p>)
  }

  const ownerFirst = r.owner?.firstName ?? 'you'
  return shell(
    `Have Lily reach out to ${first}?`,
    <IntroConfirm token={token} first={first} ownerFirst={ownerFirst} pageUrl={pageUrl} candidateEmail={(r.candidate.email as string | null) ?? null} />,
  )
}
