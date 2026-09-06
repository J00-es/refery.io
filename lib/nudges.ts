/**
 * Lifecycle reminders: the small set of messages sent because nothing happened.
 *
 * Every event notification in the app answers "what just happened". These answer
 * the question events cannot, because silence fires no event: what is sitting
 * still that somebody could unstick.
 *
 * Six rules the whole file obeys, and they are the reason it is one file:
 *
 *   Once, or against a deadline.   Every nudge fires once, or at most three
 *   times ending at a hard expiry, and then stops permanently. Somebody who
 *   ignored two emails has answered. The exception is the review nudge, which
 *   repeats because the person being chased is Lily.
 *
 *   Recorded before it is sent.   The ledger row is written first, so a crash
 *   between send and record cannot produce a second email tomorrow.
 *
 *   Stops on the thing it chases.   Conditions are evaluated at send time from
 *   live rows, never from a queue built earlier, so a signature at 4am cancels
 *   the 9am reminder without anything having to cancel it.
 *
 *   One email per person per 72 hours.   Checked across every kind, so two
 *   unrelated nudges cannot land on the same morning.
 *
 *   Nothing inside 24 hours.   Whatever the schedule says. A person must have
 *   had a chance to act before we point out that they have not.
 *
 *   One switch.   NUDGES_ENABLED=false stops all of it without a deploy per job.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  sendFirmEmptyTeam,
  sendFirmInviteReminder,
  sendFirmInviteStalledToAdmin,
  sendFirmSignatureExpired,
  sendFirmSignatureReminder,
  sendFirmSignatureStalledToChampion,
  announceFirmAwaitingReview,
} from '@/lib/firm-notify'

const DAY_MS = 86_400_000

/** No nudge fires inside this window, whatever its own schedule says. */
const MIN_AGE_MS = 24 * 60 * 60 * 1000

/** One lifecycle email per person in this window, across every kind. */
const PERSON_COOLDOWN_MS = 72 * 60 * 60 * 1000

export function nudgesEnabled(): boolean {
  return process.env.NUDGES_ENABLED !== 'false'
}

export interface NudgeResult {
  kind: string
  sent: number
  skipped: number
  failed: number
}

function daysSince(iso: string | null | undefined): number {
  if (!iso) return 0
  return (Date.now() - new Date(iso).getTime()) / DAY_MS
}

function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'https://refery.xyz'
  )
}

/**
 * Claims the right to send, or refuses.
 *
 * Inserting the ledger row is the claim: the unique index on dedupe_key means
 * two concurrent runs cannot both win, and a crash after this point costs a
 * missed email rather than a duplicate one. That is the right way round.
 */
async function claim(
  admin: SupabaseClient,
  opts: {
    dedupeKey: string
    kind: string
    channel?: 'email' | 'slack'
    recipientEmail?: string | null
    subjectId?: string | null
  },
): Promise<boolean> {
  const channel = opts.channel ?? 'email'

  // The per-person budget. Slack messages are not addressed to a person and do
  // not spend it.
  if (channel === 'email' && opts.recipientEmail) {
    const { data: recent } = await admin
      .from('nudges')
      .select('id')
      .eq('recipient_email', opts.recipientEmail.toLowerCase())
      .gt('sent_at', new Date(Date.now() - PERSON_COOLDOWN_MS).toISOString())
      .limit(1)
    if (recent && recent.length > 0) return false
  }

  const { error } = await admin.from('nudges').insert({
    dedupe_key: opts.dedupeKey,
    kind: opts.kind,
    channel,
    recipient_email: opts.recipientEmail?.toLowerCase() ?? null,
    subject_id: opts.subjectId ?? null,
  })

  // A duplicate key is the normal way this returns false: it means somebody
  // already sent this exact nudge, which is the whole point of the index.
  return !error
}

/** Marks a claimed nudge as having failed, so the ledger does not lie. */
async function markFailed(admin: SupabaseClient, dedupeKey: string, error: string) {
  await admin.from('nudges').update({ ok: false, error: error.slice(0, 500) }).eq('dedupe_key', dedupeKey)
}

// ── N2 · the nominated signer has not signed ────────────────────────────────

/**
 * Day 3 to the signer, day 7 to both, day 13 to both because it expires
 * tomorrow. Then silence: three messages across a fortnight is the most anyone
 * should hear about a document they have decided not to read.
 */
export async function nudgeUnsignedFirms(admin: SupabaseClient): Promise<NudgeResult> {
  const out: NudgeResult = { kind: 'firm_unsigned', sent: 0, skipped: 0, failed: 0 }

  const { data: firms } = await admin
    .from('partner_orgs')
    .select('id, name, legal_name, slug, status, signer_user_id, signer_name, signer_email, signature_requested_at, signature_expires_at, created_by_user_id')
    .eq('status', 'awaiting_signature')

  for (const firm of firms ?? []) {
    const age = daysSince(firm.signature_requested_at as string)
    if (age * DAY_MS < MIN_AGE_MS) continue

    const stage = age >= 13 ? 13 : age >= 7 ? 7 : age >= 3 ? 3 : 0
    if (!stage) {
      out.skipped++
      continue
    }

    const signerEmail = firm.signer_email as string
    const daysLeft = Math.max(
      0,
      Math.ceil((new Date(firm.signature_expires_at as string).getTime() - Date.now()) / DAY_MS),
    )

    // The champion, who is the one actually blocked by this.
    let champion: { email: string; name: string } | null = null
    if (firm.created_by_user_id) {
      const { data: c } = await admin
        .from('users_admin')
        .select('email, full_name')
        .eq('id', firm.created_by_user_id as string)
        .single()
      if (c) champion = { email: c.email as string, name: (c.full_name as string) || (c.email as string) }
    }

    // The signer hears at every stage. There is no fresh link to send: the one
    // they already have is single-use and still live until it expires.
    if (signerEmail) {
      const key = `firm_unsigned_d${stage}:${firm.id}`
      if (await claim(admin, { dedupeKey: key, kind: `firm_unsigned_d${stage}`, recipientEmail: signerEmail, subjectId: firm.id as string })) {
        const res = await sendFirmSignatureReminder(
          signerEmail,
          firm as never,
          champion?.name ?? 'Your colleague',
          daysLeft,
        )
        if (res.sent) out.sent++
        else {
          out.failed++
          await markFailed(admin, key, res.error ?? 'send failed')
        }
      } else out.skipped++
    }

    // The champion is told from day 7, when a word in person beats a third email.
    if (stage >= 7 && champion) {
      const key = `firm_unsigned_champion_d${stage}:${firm.id}`
      if (await claim(admin, { dedupeKey: key, kind: `firm_unsigned_champion_d${stage}`, recipientEmail: champion.email, subjectId: firm.id as string })) {
        const res = await sendFirmSignatureStalledToChampion(
          champion.email,
          firm as never,
          (firm.signer_name as string) || signerEmail,
          daysLeft,
        )
        if (res.sent) out.sent++
        else {
          out.failed++
          await markFailed(admin, key, res.error ?? 'send failed')
        }
      } else out.skipped++
    }
  }

  return out
}

// ── N3 · the signing link expired ───────────────────────────────────────────

/**
 * Deliberately not framed as a failure. A firm that let a link lapse is still a
 * firm that wanted in, and the only thing between them and signing is a working
 * URL.
 */
export async function nudgeExpiredSignatures(admin: SupabaseClient): Promise<NudgeResult> {
  const out: NudgeResult = { kind: 'firm_signature_expired', sent: 0, skipped: 0, failed: 0 }

  const { data: firms } = await admin
    .from('partner_orgs')
    .select('id, name, legal_name, slug, status, signer_user_id, signer_name, signer_email, signature_expires_at, created_by_user_id')
    .eq('status', 'awaiting_signature')
    .lt('signature_expires_at', new Date().toISOString())

  for (const firm of firms ?? []) {
    if (!firm.created_by_user_id) {
      out.skipped++
      continue
    }
    const { data: c } = await admin
      .from('users_admin')
      .select('email, full_name')
      .eq('id', firm.created_by_user_id as string)
      .single()
    if (!c) {
      out.skipped++
      continue
    }

    const key = `firm_signature_expired:${firm.id}`
    if (await claim(admin, { dedupeKey: key, kind: 'firm_signature_expired', recipientEmail: c.email as string, subjectId: firm.id as string })) {
      const res = await sendFirmSignatureExpired(
        c.email as string,
        firm as never,
        (firm.signer_name as string) || (firm.signer_email as string) || 'them',
        `${appUrl()}/firm/members`,
      )
      if (res.sent) out.sent++
      else {
        out.failed++
        await markFailed(admin, key, res.error ?? 'send failed')
      }
    } else out.skipped++
  }

  return out
}

// ── N4 · signed, and sitting in Lily's queue ────────────────────────────────

/**
 * The only nudge pointed at Refery, and the only one that repeats, because the
 * person being chased is the one who can act. Slack rather than email: Lily
 * already works the day from that channel, and a fifth email to yourself is not
 * a system.
 */
export async function nudgeFirmsAwaitingReview(admin: SupabaseClient): Promise<NudgeResult> {
  const out: NudgeResult = { kind: 'firm_awaiting_review', sent: 0, skipped: 0, failed: 0 }

  const { data: firms } = await admin
    .from('partner_orgs')
    .select('id, name, legal_name, slug, status, signer_user_id, signer_name, signer_email, signer_accepted_at, jurisdiction')
    .eq('status', 'pending')

  const today = new Date().toISOString().slice(0, 10)

  for (const firm of firms ?? []) {
    const waited = daysSince(firm.signer_accepted_at as string)
    if (waited * DAY_MS < MIN_AGE_MS) {
      out.skipped++
      continue
    }

    // Keyed on the day, so it repeats daily rather than once ever.
    const key = `firm_awaiting_review:${firm.id}:${today}`
    if (await claim(admin, { dedupeKey: key, kind: 'firm_awaiting_review', channel: 'slack', subjectId: firm.id as string })) {
      const res = await announceFirmAwaitingReview({
        firm: firm as never,
        signerName: (firm.signer_name as string) || '',
        signedAt: firm.signer_accepted_at as string,
        daysWaiting: Math.floor(waited),
        jurisdiction: (firm.jurisdiction as string) ?? null,
      })
      if (res.sent) out.sent++
      else {
        out.failed++
        await markFailed(admin, key, res.error ?? 'post failed')
      }
    } else out.skipped++
  }

  return out
}

// ── N5 · an invitation nobody accepted ──────────────────────────────────────

/** Day 3 to the colleague, day 6 to the admin. Never chases a person twice. */
export async function nudgeOpenInvites(admin: SupabaseClient): Promise<NudgeResult> {
  const out: NudgeResult = { kind: 'firm_invite', sent: 0, skipped: 0, failed: 0 }

  const { data: invites } = await admin
    .from('partner_org_invites')
    .select('id, org_id, email, created_at, expires_at, org:partner_orgs(id, name, legal_name, slug, status, signer_user_id)')
    .is('accepted_at', null)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())

  for (const inv of invites ?? []) {
    const age = daysSince(inv.created_at as string)
    if (age * DAY_MS < MIN_AGE_MS) continue

    const rawOrg = inv.org as unknown
    const firm = (Array.isArray(rawOrg) ? rawOrg[0] : rawOrg) as
      | { id: string; name: string; legal_name: string }
      | null
    if (!firm) {
      out.skipped++
      continue
    }

    const daysLeft = Math.max(
      0,
      Math.ceil((new Date(inv.expires_at as string).getTime() - Date.now()) / DAY_MS),
    )

    // Day 3: the person who was invited.
    if (age >= 3) {
      const key = `firm_invite_d3:${inv.id}`
      if (await claim(admin, { dedupeKey: key, kind: 'firm_invite_d3', recipientEmail: inv.email as string, subjectId: firm.id })) {
        const res = await sendFirmInviteReminder(
          inv.email as string,
          firm as never,
          daysLeft,
          `${appUrl()}/firm/members`,
        )
        if (res.sent) out.sent++
        else {
          out.failed++
          await markFailed(admin, key, res.error ?? 'send failed')
        }
      } else out.skipped++
    }

    // Day 6: the admin, who can resend it or try a different address.
    if (age >= 6) {
      const { data: admins } = await admin
        .from('partner_org_members')
        .select('user_id')
        .eq('org_id', firm.id)
        .eq('org_role', 'admin')
        .is('removed_at', null)
        .limit(1)
      const adminId = admins?.[0]?.user_id as string | undefined
      if (!adminId) {
        out.skipped++
        continue
      }
      const { data: person } = await admin
        .from('users_admin')
        .select('email')
        .eq('id', adminId)
        .single()
      if (!person) {
        out.skipped++
        continue
      }

      const key = `firm_invite_admin_d6:${inv.id}`
      if (await claim(admin, { dedupeKey: key, kind: 'firm_invite_admin_d6', recipientEmail: person.email as string, subjectId: firm.id })) {
        const res = await sendFirmInviteStalledToAdmin(
          person.email as string,
          firm as never,
          inv.email as string,
          `${appUrl()}/firm/members`,
        )
        if (res.sent) out.sent++
        else {
          out.failed++
          await markFailed(admin, key, res.error ?? 'send failed')
        }
      } else out.skipped++
    }
  }

  return out
}

// ── N6 · live for days, still a team of one ─────────────────────────────────

/**
 * Once only. A one-person firm is a legitimate choice, and the second email
 * would be us arguing with it.
 */
export async function nudgeEmptyFirms(admin: SupabaseClient): Promise<NudgeResult> {
  const out: NudgeResult = { kind: 'firm_empty_team', sent: 0, skipped: 0, failed: 0 }

  const { data: firms } = await admin
    .from('partner_orgs')
    .select('id, name, legal_name, slug, status, signer_user_id, activated_at, created_by_user_id')
    .eq('status', 'active')

  for (const firm of firms ?? []) {
    const age = daysSince((firm.activated_at as string) ?? null)
    if (age < 4) {
      out.skipped++
      continue
    }

    const { count } = await admin
      .from('partner_org_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('org_id', firm.id)
      .is('removed_at', null)
    if ((count ?? 0) > 1) {
      out.skipped++
      continue
    }

    // An invitation already sent means they have started; nothing to prompt.
    const { count: invited } = await admin
      .from('partner_org_invites')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', firm.id)
      .is('revoked_at', null)
    if ((invited ?? 0) > 0) {
      out.skipped++
      continue
    }

    if (!firm.created_by_user_id) {
      out.skipped++
      continue
    }
    const { data: c } = await admin
      .from('users_admin')
      .select('email')
      .eq('id', firm.created_by_user_id as string)
      .single()
    if (!c) {
      out.skipped++
      continue
    }

    const key = `firm_empty_team:${firm.id}`
    if (await claim(admin, { dedupeKey: key, kind: 'firm_empty_team', recipientEmail: c.email as string, subjectId: firm.id as string })) {
      const res = await sendFirmEmptyTeam(c.email as string, firm as never, `${appUrl()}/firm/members`)
      if (res.sent) out.sent++
      else {
        out.failed++
        await markFailed(admin, key, res.error ?? 'send failed')
      }
    } else out.skipped++
  }

  return out
}

/** Everything, in the order a firm meets it. */
export async function runAllNudges(admin: SupabaseClient): Promise<NudgeResult[]> {
  return [
    await nudgeUnsignedFirms(admin),
    await nudgeExpiredSignatures(admin),
    await nudgeFirmsAwaitingReview(admin),
    await nudgeOpenInvites(admin),
    await nudgeEmptyFirms(admin),
  ]
}
