import { createClient, createAdminClient } from '@/lib/supabase/server'

export const SUPER_ADMIN_EMAILS = ['lily@10kventures.co']

/**
 * The Jobs board is super-admin-only for now.
 *
 * /jobs is the sourced watchlist: tens of thousands of roles at companies we
 * were never retained by, carrying salary bands, internal notes and owner
 * assignments. Until there is a partner-facing answer for which of those a
 * scout or recruiter should see, the whole surface stays with the super admin.
 *
 * One flag, honoured by the route layout, the nav link and every /api/jobs
 * handler - flip it to `false` to open it back up. Compare DESK_BETA_ONLY in
 * lib/partners.ts, which opens the desk to beta users instead.
 */
export const JOBS_SUPER_ADMIN_ONLY = true

/**
 * The Companies directory is super-admin-only for now.
 *
 * /companies is the other half of the sourced watchlist that /jobs sits on:
 * every company we have ever ingested, with contacts, internal notes, hiring
 * insights and signed agreements hanging off each one. A partner has no reason
 * to browse it, and several of those cards are client confidences.
 *
 * One flag, honoured by the route layout, the nav link and every /api/companies
 * handler - flip it to `false` to open it back up. Mirrors
 * JOBS_SUPER_ADMIN_ONLY above.
 */
export const COMPANIES_SUPER_ADMIN_ONLY = true

/**
 * Canonical form of an email for identity lookups.
 *
 * Supabase Auth stores `auth.users.email` lower-cased, but `users_admin.email`
 * is written from whatever the user typed into the sign-up form. A partner who
 * signed up as "Dino@gmail.com" got an auth row for "dino@gmail.com" and a
 * users_admin row for "Dino@gmail.com" — every `.eq('email', user.email)`
 * lookup then missed, the row read as `status: pending`, and an approved,
 * active partner was bounced to /auth/pending-approval forever.
 *
 * Stored emails are normalized by a DB trigger; normalize on the read side too
 * so a stray row can never re-open that hole.
 */
export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase()
}

export type AppRole = 'super_admin' | 'admin' | 'recruiter' | 'scout' | 'viewer'

export interface AppUser {
  /** auth.users.id — the id every ownership column points at. */
  id: string
  email: string
  role: AppRole
  status: string
  fullName: string | null
  isSuperAdmin: boolean
  /** Admin-console capability: managing users, agreements, settings. */
  isAdmin: boolean
  /**
   * Whether this user may see candidates that are not their own.
   *
   * Deliberately narrower than `isAdmin`: candidate records are the partners'
   * own book of business, so only the super admin gets a cross-partner view.
   * Every other role — including `admin` — sees only what is assigned to them.
   * Mirrored in the database by `public.can_view_all_candidates()`; keep the
   * two definitions in step.
   */
  canViewAllCandidates: boolean
  /**
   * Sees surfaces still in beta (the Searches desk, Pipeline) before they open
   * to everyone. Toggled per user from /admin/users; super admins always are.
   * Orthogonal to role and status, so a scout stays a scout and an active
   * account stays active. Gates are `DESK_BETA_ONLY` in lib/partners.ts.
   */
  isBeta: boolean
  isActive: boolean
}

/**
 * Resolves the signed-in user to their application record.
 *
 * Always reads `users_admin` through the service-role client: the table's own
 * RLS policies are keyed on `users_admin.id` (the table PK) rather than
 * `users_admin.user_id` (the auth id), so a user-bound client reads back
 * nothing and every role check would silently fall through to 'viewer'.
 *
 * Returns null when there is no session.
 */
export async function getAppUser(): Promise<AppUser | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const email = normalizeEmail(user.email)
  const adminClient = createAdminClient()
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(email)

  let { data: row } = await adminClient
    .from('users_admin')
    .select('id, role, status, full_name, user_id, is_beta')
    .eq('email', email)
    .maybeSingle()

  // Self-heal: a confirmed auth user with no users_admin row can never be
  // approved, because the admin console lists users_admin. Password sign-in
  // does not pass through /auth/callback, so this is the only place that
  // catches it. Created pending — an admin still has to approve them.
  if (!row && email) {
    const { data: created } = await adminClient
      .from('users_admin')
      .insert({
        user_id: user.id,
        email,
        full_name: user.user_metadata?.full_name || email.split('@')[0],
        linkedin_url: user.user_metadata?.linkedin_url || null,
        role: 'viewer',
        status: 'pending',
      })
      .select('id, role, status, full_name, user_id, is_beta')
      .maybeSingle()
    row = created ?? null
  }

  // Link the row to the auth id when an admin created it by hand.
  if (row && !row.user_id) {
    await adminClient.from('users_admin').update({ user_id: user.id }).eq('id', row.id)
  }

  const role = (isSuperAdmin ? 'super_admin' : row?.role || 'viewer') as AppRole
  const status = isSuperAdmin ? 'active' : row?.status || 'pending'

  return {
    id: user.id,
    email,
    role,
    status,
    fullName: row?.full_name ?? null,
    isSuperAdmin,
    isAdmin: role === 'super_admin' || role === 'admin',
    canViewAllCandidates: role === 'super_admin',
    isBeta: isSuperAdmin || Boolean(row?.is_beta),
    isActive: status === 'active',
  }
}

/**
 * A candidate belongs to you if you own it, uploaded it, or created it. Passed
 * to PostgREST `.or()` so the filter runs in the database rather than being
 * applied to an already-truncated page of rows.
 */
export function candidateOwnershipFilter(userId: string): string {
  return `owner_user_id.eq.${userId},uploaded_by_user_id.eq.${userId},user_id.eq.${userId}`
}

/** True when `appUser` may read/modify this specific candidate row. */
export function ownsCandidate(
  appUser: AppUser,
  candidate: {
    owner_user_id?: string | null
    uploaded_by_user_id?: string | null
    user_id?: string | null
  } | null,
): boolean {
  if (!candidate) return false
  if (appUser.canViewAllCandidates) return true
  return (
    candidate.owner_user_id === appUser.id ||
    candidate.uploaded_by_user_id === appUser.id ||
    candidate.user_id === appUser.id
  )
}

export type CandidateAccess =
  | { ok: true; appUser: AppUser }
  | { ok: false; status: 401 | 403 | 404; message: string }

/**
 * Gate for any handler that touches one candidate through the service-role
 * client. Service-role bypasses RLS, so the database cannot stop a partner
 * from passing someone else's candidate id — the check has to happen here.
 *
 * Returns 404 rather than 403 for a candidate the caller cannot see, so the
 * endpoint does not confirm that the id exists.
 */
export async function requireCandidateAccess(candidateId: string): Promise<CandidateAccess> {
  const appUser = await getAppUser()

  if (!appUser) return { ok: false, status: 401, message: 'Unauthorized' }
  if (!appUser.isActive) return { ok: false, status: 403, message: 'Account is not active' }

  const adminClient = createAdminClient()
  const { data: candidate } = await adminClient
    .from('candidates')
    .select('owner_user_id, uploaded_by_user_id, user_id')
    .eq('id', candidateId)
    .maybeSingle()

  if (!candidate || !ownsCandidate(appUser, candidate)) {
    return { ok: false, status: 404, message: 'Not found' }
  }

  return { ok: true, appUser }
}
