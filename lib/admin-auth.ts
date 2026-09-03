import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { JOBS_SUPER_ADMIN_ONLY, normalizeEmail, SUPER_ADMIN_EMAILS } from '@/lib/current-user'

export type AdminCheckResult =
  | { ok: true; userId: string; email: string; role: 'super_admin' | 'admin' }
  | { ok: false; status: 401 | 403 | 404; message: string }

/**
 * Verifies that the current request is from an authenticated admin or
 * super-admin. Mirrors the pattern used by /api/admin/* routes:
 *
 *   - Reads the session cookie via the SSR client.
 *   - Honors the SUPER_ADMIN_EMAILS allowlist (covers cases where the
 *     users_admin row hasn't been linked to an auth.users id yet).
 *   - Looks up users_admin by `email` using the service-role client to
 *     bypass RLS — direct user-bound queries against users_admin can hit
 *     recursive policy errors and return 500.
 */
export async function requireAdmin(): Promise<AdminCheckResult> {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !user.email) {
    return { ok: false, status: 401, message: 'Unauthorized' }
  }

  const email = normalizeEmail(user.email)

  if (SUPER_ADMIN_EMAILS.includes(email)) {
    return { ok: true, userId: user.id, email, role: 'super_admin' }
  }

  const { data: adminUser } = await adminClient
    .from('users_admin')
    .select('role, status')
    .eq('email', email)
    .maybeSingle()

  if (
    !adminUser ||
    adminUser.status !== 'active' ||
    !['admin', 'super_admin'].includes(adminUser.role)
  ) {
    return { ok: false, status: 403, message: 'Forbidden' }
  }

  return {
    ok: true,
    userId: user.id,
    email,
    role: adminUser.role as 'admin' | 'super_admin',
  }
}

/**
 * Super-admin only. For surfaces an ordinary admin must not reach at all.
 *
 * Answers 404 rather than 403 to anyone who is merely an admin: the reply
 * should not confirm that the thing they were denied exists. Callers that leak
 * client confidences use this -- hiring-manager briefs carry salary bands,
 * equity, and a candid read on the founders, and the link they hand out needs
 * no login, so the set of people who can mint one stays as small as possible.
 */
export async function requireSuperAdmin(): Promise<AdminCheckResult> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth
  if (auth.role !== 'super_admin') {
    return { ok: false, status: 404, message: 'Not found' }
  }
  return auth
}

/**
 * Guard for the /api/jobs handlers while JOBS_SUPER_ADMIN_ONLY is set.
 *
 * Returns the response to send when the caller may not touch the jobs surface,
 * and null when they may proceed. 404 rather than 403, matching the page: the
 * reply should not confirm the board is there.
 *
 * The pages hide themselves in app/(dashboard)/jobs/layout.tsx. This is the
 * half that actually enforces it - the job routes are all reachable directly.
 */
export async function jobsAccessDenied(): Promise<NextResponse | null> {
  if (!JOBS_SUPER_ADMIN_ONLY) return null
  const auth = await requireSuperAdmin()
  if (auth.ok) return null
  return NextResponse.json({ error: auth.message }, { status: auth.status })
}
