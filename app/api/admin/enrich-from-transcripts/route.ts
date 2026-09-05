import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getAppUser } from '@/lib/current-user'
import { coerceFinding, extractFromTranscripts, EXTRACTABLE_FIELDS } from '@/lib/transcript-extract'

export const maxDuration = 300

/**
 * Read candidate intro-call transcripts and stage what they say as CRM
 * proposals.
 *
 * Super admin only: it spans every partner's book, and the transcripts behind
 * it are deliberately unreadable through the app (`ingested_signals` has RLS
 * on with no policies, so only the service role reaches it).
 *
 * Nothing is written to a candidate row. Findings land in
 * `crm_update_proposals` with the verbatim quote that produced them, which is
 * the only way a reviewer can tell "she said 130" from "the model heard 130".
 */

/** Below this, a finding is a guess and staging it just makes review noisier. */
const MIN_CONFIDENCE = 0.7

/** How many candidates one invocation will read, so the route finishes inside its budget. */
const DEFAULT_LIMIT = 10

interface ProposalRow {
  signal_id: string
  target_table: string
  target_id: string
  proposed: Record<string, string | number>
  rationale: string
  confidence: number
  status: string
}

export async function POST(request: NextRequest) {
  try {
    const appUser = await getAppUser()

    if (!appUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!appUser.isSuperAdmin) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const body = await request.json().catch(() => ({}))
    const limit = Math.min(50, Math.max(1, Number(body?.limit) || DEFAULT_LIMIT))
    // Stage nothing, just report what would be staged. The cheapest way to
    // see whether the prompt is behaving before spending on a full run.
    const dryRun = body?.dryRun === true
    const onlyCandidateId: string | undefined = body?.candidateId

    const admin = createAdminClient()

    // Every Granola call already linked to a candidate. `raw` is left out
    // here on purpose: at ~36,000 characters a transcript, pulling all of
    // them up front is megabytes of payload for a list we only need ids from.
    let signalQuery = admin
      .from('ingested_signals')
      .select('id, entity_id, title, occurred_at')
      .eq('source', 'granola')
      .eq('entity_type', 'candidate')
      .not('entity_id', 'is', null)
      .order('occurred_at')

    if (onlyCandidateId) signalQuery = signalQuery.eq('entity_id', onlyCandidateId)

    const { data: signals, error: signalError } = await signalQuery
    if (signalError) throw signalError

    // Resumable, for the same reason the résumé backfill is: reading costs
    // real money per candidate, so a run interrupted by a deploy or a closed
    // tab must pick up where it stopped instead of paying again. A candidate
    // that already has a pending proposal has been read.
    const { data: existing, error: existingError } = await admin
      .from('crm_update_proposals')
      .select('target_id')
      .eq('target_table', 'candidates')
      .eq('status', 'pending')
    if (existingError) throw existingError

    const alreadyStaged = new Set((existing ?? []).map(r => r.target_id))

    const byCandidate = new Map<string, { id: string; title: string; occurredAt: string }[]>()
    for (const s of signals ?? []) {
      const candidateId = s.entity_id as string
      if (alreadyStaged.has(candidateId)) continue
      const list = byCandidate.get(candidateId) ?? []
      list.push({ id: s.id, title: s.title ?? 'Untitled call', occurredAt: String(s.occurred_at).slice(0, 10) })
      byCandidate.set(candidateId, list)
    }

    const queue = [...byCandidate.entries()].slice(0, limit)

    const results: {
      candidateId: string
      name: string
      calls: number
      staged: number
      skipped: string[]
      model?: string
      error?: string
    }[] = []

    for (const [candidateId, calls] of queue) {
      const { data: candidate } = await admin
        .from('candidates')
        .select('id, name, location, remote_preference, salary_expectation_min, salary_expectation_max, availability_status')
        .eq('id', candidateId)
        .maybeSingle()

      if (!candidate) {
        results.push({ candidateId, name: '(missing)', calls: calls.length, staged: 0, skipped: ['candidate row not found'] })
        continue
      }

      const { data: withText } = await admin
        .from('ingested_signals')
        .select('id, raw')
        .in('id', calls.map(c => c.id))

      const textById = new Map((withText ?? []).map(r => [r.id, (r.raw as { transcript?: string })?.transcript ?? '']))

      const transcripts = calls
        .map(c => ({ title: c.title, occurredAt: c.occurredAt, text: textById.get(c.id) ?? '' }))
        // A couple of these calls recorded only fragments of unintelligible
        // audio. There is nothing in them to extract, and sending them costs
        // the same as sending a real one.
        .filter(t => t.text.length > 2000)

      if (transcripts.length === 0) {
        results.push({
          candidateId,
          name: candidate.name,
          calls: calls.length,
          staged: 0,
          skipped: ['no usable transcript text'],
        })
        continue
      }

      let extraction
      let model: string
      try {
        const out = await extractFromTranscripts(candidate.name, transcripts)
        extraction = out.extraction
        model = out.model
      } catch (error) {
        results.push({
          candidateId,
          name: candidate.name,
          calls: transcripts.length,
          staged: 0,
          skipped: [],
          error: error instanceof Error ? error.message.slice(0, 200) : 'extraction failed',
        })
        continue
      }

      const current = candidate as unknown as Record<string, unknown>
      // Attribute proposals to the most recent call, which is the one whose
      // wording wins when two disagree.
      const signalId = calls[calls.length - 1].id

      const proposals: ProposalRow[] = []
      const skipped: string[] = []

      for (const finding of extraction.findings) {
        if (!(EXTRACTABLE_FIELDS as readonly string[]).includes(finding.field)) continue

        if (finding.confidence < MIN_CONFIDENCE) {
          skipped.push(`${finding.field}: confidence ${finding.confidence}`)
          continue
        }

        const value = coerceFinding(finding)
        if (value === null) {
          skipped.push(`${finding.field}: unusable value "${finding.value}"`)
          continue
        }

        // Proposing what the row already says is pure review burden.
        if (String(current[finding.field] ?? '') === String(value)) {
          skipped.push(`${finding.field}: already set to this`)
          continue
        }

        const currentText = current[finding.field] == null ? '(empty)' : String(current[finding.field])
        const currency =
          finding.field.startsWith('salary') && extraction.currency ? ` ${extraction.currency}` : ''

        proposals.push({
          signal_id: signalId,
          target_table: 'candidates',
          target_id: candidateId,
          proposed: { [finding.field]: value },
          rationale:
            `From the intro call on ${calls[calls.length - 1].occurredAt}. ` +
            `Currently ${currentText}, proposed ${value}${currency}.\n\n` +
            `Quote: "${finding.quote}"`,
          confidence: Math.min(1, Math.max(0, finding.confidence)),
          status: 'pending',
        })
      }

      if (proposals.length > 0 && !dryRun) {
        const { error: insertError } = await admin.from('crm_update_proposals').insert(proposals)
        if (insertError) {
          results.push({
            candidateId,
            name: candidate.name,
            calls: transcripts.length,
            staged: 0,
            skipped,
            model,
            error: `could not stage: ${insertError.message}`,
          })
          continue
        }
      }

      results.push({
        candidateId,
        name: candidate.name,
        calls: transcripts.length,
        staged: proposals.length,
        skipped,
        model,
      })
    }

    return NextResponse.json({
      dryRun,
      candidatesWithTranscripts: byCandidate.size,
      processed: results.length,
      remaining: Math.max(0, byCandidate.size - results.length),
      staged: results.reduce((n, r) => n + r.staged, 0),
      results,
    })
  } catch (error) {
    console.error('Error enriching from transcripts:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: `Could not enrich from transcripts: ${message.slice(0, 300)}` }, { status: 500 })
  }
}
