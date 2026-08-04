import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { analyzeResumeFromBlob, ResumeNotFoundError } from '@/lib/resume-parser'

/** Transcribing a whole resume takes longer than the default budget. */
export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { pathname } = await request.json()

    if (!pathname) {
      return NextResponse.json({ error: 'Missing pathname' }, { status: 400 })
    }

    const parsed_data = await analyzeResumeFromBlob(pathname)

    return NextResponse.json({ parsed_data })
  } catch (error) {
    console.error('Resume analysis error:', error)

    if (error instanceof ResumeNotFoundError) {
      return NextResponse.json({ error: 'The uploaded file could not be found. Please upload it again.' }, { status: 404 })
    }

    const errorMessage = error instanceof Error ? error.message : String(error)

    if (errorMessage.includes('credit card') || errorMessage.includes('customer_verification_required')) {
      return NextResponse.json({
        error: 'AI service requires account verification. Please add a credit card to your Vercel account to unlock AI features.',
        code: 'VERIFICATION_REQUIRED'
      }, { status: 402 })
    }

    if (errorMessage.includes('rate limit') || errorMessage.includes('quota')) {
      return NextResponse.json({
        error: 'AI service rate limit reached. Please try again in a moment.',
        code: 'RATE_LIMIT'
      }, { status: 429 })
    }

    // The old generic message hid real, fixable causes — a password-protected
    // PDF, a scan with no text layer, a file that is not a PDF at all. Pass the
    // detail through so the uploader can show it.
    return NextResponse.json({
      error: `Could not read this resume: ${errorMessage.slice(0, 300)}`,
      code: 'ANALYSIS_FAILED',
    }, { status: 500 })
  }
}
