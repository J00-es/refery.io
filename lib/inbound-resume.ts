import { put } from '@vercel/blob'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/server'
import { analyzeResumeFromBlob } from '@/lib/resume-parser'
import { candidateRowFromParsed, toText } from '@/lib/resume'
import { embedCandidate } from '@/lib/embeddings'
import { normalizeEmail, SUPER_ADMIN_EMAILS } from '@/lib/current-user'
import { getSubmissionTermsStatus } from '@/lib/submission-terms'
import { candidateHighlights } from '@/lib/candidate-highlights'
import { notifySlack } from '@/lib/slack'
import type { ParsedResumeData } from '@/lib/types'

/**
 * Candidates that arrive as a PDF attached to an email.
 *
 * Partners and candidates both do this constantly — a recruiter forwards a CV
 * with "she might fit your needs", a candidate replies to an intro thread with
 * "resume attached" — and until now every one of those was retyped into the
 * upload form by hand, or quietly lost.
 *
 * The deliberate design constraint is that this path must produce a candidate
 * that is *indistinguishable* from one uploaded through the form. Same blob
 * bucket, same pathname shape, same extractor, same coercion helpers, same
 * embedding. The only things unique to this file are deciding whether a PDF is
 * a résumé at all, and working out who should own the result.
 */

/** Same ceiling the upload form enforces. */
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

/**
 * Senders whose PDFs are never résumés.
 *
 * This matters more than it looks: `has:attachment filename:pdf` over Lily's
 * inbox is dominated by countersigned agreements from our own agreements@
 * mailbox, Google Workspace invoices and Stripe receipts. Without this list we
 * would pay for a full extraction on each one before discovering it was a bill.
 */
const SENDER_DENY_EXACT = new Set(['agreements@refery.io'])

const SENDER_DENY_DOMAINS = [
  'stripe.com',
  'google.com',
  'slack.com',
  'docuseal.com',
  'docuseal.co',
  'vercel.com',
  'resend.com',
  'granola.ai',
  'boardy.ai',
  'notion.so',
  'intercom.io',
  'atlassian.com',
  'quickbooks.com',
  'xero.com',
]

/** Automated mailboxes: no human attached a CV to one of these. */
const SENDER_DENY_LOCALPART =
  /^(no-?reply|do-?not-?reply|notifications?|notify|billing|invoices?|receipts?|statements?|support|postmaster|mailer-daemon|bounce|alerts?)\b/i

/** Filenames that announce themselves as something other than a CV. */
const FILENAME_DENY =
  /(invoice|receipt|statement|agreement|contract|\bnda\b|signed|countersigned|w-?9\b|1099|purchase[-_ ]?order|payslip|terms)/i

export type InboundOutcome =
  | 'created'
  | 'duplicate'
  | 'possible_duplicate'
  | 'skipped'
  | 'error'

export interface InboundAttachment {
  id: string
  filename: string
  contentType: string | null
  downloadUrl: string
  size?: number | null
}

export interface InboundEmail {
  /** The provider's id for the received email — half of the idempotency key. */
  providerEmailId: string
  messageId: string | null
  fromEmail: string
  fromName: string | null
  subject: string | null
  receivedAt: string | null
  /** Origin used to build the "Open profile" link in Slack. */
  origin: string
}

export interface IngestResult {
  outcome: InboundOutcome
  candidateId?: string
  duplicateOf?: string
  detail?: string
}

/** "Febin Francis <febin@404hires.com>" → both halves, either possibly absent. */
export function parseFromHeader(value: string | null | undefined): {
  email: string
  name: string | null
} {
  const raw = (value ?? '').trim()
  const angled = raw.match(/^(.*)<([^>]+)>\s*$/)
  if (angled) {
    const name = angled[1].trim().replace(/^["']|["']$/g, '')
    return { email: normalizeEmail(angled[2]), name: name || null }
  }
  return { email: normalizeEmail(raw), name: null }
}

function emailDomain(email: string): string {
  return email.split('@')[1] ?? ''
}

/**
 * A cheap pre-filter, run before anything is downloaded or parsed.
 *
 * Returns a reason string when the attachment should be ignored, or null to
 * carry on. Deliberately conservative: a false "skip" loses a candidate, while
 * a false "keep" only costs one extraction that the post-parse check below will
 * throw away anyway.
 */
export function skipReason(email: InboundEmail, attachment: InboundAttachment): string | null {
  const from = normalizeEmail(email.fromEmail)

  if (!from) return 'no sender address'
  if (SENDER_DENY_EXACT.has(from)) return `sender ${from} is an automated mailbox`

  const domain = emailDomain(from)
  if (SENDER_DENY_DOMAINS.some(d => domain === d || domain.endsWith(`.${d}`))) {
    return `sender domain ${domain} never sends résumés`
  }

  const localpart = from.split('@')[0] ?? ''
  if (SENDER_DENY_LOCALPART.test(localpart)) {
    return `sender ${from} is an automated mailbox`
  }

  const filename = attachment.filename || ''
  if (!/\.pdf$/i.test(filename) && attachment.contentType !== 'application/pdf') {
    return `${filename || 'attachment'} is not a PDF`
  }
  if (FILENAME_DENY.test(filename)) {
    return `${filename} looks like a document, not a résumé`
  }
  if (attachment.size != null && attachment.size > MAX_ATTACHMENT_BYTES) {
    return `${filename} is larger than 10MB`
  }

  return null
}

/**
 * Does this extraction actually describe a person's career?
 *
 * The real backstop for classification. An invoice fed to the parser comes back
 * with a company name in `name` and nothing in `work_history` or `education` —
 * so requiring career substance rejects it without ever needing a rule about
 * what an invoice looks like.
 */
export function looksLikeResume(parsed: Partial<ParsedResumeData>): boolean {
  const name = toText(parsed.name)
  if (!name || name.toLowerCase() === 'unknown') return false

  const roles = parsed.work_history?.length ?? 0
  const schools = parsed.education?.length ?? 0
  if (roles === 0 && schools === 0) return false

  // A one-line "education only" parse with no skills is more often a
  // certificate or a transcript than a CV.
  const skills = parsed.skills?.length ?? 0
  return roles > 0 || skills >= 3
}

interface PartnerRow {
  id: string
  user_id: string | null
  email: string
  full_name: string | null
  role: string
  status: string
}

export interface OwnerResolution {
  ownerUserId: string
  ownerLabel: string
  /** Which rule fired — surfaced in Slack and stored on the event row. */
  reason: 'partner' | 'self' | 'internal' | 'unknown'
  intakeSource: 'referred' | 'inbound'
  partner: PartnerRow | null
}

/**
 * Addresses that mean "this is Lily", and therefore "owner is Lily".
 *
 * She has two rows in `users_admin` — the super-admin one she signs in with,
 * and a `recruiter` row for lily@refery.io, which is the address the outside
 * world writes to. Left to the generic partner lookup, a CV she forwarded
 * herself would be attributed to that second, near-dormant identity. Both
 * addresses resolve to the super-admin account instead.
 */
function internalAddresses(): string[] {
  const extra = (process.env.REFERY_OWNER_ALIASES || 'lily@refery.io')
    .split(',')
    .map(normalizeEmail)
    .filter(Boolean)
  return [...SUPER_ADMIN_EMAILS.map(normalizeEmail), ...extra]
}

/** auth.users.id for the account that owns anything with no better owner. */
async function defaultOwnerUserId(admin: SupabaseClient): Promise<string | null> {
  if (process.env.REFERY_DEFAULT_OWNER_USER_ID) {
    return process.env.REFERY_DEFAULT_OWNER_USER_ID
  }

  const { data } = await admin
    .from('users_admin')
    .select('user_id')
    .eq('email', normalizeEmail(SUPER_ADMIN_EMAILS[0]))
    .maybeSingle()

  return data?.user_id ?? null
}

/**
 * Who owns the candidate this email produced.
 *
 * Three rules, in this order:
 *
 *  1. An active partner sent it → they own it, and it counts as `referred`.
 *     This is the attribution that decides who gets paid, so it wins over
 *     everything else.
 *  2. The sender's address is one of ours → Lily owns it.
 *  3. Anyone else — including the candidate mailing their own CV, which is the
 *     common case for people who met Lily directly → Lily owns it, `inbound`.
 *
 * Rule 3 is why an unknown sender is not an error: someone who was introduced
 * over email and replied with a CV is exactly the candidate we most want, and
 * they will never match a `users_admin` row.
 */
export async function resolveOwner(
  admin: SupabaseClient,
  fromEmail: string,
  parsedEmail: string | null,
): Promise<OwnerResolution> {
  const from = normalizeEmail(fromEmail)
  const fallbackOwner = await defaultOwnerUserId(admin)

  const internal = internalAddresses().includes(from)

  if (!internal) {
    const { data: partner } = await admin
      .from('users_admin')
      .select('id, user_id, email, full_name, role, status')
      .eq('email', from)
      .eq('status', 'active')
      .maybeSingle()

    if (partner?.user_id && ['scout', 'recruiter', 'admin'].includes(partner.role)) {
      return {
        ownerUserId: partner.user_id,
        ownerLabel: `${partner.full_name || partner.email} (${partner.role})`,
        reason: 'partner',
        intakeSource: 'referred',
        partner: partner as PartnerRow,
      }
    }
  }

  if (!fallbackOwner) {
    throw new Error(
      'No default owner: set REFERY_DEFAULT_OWNER_USER_ID, or make sure the super admin has a users_admin row with user_id set',
    )
  }

  // Self-submission is worth naming separately even though it lands on the same
  // owner — it is the difference between "a partner owes us attribution" and
  // "this person came to us directly", which is what intake_source records.
  const self = !!parsedEmail && normalizeEmail(parsedEmail) === from

  return {
    ownerUserId: fallbackOwner,
    ownerLabel: 'Lily',
    reason: internal ? 'internal' : self ? 'self' : 'unknown',
    intakeSource: 'inbound',
    partner: null,
  }
}

interface DuplicateMatch {
  id: string
  name: string
  email: string | null
  owner_user_id: string | null
}

/**
 * Do we already have this person?
 *
 * Runs unscoped through the service-role client on purpose. The equivalent
 * check in `POST /api/candidates` filters by ownership, which is right for a
 * partner using the form — they should not learn who else is in the book — but
 * wrong here: a candidate already owned by another partner is still a duplicate,
 * and creating a second row for them is the exact mess this is meant to prevent.
 *
 * Email and LinkedIn are treated as identity. A name match alone is not: two
 * different people genuinely share a name, so that returns `soft` and the
 * profile is still created, flagged.
 */
export async function findDuplicate(
  admin: SupabaseClient,
  row: { email?: unknown; linkedin_url?: unknown; name?: unknown },
): Promise<{ kind: 'hard' | 'soft'; match: DuplicateMatch } | null> {
  const select = 'id, name, email, owner_user_id'

  const email = toText(row.email)
  if (email) {
    const { data } = await admin.from('candidates').select(select).ilike('email', email).limit(1).maybeSingle()
    if (data) return { kind: 'hard', match: data as DuplicateMatch }
  }

  const linkedin = toText(row.linkedin_url)
  if (linkedin) {
    // Trailing slashes and query strings differ between a résumé's copy of a
    // profile URL and the one typed into the form, so match on the handle.
    const handle = linkedin.replace(/\/+$/, '').split('/').pop()
    if (handle && handle.length > 2) {
      const { data } = await admin
        .from('candidates')
        .select(select)
        .ilike('linkedin_url', `%/${handle}%`)
        .limit(1)
        .maybeSingle()
      if (data) return { kind: 'hard', match: data as DuplicateMatch }
    }
  }

  const name = toText(row.name)
  if (name) {
    const { data } = await admin.from('candidates').select(select).ilike('name', name).limit(1).maybeSingle()
    if (data) return { kind: 'soft', match: data as DuplicateMatch }
  }

  return null
}

/** Has this exact attachment already been handled? Makes webhook retries safe. */
export async function alreadyProcessed(
  admin: SupabaseClient,
  providerEmailId: string,
  attachmentId: string,
): Promise<boolean> {
  const { data } = await admin
    .from('inbound_resume_events')
    .select('id')
    .eq('provider_email_id', providerEmailId)
    .eq('attachment_id', attachmentId)
    .maybeSingle()

  return !!data
}

async function recordEvent(
  admin: SupabaseClient,
  email: InboundEmail,
  attachment: InboundAttachment,
  fields: {
    outcome: InboundOutcome
    candidateId?: string | null
    duplicateOf?: string | null
    ownerUserId?: string | null
    ownerReason?: string | null
    intakeSource?: string | null
    detail?: string | null
  },
): Promise<void> {
  const { error } = await admin.from('inbound_resume_events').insert({
    provider_email_id: email.providerEmailId,
    attachment_id: attachment.id,
    message_id: email.messageId,
    from_email: normalizeEmail(email.fromEmail),
    from_name: email.fromName,
    subject: email.subject,
    filename: attachment.filename,
    outcome: fields.outcome,
    candidate_id: fields.candidateId ?? null,
    duplicate_of: fields.duplicateOf ?? null,
    owner_user_id: fields.ownerUserId ?? null,
    owner_reason: fields.ownerReason ?? null,
    intake_source: fields.intakeSource ?? null,
    detail: fields.detail ?? null,
    received_at: email.receivedAt,
  })

  // A duplicate key here means a concurrent delivery of the same webhook got
  // there first. That is the index doing its job, not a failure.
  if (error && error.code !== '23505') {
    console.error('[inbound-resume] could not record event:', error)
  }
}

function senderLabel(email: InboundEmail): string {
  return email.fromName ? `${email.fromName} (${email.fromEmail})` : email.fromEmail
}

/**
 * Process one PDF attachment from one inbound email.
 *
 * Never throws: every failure mode is recorded as an `error` event and reported
 * to Slack, because the alternative is a résumé that vanished with nothing to
 * show that it ever arrived.
 */
export async function ingestInboundResume(
  email: InboundEmail,
  attachment: InboundAttachment,
): Promise<IngestResult> {
  const admin = createAdminClient()

  if (await alreadyProcessed(admin, email.providerEmailId, attachment.id)) {
    return { outcome: 'skipped', detail: 'already processed' }
  }

  const preSkip = skipReason(email, attachment)
  if (preSkip) {
    await recordEvent(admin, email, attachment, { outcome: 'skipped', detail: preSkip })
    return { outcome: 'skipped', detail: preSkip }
  }

  try {
    // 1. Fetch the bytes. Resend's download_url is signed and short-lived, so
    //    this has to happen while handling the delivery rather than later.
    const response = await fetch(attachment.downloadUrl)
    if (!response.ok) {
      throw new Error(`attachment download failed: ${response.status}`)
    }

    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
      const detail = `${attachment.filename} is larger than 10MB`
      await recordEvent(admin, email, attachment, { outcome: 'skipped', detail })
      return { outcome: 'skipped', detail }
    }

    // 2. Store it under the same `resumes/` prefix the upload form uses, so
    //    /api/file, re-analysis and every existing reader work unchanged —
    //    that route authorises by candidate row, not by blob path, so the
    //    folder does not need to name anyone. The attachment id keys it
    //    because the owner is not known until after the parse.
    const safeName = attachment.filename.replace(/[^\w.() -]/g, '_')
    const blob = await put(`resumes/inbound/${attachment.id}-${safeName}`, bytes, {
      access: 'private',
      contentType: 'application/pdf',
    })

    // 3. Same extractor as every other résumé in the system.
    const parsed = await analyzeResumeFromBlob(blob.pathname)

    if (!looksLikeResume(parsed)) {
      const detail = `${attachment.filename} parsed, but does not read as a résumé`
      await recordEvent(admin, email, attachment, { outcome: 'skipped', detail })
      return { outcome: 'skipped', detail }
    }

    const derived = candidateRowFromParsed({
      parsed,
      resume_blob_pathname: blob.pathname,
      resume_filename: attachment.filename,
    })

    const name = toText(derived.name) ?? 'Unknown'
    const owner = await resolveOwner(admin, email.fromEmail, toText(derived.email))

    // 4. Duplicate check before writing anything.
    const duplicate = await findDuplicate(admin, derived)

    if (duplicate?.kind === 'hard') {
      await recordEvent(admin, email, attachment, {
        outcome: 'duplicate',
        duplicateOf: duplicate.match.id,
        ownerUserId: owner.ownerUserId,
        ownerReason: owner.reason,
        detail: `already in the database as ${duplicate.match.name}`,
      })

      await notifySlack({
        stream: 'candidates',
        emoji: ':twisted_rightwards_arrows:',
        title: `${name} was emailed in again — already in the database`,
        context: 'Nothing was created. Open the existing profile to add the new résumé if it is more recent.',
        fields: [
          { label: 'Sent by', value: senderLabel(email) },
          { label: 'Existing profile', value: duplicate.match.name },
          { label: 'Matched on', value: duplicate.match.email ? 'Email address' : 'LinkedIn' },
          { label: 'Attachment', value: attachment.filename },
        ],
        links: [{ label: 'Open existing profile', url: `${email.origin}/candidates/${duplicate.match.id}` }],
      })

      return { outcome: 'duplicate', duplicateOf: duplicate.match.id }
    }

    // 5. Create. All three ownership columns point at the same user so the
    //    candidate shows up under `candidateOwnershipFilter` however it is read.
    const { data: candidate, error } = await admin
      .from('candidates')
      .insert({
        ...derived,
        parsed_data: parsed,
        user_id: owner.ownerUserId,
        owner_user_id: owner.ownerUserId,
        uploaded_by_user_id: owner.ownerUserId,
        created_by_user_id: owner.ownerUserId,
        intake_source: owner.intakeSource,
      })
      .select()
      .single()

    if (error) throw new Error(`insert failed: ${error.message}`)

    // Non-fatal by design — see embedCandidate.
    await embedCandidate(candidate.id, parsed, name)

    const outcome: InboundOutcome = duplicate?.kind === 'soft' ? 'possible_duplicate' : 'created'

    await recordEvent(admin, email, attachment, {
      outcome,
      candidateId: candidate.id,
      duplicateOf: duplicate?.match.id ?? null,
      ownerUserId: owner.ownerUserId,
      ownerReason: owner.reason,
      intakeSource: owner.intakeSource,
      detail: duplicate ? `same name as existing profile ${duplicate.match.name}` : null,
    })

    // Submission Terms are what bind a partner to attribution and candidate
    // consent. Emailing a CV bypasses that gate entirely, so where a partner
    // owes them and has not accepted, say so rather than let it pass silently.
    let termsWarning: string | null = null
    if (owner.partner) {
      const status = await getSubmissionTermsStatus(admin, {
        id: owner.partner.user_id!,
        email: owner.partner.email,
        role: owner.partner.role,
      })
      if (status.required && !status.accepted) {
        termsWarning = 'Has not accepted Submission Terms — attribution and candidate consent are uncovered.'
      }
    }

    const h = candidateHighlights(parsed, {
      name,
      linkedin_url: toText(derived.linkedin_url),
      location: toText(derived.location),
    })

    const ownerNote =
      owner.reason === 'partner'
        ? `Referred by ${owner.ownerLabel}, who now owns the profile.`
        : owner.reason === 'self'
          ? 'Sent by the candidate themselves, so it is assigned to you.'
          : owner.reason === 'internal'
            ? 'Forwarded from your own address, so it is assigned to you.'
            : 'Sender is not a registered partner, so it is assigned to you.'

    await notifySlack({
      stream: 'candidates',
      emoji: ':email:',
      title: `${name} arrived by email from ${email.fromName || email.fromEmail}`,
      context: [ownerNote, termsWarning, h.headline ? `Currently ${h.headline}.` : null]
        .filter(Boolean)
        .join(' '),
      fields: [
        { label: 'Sent by', value: senderLabel(email) },
        { label: 'Owner', value: owner.ownerLabel },
        { label: 'Intake', value: owner.intakeSource },
        { label: 'Subject', value: email.subject || '(no subject)' },
        ...(h.linkedin ? [{ label: 'LinkedIn', value: h.linkedin }] : []),
        ...(h.points.length ? [{ label: 'Highlights', value: h.points.join(' · ') }] : []),
        ...(outcome === 'possible_duplicate'
          ? [{ label: ':warning: Possible duplicate', value: `Same name as an existing profile — check before working it` }]
          : []),
      ],
      body: h.summary || undefined,
      links: [
        { label: 'Open profile', url: `${email.origin}/candidates/${candidate.id}` },
        ...(outcome === 'possible_duplicate' && duplicate
          ? [{ label: 'Open the same-name profile', url: `${email.origin}/candidates/${duplicate.match.id}` }]
          : []),
      ],
    })

    return { outcome, candidateId: candidate.id, duplicateOf: duplicate?.match.id }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error(`[inbound-resume] ${attachment.filename} from ${email.fromEmail} failed:`, err)

    await recordEvent(admin, email, attachment, { outcome: 'error', detail: detail.slice(0, 500) })

    await notifySlack({
      stream: 'candidates',
      emoji: ':warning:',
      title: `Could not ingest ${attachment.filename} from ${email.fromEmail}`,
      context: 'The email is in your inbox — this one needs uploading by hand.',
      fields: [
        { label: 'Sent by', value: senderLabel(email) },
        { label: 'Subject', value: email.subject || '(no subject)' },
        { label: 'Reason', value: detail.slice(0, 300) },
      ],
    })

    return { outcome: 'error', detail }
  }
}
