import { createAdminClient } from '@/lib/supabase/server'
import { canonicalCandidate } from '@/lib/slugs'
import { EditCandidateForm } from './edit-form'

export const dynamic = 'force-dynamic'

/** /candidates/<slug>/edit. A UUID in the address lands on the short slug. */
export default async function EditCandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id, slug } = await canonicalCandidate(createAdminClient(), (await params).id, { tail: '/edit' })
  return <EditCandidateForm id={id} slug={slug} />
}
