import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireCandidateAccess } from '@/lib/current-user'

/**
 * The three facts founders ask first (visa, cities, base) plus consent, from
 * the upload step, the bulk review table, or the profile. A blank never erases
 * what the record knows. When the panel has already run, it runs again with
 * the new facts, and only speaks up if the grade crossed the bar.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireCandidateAccess(id)
  if (!access.ok) return NextResponse.json({ error: access.message }, { status: access.status })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const patch: Record<string, unknown> = {}

  if (typeof body.visa_status === 'string' && body.visa_status.trim()) patch.visa_status = body.visa_status.trim().slice(0, 120)
  if (Array.isArray(body.allowed_locations)) {
    const cities = body.allowed_locations.filter((x): x is string => typeof x === 'string' && !!x.trim()).map(x => x.trim().slice(0, 80)).slice(0, 8)
    if (cities.length) patch.allowed_locations = cities
  }
  if (typeof body.relocation_ok === 'boolean') patch.relocation_ok = body.relocation_ok
  if (typeof body.remote_preference === 'string' && body.remote_preference.trim()) patch.remote_preference = body.remote_preference.trim().slice(0, 40)
  const money = (v: unknown) => {
    if (v == null || v === '') return null
    const n = typeof v === 'number' ? v : Number(String(v).replace(/[,$\s]/g, ''))
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null
  }
  const min = money(body.salary_expectation_min)
  const max = money(body.salary_expectation_max)
  if (min) patch.salary_expectation_min = min
  if (max) patch.salary_expectation_max = max
  if (min && !max) patch.salary_expectation_max = min
  if (typeof body.consent_told_candidate === 'boolean') patch.consent_told_candidate = body.consent_told_candidate
  if (typeof body.location === 'string' && body.location.trim()) patch.location = body.location.trim().slice(0, 120)

  if (!Object.keys(patch).length) return NextResponse.json({ ok: true, unchanged: true })

  const admin = createAdminClient()
  const { data: before } = await admin.from('candidates').select('panel_at, journey_stage').eq('id', id).maybeSingle()
  const { error } = await admin.from('candidates').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Re-panel only when there is a panel to refresh; a brand-new profile is
  // already queued by the insert trigger.
  if (before?.panel_at) await admin.rpc('enqueue_candidate_panel', { p_candidate_id: id, p_reason: 'facts_updated' })

  return NextResponse.json({ ok: true, patch })
}
