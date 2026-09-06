import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import {
  generateAgreementHash,
  getAgreementText,
  getAgreementVersion,
  type AgreementType,
} from '@/lib/agreements'
import { generateAgreementPdf } from '@/lib/generate-agreement-pdf'
import { sendPartnerAgreementEmails } from '@/lib/send-agreement-emails'
import { normalizeEmail } from '@/lib/current-user'
import { AGREEMENT_VERSIONS } from '@/lib/agreements'
import { createFirm } from '@/lib/firms'
import { announceFirmSignup, sendFirmReceipt } from '@/lib/firm-notify'

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
    const { password, fullName, linkedinUrl, role } = body
    // Supabase Auth lower-cases the address it stores. Match it here so the
    // users_admin row can always be found by the auth email — a mixed-case row
    // is invisible to every lookup and reads back as `pending`.
    const email = normalizeEmail(body.email)
    const agreement: AgreementPayload | undefined = body.agreement

    const supabase = await createClient()
    const adminClient = createAdminClient()

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
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    if (authData.user) {
      // Create users_admin record using admin client (bypasses RLS)
      const { error: adminError } = await adminClient.from('users_admin').insert({
        user_id: authData.user.id,
        email: email,
        full_name: fullName,
        linkedin_url: linkedinUrl,
        role: role || 'viewer',
        status: 'pending',
        accepted_terms_at: new Date().toISOString(),
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
          // signer_user_id is the users_admin PK, not the auth id. Read it back
          // by email so this works whether the row was inserted or relinked.
          const { data: adminRow } = await adminClient
            .from('users_admin')
            .select('id')
            .eq('email', email)
            .single()

          if (adminRow?.id) {
            const created = await createFirm(adminClient, {
              name: body.firm.name,
              legalName: body.firm.legal_name,
              jurisdiction: body.firm.jurisdiction,
              companyNumber: body.firm.company_number,
              billingEmail: body.firm.billing_email,
              signerUserId: adminRow.id as string,
              ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
              userAgent: req.headers.get('user-agent'),
            })

            if (created.ok) {
              const versions = {
                partner: AGREEMENT_VERSIONS.partner,
                submission: AGREEMENT_VERSIONS.partnerSubmission,
                addendum: AGREEMENT_VERSIONS.firmAddendum,
              }
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
    })
  } catch (error) {
    console.error('Sign up error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sign up failed' },
      { status: 500 }
    )
  }
}
