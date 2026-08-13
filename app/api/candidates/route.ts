import { NextRequest, NextResponse, after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { candidateOwnershipFilter, getAppUser } from '@/lib/current-user'
import { candidateRowFromParsed, sanitizeCandidateInput, toText } from '@/lib/resume'
import { embedCandidate } from '@/lib/embeddings'
import type { ParsedResumeData } from '@/lib/types'
import { getSubmissionTermsStatus } from '@/lib/submission-terms'
import { candidateHighlights } from '@/lib/candidate-highlights'
import { getRequestContext } from '@/lib/request-context'
import { notifySlack } from '@/lib/slack'

export async function GET(request: NextRequest) {
  try {
    const adminClient = createAdminClient()
    const appUser = await getAppUser()

    if (!appUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!appUser.isActive) {
      return NextResponse.json({ error: 'Account is not active' }, { status: 403 })
    }

    // Get limit from query params
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '100')

    // Scope in the query, not after the fact. Filtering a limited page in JS
    // returned a partner the intersection of "their candidates" and "the first
    // N by name" — usually far fewer rows than they actually own.
    let query = adminClient
      .from('candidates')
      .select('id, name, email, linkedin_url, skills, location, phone, experience_years, owner_user_id, uploaded_by_user_id, user_id')
      .order('name')
      .limit(limit)

    if (!appUser.canViewAllCandidates) {
      query = query.or(candidateOwnershipFilter(appUser.id))
    }

    const { data: candidates, error } = await query

    if (error) {
      throw error
    }

    return NextResponse.json({ candidates: candidates || [] })
  } catch (error) {
    console.error('Error fetching candidates:', error)
    return NextResponse.json({ error: 'Failed to fetch candidates' }, { status: 500 })
  }
}

/**
 * Create a candidate from a parsed resume.
 *
 * The body used to be spread straight into the insert. That made the endpoint a
 * thin pipe from a language model's output into Postgres, and the model only had
 * to answer "1.5" for years of experience — which it does for anyone under two
 * years in — for the `integer` column to reject the row and both upload paths to
 * report the same opaque "Failed to create candidate". Everything the model
 * produces is now coerced to what the column accepts before it gets near the
 * database, and anything that still fails comes back with the real reason.
 */
export async function POST(request: NextRequest) {
  try {
    const appUser = await getAppUser()

    if (!appUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!appUser.isActive) {
      return NextResponse.json({ error: 'Your account is not active yet, so profiles cannot be created.' }, { status: 403 })
    }

    const adminClient = createAdminClient()

    // Partner Terms v2.0 leaves attribution and candidate consent to the
    // Submission Terms, which bind here. 428 is the signal the upload screen
    // uses to show them; it is not an error the partner did anything wrong.
    const termsStatus = await getSubmissionTermsStatus(adminClient, appUser)
    if (termsStatus.required && !termsStatus.accepted) {
      return NextResponse.json(
        { error: 'submission_terms_required', submission_terms_required: true },
        { status: 428 },
      )
    }

    const body = (await request.json()) as Record<string, unknown>

    const parsed = (body.parsed_data ?? null) as Partial<ParsedResumeData> | null

    // Derive the columns from the parsed resume first, then let anything the
    // caller passed explicitly win — that is how a corrected name or a
    // hand-picked owner from the review screen takes effect.
    const derived = parsed
      ? candidateRowFromParsed({
          parsed,
          resume_blob_pathname: toText(body.resume_blob_pathname),
          resume_filename: toText(body.resume_filename),
        })
      : {}

    const explicit = sanitizeCandidateInput(body)
    const row: Record<string, unknown> = { ...derived, ...explicit }

    if (parsed) {
      row.parsed_data = parsed
    }

    // Both columns are NOT NULL. Catching it here turns a 500 with a Postgres
    // error string into something the uploader can actually tell the user.
    const name = toText(row.name)
    if (!name) {
      return NextResponse.json(
        { error: 'No name could be read from this resume. Add one before creating the profile.' },
        { status: 400 },
      )
    }
    row.name = name

    if (!toText(row.resume_blob_pathname)) {
      return NextResponse.json(
        { error: 'The resume file is missing. Upload it again before creating the profile.' },
        { status: 400 },
      )
    }

    // Uploading the same person twice is the most common way this dataset gets
    // messy, and it happens most often in bulk. Report it as a distinct outcome
    // with the existing profile attached, so the uploader can link to it rather
    // than treating it as a failure.
    const email = toText(row.email)
    if (email) {
      let duplicateQuery = adminClient
        .from('candidates')
        .select('id, name, email')
        .ilike('email', email)
        .limit(1)

      if (!appUser.canViewAllCandidates) {
        duplicateQuery = duplicateQuery.or(candidateOwnershipFilter(appUser.id))
      }

      const { data: existing } = await duplicateQuery.maybeSingle()

      if (existing) {
        return NextResponse.json(
          {
            error: `${existing.name} is already in your candidates with this email address.`,
            code: 'DUPLICATE',
            candidate: existing,
          },
          { status: 409 },
        )
      }
    }

    // Whoever creates the profile owns it by default. Both creation paths —
    // the single upload form and the bulk uploader — post here, so this is the
    // one place that needs it. An explicit owner_user_id in the body still
    // wins, and it can be reassigned later from the candidate page.
    const { data: candidate, error } = await adminClient
      .from('candidates')
      .insert({
        ...row,
        user_id: appUser.id,
        uploaded_by_user_id: appUser.id,
        owner_user_id: row.owner_user_id ?? appUser.id,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating candidate:', error)
      return NextResponse.json(
        { error: `Could not save this candidate: ${error.message}`, code: error.code },
        { status: 400 },
      )
    }

    // Non-fatal by design — see embedCandidate.
    const embedded = parsed ? await embedCandidate(candidate.id, parsed, name) : false

    // Tell the admin who just submitted whom, with enough of the profile to
    // judge it without opening anything. Runs after the response so a slow
    // webhook never delays the uploader.
    const ctx = getRequestContext(request)
    after(async () => {
      try {
        const h = candidateHighlights(parsed, {
          name,
          linkedin_url: toText(row.linkedin_url),
          location: toText(row.location),
        })
        const origin = request.nextUrl.origin

        await notifySlack({
          stream: 'candidates',
          emoji: ':inbox_tray:',
          title: `${appUser.fullName || appUser.email} submitted ${name}`,
          context: h.headline ? `Currently ${h.headline}.` : undefined,
          fields: [
            { label: 'Submitted by', value: `${appUser.fullName || 'Unknown'} (${appUser.email})` },
            { label: 'Role', value: appUser.role },
            ...(h.linkedin ? [{ label: 'LinkedIn', value: h.linkedin }] : []),
            ...(h.points.length ? [{ label: 'Highlights', value: h.points.join(' · ') }] : []),
            { label: 'From', value: ctx.location || 'Unknown' },
          ],
          body: h.summary || undefined,
          links: [{ label: 'Open profile', url: `${origin}/candidates/${candidate.id}` }],
        })
      } catch (err) {
        console.error('[candidates] slack notify failed:', err)
      }
    })

    return NextResponse.json({ candidate, embedded })
  } catch (error) {
    console.error('Error creating candidate:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: `Failed to create candidate: ${message}` }, { status: 500 })
  }
}
