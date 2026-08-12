import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import { CARD, FOCUS } from '@/lib/candidate-ui'
import { shortAge } from '@/lib/job-ui'
import { resolvePartnerAccess } from '@/lib/partners-access'
import { anonLabel } from '@/lib/partners'
import { AccessRequestActions } from '@/components/partners/access-request-actions'

export const dynamic = 'force-dynamic'

/**
 * Scouts asking to be put on a client.
 *
 * Approving grants the assignment in the same action, so an approved request can
 * never leave someone waiting on a second step nobody remembers to take.
 */
export default async function AccessRequestsPage() {
  const access = await resolvePartnerAccess()
  if (!access) redirect('/auth/login')
  // The desk is super-admin-only while it is being built — see DESK_SUPER_ADMIN_ONLY.
  if (!access.canUseDesk) notFound()
  if (!access.canManage) notFound()

  const adminClient = createAdminClient()
  const { data: requests } = await adminClient
    .from('company_access_requests')
    .select('id, company_id, user_id, message, status, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  const rows = requests ?? []
  const companyIds = [...new Set(rows.map(r => r.company_id as string))]
  const userIds = [...new Set(rows.map(r => r.user_id as string))]

  const [{ data: companies }, { data: users }] = await Promise.all([
    companyIds.length
      ? adminClient
          .from('partner_companies_v')
          .select('company_id, display_name, company_name, anon_alias, stage, industry, live_roles')
          .in('company_id', companyIds)
      : Promise.resolve({ data: [] }),
    userIds.length
      ? adminClient
          .from('users_admin')
          .select('user_id, full_name, email, role')
          .in('user_id', userIds)
      : Promise.resolve({ data: [] }),
  ])

  const companyById = new Map((companies ?? []).map(c => [c.company_id as string, c]))
  const userById = new Map((users ?? []).map(u => [u.user_id as string, u]))

  return (
    <div className="mx-auto max-w-[760px] space-y-6 px-1 pb-16 sm:px-0">
      <Link
        href="/partners"
        className={`inline-flex items-center gap-1.5 text-[13.5px] font-medium text-[#6E6E68] transition-colors hover:text-[#161613] ${FOCUS}`}
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Partners
      </Link>

      <header>
        <h1 className="font-serif text-[28px] font-normal leading-[1.15] tracking-[-0.02em] text-[#161613] sm:text-[32px]">
          Access requests
        </h1>
        <p className="mt-2 max-w-xl text-[14px] text-[#6E6E68]">
          Approving one puts that scout on the client: they see the name, read the brief, and can
          submit to every live search under it.
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="rounded-[18px] border border-dashed border-[#D8D8D0] bg-[#FAFAF6] px-5 py-10 text-center text-[14px] text-[#6E6E68]">
          Nothing waiting.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map(request => {
            const company = companyById.get(request.company_id as string)
            const user = userById.get(request.user_id as string)
            const companyLabel = company
              ? company.display_name || company.company_name || anonLabel(company)
              : 'Unknown client'

            return (
              <li key={request.id as string} className={`p-5 ${CARD}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold text-[#161613]">
                      {user?.full_name || user?.email || 'Unknown user'}
                    </p>
                    <p className="mt-0.5 text-[13px] text-[#6E6E68]">
                      wants access to{' '}
                      <Link
                        href={`/partners/${request.company_id}`}
                        className={`font-medium text-[#1F4D3A] underline-offset-4 hover:underline ${FOCUS}`}
                      >
                        {companyLabel}
                      </Link>
                      {company?.live_roles ? ` · ${company.live_roles} live` : ''}
                    </p>
                    <p className="mt-0.5 text-[12.5px] text-[#9C9C95]">
                      {[user?.role?.replace(/_/g, ' '), user?.email, shortAge(request.created_at as string)]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <AccessRequestActions requestId={request.id as string} />
                </div>

                {request.message && (
                  <p className="mt-3 rounded-[10px] bg-[#FAFAF6] px-3 py-2.5 text-[13.5px] leading-relaxed text-[#3C403C]">
                    {request.message as string}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
