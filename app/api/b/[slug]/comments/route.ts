/**
 * Comments on a public hiring-manager brief — read and create.
 *
 * The reader has no account, so authorship works like a coat-check: on create
 * the server mints a token, hands it back exactly once, and the browser keeps
 * it. Presenting that token later is the only thing that permits an edit or a
 * delete (see `[id]/route.ts`). It is never returned by a read, so one viewer's
 * link cannot be used to rewrite another's correction.
 *
 * Everything is stored as plain text and rendered as plain text by React. No
 * markup from this endpoint ever reaches another viewer's page.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { briefRef, findPublishedBrief, notifyBriefComment, viewerContext } from '@/lib/hm-brief'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_BODY = 4000
const MAX_NAME = 80
/** Per IP, per window. Generous for a founder working through a checklist. */
const RATE_LIMIT = 15
const RATE_WINDOW_MS = 10 * 60 * 1000
/** A brief that has collected this many is being abused, not answered. */
const MAX_PER_BRIEF = 500

export interface PublicComment {
  id: string
  sectionId: string | null
  sectionLabel: string | null
  prompt: string | null
  authorName: string | null
  body: string
  createdAt: string
  editedAt: string | null
}

function shape(row: Record<string, unknown>): PublicComment {
  return {
    id: row.id as string,
    sectionId: (row.section_id as string) ?? null,
    sectionLabel: (row.section_label as string) ?? null,
    prompt: (row.prompt as string) ?? null,
    authorName: (row.author_name as string) ?? null,
    body: row.body as string,
    createdAt: row.created_at as string,
    editedAt: (row.edited_at as string) ?? null,
  }
}

/** Selected explicitly, so `author_token` can never be added to a read by accident. */
const PUBLIC_COLUMNS = 'id, section_id, section_label, prompt, author_name, body, created_at, edited_at'

export async function GET(request: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const brief = await findPublishedBrief(slug)
  if (!brief) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const db = createAdminClient()
  const { data, error } = await db
    .from('hm_brief_comments')
    .select(PUBLIC_COLUMNS)
    .eq('brief_id', brief.id)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(MAX_PER_BRIEF)

  if (error) {
    console.error('[hm-brief] comment read failed:', error)
    return NextResponse.json({ error: 'Could not load comments' }, { status: 500 })
  }

  return NextResponse.json({ comments: (data ?? []).map(shape) }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const brief = await findPublishedBrief(slug)
  if (!brief) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const raw = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!raw) return NextResponse.json({ error: 'Expected a JSON body' }, { status: 400 })

  const body = typeof raw.body === 'string' ? raw.body.trim() : ''
  if (!body) return NextResponse.json({ error: 'Write something first.' }, { status: 400 })
  if (body.length > MAX_BODY) {
    return NextResponse.json({ error: `Keep it under ${MAX_BODY} characters.` }, { status: 400 })
  }

  const viewer = viewerContext(request.headers)
  const db = createAdminClient()

  if (viewer.ip) {
    const { count } = await db
      .from('hm_brief_comments')
      .select('id', { count: 'exact', head: true })
      .eq('ip', viewer.ip)
      .gte('created_at', new Date(Date.now() - RATE_WINDOW_MS).toISOString())

    if ((count ?? 0) >= RATE_LIMIT) {
      return NextResponse.json({ error: 'That is a lot of comments at once. Try again shortly.' }, { status: 429 })
    }
  }

  const { count: onBrief } = await db
    .from('hm_brief_comments')
    .select('id', { count: 'exact', head: true })
    .eq('brief_id', brief.id)
    .eq('status', 'active')

  if ((onBrief ?? 0) >= MAX_PER_BRIEF) {
    return NextResponse.json({ error: 'This brief has reached its comment limit.' }, { status: 409 })
  }

  const optional = (v: unknown, max: number) =>
    typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null

  // Minted here rather than accepted from the client: a token is only worth
  // anything if its randomness is ours.
  const authorToken = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '')

  const { data, error } = await db
    .from('hm_brief_comments')
    .insert({
      brief_id: brief.id,
      section_id: optional(raw.sectionId, 120),
      section_label: optional(raw.sectionLabel, 160),
      prompt: optional(raw.prompt, 400),
      author_name: optional(raw.authorName, MAX_NAME),
      body,
      author_token: authorToken,
      ip: viewer.ip,
      country: viewer.country,
      region: viewer.region,
      city: viewer.city,
      user_agent: viewer.userAgent,
    })
    .select(PUBLIC_COLUMNS)
    .single()

  if (error || !data) {
    console.error('[hm-brief] comment write failed:', error)
    return NextResponse.json({ error: 'Could not save that. Try again.' }, { status: 500 })
  }

  const comment = shape(data)

  // Awaited, not fired and forgotten: on serverless the function can be frozen
  // the moment the response is returned, and a dangling promise dies with it.
  // `notifySlack` swallows its own failures, so this cannot fail the write.
  await notifyBriefComment(briefRef(brief), viewer, {
    author: comment.authorName,
    sectionLabel: comment.sectionLabel,
    prompt: comment.prompt,
    body: comment.body,
  })

  await createAdminClient()
    .from('hm_brief_events')
    .insert({
      brief_id: brief.id,
      session_id: typeof raw.sessionId === 'string' ? raw.sessionId.slice(0, 64) : 'comment',
      kind: 'comment',
      section_id: comment.sectionId,
      // Already announced above; recorded here only so the activity trail is
      // complete when someone reads it back.
      notified_at: new Date().toISOString(),
      ip: viewer.ip,
      country: viewer.country,
      region: viewer.region,
      city: viewer.city,
      user_agent: viewer.userAgent,
    })

  return NextResponse.json({ comment, token: authorToken }, { status: 201 })
}
