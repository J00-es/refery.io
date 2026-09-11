import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { preferencesFromApplication } from '@/lib/onboarding/decisions'
import { suggestFirstSearch } from '@/lib/onboarding/matcher'
import { cancelQueued } from '@/lib/comms'
import type { ScoutApplication } from '@/lib/intake'
import {
  generateAgreementHash,
  getAgreementText,
  getAgreementVersion,
  type AgreementType,
} from '@/lib/agreements'
import { generateAgreementPdf } from '@/lib/generate-agreement-pdf'
import { sendPartnerAgreementEmails } from '@/lib/send-agreement-emails'
import { normalizeEmail } from '@/lib/current-user'
import { emailProblem } from '@/lib/email-format'
import { resolveAccountState } from '@/lib/account-state'
import { sanitizeFirmDraft, saveFirmDraft } from '@/lib/firm-drafts'
import { AGREEMENT_VERSIONS } from '@/lib/agreements'
import { createFirm, SIGNATURE_DAYS } from '@/lib/firms'
import { announceFirmSignup, sendFirmReceipt, sendFirmSignatureRequest } from '@/lib/firm-notify'

// PDF rendering + email send adds a few seconds; give the function room.
export const maxDuration = 60

const STORAGE_BUCKET = 'signed-agreements'

interface AgreementPayload {
  version: string
  type: string
  hash: string
  userAgent?: string
}

function getClientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  const real = req.headers.get('x-real-ip')
  if (real) return real
  return null
}

function lastName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  return parts.length > 1 ? parts[parts.length - 1] : parts[0] || 'signer'
}

function slugifyName(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'signer'
  )
}

const PARTNER_TYPES: AgreementType[] = ['scout', 'recruiter']

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { password, fullName, linkedinUrl } = body
    // Only a partner role can be requested from the public form. Anything
    // else (admin, super_admin, viewer) is refused at the door.
    const role: 'scout' | 'recruiter' = body.role === 'recruiter' ? 'recruiter' : 'scout'
    const inviteToken = typeof body.invite === 'string' && body.invite.trim() ? body.invite.trim() : null
    const preferences = body.preferences && typeof body.preferences === 'object' ? (body.preferences as Record<string, unknown>) : null
    // Supabase Auth lower-cases the address it stores. Match it here so the
    // users_admin row can always be found by the auth email — a mixed-case row
    // is invisible to every lookup and reads back as `pending`.
    const email = normalizeEmail(body.email)
    const agreement: AgreementPayload | undefined = body.agreement

    // Checked before Supabase sees it. Its own rejection ("Unable to validate
    // email address: invalid format") names neither the field nor the value,
    // and by now the form is two steps past the box. `field` tells the form
    // which box to go back to.
    const emailIssue = emailProblem(email, 'your email')
    if (emailIssue) {
      return NextResponse.json({ error: emailIssue, field: 'email' }, { status: 400 })
    }
    if (body.firm?.name && body.firm?.signer_self === false) {
      const signerIssue = emailProblem(String(body.firm.signer_email ?? ''), 'the email of the person who can sign')
      if (signerIssue) {
        return NextResponse.json({ error: signerIssue, field: 'signer_email' }, { status: 400 })
      }
    }

    const supabase = await createClient()
    const adminClient = createAdminClient()

    /**
     * Lily already said yes to this person, either on the Slack card (an
     * approved application under this email) or by inviting them (a token),
     * so the account is active the moment it exists. Everyone else stays
     * pending and is approved from #refery-partners as before.
     */
    let approvedApplication: { id: string; status: string; email: string; source_campaign: string | null; source: string | null } | null = null
    if (inviteToken) {
      const { data } = await adminClient
        .from('scout_applications')
        .select('id, status, email, source_campaign, source')
        .eq('invite_token', inviteToken)
        .in('status', ['approved', 'in_conversation'])
        .maybeSingle()
      if (data && normalizeEmail(data.email) === email) approvedApplication = data
    }
    if (!approvedApplication) {
      const { data } = await adminClient
        .from('scout_applications')
        .select('id, status, email, source_campaign, source')
        .eq('email', email)
        .in('status', ['approved', 'in_conversation'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (data) approvedApplication = data
    }
    const preApproved = Boolean(approvedApplication)

    // Sign up the user with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/auth/callback`,
        data: {
          full_name: fullName,
          linkedin_url: linkedinUrl,
        },
      },
    })

    if (authError) {
      console.error('Auth sign up error:', authError)
      // The details step normally catches an existing account before the terms
      // are read. When it did not (rate limited, or the check failed), this is
      // the same answer, later: which account it is and where to go, with the
      // firm they described kept for them.
      const exists = authError.code === 'user_already_exists' || /already registered/i.test(authError.message)
      if (exists) {
        const known = await resolveAccountState(adminClient, email)
        const draft = sanitizeFirmDraft(body.firm)
        if (draft && (known.state === 'partner' || known.state === 'pending')) {
          await saveFirmDraft(adminClient, email, draft, { source: 'sign-up', accountState: known.state })
        }
        return NextResponse.json(
          {
            error: 'You already have a Refery account with this email. Sign in to continue.',
            known: known.state === 'none' ? { state: 'partner' } : known,
          },
          { status: 409 },
        )
      }
      // Supabase is stricter than the check above in places. Whatever it
      // disliked about the address, quote the address and send them back to it.
      const aboutEmail =
        authError.code === 'email_address_invalid' || /validate email address/i.test(authError.message)
      if (aboutEmail) {
        return NextResponse.json(
          { error: `We could not create an account for "${email}". Check the address for a typo and try again.`, field: 'email' },
          { status: 400 },
        )
      }
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    if (authData.user) {
      // Create users_admin record using admin client (bypasses RLS)
      const { error: adminError } = await adminClient.from('users_admin').insert({
        user_id: authData.user.id,
        email: email,
        full_name: fullName,
        linkedin_url: linkedinUrl,
        role,
        status: preApproved ? 'active' : 'pending',
        accepted_terms_at: new Date().toISOString(),
        source: approvedApplication?.source_campaign ? 'outbound' : approvedApplication ? 'application' : 'direct',
        source_campaign: approvedApplication?.source_campaign ?? null,
        reviewed_at: preApproved ? new Date().toISOString() : null,
        reviewed_by: preApproved ? 'application decision' : null,
      })
      if (adminError) {
        // Most likely an admin pre-created the row (email is unique). Keep the
        // role and status they set, but link it to the new auth id so every
        // ownership lookup resolves.
        const { error: linkError } = await adminClient
          .from('users_admin')
          .update({
            user_id: authData.user.id,
            linkedin_url: linkedinUrl,
            accepted_terms_at: new Date().toISOString(),
          })
          .eq('email', email)
          .is('user_id', null)
        if (linkError) {
          console.error('Failed to create user admin record:', adminError, linkError)
          // Don't fail the whole sign-up if admin record creation fails
        }
      }

      /**
       * Preferences and the first search.
       *
       * Saved from the form when the person confirmed them; otherwise read from
       * the application they came in on. Confirmed preferences are what let the
       * daily job suggest a search. Best effort, never fails the sign-up.
       */
      try {
        type PrefsRow = {
          own_location: string | null
          network_cities: string[]
          functions: string[]
          stages: string[]
          relationship_types: string[]
          would_relocate: boolean | null
          source: string
          confirmed_at: string | null
        }
        const fromForm: PrefsRow | null = preferences
          ? {
              own_location: typeof preferences.own_location === 'string' ? preferences.own_location : null,
              network_cities: Array.isArray(preferences.network_cities) ? (preferences.network_cities as string[]) : [],
              functions: Array.isArray(preferences.functions) ? (preferences.functions as string[]) : [],
              stages: Array.isArray(preferences.stages) ? (preferences.stages as string[]) : [],
              relationship_types: Array.isArray(preferences.relationship_types) ? (preferences.relationship_types as string[]) : [],
              would_relocate: typeof preferences.would_relocate === 'boolean' ? preferences.would_relocate : null,
              source: 'signup',
              confirmed_at: new Date().toISOString(),
            }
          : null
        let prefs: PrefsRow | null = fromForm
        if (!prefs && approvedApplication) {
          const { data: app } = await adminClient.from('scout_applications').select('*').eq('id', approvedApplication.id).maybeSingle()
          if (app) {
            const p = preferencesFromApplication(app as ScoutApplication)
            prefs = { own_location: null, network_cities: p.network_cities, functions: p.functions, stages: p.stages, relationship_types: [], would_relocate: null, source: 'application', confirmed_at: null }
          }
        }
        if (prefs && (prefs.network_cities.length || prefs.functions.length)) {
          await adminClient.from('partner_preferences').upsert({ user_id: authData.user.id, ...prefs, updated_at: new Date().toISOString(), updated_by: email }, { onConflict: 'user_id' })
        }
        if (approvedApplication) {
          await adminClient
            .from('scout_applications')
            .update({ status: 'onboarded', partner_user_id: authData.user.id })
            .eq('id', approvedApplication.id)
          await cancelQueued(adminClient, { applicationId: approvedApplication.id, templateId: 'G' }, 'account created')
          await cancelQueued(adminClient, { applicationId: approvedApplication.id, templateId: 'N' }, 'account created')
        }
        if (preApproved && prefs?.confirmed_at) {
          // The Start page shows the suggestion; no email on top of the one they just got.
          await suggestFirstSearch(adminClient, { userId: authData.user.id, email, fullName }, { by: 'sign-up', sendEmail: false })
        }
      } catch (prefErr) {
        console.error('[sign-up] preferences step threw:', prefErr)
      }

      /**
       * Signing up as a firm.
       *
       * Done here rather than by the browser afterwards, because sign-up sends a
       * verification email and leaves no session: there would be nobody to
       * authenticate a second call as, and asking someone to verify their email
       * before they can finish signing is how you lose the firm halfway.
       *
       * The signer's acceptance covers both capacities, which is what the
       * checkbox on the last step says: the entity is bound, and they personally
       * confirm they may bind it. The firm is created `pending` like the person,
       * so nothing is live until the card in Slack is thumbed up.
       *
       * Best effort, deliberately. A firm that fails to create leaves a working
       * recruiter account whose owner can set the firm up from /firm, which is a
       * far better failure than a sign-up that rolls back at the last step.
       */
      if (body.firm?.name && body.firm?.legal_name) {
        try {
          /**
           * The auth id, not the users_admin primary key.
           *
           * Everything downstream keys on the auth id: partner_org_members.user_id,
           * candidates.owner_user_id, and getMembership's lookup. An earlier
           * version of this block read users_admin.id and would have left the
           * person who created a firm with no membership in it, so the app would
           * have offered to create them a second one. Never hit: no firm has
           * signed up yet.
           */
          {
            const created = await createFirm(adminClient, {
              name: body.firm.name,
              legalName: body.firm.legal_name,
              jurisdiction: body.firm.jurisdiction,
              companyNumber: body.firm.company_number,
              billingEmail: body.firm.billing_email,
              createdByUserId: authData.user.id,
              signer:
                body.firm.signer_self === false
                  ? {
                      self: false,
                      name: String(body.firm.signer_name ?? '').trim(),
                      email: String(body.firm.signer_email ?? '').trim(),
                    }
                  : { self: true, name: fullName, email },
              ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
              userAgent: req.headers.get('user-agent'),
            })

            if (created.ok) {
              const versions = {
                partner: AGREEMENT_VERSIONS.partner,
                submission: AGREEMENT_VERSIONS.partnerSubmission,
                addendum: AGREEMENT_VERSIONS.firmAddendum,
              }
              if (created.signatureToken) {
                // Somebody else binds the company. Nothing is announced yet:
                // there is no signature for Lily to approve.
                const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://refery.xyz'
                await sendFirmSignatureRequest(
                  String(body.firm.signer_email).trim(),
                  created.firm,
                  fullName,
                  `${base}/firm/sign/${created.firm.slug}?token=${created.signatureToken}`,
                  SIGNATURE_DAYS,
                  versions,
                )
              } else {
                await Promise.allSettled([
                  sendFirmReceipt(email, created.firm, fullName, versions),
                  announceFirmSignup({
                    firm: created.firm,
                    signerName: fullName,
                    signerEmail: email,
                    signerTitle: body.firm.signer_title,
                    jurisdiction: body.firm.jurisdiction,
                    companyNumber: body.firm.company_number,
                    versions,
                  }),
                ])
              }
            } else {
              console.error('[sign-up] firm creation failed:', created.error)
            }
          }
        } catch (firmErr) {
          console.error('[sign-up] firm creation threw:', firmErr)
        }
      }

      // Persist the role-specific clickwrap acceptance for legal record-keeping,
      // generate the legally-binding signed PDF, and email it to the signer and
      // the Refery team. All best-effort — never fail the sign-up over it.
      const partnerType = PARTNER_TYPES.find((t) => t === agreement?.type) ?? null

      if (agreement && partnerType) {
        try {
          const ip = getClientIp(req)
          const ua = agreement.userAgent || req.headers.get('user-agent') || null
          const signedAt = new Date().toISOString()

          // Canonical agreement text + version + integrity hash, computed server
          // side so the recorded hash, the PDF, and the email all match.
          // Both come from the same pair of helpers. Reading the version
          // straight out of AGREEMENT_VERSIONS[partnerType] recorded "1.2.0"
          // against a hash of the v2.0 text, which made the acceptance
          // self-contradictory and, because the Submission Terms gate matches
          // on version, meant new partners were never asked for tier two.
          const content = getAgreementText(partnerType)
          const version = getAgreementVersion(partnerType)
          const termsHash = await generateAgreementHash(content)

          const { data: acceptance, error: acceptError } = await adminClient
            .from('agreement_acceptances')
            .insert({
              user_id: authData.user.id,
              user_email: email,
              user_name: fullName,
              ip_address: ip,
              user_agent: ua,
              agreement_version: version,
              agreement_hash: termsHash,
              acceptance_method: 'clickwrap_checkbox_and_button',
              agreement_type: partnerType,
              accepted_at: signedAt,
            })
            .select('id')
            .single()

          if (acceptError) {
            console.error('Failed to record agreement acceptance:', acceptError)
          }

          const acceptanceId = acceptance?.id || authData.user.id

          // Generate the signed PDF (captures name, email, signed-at, IP, version,
          // SHA-256 terms hash, and a reference id — everything needed for a
          // legally-binding electronic signature record).
          let pdfBuffer: Buffer | null = null
          try {
            pdfBuffer = await generateAgreementPdf({
              kind: 'partner',
              content,
              signerName: fullName,
              signerEmail: email,
              signedAt,
              version,
              termsHash,
              agreementLinkId: acceptanceId,
              ipAddress: ip,
              partnerType,
            })

            // Store a copy for record-keeping (best-effort).
            const pdfPath = `partner-agreements/signup-${acceptanceId}.pdf`
            const { error: uploadError } = await adminClient.storage
              .from(STORAGE_BUCKET)
              .upload(pdfPath, pdfBuffer, {
                contentType: 'application/pdf',
                upsert: true,
              })
            if (uploadError) {
              console.error('[sign-up] pdf upload failed:', uploadError)
            } else if (acceptance?.id) {
              await adminClient
                .from('agreement_acceptances')
                .update({ pdf_url: pdfPath })
                .eq('id', acceptance.id)
            }
          } catch (pdfErr) {
            console.error('[sign-up] pdf generation failed:', pdfErr)
          }

          if (pdfBuffer) {
            const origin =
              process.env.NEXT_PUBLIC_SITE_URL ||
              process.env.NEXT_PUBLIC_APP_URL ||
              new URL(req.url).origin
            const signedAtHuman = new Date(signedAt)
              .toUTCString()
              .replace(' GMT', ' UTC')
            const result = await sendPartnerAgreementEmails({
              signerName: fullName,
              signerEmail: email,
              partnerType,
              version,
              signedAtIso: signedAt,
              signedAtHuman,
              ipAddress: ip,
              termsHash,
              agreementLinkId: acceptanceId,
              adminUrl: `${origin}/dashboard`,
              pdfBuffer,
              pdfFilename: `Refery-Partner-Agreement-${slugifyName(lastName(fullName))}.pdf`,
            })
            if (result.errors.length) {
              console.error('[sign-up] agreement email errors:', result.errors)
            }
          } else {
            console.error('[sign-up] skipped agreement emails — no PDF buffer')
          }
        } catch (agreementErr) {
          console.error('[sign-up] agreement PDF/email step threw:', agreementErr)
        }
      }
    }

    return NextResponse.json({
      success: true,
      user: authData.user,
      session: authData.session,
      approved: preApproved,
      next: preApproved ? '/start' : '/auth/pending-approval',
    })
  } catch (error) {
    console.error('Sign up error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sign up failed' },
      { status: 500 }
    )
  }
}
