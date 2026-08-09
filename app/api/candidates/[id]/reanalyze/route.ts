import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireCandidateAccess } from '@/lib/current-user'
import { analyzeResumeFromBlob, ResumeNotFoundError } from '@/lib/resume-parser'
import { candidateRowFromParsed } from '@/lib/resume'
import { embedCandidate } from '@/lib/embeddings'

export const maxDuration = 300

/**
 * Re-read a candidate's resume with the current extractor.
 *
 * Most of the existing profiles were parsed by a much thinner extractor that
 * kept only a summary of each role and dropped education, links, projects and
 * the document text entirely. Rather than leave those profiles permanently
 * poorer than newly uploaded ones, this re-runs the parse from the resume still
 * sitting in blob storage and backfills everything.
 *
 * Fields a human has since edited are preserved: the parse is a source for
 * columns that came from the resume in the first place, not an authority over
 * someone's correction. Status, ownership, verdicts and notes are never touched.
 */
/**
 * Columns a recruiter can change by hand on the edit form.
 *
 * These are the ones a re-read can quietly undo, so `mode: 'fill'` leaves any
 * of them that already has a value alone. Everything else a résumé produces —
 * work history, education, keywords, the parse itself — was never editable, so
 * it is always refreshed.
 */
const HAND_EDITABLE_COLUMNS = [
  'email',
  'phone',
  'linkedin_url',
  'location',
  'experience_years',
  'remote_preference',
  'salary_expectation_min',
  'salary_expectation_max',
  'skills',
] as const

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  return true
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    const access = await requireCandidateAccess(id)
    if (!access.ok) {
      return NextResponse.json({ error: access.message }, { status: access.status })
    }

    // 'replace' — what the button does: the résumé is the source of truth,
    // because someone deliberately asked for it to be read again.
    // 'fill'    — what the bulk backfill does: add what is missing and never
    //             overwrite something a person typed. Across hundreds of rows,
    //             silently reverting a corrected email is damage nobody would
    //             notice until it mattered.
    const body = await request.json().catch(() => ({}))
    const mode: 'replace' | 'fill' = body?.mode === 'fill' ? 'fill' : 'replace'

    const adminClient = createAdminClient()
    const { data: candidate } = await adminClient
      .from('candidates')
      // Spelled out rather than built from HAND_EDITABLE_COLUMNS: supabase-js
      // infers the row type from this string literal, and a computed one
      // collapses it to an error type.
      .select(
        'id, name, resume_blob_pathname, resume_filename, email, phone, linkedin_url, location, experience_years, remote_preference, salary_expectation_min, salary_expectation_max, skills',
      )
      .eq('id', id)
      .maybeSingle()

    if (!candidate?.resume_blob_pathname) {
      return NextResponse.json(
        { error: 'This candidate has no resume on file to re-read.' },
        { status: 400 },
      )
    }

    const parsed = await analyzeResumeFromBlob(candidate.resume_blob_pathname)
    const row = candidateRowFromParsed({ parsed })

    // Keep the name already on the record. It is the one field a recruiter is
    // most likely to have fixed by hand, and re-deriving it from a resume with
    // an unusual header is how a corrected name silently reverts.
    delete row.name

    if (mode === 'fill') {
      const existing = candidate as unknown as Record<string, unknown>
      for (const column of HAND_EDITABLE_COLUMNS) {
        if (hasValue(existing[column])) delete row[column]
      }
    }

    const { data: updated, error } = await adminClient
      .from('candidates')
      .update({ ...row, parsed_data: parsed, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error saving re-analysis:', error)
      return NextResponse.json({ error: `Could not save the re-analysis: ${error.message}` }, { status: 400 })
    }

    const embedded = await embedCandidate(id, parsed, candidate.name)

    return NextResponse.json({ candidate: updated, embedded, mode })
  } catch (error) {
    console.error('Error re-analyzing candidate:', error)

    if (error instanceof ResumeNotFoundError) {
      return NextResponse.json(
        { error: 'The resume file is no longer in storage, so it cannot be re-read.' },
        { status: 404 },
      )
    }

    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: `Could not re-read this resume: ${message.slice(0, 300)}` }, { status: 500 })
  }
}
