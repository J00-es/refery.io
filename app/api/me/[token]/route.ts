import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { validateAnswers, EMPTY_ANSWERS, type ApplyAnswers } from '@/lib/apply/options'
import { answersFrom, profileAction, profileByToken, profileStatus, updateProfileAnswers, type ProfileAction } from '@/lib/apply/profile'

/** The private profile. The token is the credential, as on /c/. */
export const dynamic = 'force-dynamic'

const NO_STORE = { headers: { 'Cache-Control': 'no-store' } }

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const view = await profileByToken(createAdminClient(), token)
  if (!view) return NextResponse.json({ error: 'That link does not work.' }, { status: 404 })
  return NextResponse.json({ status: profileStatus(view), answers: answersFrom(view.profile), sharedCount: view.sharedCount, keptUntil: view.profile.consent_until, cv: view.candidate.resume_filename }, NO_STORE)
}

export async function PUT(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const admin = createAdminClient()
  const view = await profileByToken(admin, token)
  if (!view || view.profile.deleted_at) return NextResponse.json({ error: 'That link does not work.' }, { status: 404 })
  const body = (await request.json().catch(() => ({}))) as { answers?: Partial<ApplyAnswers> }
  const answers: ApplyAnswers = { ...EMPTY_ANSWERS, ...answersFrom(view.profile), ...(body.answers ?? {}), email: view.profile.email, consent: true }
  const problem = validateAnswers(answers, { needsConsent: false })
  if (problem) return NextResponse.json({ error: problem.message }, { status: 400 })
  await updateProfileAnswers(admin, view, answers)
  return NextResponse.json({ ok: true }, NO_STORE)
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const admin = createAdminClient()
  const view = await profileByToken(admin, token)
  if (!view) return NextResponse.json({ error: 'That link does not work.' }, { status: 404 })
  const body = (await request.json().catch(() => ({}))) as { action?: string }
  const action = ['pause', 'resume', 'renew', 'delete'].includes(body.action ?? '') ? (body.action as ProfileAction) : null
  if (!action) return NextResponse.json({ error: 'Pause, resume, renew or delete.' }, { status: 400 })
  if (view.profile.deleted_at && action !== 'delete') return NextResponse.json({ error: 'This profile was deleted.' }, { status: 410 })
  const result = await profileAction(admin, view, action)
  return NextResponse.json(result, NO_STORE)
}
