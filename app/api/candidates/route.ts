import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { candidateOwnershipFilter, getAppUser } from '@/lib/current-user'

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

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    const { data: candidate, error } = await adminClient
      .from('candidates')
      .insert({
        ...body,
        user_id: user.id,
        uploaded_by_user_id: user.id,
      })
      .select()
      .single()

    if (error) {
      throw error
    }

    return NextResponse.json({ candidate })
  } catch (error) {
    console.error('Error creating candidate:', error)
    return NextResponse.json({ error: 'Failed to create candidate' }, { status: 500 })
  }
}
