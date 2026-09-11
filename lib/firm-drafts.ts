import type { SupabaseClient } from '@supabase/supabase-js'
import { notifySlack } from '@/lib/slack'
import type { KnownAccount } from '@/lib/account-state'

/**
 * The firm an existing partner described on the sign-up form, kept for them.
 *
 * The form recognises their account at the email field and sends them to log
 * in. What they typed used to live only in that tab's sessionStorage, so a
 * password reset (a new tab, from an email), a second device, or simply coming
 * back a week later lost it, and nothing inside the app mentioned the firm
 * again. Now the server keeps a copy: /firm/new fills the form from it, the
 * dashboard shows a banner until it is used, and creating the firm deletes it.
 *
 * Written from an unauthenticated form, so only the nine sign-up fields are
 * kept, as strings, trimmed and capped, and only once the address is known to
 * belong to a partner. The worst a stranger can do is pre-fill a form that the
 * real owner then edits.
 */

export const FIRM_DRAFT_KEYS = [
  'name',
  'legal_name',
  'jurisdiction',
  'company_number',
  'signer_title',
  'billing_email',
  'signer_self',
  'signer_name',
  'signer_email',
] as const

export type FirmDraftKey = (typeof FIRM_DRAFT_KEYS)[number]
export type FirmDraft = Partial<Record<FirmDraftKey, string>>

/** Whitelisted, trimmed, capped; null when there is no firm in it. */
export function sanitizeFirmDraft(input: unknown): FirmDraft | null {
  if (!input || typeof input !== 'object') return null
  const src = input as Record<string, unknown>
  const out: FirmDraft = {}
  for (const key of FIRM_DRAFT_KEYS) {
    let v = src[key]
    // The sign-up route receives signer_self as a boolean; the form parks it as
    // 'yes' / 'no'. One shape on disk.
    if (key === 'signer_self' && typeof v === 'boolean') v = v ? 'yes' : 'no'
    if (typeof v !== 'string') continue
    const s = v.trim().slice(0, 200)
    if (s) out[key] = s
  }
  if (out.signer_self && out.signer_self !== 'yes' && out.signer_self !== 'no') delete out.signer_self
  return out.name || out.legal_name ? out : null
}

export async function saveFirmDraft(
  admin: SupabaseClient,
  email: string,
  draft: FirmDraft,
  opts: { source: string; accountState: string },
): Promise<void> {
  const { error } = await admin.from('partner_org_drafts').upsert(
    {
      email,
      draft,
      source: opts.source,
      account_state: opts.accountState,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'email' },
  )
  if (error) console.error('[firm-drafts] save failed:', error.message)
}

export async function getFirmDraft(admin: SupabaseClient, email: string): Promise<FirmDraft | null> {
  const { data } = await admin.from('partner_org_drafts').select('draft').eq('email', email).maybeSingle()
  return data?.draft ? sanitizeFirmDraft(data.draft) : null
}

export async function clearFirmDraft(admin: SupabaseClient, email: string): Promise<void> {
  const { error } = await admin.from('partner_org_drafts').delete().eq('email', email)
  if (error) console.error('[firm-drafts] clear failed:', error.message)
}

/**
 * One line in #refery-partners, so Lily knows a partner is converting before
 * the firm card arrives, or that a pending person wants a firm, which the
 * approval decision should take into account.
 */
export async function announceFirmDraft(known: KnownAccount, email: string, draft: FirmDraft): Promise<void> {
  const who = known.firstName || email
  const firm = draft.name || draft.legal_name || 'a firm'
  const pending = known.state === 'pending'
  await notifySlack({
    stream: 'partners',
    emoji: ':office:',
    title: pending ? `${who} (pending approval) wants a firm account: ${firm}` : `${who} is converting to a firm: ${firm}`,
    context: pending
      ? 'Approve the person first. What they typed about the firm is saved and the form will be waiting for them.'
      : 'Existing partner. The form is filled in and waiting at /firm/new; the card to approve comes when they accept.',
    fields: [
      { label: 'Email', value: email },
      { label: 'Legal entity', value: draft.legal_name || 'Not given' },
      { label: 'Jurisdiction', value: draft.jurisdiction || 'Not given' },
      {
        label: 'Signer',
        value: draft.signer_self === 'no' ? `${draft.signer_name || '?'} (${draft.signer_email || '?'})` : 'Themselves',
      },
    ],
  })
}
