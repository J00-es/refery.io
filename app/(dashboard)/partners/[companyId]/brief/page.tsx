import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, Printer } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import { FOCUS } from '@/lib/candidate-ui'
import { normalizeBrief } from '@/lib/brief'
import { resolvePartnerAccess } from '@/lib/partners-access'
import { isUnlocked } from '@/lib/partners'
import { BriefDocument } from '@/components/partners/brief-document'

export const dynamic = 'force-dynamic'

/**
 * The brief on its own, the way it was always meant to be read: full width, in
 * order, and printable.
 *
 * `?job=` narrows it to a role-scoped brief; without it, the company brief — the
 * one that covers every search under the client, which is how they are written.
 */
export default async function CompanyBriefPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const access = await resolvePartnerAccess()
  if (!access) redirect('/auth/login')
  // The desk is super-admin-only while it is being built — see DESK_SUPER_ADMIN_ONLY.
  if (!access.canUseDesk) notFound()

  const { companyId } = await params
  const sp = await searchParams
  const jobId = (Array.isArray(sp.job) ? sp.job[0] : sp.job) ?? null

  if (!isUnlocked(access, companyId)) notFound()

  const adminClient = createAdminClient()
  const query = adminClient
    .from('partner_briefs')
    .select('id, title, status, content, updated_at, version, job_id')
    .eq('company_id', companyId)

  const { data: brief } = jobId
    ? await query.eq('job_id', jobId).maybeSingle()
    : await query.is('job_id', null).maybeSingle()

  if (!brief) notFound()
  if (brief.status !== 'published' && !access.canManage) notFound()

  const content = normalizeBrief(brief.content)

  return (
    <div className="-mx-3 -my-4 sm:-mx-4 sm:-my-6 md:-my-8">
      <div className="mx-auto flex max-w-[920px] flex-wrap items-center justify-between gap-3 px-5 pt-4 sm:px-8 print:hidden">
        <Link
          href={jobId ? `/partners/${companyId}/roles/${jobId}` : `/partners/${companyId}`}
          className={`inline-flex items-center gap-1.5 text-[13.5px] font-medium text-[#6E6E68] transition-colors hover:text-[#161613] ${FOCUS}`}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </Link>
        <div className="flex items-center gap-3">
          {brief.status !== 'published' && (
            <span className="rounded-full bg-[#F5EEDD] px-2.5 py-1 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-[#8A6A1F]">
              Draft
            </span>
          )}
          <PrintHint />
        </div>
      </div>

      <BriefDocument content={content} variant="standalone" />
    </div>
  )
}

/**
 * A print affordance without a client component: the browser's own shortcut,
 * spelled out. `window.print()` would need a `'use client'` island for one
 * button, and the keyboard hint teaches something the button would not.
 */
function PrintHint() {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12.5px] text-[#9C9C95]">
      <Printer className="h-3.5 w-3.5" aria-hidden />
      Ctrl/⌘ + P to save as PDF
    </span>
  )
}
