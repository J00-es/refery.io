import { NextResponse } from 'next/server'
import { resolvePartnerAccess } from '@/lib/partners-access'
import { deleteQuestion, publishAnswer, setQuestionVisibility } from '@/lib/search-questions'

/**
 * Refery answering, editing, hiding or deleting a question from the page.
 *
 * Same code path as a Slack reply (lib/search-questions.ts), so the card's
 * thread always says what the page says. Answering emails the asker the first
 * time; editing does not.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await resolvePartnerAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.canUseDesk) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!access.canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  const actorLabel = access.realUser.fullName?.split(' ')[0] || 'Refery'

  if (typeof body?.answer === 'string') {
    const result = await publishAnswer({
      id,
      answer: body.answer,
      answeredBy: access.realUser.id,
      via: 'web',
      actorLabel: `${actorLabel} (web)`,
    })
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.error === 'Not found' ? 404 : 400 })
    return NextResponse.json({ ok: true, audience: result.audience, emailed: result.emailed })
  }

  if (typeof body?.is_visible === 'boolean') {
    const result = await setQuestionVisibility({ id, visible: body.is_visible, actorLabel: `${actorLabel} (web)` })
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.error === 'Not found' ? 404 : 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Nothing to change' }, { status: 400 })
}

/** Removing a question entirely. Super admin only; an admin hides instead. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await resolvePartnerAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.canUseDesk) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!access.realUser.isSuperAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const actorLabel = access.realUser.fullName?.split(' ')[0] || 'Refery'
  const result = await deleteQuestion({ id, actorLabel: `${actorLabel} (web)` })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.error === 'Not found' ? 404 : 500 })
  return NextResponse.json({ ok: true })
}
