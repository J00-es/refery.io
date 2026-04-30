import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  try {
    const { email, password, fullName, linkedinUrl, role } = await req.json()
    
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
        }
      },
    })

    if (authError) {
      console.error('Auth sign up error:', authError)
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    // Create users_admin record using admin client (bypasses RLS)
    if (authData.user) {
      const { error: adminError } = await adminClient
        .from('users_admin')
        .insert({
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
        // The auth callback will try to sync it later
      }
    }

    return NextResponse.json({ 
      success: true, 
      user: authData.user,
      session: authData.session 
    })
  } catch (error) {
    console.error('Sign up error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sign up failed' }, 
      { status: 500 }
    )
  }
}
