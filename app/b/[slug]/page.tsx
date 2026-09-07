/**
 * The hiring-manager brief, in public.
 *
 * No account, no portal, no password — a founder opens the link from their
 * phone and reads. The one thing they can do besides read is answer: every
 * section takes a correction, every open question takes a reply, and both reach
 * Slack the moment they are written.
 *
 * The URL is the credential (see `lib/hm-brief.ts`), which sets the rules for
 * this page: never indexable, never cached at the edge, and a draft or a wrong
 * slug must 404 identically so the space cannot be probed.
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { normalizeBrief, briefNav } from '@/lib/brief'
import { findPublishedBrief } from '@/lib/hm-brief'
import { FounderBrief } from '@/components/hm/founder-brief'
import { BriefCommentsProvider, type BriefComment } from '@/components/hm/comments-provider'
import { GeneralComments, SectionComments, ChecklistAnswer } from '@/components/hm/brief-comments'
import { BriefTelemetry } from '@/components/hm/brief-telemetry'
import { BriefChoice, type BriefAnswer } from '@/components/hm/brief-choice'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const brief = await findPublishedBrief(slug)

  // A confidential document behind a shareable link. If it reaches a crawler,
  // nothing about it should be retained — and the title alone would leak which
  // company we are working with.
  const robots = { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } }

  if (!brief) return { title: 'Refery', robots }

  return {
    title: `${brief.companyName} · Hiring Manager Brief · Refery`,
    description: 'Prepared by Refery. Confidential.',
    robots,
  }
}

export default async function PublicBriefPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const brief = await findPublishedBrief(slug)
  if (!brief) notFound()

  const content = normalizeBrief(brief.content)
  const nav = briefNav(content)

  // Read straight from the database rather than through the API route: this is
  // the same process, and a self-fetch would cost a round trip on first paint.
  const { data: rows } = await createAdminClient()
    .from('hm_brief_comments')
    .select('id, section_id, section_label, prompt, author_name, body, created_at, edited_at')
    .eq('brief_id', brief.id)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(500)

  const { data: answerRows } = await createAdminClient()
    .from('hm_brief_answers')
    .select('key, value, author_name, updated_at')
    .eq('brief_id', brief.id)
  const answers: Record<string, BriefAnswer> = Object.fromEntries(
    (answerRows ?? []).map(r => [r.key, { value: r.value, authorName: r.author_name, updatedAt: r.updated_at }]),
  )

  const comments: BriefComment[] = (rows ?? []).map(r => ({
    id: r.id,
    sectionId: r.section_id,
    sectionLabel: r.section_label,
    prompt: r.prompt,
    authorName: r.author_name,
    body: r.body,
    createdAt: r.created_at,
    editedAt: r.edited_at,
  }))

  const sectionSlots = Object.fromEntries(
    content.sections
      .filter(s => s.blocks.length)
      .map(s => [
        s.id,
        <SectionComments key={s.id} sectionId={s.id} sectionLabel={s.nav ?? s.heading} />,
      ]),
  )

  return (
    <BriefCommentsProvider slug={brief.slug} initial={comments}>
      <BriefTelemetry slug={brief.slug} sections={nav} />

      <FounderBrief
        content={content}
        ribbonNote={brief.ribbonNote ?? 'Prepared for you by Refery · please don’t forward'}
        recipientName={brief.recipientName}
        publishedAt={brief.publishedAt}
        answers={answers}
        sectionSlots={sectionSlots}
        checklistSlot={(ask, section) => (
          <ChecklistAnswer ask={ask} sectionId={section.id} sectionLabel={section.label} />
        )}
        choiceSlot={block => <BriefChoice slug={brief.slug} block={block} initial={answers[block.key] ?? null} />}
        footerSlot={<GeneralComments />}
      />
    </BriefCommentsProvider>
  )
}
