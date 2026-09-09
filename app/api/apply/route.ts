import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { viewerContext } from '@/lib/hm-brief'
import { verifyTurnstile } from '@/lib/apply/turnstile'
import { validateAnswers, EMPTY_ANSWERS, type ApplyAnswers } from '@/lib/apply/options'
import { createSelfSubmission, hashIp, logEvent, tooManyAttempts, MAX_PDF_BYTES } from '@/lib/apply/profile'

/**
 * The candidate door. Public, no login. One multipart request: the CV and
 * the answers. Every gate here runs before the parser, so junk never costs
 * anything: honeypot, Turnstile, five attempts an hour per address, PDF only.
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'Send the form as multipart data.' }, { status: 400 })
  const v = viewerContext(request.headers)
  const ipHash = hashIp(v.ip)
  const admin = createAdminClient()

  // A field people never see. Bots fill it.
  if (String(form.get('website') ?? '').trim()) {
    await logEvent(admin, { ipHash, outcome: 'honeypot' })
    return NextResponse.json({ state: 'created', reviewDate: null })
  }
  if (await tooManyAttempts(admin, ipHash)) {
    await logEvent(admin, { ipHash, outcome: 'rate_limited' })
    return NextResponse.json({ error: 'Too many attempts from this network. Try again in an hour, or email your CV to lily@refery.io.' }, { status: 429 })
  }
  const turnstile = await verifyTurnstile(String(form.get('cf-turnstile-response') ?? '') || null, v.ip)
  if (!turnstile.ok) {
    await logEvent(admin, { ipHash, outcome: 'turnstile_failed' })
    return NextResponse.json({ error: 'The bot check did not pass. Reload the page and try again.' }, { status: 400 })
  }

  let answers: ApplyAnswers
  try {
    answers = { ...EMPTY_ANSWERS, ...(JSON.parse(String(form.get('answers') ?? '{}')) as Partial<ApplyAnswers>) }
  } catch {
    return NextResponse.json({ error: 'The answers did not come through. Try again.' }, { status: 400 })
  }
  const problem = validateAnswers(answers, { needsConsent: true })
  if (problem) return NextResponse.json({ error: problem.message, step: problem.step }, { status: 400 })

  const file = form.get('cv')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Your CV as a PDF, please.', step: 1 }, { status: 400 })
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) return NextResponse.json({ error: 'PDF only. LinkedIn exports are fine.', step: 1 }, { status: 400 })
  if (file.size > MAX_PDF_BYTES) return NextResponse.json({ error: 'That file is over 10 MB.', step: 1 }, { status: 400 })

  const source = form.get('source') === 'go' ? 'go' : 'apply'
  const sourceCampaign = String(form.get('campaign') ?? '').trim().slice(0, 80) || null

  try {
    const bytes = Buffer.from(await file.arrayBuffer())
    const result = await createSelfSubmission(admin, { bytes, filename: file.name, answers, ipHash, source, sourceCampaign })
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[apply]', err)
    await logEvent(admin, { email: answers.email, ipHash, outcome: 'error', detail: String(err instanceof Error ? err.message : err).slice(0, 300) })
    return NextResponse.json({ error: 'That did not go through on our side. Email your CV to lily@refery.io and it reaches the same desk.' }, { status: 500 })
  }
}
