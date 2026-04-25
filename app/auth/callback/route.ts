import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Get the user after exchanging the code
      const { data: { user } } = await supabase.auth.getUser()
      
      // Sync user_id in users_admin if the user exists but doesn't have user_id set
      if (user?.email) {
        const { data: adminUser } = await supabase
          .from('users_admin')
          .select('id, user_id')
          .eq('email', user.email)
          .single()
        
        // If user exists in users_admin but doesn't have user_id, update it
        if (adminUser && !adminUser.user_id) {
          await supabase
            .from('users_admin')
            .update({ user_id: user.id })
            .eq('id', adminUser.id)
        }
      }
      
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/error`)
}
