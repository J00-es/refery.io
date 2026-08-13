/**
 * Editing and deleting a comment on a public hiring-manager brief.
 *
 * Authorisation is the token minted when the comment was created and kept in
 * the author's browser. It is matched as part of the row lookup, so a request
 * without it does not find the comment at all — a wrong token and a wrong id
 * are the same 404, and neither confirms that the other was right.
 *
 * Deletes are soft. The hiring manager sees the comment disappear; we keep the
 * text, because "they wrote a correction and then withdrew it" is itself worth
 * knowing when you pick the conversation back up.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { briefRef, findPublishedBrief, notifyBriefComment, viewerContext } from '@/lib/hm-brief'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_BODY = 4000
const TOKEN_HEADER = 'x-comment-token'
const PUBLIC_COLUMNS = 'id, section_id, section_label, prompt, author_name, body, created_at, edited_at'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface Resolved {
  briefId: string
  slug: string
  companyName: string
  recipientName: string | null
  title: string
  comment: Record<string, unknown>
}

/**
 * Finds the comment, but only for whoever wrote it.
 *
 * The token is part of the `where`, so an attacker learns nothing from the
 * response: every failure mode returns the same null.
 */
async function resolve(slug: string, id: string, token: string | null): Promise<Resolved | null> {
  if (!token || token.length < 16 || token.length > 128) return null
  if (!UUID.test(id)) return null

  const brief = await findPublishedBrief(slug)
  if (!brief) return null

  const { data } = await createAdminClient()
    .from('hm_brief_comments')
    .select(PUBLIC_COLUMNS)
    .eq('id', id)
    .eq('brief_id', brief.id)
    .eq('author_token', token)
    .eq('status', 'active')
    .maybeSingle()

  if (!data) return null

  return {
    briefId: brief.id,
    slug: brief.slug,
    companyName: brief.companyName,
    recipientName: brief.recipientName,
    title: brief.title,
    comment: data as Record<string, unknown>,
  }
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await ctx.params
  const found = await resolve(slug, id, request.headers.get(TOKEN_HEADER))
  if (!found) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const raw = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const body = typeof raw?.body === 'string' ? raw.body.trim() : ''
  if (!body) return NextResponse.json({ error: 'Write something first.' }, { status: 400 })
  if (body.length > MAX_BODY) {
    return NextResponse.json({ error: `Keep it under ${MAX_BODY} characters.` }, { status: 400 })
  }

  const now = new Date().toISOString()
  const { data, error } = await createAdminClient()
    .from('hm_brief_comments')
    .update({
      body,
      edited_at: now,
      author_name:
        typeof raw?.authorName === 'string' && raw.authorName.trim()
          ? raw.authorName.trim().slice(0, 80)
          : (found.comment.author_name as string | null),
    })
    .eq('id', id)
    .select(PUBLIC_COLUMNS)
    .single()

  if (error || !data) {
    console.error('[hm-brief] comment edit failed:', error)
    return NextResponse.json({ error: 'Could not save that. Try again.' }, { status: 500 })
  }

  const viewer = viewerContext(request.headers)
  await notifyBriefComment(
    {
      id: found.briefId,
      slug: found.slug,
      title: found.title,
      companyName: found.companyName,
      recipientName: found.recipientName,
    },
    viewer,
    {
      author: data.author_name,
      sectionLabel: data.section_label,
      prompt: data.prompt,
      body: data.body,
    },
    'edited',
  )

  return NextResponse.json({
    comment: {
      id: data.id,
      sectionId: data.section_id,
      sectionLabel: data.section_label,
      prompt: data.prompt,
      authorName: data.author_name,
      body: data.body,
      createdAt: data.created_at,
      editedAt: data.edited_at,
    },
  })
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await ctx.params
  const found = await resolve(slug, id, request.headers.get(TOKEN_HEADER))
  if (!found) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const now = new Date().toISOString()
  const { error } = await createAdminClient()
    .from('hm_brief_comments')
    .update({ status: 'deleted', deleted_at: now })
    .eq('id', id)

  if (error) {
    console.error('[hm-brief] comment delete failed:', error)
    return NextResponse.json({ error: 'Could not delete that. Try again.' }, { status: 500 })
  }

  const viewer = viewerContext(request.headers)
  await notifyBriefComment(
    {
      id: found.briefId,
      slug: found.slug,
      title: found.title,
      companyName: found.companyName,
      recipientName: found.recipientName,
    },
    viewer,
    {
      author: found.comment.author_name as string | null,
      sectionLabel: found.comment.section_label as string | null,
      prompt: found.comment.prompt as string | null,
      body: found.comment.body as string,
    },
    'deleted',
  )

  return NextResponse.json({ ok: true })
}
