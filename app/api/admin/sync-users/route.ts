import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

const SUPER_ADMIN_EMAILS = ['lily@10kventures.co']

export async function POST() {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only super admins can sync users
    const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(user.email || '')
    if (!isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get all users from Supabase Auth using admin client
    const { data: authUsers, error: authError } = await adminClient.auth.admin.listUsers()
    
    if (authError) {
      console.error('Error fetching auth users:', authError)
      return NextResponse.json({ error: 'Failed to fetch auth users' }, { status: 500 })
    }

    // Get all existing users_admin records
    const { data: existingAdminUsers } = await adminClient
      .from('users_admin')
      .select('email, user_id')

    const existingEmails = new Set(existingAdminUsers?.map(u => u.email.toLowerCase()) || [])
    const existingUserIds = new Set(existingAdminUsers?.map(u => u.user_id).filter(Boolean) || [])

    const usersToCreate: {
      user_id: string
      email: string
      full_name: string
      linkedin_url: string | null
      role: string
      status: string
    }[] = []
    const usersToUpdate: { id: string; user_id: string }[] = []

    for (const authUser of authUsers.users) {
      if (!authUser.email) continue
      
      const emailLower = authUser.email.toLowerCase()
      
      if (!existingEmails.has(emailLower)) {
        // User doesn't exist in users_admin, create them
        usersToCreate.push({
          user_id: authUser.id,
          email: emailLower,
          full_name: authUser.user_metadata?.full_name || authUser.email.split('@')[0] || '',
          linkedin_url: authUser.user_metadata?.linkedin_url || null,
          role: 'viewer',
          status: 'pending',
        })
      } else if (!existingUserIds.has(authUser.id)) {
        // User exists but user_id might not be set, find and update
        const existingUser = existingAdminUsers?.find(u => u.email.toLowerCase() === emailLower)
        if (existingUser && !existingUser.user_id) {
          // We need to get the id to update
          const { data: userToUpdate } = await adminClient
            .from('users_admin')
            .select('id')
            .eq('email', emailLower)
            .maybeSingle()
          
          if (userToUpdate) {
            usersToUpdate.push({ id: userToUpdate.id, user_id: authUser.id })
          }
        }
      }
    }

    // Create new users
    let created = 0
    if (usersToCreate.length > 0) {
      const { error: insertError } = await adminClient
        .from('users_admin')
        .insert(usersToCreate)
      
      if (insertError) {
        console.error('Error creating users:', insertError)
      } else {
        created = usersToCreate.length
      }
    }

    // Update existing users with missing user_id
    let updated = 0
    for (const userToUpdate of usersToUpdate) {
      const { error: updateError } = await adminClient
        .from('users_admin')
        .update({ user_id: userToUpdate.user_id })
        .eq('id', userToUpdate.id)
      
      if (!updateError) {
        updated++
      }
    }

    return NextResponse.json({
      success: true,
      totalAuthUsers: authUsers.users.length,
      created,
      updated,
      message: `Synced ${created} new users and updated ${updated} existing users`
    })
  } catch (error) {
    console.error('Error syncing users:', error)
    return NextResponse.json({ error: 'Failed to sync users' }, { status: 500 })
  }
}
