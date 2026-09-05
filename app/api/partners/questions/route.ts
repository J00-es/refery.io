import { NextResponse } from 'next/server'
import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { actingFor, resolvePartnerAccess } from '@/lib/partners-access'
import { canWorkSearch } from '@/lib/partners'
import { announceQuestion } from '@/lib/search-questions'

// The response returns at once; Pep's draft runs in `after()` and needs the
// function to stay alive for the model call.
export const maxDuration = 60

/**
 * A partner's question on a search.
 *
 * Asked once, answered once, read by everyone on the search. The same question
 * ("does OPT with 2.5 years work?") used to be answered by Lily on Slack four
 * times in a week. The asker is never named to other partners.
 */
export async function POST(req: Request) {
  const access = await resolvePartnerAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.canUseDesk) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const jobId = typeof body?.job_id === 'string' ? body.job_id : null
  const question = typeof body?.question === 'string' ? body.question.trim().slice(0, 1000) : ''
  if (!jobId) return NextResponse.json({ error: 'job_id is required' }, { status: 400 })
  if (question.length < 10) return NextResponse.json({ error: 'Ask the whole question' }, { status: 400 })

  const adminClient = createAdminClient()
  const { data: role } = await adminClient
    .from('partner_roles')
    .select('job_id, company_id')
    .eq('job_id', jobId)
    .maybeSingle()
  if (!role) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!canWorkSearch(access, jobId, role.company_id as string)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data, error } = await adminClient
    .from('search_questions')
    .insert({
      job_id: jobId,
      company_id: role.company_id,
      asked_by: access.appUser.id,
      acted_by_user_id: actingFor(access),
      question,
    })
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // The card in Slack and Pep's draft take a few seconds; the partner should
  // not wait on either.
  const questionId = data.id as string
  after(() =>
    announceQuestion(questionId).then(r => {
      if (!r.sent) console.warn('[questions] slack card not sent:', r.error)
    }),
  )

  return NextResponse.json({ ok: true, id: data.id })
}
