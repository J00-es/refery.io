import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getAppUser } from '@/lib/current-user'
import { PARSER_VERSION } from '@/lib/resume-parser'

/**
 * Which candidates were parsed by an older extractor and still have a résumé
 * on file to re-read.
 *
 * Exists so a backfill can be resumed rather than restarted. Re-reading is the
 * one operation here that costs real money per row, so a run that is
 * interrupted — a closed tab, a deploy, a network blip — must be able to pick
 * up exactly where it left off instead of paying again for the rows it already
 * did. `parsed_data.parser_version` is the marker, written only on success, so
 * this list shrinks as work completes and is the only state the backfill needs.
 *
 * Super admin only: it spans every partner's book.
 */
export async function GET(request: NextRequest) {
  try {
    const appUser = await getAppUser()

    if (!appUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!appUser.isSuperAdmin) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const limit = Math.min(
      1000,
      Math.max(1, parseInt(request.nextUrl.searchParams.get('limit') || '500', 10) || 500),
    )

    const { data, error } = await createAdminClient()
      .from('candidates')
      .select('id, name, parsed_data->parser_version, resume_blob_pathname')
      .not('resume_blob_pathname', 'is', null)
      .order('created_at')
      .limit(limit)

    if (error) throw error

    const stale = (data ?? []).filter(row => {
      const version = Number((row as { parser_version?: unknown }).parser_version ?? 0)
      return !row.resume_blob_pathname ? false : !(version >= PARSER_VERSION)
    })

    return NextResponse.json({
      parserVersion: PARSER_VERSION,
      count: stale.length,
      ids: stale.map(row => row.id),
    })
  } catch (error) {
    console.error('Error listing stale parses:', error)
    return NextResponse.json({ error: 'Failed to list stale parses' }, { status: 500 })
  }
}
