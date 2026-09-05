import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolvePartnerAccess } from '@/lib/partners-access'

/** Refery answering, or hiding, a question. Admin only. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await resolvePartnerAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.canUseDesk) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!access.canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  const patch: Record<string, unknown> = {}

  if (typeof body?.answer === 'string') {
    const answer = body.answer.trim().slice(0, 2000)
    patch.answer = answer || null
    patch.answered_by = answer ? access.appUser.id : null
    patch.answered_at = answer ? new Date().toISOString() : null
  }
  if (typeof body?.is_visible === 'boolean') patch.is_visible = body.is_visible

  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nothing to change' }, { status: 400 })

  const adminClient = createAdminClient()
  const { error } = await adminClient.from('search_questions').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
