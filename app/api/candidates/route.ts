import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: candidates, error } = await supabase
      .from('candidates')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      throw error
    }

    return NextResponse.json({ candidates })
  } catch (error) {
    console.error('Error fetching candidates:', error)
    return NextResponse.json({ error: 'Failed to fetch candidates' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    const { data: candidate, error } = await supabase
      .from('candidates')
      .insert({
        ...body,
        user_id: user.id
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
