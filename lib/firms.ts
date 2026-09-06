/**
 * Recruiting firms: a company as the partner, rather than one person.
 *
 * The shape, and why:
 *
 *   the firm     is the commercial counterparty and the only party we pay
 *   the signer   accepts for it, and separately warrants their own authority
 *   a member     accepts short personal terms of their own before getting in
 *
 * A firm cannot accept personal obligations for someone it has not hired yet,
 * which is why joining is its own acceptance rather than an inherited one.
 *
 * Everything here is gated on `is_beta` until the data-sharing terms are done.
 * That flag already gates the Searches desk, so firms ride a switch that exists
 * rather than inventing another one.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AGREEMENT_VERSIONS } from '@/lib/agreements'
import type { AppRole, AppUser } from '@/lib/current-user'

/** How long an invitation is good for. */
export const INVITE_DAYS = 7

export type FirmRole = 'admin' | 'recruiter' | 'coordinator'

/**
 * PostgREST types an embedded relation as an array even when the join can only
 * produce one row. Normalising here keeps the casts out of the call sites.
 */
function firstOf<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null
  return v ?? null
}

export interface Firm {
  id: string
  name: string
  legal_name: string
  slug: string
  status: 'awaiting_signature' | 'pending' | 'active' | 'suspended'
  signer_user_id: string | null
  signer_name?: string | null
  signer_email?: string | null
}

/** Days a signing link stays good. Same as a colleague invitation. */
export const SIGNATURE_DAYS = 14

export interface Membership {
  firm: Firm
  role: FirmRole
  /** True once they have accepted the Team access terms. */
  accepted: boolean
}

/**
 * Who may work as a firm. Open to every active partner since 6 Sep 2026.
 *
 * This was beta-only while member removal was still missing, which was
 * counsel's one blocking condition. That shipped, so the flag came off and
 * firms onboard themselves.
 *
 * Note what is *not* open: creating a firm leaves it `pending`, and a pending
 * firm can invite nobody. Every firm still passes a human before it is live,
 * which is where the remaining legal condition is enforced — no EU or UK firm
 * gets activated until the data-sharing terms and candidate privacy notice
 * exist. The sign-up card flags a non-US jurisdiction for exactly that reason.
 *
 * Hiring managers and viewers are not partners and have no book to share.
 */
const PARTNER_ROLES = new Set<AppRole>(['recruiter', 'scout', 'admin', 'super_admin'])

export function firmsEnabled(appUser: Pick<AppUser, 'role' | 'isActive'>): boolean {
  return appUser.isActive && PARTNER_ROLES.has(appUser.role)
}

/**
 * Whether a firm's jurisdiction falls under counsel's one live restriction.
 *
 * Counsel named the EU and the UK, and nothing else. Canada, Latin America and
 * the rest of the world were never restricted, so they are not treated as if
 * they were: inventing a hold counsel did not impose is its own kind of wrong,
 * and it teaches you to click past the warning that does matter.
 *
 * Switzerland and the wider EEA are included because the transfer problem is
 * identical there, which is the thing the restriction is actually about.
 *
 * Matched on the jurisdiction the signer typed, so it is a prompt to look, not
 * a determination. A firm that leaves the field blank gets no warning and is
 * visible in the Entity field as "Not given".
 */
const RESTRICTED_JURISDICTIONS = [
  'eu', 'e\\.u\\.', 'european union', 'eea', 'uk', 'u\\.k\\.', 'united kingdom',
  'england', 'wales', 'scotland', 'northern ireland', 'britain', 'gb',
  'austria', 'belgium', 'bulgaria', 'croatia', 'cyprus', 'czech', 'czechia',
  'denmark', 'estonia', 'finland', 'france', 'germany', 'greece', 'hungary',
  'iceland', 'ireland', 'italy', 'latvia', 'liechtenstein', 'lithuania',
  'luxembourg', 'malta', 'netherlands', 'norway', 'poland', 'portugal',
  'romania', 'slovakia', 'slovenia', 'spain', 'sweden', 'switzerland', 'swiss',
]

const RESTRICTED_RE = new RegExp(`\\b(${RESTRICTED_JURISDICTIONS.join('|')})\\b`, 'i')

export function isRestrictedJurisdiction(jurisdiction?: string | null): boolean {
  // Blank counts. Counsel's point: an unanswered field is not evidence of a
  // safe answer, and treating silence as "not EU" is exactly how the one firm
  // that should have been held gets waved through.
  if (!jurisdiction || !jurisdiction.trim()) return true
  return RESTRICTED_RE.test(jurisdiction)
}

/** URL-safe, collision-resistant enough for a name, and stable to read. */
export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return `${base || 'firm'}-${randomBytes(3).toString('hex')}`
}

/** The token goes in the email once. Only its hash is ever stored. */
export function newInviteToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, hash: hashToken(token) }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Constant-time, so a wrong token cannot be narrowed down by timing. */
export function tokenMatches(token: string, storedHash: string): boolean {
  const a = Buffer.from(hashToken(token))
  const b = Buffer.from(storedHash)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * The firm this user belongs to, if any.
 *
 * Returns null for a solo partner, which is most of them, so every caller has
 * to handle the solo case first and nothing changes for them by accident.
 */
export async function getMembership(
  admin: SupabaseClient,
  userId: string,
): Promise<Membership | null> {
  const { data } = await admin
    .from('partner_org_members')
    .select('org_role, accepted_user_terms_at, org:partner_orgs(id, name, legal_name, slug, status, signer_user_id)')
    .eq('user_id', userId)
    .is('removed_at', null)
    .maybeSingle()

  const firm = firstOf<Firm>(data?.org as unknown as Firm | Firm[] | null)
  if (!data || !firm) return null

  return {
    firm,
    role: data.org_role as FirmRole,
    accepted: Boolean(data.accepted_user_terms_at),
  }
}

/**
 * Whose records this person may see.
 *
 * Themselves, plus their colleagues when all four are true: they are in a firm,
 * the firm is active, they have accepted their own terms, and their role is not
 * coordinator. A coordinator sees only what is assigned to them, which is the
 * whole reason that role exists.
 *
 * Returns a single id for the ~80 solo partners, so nothing changes for them.
 */
export async function scopeUserIds(
  admin: SupabaseClient,
  user: { id: string },
): Promise<string[]> {
  const membership = await getMembership(admin, user.id)
  if (
    !membership ||
    !membership.accepted ||
    membership.firm.status !== 'active' ||
    membership.role === 'coordinator'
  ) {
    return [user.id]
  }
  const ids = await firmMemberIds(admin, membership.firm.id)
  return ids.length ? ids : [user.id]
}

/** Every active member's user id. Used to widen visibility to the firm. */
export async function firmMemberIds(
  admin: SupabaseClient,
  firmId: string,
): Promise<string[]> {
  const { data } = await admin
    .from('partner_org_members')
    .select('user_id')
    .eq('org_id', firmId)
    .is('removed_at', null)
  return (data ?? []).map(m => m.user_id as string)
}

export interface CreateFirmInput {
  name: string
  legalName: string
  jurisdiction?: string | null
  companyNumber?: string | null
  billingEmail?: string | null
  /** Who set the firm up. Becomes the first Firm Admin either way. */
  createdByUserId: string
  signerTitle?: string | null
  ip?: string | null
  userAgent?: string | null
  /**
   * Who binds the company.
   *
   * When `self` is true the creator is also the signer and the firm is created
   * `pending`, ready for approval. Otherwise the named person is emailed a
   * signing link and the firm waits in `awaiting_signature`, because a firm
   * nobody with authority has signed for is not a firm we should be reviewing.
   */
  signer:
    | { self: true; name: string; email: string }
    | { self: false; name: string; email: string }
}

/**
 * Creates the firm and makes the signer its first admin.
 *
 * The firm starts `pending`: nobody gets access until it is approved, the same
 * way a partner sign-up does. The signer is a member from the outset because
 * their acceptance record has to live somewhere an auditor would look for it.
 */
export async function createFirm(
  admin: SupabaseClient,
  input: CreateFirmInput,
): Promise<
  { ok: true; firm: Firm; signatureToken: string | null } | { ok: false; error: string }
> {
  const self = input.signer.self
  const signature = self ? null : newInviteToken()

  const { data: firm, error } = await admin
    .from('partner_orgs')
    .insert({
      name: input.name.trim().slice(0, 200),
      legal_name: input.legalName.trim().slice(0, 200),
      jurisdiction: input.jurisdiction?.trim().slice(0, 120) || null,
      company_number: input.companyNumber?.trim().slice(0, 60) || null,
      billing_email: input.billingEmail?.trim().slice(0, 200) || null,
      slug: slugify(input.name),
      status: self ? 'pending' : 'awaiting_signature',
      created_by_user_id: input.createdByUserId,
      // Only set when the signer holds an account. A nominated signer accepts by
      // name-and-email clickwrap, the way a client signs a services agreement,
      // so there is no account to point at and the columns below are the record.
      signer_user_id: self ? input.createdByUserId : null,
      signer_name: input.signer.name.trim().slice(0, 200),
      signer_email: normalizeSignerEmail(input.signer.email),
      signer_title: input.signerTitle?.trim().slice(0, 120) || null,
      signer_accepted_at: self ? new Date().toISOString() : null,
      signer_accepted_ip: self ? input.ip ?? null : null,
      signer_accepted_user_agent: self ? input.userAgent ?? null : null,
      signature_token_hash: signature?.hash ?? null,
      signature_expires_at: signature
        ? new Date(Date.now() + SIGNATURE_DAYS * 86_400_000).toISOString()
        : null,
      signature_requested_at: signature ? new Date().toISOString() : null,
      partner_terms_version: AGREEMENT_VERSIONS.partner,
      submission_terms_version: AGREEMENT_VERSIONS.partnerSubmission,
      firm_addendum_version: AGREEMENT_VERSIONS.firmAddendum,
    })
    .select('id, name, legal_name, slug, status, signer_user_id, signer_name, signer_email')
    .single()

  if (error || !firm) return { ok: false, error: error?.message ?? 'Could not create the firm' }

  // Whoever set the firm up runs it, signer or not. They have accepted their own
  // Team access terms by the same act either way: those are about their personal
  // use of the workspace, which is a thing they can speak for without authority
  // to bind the company.
  const { error: memberError } = await admin.from('partner_org_members').insert({
    org_id: firm.id,
    user_id: input.createdByUserId,
    org_role: 'admin',
    accepted_user_terms_at: new Date().toISOString(),
    accepted_user_terms_version: AGREEMENT_VERSIONS.firmUser,
    accepted_ip: input.ip ?? null,
    accepted_user_agent: input.userAgent ?? null,
  })

  if (memberError) {
    console.error('[firms] firm created but admin membership failed:', memberError.message)
  }

  return { ok: true, firm: firm as Firm, signatureToken: signature?.token ?? null }
}

function normalizeSignerEmail(email: string): string {
  return email.trim().toLowerCase().slice(0, 200)
}

/**
 * The firm a signing link refers to, or null.
 *
 * Expired, already signed, and never existed all answer the same way, so a
 * token probe learns nothing it did not already know.
 */
export async function findFirmAwaitingSignature(
  admin: SupabaseClient,
  token: string,
): Promise<Firm | null> {
  const { data } = await admin
    .from('partner_orgs')
    .select('id, name, legal_name, slug, status, signer_user_id, signer_name, signer_email, jurisdiction, company_number, signature_token_hash, signature_expires_at')
    .eq('signature_token_hash', hashToken(token))
    .eq('status', 'awaiting_signature')
    .maybeSingle()

  if (!data) return null
  if (!data.signature_expires_at) return null
  if (new Date(data.signature_expires_at as string).getTime() < Date.now()) return null
  if (!tokenMatches(token, data.signature_token_hash as string)) return null

  return data as unknown as Firm
}

/**
 * The nominated signer accepts.
 *
 * Burns the token in the same statement that records the acceptance, and only
 * from `awaiting_signature`, so two clicks on the same link cannot produce two
 * signatures or move an already-approved firm backwards.
 */
export async function signFirmAgreement(
  admin: SupabaseClient,
  opts: { firmId: string; name: string; ip?: string | null; userAgent?: string | null },
): Promise<{ ok: true; firm: Firm } | { ok: false; error: string }> {
  const { data, error } = await admin
    .from('partner_orgs')
    .update({
      status: 'pending',
      signer_name: opts.name.trim().slice(0, 200),
      signer_accepted_at: new Date().toISOString(),
      signer_accepted_ip: opts.ip ?? null,
      signer_accepted_user_agent: opts.userAgent ?? null,
      signature_token_hash: null,
      signature_expires_at: null,
    })
    .eq('id', opts.firmId)
    .eq('status', 'awaiting_signature')
    .select('id, name, legal_name, slug, status, signer_user_id, signer_name, signer_email')
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'That agreement has already been signed.' }
  return { ok: true, firm: data as Firm }
}

export type InviteResult =
  | { ok: true; token: string; inviteId: string }
  | { ok: false; error: string }

/**
 * Invites a colleague. Returns the raw token exactly once, for the email.
 *
 * An open invitation to the same address is replaced rather than duplicated, so
 * re-inviting somebody does not leave two live links to the same seat.
 */
export async function createInvite(
  admin: SupabaseClient,
  opts: { firmId: string; email: string; role: FirmRole; invitedBy: string },
): Promise<InviteResult> {
  const email = opts.email.trim().toLowerCase()
  if (!email.includes('@')) return { ok: false, error: 'That does not look like an email address' }

  await admin
    .from('partner_org_invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('org_id', opts.firmId)
    .eq('email', email)
    .is('accepted_at', null)
    .is('revoked_at', null)

  const { token, hash } = newInviteToken()
  const { data, error } = await admin
    .from('partner_org_invites')
    .insert({
      org_id: opts.firmId,
      email,
      org_role: opts.role,
      token_hash: hash,
      invited_by: opts.invitedBy,
      expires_at: new Date(Date.now() + INVITE_DAYS * 86_400_000).toISOString(),
    })
    .select('id')
    .single()

  if (error || !data) return { ok: false, error: error?.message ?? 'Could not create the invitation' }
  return { ok: true, token, inviteId: data.id }
}

export interface OpenInvite {
  id: string
  org_id: string
  email: string
  org_role: FirmRole
  firm: Firm
}

/**
 * Looks an invitation up by its token.
 *
 * Expired, revoked and already-accepted all fail the same way on purpose: a
 * link that no longer works should not tell a stranger which of those it was.
 */
export async function findOpenInvite(
  admin: SupabaseClient,
  token: string,
): Promise<OpenInvite | null> {
  if (!token) return null
  const { data } = await admin
    .from('partner_org_invites')
    .select('id, org_id, email, org_role, token_hash, expires_at, accepted_at, revoked_at, org:partner_orgs(id, name, legal_name, slug, status, signer_user_id)')
    .eq('token_hash', hashToken(token))
    .maybeSingle()

  if (!data) return null
  if (data.accepted_at || data.revoked_at) return null
  if (new Date(data.expires_at as string).getTime() < Date.now()) return null
  if (!tokenMatches(token, data.token_hash as string)) return null

  const firm = firstOf<Firm>(data.org as unknown as Firm | Firm[] | null)
  if (!firm) return null

  return {
    id: data.id as string,
    org_id: data.org_id as string,
    email: data.email as string,
    org_role: data.org_role as FirmRole,
    firm,
  }
}

/**
 * Accepts an invitation, which is the moment the person becomes bound by the
 * Team access terms. Recorded with version, time, IP and user agent, because
 * one day somebody will ask who agreed to what.
 */
export async function acceptInvite(
  admin: SupabaseClient,
  opts: { invite: OpenInvite; userId: string; ip?: string | null; userAgent?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  const now = new Date().toISOString()

  const { error: memberError } = await admin.from('partner_org_members').upsert(
    {
      org_id: opts.invite.org_id,
      user_id: opts.userId,
      org_role: opts.invite.org_role,
      accepted_user_terms_at: now,
      accepted_user_terms_version: AGREEMENT_VERSIONS.firmUser,
      accepted_ip: opts.ip ?? null,
      accepted_user_agent: opts.userAgent ?? null,
      invited_by: null,
      removed_at: null,
    },
    { onConflict: 'org_id,user_id' },
  )
  if (memberError) return { ok: false, error: memberError.message }

  // Single use. Claiming the invitation only after the membership exists means
  // a failure here leaves a usable link rather than a locked-out person.
  const { error: inviteError } = await admin
    .from('partner_org_invites')
    .update({ accepted_at: now })
    .eq('id', opts.invite.id)
    .is('accepted_at', null)

  if (inviteError) return { ok: false, error: inviteError.message }
  return { ok: true }
}

/**
 * Removing someone from a firm.
 *
 * Counsel made this mandatory before any external firm, and the reason is
 * timing: somebody leaves an agency and their access has to end that day, not
 * whenever we next look at it.
 *
 * Access is resolved from this table on every request, so clearing `removed_at`
 * takes effect on their very next page load. There is no cached membership to
 * invalidate, which is the one good thing about resolving it every time.
 *
 * Their candidates are reassigned to the person doing the removal. Section 8 of
 * the Firm Addendum says the firm keeps its records, and leaving `owner_user_id`
 * pointing at a departed employee would mean the firm could no longer see work
 * it owns. Claims are untouched: they are already held by the firm.
 *
 * The last admin cannot be removed, and nobody can remove themselves. Both are
 * ways a firm locks itself out.
 */
export async function removeMember(
  admin: SupabaseClient,
  opts: { firmId: string; userId: string; actorId: string },
): Promise<{ ok: true; reassigned: number } | { ok: false; error: string }> {
  if (opts.userId === opts.actorId) {
    return { ok: false, error: 'You cannot remove yourself. Ask another admin.' }
  }

  const { data: target } = await admin
    .from('partner_org_members')
    .select('org_role, joined_at')
    .eq('org_id', opts.firmId)
    .eq('user_id', opts.userId)
    .is('removed_at', null)
    .maybeSingle()

  if (!target) return { ok: false, error: 'They are not in this firm' }

  // The window the firm has a claim over. Anything they owned before they
  // walked in is theirs and goes with them.
  const joinedAt = (target.joined_at as string) ?? new Date(0).toISOString()

  if (target.org_role === 'admin') {
    const { count } = await admin
      .from('partner_org_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('org_id', opts.firmId)
      .eq('org_role', 'admin')
      .is('removed_at', null)

    if ((count ?? 0) <= 1) {
      return {
        ok: false,
        error: 'That is the last admin. Make someone else an admin first.',
      }
    }
  }

  const now = new Date().toISOString()

  const { error } = await admin
    .from('partner_org_members')
    .update({ removed_at: now })
    .eq('org_id', opts.firmId)
    .eq('user_id', opts.userId)
    .is('removed_at', null)

  if (error) return { ok: false, error: error.message }

  // The firm keeps what it owns. Without this the records would still be
  // readable only by the person who just left.
  const { data: moved } = await admin
    .from('candidates')
    .update({ owner_user_id: opts.actorId })
    .eq('owner_user_id', opts.userId)
    // Only what they took on while they were here. A partner who joined a firm
    // with their own book keeps it: removal is the firm reclaiming its work,
    // not the firm taking everything the person has ever owned.
    .gte('created_at', joinedAt)
    .select('id')

  // Any open invitation to them is dead too.
  await admin
    .from('partner_org_invites')
    .update({ revoked_at: now })
    .eq('org_id', opts.firmId)
    .is('accepted_at', null)
    .is('revoked_at', null)

  return { ok: true, reassigned: moved?.length ?? 0 }
}
