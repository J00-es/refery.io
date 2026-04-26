import { createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'

// GET - Get a single agreement link (admin only)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const auth = await requireAdmin()
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status })
  }

  const adminClient = createAdminClient()

  const { data, error } = await adminClient
    .from('agreement_links')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    console.error('[agreements/links/:id GET] query failed:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json(data)
}

// PATCH - Update agreement link status (admin only - for revoking)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const auth = await requireAdmin()
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status })
  }

  const adminClient = createAdminClient()

  let body: { status?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { status } = body

  if (status !== 'revoked') {
    return NextResponse.json({ error: 'Invalid status update' }, { status: 400 })
  }

  const nowIso = new Date().toISOString()

  const { data, error } = await adminClient
    .from('agreement_links')
    .update({
      status: 'revoked',
      revoked_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('[agreements/links/:id PATCH] update failed:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
