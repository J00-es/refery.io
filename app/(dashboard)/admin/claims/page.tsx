import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { getAppUser } from '@/lib/current-user'
import { CARD, FOCUS } from '@/lib/candidate-ui'

/**
 * Attested introductions that never happened.
 *
 * Every claim starts with a partner ticking "I can introduce them now". That
 * attestation is what stops the 24-month protection becoming a reason to
 * bulk-upload strangers, and it is only worth anything if someone can see who
 * did not follow through. This is that list.
 *
 * Nothing here is automatic. A claim is withdrawn by a person deciding to
 * withdraw it, because the decision says a partner told us something that was
 * not true, and that should never be taken by a cron job.
 */

export const dynamic = 'force-dynamic'

export default async function ClaimsPage() {
  const appUser = await getAppUser()
  if (!appUser) redirect('/auth/login')
  if (!appUser.isSuperAdmin) notFound()

  const admin = createAdminClient()

  const { data: claims } = await admin
    .from('submission_claims')
    .select(
      'id, candidate_id, client_company_id, holder_user_id, relationship_note, intro_due_by, protected_through',
    )
    .eq('status', 'active')
    .is('intro_confirmed_at', null)
    .lt('intro_due_by', new Date().toISOString())
    .order('intro_due_by', { ascending: true })
    .limit(200)

  const rows = claims ?? []
  const ids = {
    candidates: Array.from(new Set(rows.map(r => r.candidate_id))),
    companies: Array.from(new Set(rows.map(r => r.client_company_id))),
    holders: Array.from(new Set(rows.map(r => r.holder_user_id).filter(Boolean) as string[])),
  }

  const [people, companies, holders] = await Promise.all([
    ids.candidates.length
      ? admin.from('candidates').select('id, name').in('id', ids.candidates)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ids.companies.length
      ? admin.from('companies').select('id, name').in('id', ids.companies)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ids.holders.length
      ? admin.from('users_admin').select('user_id, full_name, email').in('user_id', ids.holders)
      : Promise.resolve({ data: [] as { user_id: string; full_name: string | null; email: string }[] }),
  ])

  const candidateName = new Map((people.data ?? []).map(p => [p.id, p.name]))
  const companyName = new Map((companies.data ?? []).map(c => [c.id, c.name]))
  const holderName = new Map(
    (holders.data ?? []).map(h => [h.user_id, h.full_name || h.email]),
  )

  const days = (iso: string) =>
    Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)

  return (
    <div className="mx-auto max-w-[1120px] space-y-6 px-1 pb-16 sm:px-0">
      <header>
        <h1 className="text-[30px] font-semibold leading-[1.15] tracking-[-0.025em] text-[#161613] sm:text-[36px]">
          Introductions owed
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] text-[#6E6E68] sm:text-[15px]">
          Every one of these was submitted with a partner confirming they could introduce the
          person straight away. The introduction has not happened, and the deadline has passed.
        </p>
      </header>

      {rows.length === 0 ? (
        <section className={`${CARD} px-5 py-12 text-center`}>
          <p className="text-[15px] font-medium text-[#161613]">Nothing owed.</p>
          <p className="mt-1.5 text-[13.5px] text-[#6E6E68]">
            Every attested introduction has either happened or is still within its window.
          </p>
        </section>
      ) : (
        <section className={`${CARD} overflow-hidden`}>
          <div className="flex items-center gap-3 border-b border-[#E4E3DC] bg-[#FAF9F5] px-5 py-2.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-[#9C9C95]">
            <span className="flex-1">Candidate</span>
            <span className="hidden w-40 sm:block">Client</span>
            <span className="hidden w-36 md:block">Submitted by</span>
            <span className="w-20 text-right">Overdue</span>
          </div>
          {rows.map(r => (
            <div key={r.id} className="border-t border-[#E4E3DC] first:border-t-0">
              <div className="flex items-center gap-3 px-5 py-3.5">
                <span className="min-w-0 flex-1">
                  <Link
                    href={`/candidates/${r.candidate_id}`}
                    className={`block truncate text-[14px] font-semibold text-[#161613] hover:underline ${FOCUS}`}
                  >
                    {candidateName.get(r.candidate_id) ?? 'Unknown candidate'}
                  </Link>
                  {r.relationship_note && (
                    <span className="mt-0.5 block truncate text-[12.5px] text-[#6E6E68]">
                      “{r.relationship_note}”
                    </span>
                  )}
                </span>
                <span className="hidden w-40 shrink-0 truncate text-[13px] text-[#6E6E68] sm:block">
                  {companyName.get(r.client_company_id) ?? '—'}
                </span>
                <span className="hidden w-36 shrink-0 truncate text-[13px] text-[#6E6E68] md:block">
                  {holderName.get(r.holder_user_id ?? '') ?? '—'}
                </span>
                <span className="w-20 shrink-0 text-right text-[12.5px] font-semibold text-[#A8564C]">
                  {days(r.intro_due_by as string)}d
                </span>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
