import Link from 'next/link'
import { AgreementContent } from '@/components/agreement-content'
import {
  AGREEMENT_VERSIONS,
  PARTNER_SUBMISSION_TERMS_TEXT,
  PARTNER_TERMS_TEXT,
} from '@/lib/agreements'

/**
 * The permanent home of the partner documents. Partner Terms clause 8 points
 * here by name, so this route has to exist and stay in step with the text that
 * is actually served at sign-up. Both tiers live on one page: a partner who
 * wants to read everything before joining should not have to hunt for the half
 * that binds later.
 */

export const metadata = {
  title: 'Partner Terms · Refery',
  description:
    'The terms between Refery and its scouts and recruiting partners, including the submission terms that apply from your first candidate.',
}

const C = {
  bg: '#F2F1EB',
  card: '#FAF9F5',
  ink: '#161613',
  ink2: 'rgba(22,22,19,0.64)',
  ink3: 'rgba(22,22,19,0.40)',
  green: '#1F3A2F',
  greenBg: '#E7EDE9',
  greenLine: 'rgba(31,58,47,0.22)',
  border: 'rgba(22,22,19,0.10)',
}

// The serif is retired platform-wide. Display and body are both DM Sans,
// loaded once in layout.tsx as --font-dm-sans; display type earns its
// contrast from weight and tracking rather than a second family.
const SANS = "var(--font-dm-sans), 'DM Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
const SERIF = SANS

export default function PartnerTermsPage() {
  return (
    <div style={{ background: C.bg, color: C.ink, fontFamily: SANS, minHeight: '100vh' }}>
      <nav
        style={{
          borderBottom: `1px solid ${C.border}`,
          padding: '0 24px',
          height: 58,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Link href="/" style={{ fontFamily: SERIF, fontSize: 20, color: C.ink, textDecoration: 'none' }}>
          Refery<em style={{ fontStyle: 'italic', color: C.green }}>.</em>
        </Link>
        <Link
          href="/auth/sign-up"
          style={{ fontSize: 14, color: C.green, textDecoration: 'none', fontWeight: 500 }}
        >
          Join Refery
        </Link>
      </nav>

      <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px 96px' }}>
        <span
          style={{
            display: 'inline-block',
            fontSize: 10.5,
            fontWeight: 650,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: C.green,
            background: C.greenBg,
            border: `1px solid ${C.greenLine}`,
            padding: '6px 13px',
            borderRadius: 99,
            marginBottom: 20,
          }}
        >
          Scouts and recruiting partners
        </span>

        <p style={{ fontSize: 15, lineHeight: 1.6, color: C.ink2, margin: '0 0 36px', maxWidth: '62ch' }}>
          There are two parts. The Partner Terms apply from the moment you join. The Submission
          Terms apply from your first candidate, and we show them to you again at that point.
        </p>

        <section
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: '36px 34px',
          }}
        >
          <AgreementContent content={PARTNER_TERMS_TEXT} density="comfortable" showEyebrow={false} />
        </section>

        <section
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: '36px 34px',
            marginTop: 20,
          }}
        >
          <AgreementContent
            content={PARTNER_SUBMISSION_TERMS_TEXT}
            density="comfortable"
            showEyebrow={false}
          />
        </section>

        <p
          style={{
            fontSize: 13,
            color: C.ink3,
            marginTop: 28,
            paddingTop: 20,
            borderTop: `1px solid ${C.border}`,
          }}
        >
          Partner Terms v{AGREEMENT_VERSIONS.partner} and Submission Terms v
          {AGREEMENT_VERSIONS.partnerSubmission}. Partners who joined before these came into effect
          keep the version they accepted. Questions any time:{' '}
          <a href="mailto:legal@refery.io" style={{ color: C.green }}>
            legal@refery.io
          </a>
          .
        </p>
      </main>
    </div>
  )
}
