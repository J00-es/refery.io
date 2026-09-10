import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { findCandidatePage } from '@/lib/candidate-pages'
import { CandidatePageView } from '@/components/candidate-page/page-view'

/**
 * The candidate version of a search. Public, no login, never indexed. The
 * company is not named; its name comes with the first conversation. The
 * link is the credential: an unknown, draft or revoked slug is a 404 alike.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const p = await findCandidatePage(slug, null)
  return {
    title: p ? `${p.page.headline ?? 'A search'} · Refery` : 'Refery',
    description: p?.page.company_line ?? 'A search shared through Refery.',
    robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  }
}

export default async function CandidateJdPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ via?: string }> }) {
  const { slug } = await params
  const { via } = await searchParams
  const code = (via ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30) || null
  const p = await findCandidatePage(slug, code)
  if (!p) notFound()
  return <CandidatePageView data={p} slug={slug} via={p.referrer?.code ?? null} siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null} />
}
