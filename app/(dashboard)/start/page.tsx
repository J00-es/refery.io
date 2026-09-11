import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getAppUser } from '@/lib/current-user'
import { accessCheck } from '@/lib/onboarding/access'
import { suggestFirstSearch } from '@/lib/onboarding/matcher'
import { CARD, FOCUS, H1, LEDE, META, RULE } from '@/lib/desk-ui'
import { resolveFee, payoutAmount, feeExplanation } from '@/lib/fees'
import { ProposalActions } from '@/components/partners/proposal-card'
import { PreferencesEditor } from '@/components/onboarding/preferences-editor'
import { NotificationPrefs } from '@/components/onboarding/notification-prefs'
import { ReferralEarnings } from '@/components/onboarding/referral-earnings'
import { YourLinkCard } from '@/components/partners/your-link'
import { rolePathFrom } from '@/lib/paths'

export const dynamic = 'force-dynamic'

/**
 * Start: the partner's first page, and the honest one.
 *
 * Says what is true about their account (every check, with the failing one
 * named as ours to fix), shows the one search we suggest and why, or says
 * plainly that nothing fits yet, and keeps the help visible without making a
 * call the price of admission. Nothing here is a checklist for its own sake.
 */
export default async function StartPage() {
  const user = await getAppUser()
  if (!user) redirect('/auth/login')
  // The super admin sees this page as a partner would, on their own account.
  // A plain admin has the desk instead.
  if (user.isAdmin && !user.isSuperAdmin) redirect('/admin/partners')

  const admin = createAdminClient()
  const check = await accessCheck(admin, user.id)

  // A partner with confirmed preferences and no search gets one suggested on
  // the spot, so this page never says "nothing yet" while a match exists.
  const { data: prefs } = await admin.from('partner_preferences').select('*').eq('user_id', user.id).maybeSingle()
  // Not for the super admin: a proposal on Lily's own account is a row the
  // desk would then count.
  if (prefs?.confirmed_at && check.searches.ok && !user.isSuperAdmin) {
    await suggestFirstSearch(admin, { userId: user.id, email: user.email, fullName: user.fullName }, { by: 'start-page', sendEmail: false })
  }

  const [{ data: assignments }, { data: submissions }, { data: me }] = await Promise.all([
    admin
      .from('search_assignments')
      .select('id, job_id, company_id, status, why, proposed_at, expires_at, confirmed_at')
      .eq('user_id', user.id)
      .in('status', ['proposed', 'working', 'paused'])
      .order('proposed_at', { ascending: false }),
    admin.from('role_submissions').select('id').eq('submitted_by_user_id', user.id).limit(1),
    admin.from('users_admin').select('no_match_at, onboarding_done_at').eq('user_id', user.id).maybeSingle(),
  ])
  const proposed = (assignments ?? []).find(a => a.status === 'proposed') ?? null
  const working = (assignments ?? []).filter(a => a.status === 'working')
  const jobIds = (assignments ?? []).map(a => a.job_id)
  const { data: roles } = jobIds.length
    ? await admin.from('partner_roles_v').select('*').in('job_id', jobIds)
    : { data: [] }
  const roleById = new Map((roles ?? []).map(r => [r.job_id as string, r]))
  const suggestedRole = proposed ? roleById.get(proposed.job_id) : null
  const hasSubmitted = Boolean(submissions?.length)
  const first = (user.fullName ?? '').split(/\s+/)[0] || 'there'

  const checks: Array<{ label: string; ok: boolean; reason: string | null }> = [
    { label: 'Account', ok: check.account.ok, reason: check.account.reason },
    { label: check.partnerTerms.version ? `Partner terms v${check.partnerTerms.version}` : 'Partner terms', ok: check.partnerTerms.ok, reason: check.partnerTerms.reason },
    { label: 'Searches', ok: check.searches.ok, reason: check.searches.reason },
    ...(check.firm.name ? [{ label: `Firm: ${check.firm.name}`, ok: check.firm.ok, reason: check.firm.reason }] : []),
  ]

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-6">
        {check.allOk ? (
          <>
            <h1 className={H1}>Hi {first}, you&rsquo;re set up.</h1>
            <p className={`mt-2 ${LEDE}`}>
              {working.length || hasSubmitted
                ? 'Everything checks. Your searches and your people are one tap away.'
                : 'Account, partner terms and preferences are done. What is left has no deadline.'}
            </p>
          </>
        ) : (
          <>
            <h1 className={H1}>Hi {first}, one thing on our side.</h1>
            <p className={`mt-2 ${LEDE}`}>
              {check.firstFailure === 'partner terms'
                ? 'Your account exists but the partner terms are not connected to it yet. That is ours to fix, not yours.'
                : check.firstFailure === 'account'
                  ? 'Your account is waiting on a check from us. You will get an email the moment it is done.'
                  : `Something is not connected yet: ${check.firstFailure}. Lily has been told.`}
            </p>
          </>
        )}
      </header>

      {/* Account checks: five facts, each its own line. A failing one names the reason. */}
      <section className={`mb-5 p-4 ${CARD} ${check.allOk ? '' : 'border-[#E4D9B8]'}`}>
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold">Your account</span>
          <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${check.allOk ? 'bg-[#E7EDE9] text-[#1F3A2F]' : 'bg-[#F5EEDD] text-[#8A6A1F]'}`}>
            {check.allOk ? 'everything checks' : 'one check failing'}
          </span>
        </div>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {checks.map(c => (
            <li key={c.label} className="flex items-center gap-2 text-[12.5px] text-[#6E6E68]">
              <span aria-hidden className={`h-2 w-2 rounded-full ${c.ok ? 'bg-[#5E8571]' : 'bg-[#C79A2E]'}`} />
              <span className={c.ok ? '' : 'font-semibold text-[#161613]'}>{c.label}{c.ok ? '' : `: ${c.reason}`}</span>
            </li>
          ))}
        </ul>
        {!check.allOk && (
          <p className={`mt-3 rounded-[10px] bg-[#FAF9F5] px-3 py-2 text-[12.5px] text-[#2A2A26]`}>
            You can still read your searches and save people privately. Introducing someone waits for the fix, and no reminder goes to you while this is open.
          </p>
        )}
      </section>

      {/* The one suggested search, or the honest none. */}
      {suggestedRole && proposed ? (
        <section className={`mb-5 overflow-hidden ${CARD} border-[#E4D9B8]`}>
          <div className="bg-[#FAF9F5] px-4 py-3">
            <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[#9C9C95]">Suggested for you · not assigned</span>
          </div>
          <div className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href={rolePathFrom(roleById.get(proposed.job_id) ?? proposed)} className={`text-[16px] font-semibold leading-tight underline-offset-4 hover:underline ${FOCUS}`}>
                  {suggestedRole.headline || suggestedRole.title}
                </Link>
                <p className={`mt-0.5 ${META}`}>
                  {[suggestedRole.company_name, suggestedRole.location].filter(Boolean).join(' · ')}
                </p>
              </div>
              {suggestedRole.priority === 'urgent' && <span className="shrink-0 rounded-full bg-[#FBEDEB] px-2.5 py-0.5 text-[12px] font-semibold text-[#A3423A]">Client wants to hire now</span>}
            </div>
            {(() => {
              const fee = resolveFee(suggestedRole)
              const payout = payoutAmount(fee)
              return (
                <p className="mt-2 text-[13px]">
                  <span className="font-semibold text-[#1F3A2F]">{payout ? `${payout} to you on a placement` : 'Payout depends on the offer'}</span>
                  <span className="text-[#9C9C95]"> · {feeExplanation(fee)}</span>
                </p>
              )
            })()}
            {suggestedRole.hard_requirements?.[0] && (
              <p className="mt-2 text-[13px] text-[#2A2A26]"><span className="font-semibold">Must have: </span>{suggestedRole.hard_requirements[0]}</p>
            )}
            <div className="mt-3">
              <ProposalActions assignmentId={proposed.id} why={proposed.why} proposedAt={proposed.proposed_at} expiresAt={proposed.expires_at} />
            </div>
            <p className={`mt-2 ${META}`}>Nothing is expected of you until you say you will work on it.</p>
          </div>
        </section>
      ) : working.length ? (
        <section className={`mb-5 p-4 ${CARD}`}>
          <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[#9C9C95]">Working on · {working.length}</span>
          <ul className={`mt-2 divide-y ${RULE}`}>
            {working.map(w => {
              const r = roleById.get(w.job_id)
              return (
                <li key={w.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <Link href={rolePathFrom(r ?? w)} className={`text-[14px] font-semibold underline-offset-4 hover:underline ${FOCUS}`}>{r?.headline || r?.title || 'Search'}</Link>
                    <p className={META}>{[r?.company_name, r?.location].filter(Boolean).join(' · ')}</p>
                  </div>
                  <Link href={rolePathFrom(r ?? w)} className={`shrink-0 rounded-full bg-[#1F3A2F] px-3 py-2 text-[12.5px] font-semibold text-white ${FOCUS}`}>Introduce someone</Link>
                </li>
              )
            })}
          </ul>
        </section>
      ) : check.searches.ok && prefs?.confirmed_at ? (
        <section className={`mb-5 p-4 ${CARD}`}>
          <h2 className="text-[16px] font-semibold">No search fits your network yet</h2>
          <p className="mt-1 text-[13.5px] text-[#6E6E68]">
            {me?.no_match_at
              ? 'We would rather say so than give you something to work on that will not go anywhere. We re-check every week against new searches, and Lily sees you under "approved, no matching search".'
              : 'We check what you told us against every live search. Nothing lines up today; we re-check every week.'}
          </p>
          <p className={`mt-2 ${META}`}>Nothing to set up in the meantime, and no reminders.</p>
        </section>
      ) : null}

      {/* Preferences, correctable in place. */}
      <section className={`mb-5 p-4 ${CARD}`}>
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] font-semibold">Where your people are</span>
          {!prefs?.confirmed_at && <span className="text-[12px] text-[#8A6A1F]">confirm to get a suggestion</span>}
        </div>
        <PreferencesEditor
          initial={{
            own_location: prefs?.own_location ?? '',
            network_cities: prefs?.network_cities ?? [],
            functions: prefs?.functions ?? [],
            stages: prefs?.stages ?? [],
            relationship_types: prefs?.relationship_types ?? [],
            would_relocate: Boolean(prefs?.would_relocate),
          }}
          confirmed={Boolean(prefs?.confirmed_at)}
        />
      </section>

      <div className="mb-5">
        <NotificationPrefs />
      </div>

      {/* Their own link: the people they would put their name behind, in two minutes. */}
      <div className="mb-5">
        <YourLinkCard />
      </div>

      {/* Two more ways to earn: a company or a partner they bring. Terms section 9. */}
      <div className="mb-5">
        <ReferralEarnings partnerName={user.fullName ?? ''} />
      </div>

      {/* Background and help, always here, never a gate. */}
      <section className={`mb-5 divide-y ${RULE} ${CARD}`}>
        <Link href="/guide" className={`flex items-center justify-between gap-3 px-4 py-3.5 ${FOCUS}`}>
          <span>
            <span className="block text-[13.5px] font-semibold">The guide</span>
            <span className={META}>Every feature, step by step, with a search box. Start here when something is new.</span>
          </span>
          <span className="text-[13px] font-semibold text-[#1F3A2F]">Open</span>
        </Link>
        <Link href="/how-it-works" className={`flex items-center justify-between gap-3 px-4 py-3.5 ${FOCUS}`}>
          <span>
            <span className="block text-[13.5px] font-semibold">How Refery works</span>
            <span className={META}>Two-minute read. What you do, what we do, what you earn and when.</span>
          </span>
          <span className="text-[13px] font-semibold text-[#1F3A2F]">Read</span>
        </Link>
        <a href="https://cal.com/refery-lily/15" target="_blank" rel="noopener noreferrer" className={`flex items-center justify-between gap-3 px-4 py-3.5 ${FOCUS}`}>
          <span>
            <span className="block text-[13.5px] font-semibold">Questions, or want to talk it through?</span>
            <span className={META}>Reply to any email from Lily, or take 15 minutes with her. Optional.</span>
          </span>
          <span className="text-[13px] font-semibold text-[#1F3A2F]">Book</span>
        </a>
      </section>
    </div>
  )
}
