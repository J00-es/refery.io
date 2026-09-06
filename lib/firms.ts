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
import type { AppUser } from '@/lib/current-user'

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
  status: 'pending' | 'active' | 'suspended'
  signer_user_id: string | null
}

export interface Membership {
  firm: Firm
  role: FirmRole
  /** True once they have accepted the Team access terms. */
  accepted: boolean
}

/**
 * Firms are beta-only. Not a soft preference: a real firm must not reach this
 * until the recruiter data-sharing terms and candidate privacy notice are in
 * place, which is counsel's one remaining launch condition.
 */
export function firmsEnabled(appUser: Pick<AppUser, 'isBeta'>): boolean {
  return appUser.isBeta
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
  signerUserId: string
  signerTitle?: string | null
  ip?: string | null
  userAgent?: string | null
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
): Promise<{ ok: true; firm: Firm } | { ok: false; error: string }> {
  const { data: firm, error } = await admin
    .from('partner_orgs')
    .insert({
      name: input.name.trim().slice(0, 200),
      legal_name: input.legalName.trim().slice(0, 200),
      jurisdiction: input.jurisdiction?.trim().slice(0, 120) || null,
      company_number: input.companyNumber?.trim().slice(0, 60) || null,
      billing_email: input.billingEmail?.trim().slice(0, 200) || null,
      slug: slugify(input.name),
      status: 'pending',
      signer_user_id: input.signerUserId,
      signer_accepted_at: new Date().toISOString(),
      partner_terms_version: AGREEMENT_VERSIONS.partner,
      submission_terms_version: AGREEMENT_VERSIONS.partnerSubmission,
      firm_addendum_version: AGREEMENT_VERSIONS.firmAddendum,
    })
    .select('id, name, legal_name, slug, status, signer_user_id')
    .single()

  if (error || !firm) return { ok: false, error: error?.message ?? 'Could not create the firm' }

  // The signer is an admin, and has accepted their own access terms by the same
  // act: the acceptance screen names both capacities.
  const { error: memberError } = await admin.from('partner_org_members').insert({
    org_id: firm.id,
    user_id: input.signerUserId,
    org_role: 'admin',
    accepted_user_terms_at: new Date().toISOString(),
    accepted_user_terms_version: AGREEMENT_VERSIONS.firmUser,
    accepted_ip: input.ip ?? null,
    accepted_user_agent: input.userAgent ?? null,
  })

  if (memberError) {
    console.error('[firms] firm created but signer membership failed:', memberError.message)
  }

  return { ok: true, firm: firm as Firm }
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
