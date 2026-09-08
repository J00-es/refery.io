/**
 * Start an onboarding run. Super admin only.
 *
 * The response returns at once with the run id; the work runs after the
 * response (`after`), inside this function's time budget, and reports to the
 * run row and to #refery-desk when it is ready.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireSuperAdmin } from '@/lib/admin-auth'
import { runOnboarding, type OnboardInput } from '@/lib/client-onboarding/run'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

function str(v: unknown, max = 500): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null
}

export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status })

  const raw = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!raw) return NextResponse.json({ error: 'Expected a JSON body' }, { status: 400 })

  const website = str(raw.website, 200)
  if (!website || !/^([a-z0-9-]+\.)+[a-z]{2,}(\/.*)?$/i.test(website.replace(/^https?:\/\//i, ''))) {
    return NextResponse.json({ error: 'Give the company website, e.g. getlivo.com' }, { status: 400 })
  }
  const roleInputs = (Array.isArray(raw.roles) ? raw.roles : String(raw.roles ?? '').split('\n'))
    .map(r => String(r).trim())
    .filter(Boolean)
    .slice(0, 8)
  if (!roleInputs.length) return NextResponse.json({ error: 'At least one role: a job link or a title, one per line.' }, { status: 400 })

  const currency = ['USD', 'EUR', 'GBP'].includes(String(raw.currency)) ? (String(raw.currency) as 'USD' | 'EUR' | 'GBP') : 'USD'
  const feePercent = Number(raw.feePercent ?? 10)
  if (!Number.isFinite(feePercent) || feePercent < 1 || feePercent > 50) return NextResponse.json({ error: 'Fee must be between 1 and 50.' }, { status: 400 })
  const contactEmail = str(raw.contactEmail, 200)
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contactEmail)) return NextResponse.json({ error: 'That does not look like an email.' }, { status: 400 })

  const input: OnboardInput = {
    website: /^https?:\/\//i.test(website) ? website : `https://${website}`,
    companyName: str(raw.companyName, 120),
    contactName: str(raw.contactName, 120),
    contactEmail,
    roleInputs,
    currency,
    bands: str(raw.bands, 300) ?? '',
    workingPattern: str(raw.workingPattern, 200),
    feePercent,
    notes: str(raw.notes, 12_000) ?? '',
  }

  const db = createAdminClient()
  const { data: run, error } = await db
    .from('onboarding_runs')
    .insert({ status: 'queued', input, created_by: auth.userId })
    .select('id')
    .single()
  if (error || !run) return NextResponse.json({ error: error?.message ?? 'Could not start' }, { status: 500 })

  after(() => runOnboarding(run.id as string))
  return NextResponse.json({ id: run.id }, { status: 202 })
}
