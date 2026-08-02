import { createClient, createAdminClient } from '@/lib/supabase/server'
import { normalizeEmail } from '@/lib/current-user'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    const adminClient = createAdminClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Get the user after exchanging the code
      const { data: { user } } = await supabase.auth.getUser()
      
      if (user?.email) {
        const email = normalizeEmail(user.email)
        // Check if user exists in users_admin using admin client to bypass RLS
        const { data: adminUser } = await adminClient
          .from('users_admin')
          .select('id, user_id')
          .eq('email', email)
          .maybeSingle()

        if (adminUser) {
          // If user exists but doesn't have user_id, update it
          if (!adminUser.user_id) {
            await adminClient
              .from('users_admin')
              .update({ user_id: user.id })
              .eq('id', adminUser.id)
          }
        } else {
          // Create users_admin record if it doesn't exist
          // This handles cases where users signed up via Supabase Auth directly
          const fullName = user.user_metadata?.full_name || user.email?.split('@')[0] || ''
          const linkedinUrl = user.user_metadata?.linkedin_url || null
          
          await adminClient
            .from('users_admin')
            .insert({
              user_id: user.id,
              email,
              full_name: fullName,
              linkedin_url: linkedinUrl,
              role: 'viewer', // Default role for users who signed up without selecting
              status: 'pending',
            })
        }
      }
      
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/error`)
}
