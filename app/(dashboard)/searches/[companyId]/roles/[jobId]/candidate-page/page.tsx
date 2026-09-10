import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import { FOCUS, H1, LEDE, MUTED } from '@/lib/desk-ui'
import { resolvePartnerAccess } from '@/lib/partners-access'
import { candidatePageUrl, ensureCandidatePage, type CandidatePageRow } from '@/lib/candidate-pages'
import { CandidatePageEditor } from '@/components/partners/candidate-page-editor'

export const dynamic = 'force-dynamic'
export const maxDuration = 180

/** Admin only: the candidate page for one search, editable live. */
export default async function CandidatePageAdmin({ params }: { params: Promise<{ companyId: string; jobId: string }> }) {
  const access = await resolvePartnerAccess()
  if (!access) redirect('/auth/login')
  if (!access.canUseDesk || !access.canManage) notFound()
  const { companyId, jobId } = await params
  const admin = createAdminClient()
  const { data: role } = await admin.from('partner_roles_v').select('job_id, company_id, title, headline, company_name').eq('job_id', jobId).maybeSingle()
  if (!role || role.company_id !== companyId) notFound()

  let { data: page } = await admin.from('candidate_pages').select('*').eq('job_id', jobId).maybeSingle()
  if (!page) page = await ensureCandidatePage(admin, jobId, access.appUser.email)
  const { data: job } = await admin.from('jobs').select('description_original, description_source, job_post_url').eq('id', jobId).maybeSingle()

  return (
    <div className="mx-auto max-w-[1120px] px-1 pb-16 sm:px-0">
      <Link href={`/searches/${companyId}/roles/${jobId}`} className={`inline-flex items-center gap-1.5 text-[13.5px] font-medium ${MUTED} transition-colors hover:text-[#161613] ${FOCUS}`}>
        <ArrowLeft className="h-3.5 w-3.5" />
        {role.headline || role.title} · {role.company_name}
      </Link>
      <header className="mt-4 mb-6">
        <h1 className={H1}>Candidate page</h1>
        <p className={`mt-2 max-w-2xl ${LEDE}`}>
          What a candidate sees at {page ? <b className="text-[#161613]">{candidatePageUrl((page as CandidatePageRow).slug).replace(/^https?:\/\//, '')}</b> : 'the link'}. Drafted from the original JD with the company, its people and its customers taken out, and live the moment the search went live. Read it, correct it, and every save shows at once.
        </p>
      </header>
      {page ? (
        <CandidatePageEditor jobId={jobId} page={page as CandidatePageRow} url={candidatePageUrl((page as CandidatePageRow).slug)} original={(job?.description_original as string | null) ?? null} originalSource={(job?.description_source as string | null) ?? null} jobPostUrl={(job?.job_post_url as string | null) ?? null} />
      ) : (
        <p className={LEDE}>The page could not be drafted just now. Try again in a minute; the nightly pass also picks it up.</p>
      )}
    </div>
  )
}
