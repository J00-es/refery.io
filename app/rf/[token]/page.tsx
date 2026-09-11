import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/server'
import { referralByToken, UNDO_MS } from '@/lib/referrals'
import { properName } from '@/lib/desk/people'
import { OneTap } from '@/components/referrals/one-tap'
import { candidatePath } from '@/lib/paths'

export const metadata: Metadata = { title: 'Was this you? | Refery', robots: { index: false, follow: false, nocache: true } }
export const dynamic = 'force-dynamic'

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'https://refery.xyz').replace(/\/$/, '')

/**
 * The page behind the two buttons in "came through your link". Opening it
 * changes nothing; the button on it does the work. No sign-in: the token is
 * the proof, and it can only answer this one referral.
 */
export default async function ReferralTapPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ a?: string }> }) {
  const { token } = await params
  const { a } = await searchParams
  const admin = createAdminClient()
  const r = await referralByToken(admin, token)

  const shell = (title: string, body: React.ReactNode) => (
    <main className="min-h-svh bg-[#F2F1EB] px-5 py-12 text-[#161613]" style={{ colorScheme: 'light' }}>
      <div className="mx-auto w-full max-w-[520px]">
        <p className="text-[13px] font-semibold tracking-tight">Refery.</p>
        <h1 className="mt-6 text-[26px] font-semibold leading-tight tracking-[-0.015em] [text-wrap:balance]">{title}</h1>
        <div className="mt-4 text-[14.5px] leading-relaxed text-[#2A2A26]">{body}</div>
      </div>
    </main>
  )

  if (!r) return shell('This link does not work.', <p>It may have been copied incompletely. Sign in to Refery and answer from the person&apos;s page instead: <a className="underline" href={`${APP_URL}/candidates`}>{APP_URL}/candidates</a></p>)
  const { data: c } = await admin.from('candidates').select('id, name, slug').eq('id', r.candidate_id).maybeSingle()
  const name = properName((c?.name as string | undefined) ?? 'this person')
  const first = name.split(/\s+/)[0]
  const pageUrl = `${APP_URL}${candidatePath({ id: r.candidate_id, slug: (c?.slug as string | undefined) ?? null })}`
  if (new Date(r.token_expires_at).getTime() < Date.now()) return shell('This link has expired.', <p>Links last 30 days. Sign in to Refery and answer from <a className="underline" href={pageUrl}>{first}&apos;s page</a>, which does the same thing.</p>)
  if (r.status === 'confirmed') return shell('Already confirmed.', <p>{first} is yours. Lily reads them against every live search, and you can put them forward from <a className="underline" href={pageUrl}>{first}&apos;s page</a>.</p>)
  if (r.status === 'duplicate') return shell(`${first} was already on Refery.`, <p>They were with us before your link, so this one is not credited. Anyone new who comes through your link is yours the moment you confirm them.</p>)
  const undoOpen = r.status === 'disowned' && r.disowned_at && Date.now() - new Date(r.disowned_at).getTime() < UNDO_MS
  if (r.status === 'disowned' && !undoOpen) return shell('Marked as not yours.', <p>{first} is off your list and nothing was credited. If that was a mistake, reply to Lily&apos;s email and she can put it right.</p>)

  return shell(
    undoOpen ? `${first}: marked as not yours.` : a === 'no' ? `Not from you?` : `Was ${first} from you?`,
    <OneTap token={token} first={first} initial={undoOpen ? 'disowned' : a === 'no' ? 'no' : 'yes'} pageUrl={pageUrl} />,
  )
}
