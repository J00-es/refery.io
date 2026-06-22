import { type NextRequest, NextResponse } from 'next/server'
import { get } from '@vercel/blob'
import { createClient, createAdminClient } from '@/lib/supabase/server'

const SUPER_ADMIN_EMAILS = ['lily@10kventures.co']

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const pathname = request.nextUrl.searchParams.get('pathname')

    if (!pathname) {
      return NextResponse.json({ error: 'Missing pathname' }, { status: 400 })
    }

    // Authorize by candidate-row access rather than blob path ownership.
    // Resumes are uploaded by many actors (recruiters, scouts, partners, bulk
    // import on behalf of others), so the upload path's user id does NOT
    // identify who is allowed to read it. Anyone who can read the candidate
    // row that references this resume can download it; super admins bypass.
    const isSuperAdmin = !!user.email && SUPER_ADMIN_EMAILS.includes(user.email)

    const lookupClient = isSuperAdmin ? createAdminClient() : supabase
    const { data: candidateRow } = await lookupClient
      .from('candidates')
      .select('id')
      .eq('resume_blob_pathname', pathname)
      .maybeSingle()

    if (!candidateRow) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const result = await get(pathname, {
      access: 'private',
      ifNoneMatch: request.headers.get('if-none-match') ?? undefined,
    })

    if (!result) {
      return new NextResponse('Not found', { status: 404 })
    }

    // Blob hasn't changed — tell the browser to use its cached copy
    if (result.statusCode === 304) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: result.blob.etag,
          'Cache-Control': 'private, no-cache',
        },
      })
    }

    return new NextResponse(result.stream, {
      headers: {
        'Content-Type': result.blob.contentType,
        ETag: result.blob.etag,
        'Cache-Control': 'private, no-cache',
      },
    })
  } catch (error) {
    console.error('Error serving file:', error)
    return NextResponse.json({ error: 'Failed to serve file' }, { status: 500 })
  }
}
