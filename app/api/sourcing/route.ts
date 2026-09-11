/**
 * Every write on the sourcing desk, one verb per call, super admin only.
 * The page buttons and the Slack card end in the same functions.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/server'
import { addOverride, approveBrief, buildBrief } from '@/lib/sourcing/brief'
import { addManual, discoverForJob } from '@/lib/sourcing/discover'
import { enrichPromising, gradePromising, recheck, screenPending } from '@/lib/sourcing/grade'
import { approveBatch, cancelBatch, proposeBatch, saveSequence } from '@/lib/sourcing/sequence'
import { loadMailboxes, testMailbox } from '@/lib/sourcing/mailboxes'
import { syncMailbox } from '@/lib/sourcing/sync'
import type { MailboxRow } from '@/lib/sourcing/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

type Body = { op: string } & Record<string, unknown>

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status })
  const by = auth.email
  const admin = createAdminClient()
  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 })
  }
  const jobId = str(body.jobId)

  try {
    switch (body.op) {
      case 'brief.build': {
        const brief = await buildBrief(admin, jobId, by)
        return NextResponse.json({ ok: true, version: brief.version, changes: brief.changes?.length ?? 0 })
      }
      case 'brief.approve': {
        const brief = await approveBrief(admin, str(body.briefId), by)
        return NextResponse.json({ ok: true, version: brief.version })
      }
      case 'brief.override': {
        // The page edits not-for and signals as plain lines; the spec keeps them with a source.
        const path = str(body.path)
        const value =
          (path === 'not_for' || path === 'signals') && Array.isArray(body.value)
            ? (body.value as unknown[]).filter((x): x is string => typeof x === 'string').map(text => ({ text, sources: [{ kind: 'lily', label: 'Lily', date: new Date().toISOString().slice(0, 10) }] }))
            : (body.value ?? null)
        await addOverride(admin, str(body.briefId), { path, value, by, reason: str(body.reason) || null })
        return NextResponse.json({ ok: true })
      }
      case 'note.add': {
        const text = str(body.text).trim()
        if (text.length < 20) return NextResponse.json({ error: 'a note needs at least a sentence' }, { status: 400 })
        const kind = str(body.kind) === 'market' ? 'market' : 'note'
        const { error } = await admin.from('sourcing_notes').insert({ job_id: jobId, kind, title: str(body.title).slice(0, 120) || null, text: text.slice(0, 40_000), created_by: by })
        if (error) throw new Error(error.message)
        return NextResponse.json({ ok: true })
      }
      case 'note.delete': {
        await admin.from('sourcing_notes').delete().eq('id', str(body.noteId))
        return NextResponse.json({ ok: true })
      }
      case 'discover': {
        const out = await discoverForJob(admin, jobId, { apolloPages: Number(body.pages ?? 2) })
        // Screening is cheap; do it now so the pool page shows who is worth a credit.
        const s = await screenPending(admin, jobId, 200)
        return NextResponse.json({ ok: true, ...out, screened: s.screened, screenedOut: s.out, notes: [...out.notes, ...s.notes] })
      }
      case 'enrich': {
        const s = await screenPending(admin, jobId, 200)
        const e = await enrichPromising(admin, jobId, Number(body.limit ?? 30))
        const g = await gradePromising(admin, jobId, Number(body.limit ?? 30))
        return NextResponse.json({ ok: true, screened: s.screened, enriched: e.enriched, credits: e.credits, graded: g.graded, fit: g.fit, notes: [...s.notes, ...e.notes, ...g.notes] })
      }
      case 'grade': {
        const g = await gradePromising(admin, jobId, Number(body.limit ?? 40))
        return NextResponse.json({ ok: true, ...g })
      }
      case 'person.add': {
        const out = await addManual(admin, jobId, { name: str(body.name), linkedin: str(body.linkedin) || null, email: str(body.email) || null, title: str(body.title) || null, employer: str(body.employer) || null })
        return NextResponse.json({ ok: true, ...out })
      }
      case 'pool.decide': {
        const ids = strs(body.poolIds)
        const decision = str(body.decision)
        if (!['ready', 'held', 'not_fit', 'none'].includes(decision) || !ids.length) return NextResponse.json({ error: 'decision and poolIds required' }, { status: 400 })
        const reason = str(body.reason) || null
        if (decision === 'not_fit' && !reason) return NextResponse.json({ error: 'a reason is required for not a fit; it teaches the next run' }, { status: 400 })
        for (const id of ids) await recheck(admin, id)
        const { error } = await admin
          .from('sourcing_pool')
          .update({ decision, decision_reason: reason, decided_by: by, decided_at: new Date().toISOString() })
          .in('id', ids)
        if (error) throw new Error(error.message)
        return NextResponse.json({ ok: true, n: ids.length })
      }
      case 'pool.relocation': {
        const { data: pool } = await admin.from('sourcing_pool').select('person_id').eq('id', str(body.poolId)).maybeSingle()
        if (!pool) return NextResponse.json({ error: 'not found' }, { status: 404 })
        const relocation = str(body.relocation)
        if (!['unknown', 'willing', 'unwilling'].includes(relocation)) return NextResponse.json({ error: 'bad value' }, { status: 400 })
        await admin.from('sourcing_people').update({ relocation }).eq('id', pool.person_id)
        // The location verdict changes with it, so the row is graded again.
        await admin.from('sourcing_pool').update({ fit_status: 'unknown' }).eq('id', str(body.poolId))
        return NextResponse.json({ ok: true })
      }
      case 'sequence.save': {
        const patch: Record<string, unknown> = {}
        for (const k of ['steps', 'mailbox_ids', 'address_preference', 'send_days', 'followup_days', 'window_start', 'window_end', 'mode', 'sending']) if (k in body) patch[k] = body[k]
        const seq = await saveSequence(admin, jobId, patch)
        return NextResponse.json({ ok: true, version: seq.version })
      }
      case 'batch.propose': {
        const out = await proposeBatch(admin, jobId, by, strs(body.poolIds))
        return NextResponse.json({ ok: true, batchId: out.batch?.id ?? null, n: out.batch?.items.length ?? 0, skipped: out.skipped, slack: out.slack })
      }
      case 'batch.approve': {
        const out = await approveBatch(admin, str(body.batchId), by, strs(body.skipPoolIds))
        return NextResponse.json({ ok: true, ...out })
      }
      case 'batch.cancel': {
        return NextResponse.json({ ok: await cancelBatch(admin, str(body.batchId)) })
      }
      case 'run.pause':
      case 'run.resume':
      case 'run.stop': {
        const runId = str(body.runId)
        const { data: run } = await admin.from('sourcing_runs').select('state, step, drafts').eq('id', runId).maybeSingle()
        if (!run) return NextResponse.json({ error: 'not found' }, { status: 404 })
        const patch =
          body.op === 'run.pause'
            ? { state: 'paused', stopped_reason: 'paused by Lily' }
            : body.op === 'run.stop'
              ? { state: 'stopped', stopped_reason: str(body.reason) || 'stopped by Lily' }
              : run.state === 'paused' || run.state === 'error'
                ? { state: run.step === 0 ? 'queued' : (run.drafts as unknown[]).length > run.step ? 'active' : 'done', stopped_reason: null, last_error: null, next_at: new Date().toISOString() }
                : {}
        if (Object.keys(patch).length) await admin.from('sourcing_runs').update(patch).eq('id', runId)
        await admin.from('sourcing_events').insert({ run_id: runId, kind: body.op.replace('run.', ''), summary: `${by}` })
        return NextResponse.json({ ok: true })
      }
      case 'suppress': {
        const email = str(body.email).trim().toLowerCase()
        if (!email.includes('@')) return NextResponse.json({ error: 'email required' }, { status: 400 })
        await admin.from('sourcing_suppressions').upsert({ email, reason: str(body.reason) || 'added by hand', source: 'page', created_by: by }, { onConflict: 'email' })
        await admin.from('sourcing_runs').update({ state: 'stopped', stopped_reason: 'address on the never list' }).eq('address', email).in('state', ['queued', 'active', 'ooo', 'paused'])
        return NextResponse.json({ ok: true })
      }
      case 'mailbox.add': {
        const address = str(body.address).trim().toLowerCase()
        if (!address.includes('@')) return NextResponse.json({ error: 'address required' }, { status: 400 })
        const kind = str(body.kind) === 'refresh_token' ? 'refresh_token' : str(body.kind) === 'desk' ? 'desk' : 'service_account'
        const credential = kind === 'refresh_token' ? { kind, refresh_token: str(body.refreshToken) } : { kind }
        const { error } = await admin.from('sourcing_mailboxes').upsert(
          {
            address,
            display_name: str(body.displayName) || address,
            signs_as: str(body.signsAs) || (str(body.displayName) || address).split(/\s+/)[0],
            owner_email: str(body.ownerEmail) || null,
            credential,
            daily_cap: Number(body.dailyCap ?? 10),
            cap_ceiling: Number(body.capCeiling ?? 50),
            reserved_other: Number(body.reservedOther ?? 0),
            ramp_started_at: new Date().toISOString(),
            status: 'active',
          },
          { onConflict: 'address' },
        )
        if (error) throw new Error(error.message)
        return NextResponse.json({ ok: true })
      }
      case 'mailbox.update': {
        const patch: Record<string, unknown> = {}
        for (const k of ['daily_cap', 'cap_ceiling', 'ramp_step', 'reserved_other', 'signs_as', 'display_name', 'status']) if (k in body) patch[k] = body[k]
        if (patch.status === 'active') patch.last_error = null
        const { error } = await admin.from('sourcing_mailboxes').update(patch).eq('id', str(body.mailboxId))
        if (error) throw new Error(error.message)
        return NextResponse.json({ ok: true })
      }
      case 'mailbox.test': {
        const m = (await loadMailboxes(admin)).find(x => x.id === str(body.mailboxId)) as MailboxRow | undefined
        if (!m) return NextResponse.json({ error: 'not found' }, { status: 404 })
        const t = await testMailbox(m)
        if (t.ok) {
          const s = await syncMailbox(admin, m)
          return NextResponse.json({ ok: true, address: t.address, sync: s })
        }
        await admin.from('sourcing_mailboxes').update({ status: 'error', last_error: t.error ?? 'test failed' }).eq('id', m.id)
        return NextResponse.json({ ok: false, error: t.error })
      }
      default:
        return NextResponse.json({ error: `unknown op ${body.op}` }, { status: 400 })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[sourcing:api]', body.op, message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
