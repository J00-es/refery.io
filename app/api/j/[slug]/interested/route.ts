import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { viewerContext } from '@/lib/hm-brief'
import { verifyTurnstile } from '@/lib/apply/turnstile'
import { EMPTY_ANSWERS, BASE_BANDS, WORK_AUTH_US, type ApplyAnswers } from '@/lib/apply/options'
import { createSelfSubmission, hashIp, logEvent, tooManyAttempts, MAX_PDF_BYTES } from '@/lib/apply/profile'
import { recordPageEvent } from '@/lib/candidate-pages'
import { resolveReferralDoor } from '@/lib/referrals'

/**
 * "I'm interested" on a candidate page. The same door as /apply with fewer
 * questions and the search attached. With a partner code on the link the
 * row is that partner's, pending their yes; without one it is a
 * self-submission owned by Lily.
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!/^[23456789abcdefghjkmnpqrstuvwxyz]{7}$/.test(slug)) return NextResponse.json({ error: 'This page is no longer live.' }, { status: 404 })
  const form = await request.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'Send the form as multipart data.' }, { status: 400 })
  const v = viewerContext(request.headers)
  const ipHash = hashIp(v.ip)
  const admin = createAdminClient()

  const { data: page } = await admin.from('candidate_pages').select('job_id, status, headline').eq('slug', slug).maybeSingle()
  if (!page || page.status !== 'published') return NextResponse.json({ error: 'This page is no longer live.' }, { status: 404 })

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

  const name = String(form.get('name') ?? '').trim().slice(0, 120)
  const email = String(form.get('email') ?? '').trim().slice(0, 200)
  const linkedin = String(form.get('linkedin') ?? '').trim().slice(0, 300)
  const location = String(form.get('location') ?? '').trim().slice(0, 120)
  const workAuthUs = String(form.get('workAuthUs') ?? '').trim()
  const base = String(form.get('base') ?? '').trim()
  const note = String(form.get('note') ?? '').trim().slice(0, 280)
  if (name.length < 2) return NextResponse.json({ error: 'Your name, please.' }, { status: 400 })
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: 'An email that works, please.' }, { status: 400 })
  if (linkedin && !/linkedin\.com\/in\//i.test(linkedin)) return NextResponse.json({ error: 'That does not look like a LinkedIn profile link.' }, { status: 400 })
  if (form.get('consent') !== '1') return NextResponse.json({ error: 'Tick the consent line so we may keep your profile.' }, { status: 400 })

  const file = form.get('cv')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Your CV as a PDF, please.' }, { status: 400 })
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) return NextResponse.json({ error: 'PDF only. LinkedIn exports are fine.' }, { status: 400 })
  if (file.size > MAX_PDF_BYTES) return NextResponse.json({ error: 'That file is over 10 MB.' }, { status: 400 })

  const answers: ApplyAnswers = {
    ...EMPTY_ANSWERS,
    fullName: name,
    email,
    linkedin,
    currentLocation: location,
    workAuthUs: (WORK_AUTH_US as readonly string[]).includes(workAuthUs) ? workAuthUs : null,
    bases: BASE_BANDS.USD.some(b => b.label === base) ? [{ currency: 'USD', band: base, amount: null, note: null }] : [],
    notes: [note, `Interested in: ${page.headline ?? slug}`].filter(Boolean).join(' · ').slice(0, 280),
    consent: true,
  }
  const via = String(form.get('via') ?? '').trim().toLowerCase().slice(0, 40) || null
  const referral = await resolveReferralDoor(admin, via, 'jd', page.job_id as string, v.userAgent, note || null)

  try {
    const bytes = Buffer.from(await file.arrayBuffer())
    const result = await createSelfSubmission(admin, { bytes, filename: file.name, answers, ipHash, source: 'apply', sourceCampaign: `jd:${slug}`, referral })
    await recordPageEvent(admin, { jobId: page.job_id as string, slug, via: referral?.code ?? null, kind: result.state === 'created' ? 'submitted' : 'interested', sessionId: null, headers: request.headers }).catch(() => undefined)
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[j/interested]', err)
    await logEvent(admin, { email, ipHash, outcome: 'error', detail: String(err instanceof Error ? err.message : err).slice(0, 300) })
    return NextResponse.json({ error: 'That did not go through on our side. Email your CV to lily@refery.io and it reaches the same desk.' }, { status: 500 })
  }
}
