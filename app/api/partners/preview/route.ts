import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/server'
import { getAppUser } from '@/lib/current-user'
import { PREVIEW_COOKIE } from '@/lib/partners-access'

/**
 * Entering and leaving a preview.
 *
 * Deliberately not gated on `resolvePartnerAccess`: that function *reads* the
 * preview state, so using it here would let a persona change the persona. The
 * check is against the signed-in user directly, and only a super admin passes.
 */
export async function POST(req: Request) {
  const appUser = await getAppUser()
  if (!appUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!appUser.isSuperAdmin) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const userId = typeof body?.user_id === 'string' ? body.user_id : null
  if (!userId) return NextResponse.json({ error: 'user_id is required' }, { status: 400 })

  const adminClient = createAdminClient()
  const { data: row } = await adminClient
    .from('users_admin')
    .select('user_id, full_name, email, role, status')
    .eq('user_id', userId)
    .maybeSingle()

  if (!row) return NextResponse.json({ error: 'No such user' }, { status: 404 })
  if (row.status !== 'active') {
    return NextResponse.json({ error: 'That account is not active' }, { status: 409 })
  }

  const store = await cookies()
  store.set(PREVIEW_COOKIE, userId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    // Session-length on purpose. A preview is something you do for two minutes,
    // and one that survived a browser restart would be read as the real desk.
  })

  return NextResponse.json({
    previewing: {
      userId,
      name: (row.full_name as string) || (row.email as string),
      role: row.role as string,
    },
  })
}

/** Leaving the preview. Available to anyone holding the cookie, by design. */
export async function DELETE() {
  const store = await cookies()
  store.delete(PREVIEW_COOKIE)
  return NextResponse.json({ previewing: null })
}
