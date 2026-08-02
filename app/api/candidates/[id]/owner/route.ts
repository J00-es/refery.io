import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getAppUser, requireCandidateAccess } from '@/lib/current-user'

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // This handler reassigns a candidate through the service-role client, so
    // it must first prove the caller can reach the candidate at all —
    // otherwise any partner could hand themselves someone else's candidate by
    // posting its id.
    const access = await requireCandidateAccess(id)
    if (!access.ok) {
      return NextResponse.json({ error: access.message }, { status: access.status })
    }

    const { appUser } = access
    const { owner_user_id } = await req.json()

    // Reassigning to a *different* person grants them access and revokes the
    // current owner's — an admin-only action. Partners may only claim a
    // candidate they can already see.
    if (!appUser.isAdmin && owner_user_id && owner_user_id !== appUser.id) {
      return NextResponse.json(
        { error: 'Only admins can assign a candidate to another user' },
        { status: 403 },
      )
    }

    const { error } = await createAdminClient()
      .from('candidates')
      .update({ owner_user_id: owner_user_id || null })
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating owner:', error)
    return NextResponse.json({ error: 'Failed to update owner' }, { status: 500 })
  }
}

// Get list of users for the assignment dropdown
export async function GET(req: Request) {
  try {
    const appUser = await getAppUser()
    if (!appUser?.isActive) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // The dropdown is a directory of every partner's name and email. Only
    // admins can reassign to another user, so only admins get the directory.
    if (!appUser.isAdmin) {
      return NextResponse.json({
        users: [
          {
            user_id: appUser.id,
            email: appUser.email,
            full_name: appUser.fullName,
            role: appUser.role,
          },
        ],
      })
    }

    const url = new URL(req.url)
    const search = url.searchParams.get('search') || ''

    let query = createAdminClient()
      .from('users_admin')
      .select('user_id, email, full_name, role')
      .not('user_id', 'is', null)
      .order('full_name')
      .limit(20)

    if (search) {
      query = query.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`)
    }

    const { data: users, error } = await query

    if (error) throw error

    return NextResponse.json({ users: users || [] })
  } catch (error) {
    console.error('Error fetching users:', error)
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }
}
