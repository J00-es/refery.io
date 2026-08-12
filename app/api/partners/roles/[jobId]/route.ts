import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolvePartnerAccess } from '@/lib/partners-access'

const PRIORITIES = new Set(['urgent', 'high', 'normal'])
const EXCLUSIVITY = new Set(['exclusive', 'shared'])

/** A number, or null when the field was explicitly cleared. Rejects garbage. */
function num(value: unknown): number | null | undefined {
  if (value === null || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[,$\s]/g, ''))
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function text(value: unknown): string | null | undefined {
  if (value === null) return null
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/** Edit a mandate's terms: priority, fee, payout, cap, context. Admin only. */
export async function PATCH(req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const access = await resolvePartnerAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { jobId } = await params
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if ('is_live' in body) patch.is_live = body.is_live === true
  if ('priority' in body) {
    if (!PRIORITIES.has(body.priority)) {
      return NextResponse.json({ error: 'Unknown priority' }, { status: 400 })
    }
    patch.priority = body.priority
  }
  if ('exclusivity' in body) {
    if (body.exclusivity !== null && !EXCLUSIVITY.has(body.exclusivity)) {
      return NextResponse.json({ error: 'Unknown exclusivity' }, { status: 400 })
    }
    patch.exclusivity = body.exclusivity ?? null
  }

  for (const field of ['headline', 'context', 'payout_note'] as const) {
    if (field in body) {
      const value = text(body[field])
      if (value === undefined) return NextResponse.json({ error: `Invalid ${field}` }, { status: 400 })
      patch[field] = value
    }
  }

  for (const field of ['fee_percentage', 'fee_flat', 'scout_payout'] as const) {
    if (field in body) {
      const value = num(body[field])
      if (value === undefined) return NextResponse.json({ error: `Invalid ${field}` }, { status: 400 })
      patch[field] = value
    }
  }

  if ('submission_cap' in body) {
    const value = num(body.submission_cap)
    if (value === undefined || (value !== null && (value < 1 || !Number.isInteger(value)))) {
      return NextResponse.json({ error: 'Submission cap must be a whole number above zero' }, { status: 400 })
    }
    patch.submission_cap = value
  }

  if ('target_start' in body) {
    const value = text(body.target_start)
    if (value === undefined) return NextResponse.json({ error: 'Invalid target_start' }, { status: 400 })
    patch.target_start = value
  }

  const adminClient = createAdminClient()
  const { data, error } = await adminClient
    .from('partner_roles')
    .update(patch)
    .eq('job_id', jobId)
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(data)
}

/**
 * Take a role off the desk.
 *
 * Refused once anything has been submitted against it: deleting the mandate
 * would orphan a scout's submission and lose the audit trail. Setting
 * `is_live: false` is the correct move there, and the message says so.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const access = await resolvePartnerAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { jobId } = await params
  const adminClient = createAdminClient()

  const { count } = await adminClient
    .from('role_submissions')
    .select('id', { count: 'exact', head: true })
    .eq('job_id', jobId)

  if (count) {
    return NextResponse.json(
      {
        error: `This role has ${count} submission${count === 1 ? '' : 's'} against it. Close it instead of removing it, so the trail survives.`,
      },
      { status: 409 },
    )
  }

  const { error } = await adminClient.from('partner_roles').delete().eq('job_id', jobId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
