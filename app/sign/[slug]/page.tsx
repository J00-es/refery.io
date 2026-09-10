/**
 * A readable alias for a client agreement: refery.xyz/agreement/edge-markets
 * (rewritten here by middleware.ts; /sign/edge-markets works too) instead of
 * the 64-character token. The slug resolves to the link's token
 * server-side and the page renders in place, so the short address stays in
 * the bar. The token route still works; this is a second door to it.
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { ClientAgreementSigningClient } from '../client-agreement/[token]/client-agreement-signing-client'

export const metadata: Metadata = {
  title: 'Recruitment Services Agreement | Refery',
  description: 'Review and sign your Refery recruitment services agreement',
}

export const dynamic = 'force-dynamic'

export default async function ShortClientAgreementPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) notFound()

  const admin = createAdminClient()
  const { data: link } = await admin.from('client_agreement_links').select('token').eq('short_slug', slug).maybeSingle()
  if (!link?.token) notFound()

  return <ClientAgreementSigningClient token={link.token} />
}
