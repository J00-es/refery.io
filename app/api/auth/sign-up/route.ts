import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

interface AgreementPayload {
  version: string
  type: string
  hash: string
  userAgent?: string
}

function getClientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  const real = req.headers.get('x-real-ip')
  if (real) return real
  return null
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { email, password, fullName, linkedinUrl, role } = body
    const agreement: AgreementPayload | undefined = body.agreement

    const supabase = await createClient()
    const adminClient = createAdminClient()

    // Sign up the user with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/auth/callback`,
        data: {
          full_name: fullName,
          linkedin_url: linkedinUrl,
        },
      },
    })

    if (authError) {
      console.error('Auth sign up error:', authError)
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    if (authData.user) {
      // Create users_admin record using admin client (bypasses RLS)
      const { error: adminError } = await adminClient.from('users_admin').insert({
        user_id: authData.user.id,
        email: email,
        full_name: fullName,
        linkedin_url: linkedinUrl,
        role: role || 'viewer',
        status: 'pending',
        accepted_terms_at: new Date().toISOString(),
      })
      if (adminError) {
        console.error('Failed to create user admin record:', adminError)
        // Don't fail the whole sign-up if admin record creation fails
      }

      // Persist the role-specific clickwrap acceptance for legal record-keeping
      if (agreement) {
        const ip = getClientIp(req)
        const ua = agreement.userAgent || req.headers.get('user-agent') || null
        const { error: acceptError } = await adminClient
          .from('agreement_acceptances')
          .insert({
            user_id: authData.user.id,
            user_email: email,
            user_name: fullName,
            ip_address: ip,
            user_agent: ua,
            agreement_version: agreement.version,
            agreement_hash: agreement.hash,
            acceptance_method: 'clickwrap_checkbox_and_button',
            agreement_type: agreement.type,
          })
        if (acceptError) {
          console.error('Failed to record agreement acceptance:', acceptError)
        }
      }
    }

    return NextResponse.json({
      success: true,
      user: authData.user,
      session: authData.session,
    })
  } catch (error) {
    console.error('Sign up error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sign up failed' },
      { status: 500 }
    )
  }
}
