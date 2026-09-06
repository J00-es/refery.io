import Link from 'next/link'
import { AgreementContent } from '@/components/agreement-content'
import {
  AGREEMENT_VERSIONS,
  FIRM_ADDENDUM_TEXT,
  FIRM_USER_TERMS_TEXT,
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
    'The terms between Refery and its scouts, recruiting partners and firms: the Partner Terms, the Submission Terms, the Firm Addendum and the Team access terms.',
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
          Scouts, recruiting partners and firms
        </span>

        <p style={{ fontSize: 15, lineHeight: 1.6, color: C.ink2, margin: '0 0 20px', maxWidth: '62ch' }}>
          The Partner Terms apply from the moment you join. The Submission Terms apply from your
          first candidate, and we show them to you again at that point. If you work as a firm, two
          more apply, and they are here too.
        </p>

        {/* A reader who followed a link from an acceptance screen came for one
            of these four. Jumping straight to it beats scrolling past three. */}
        <nav
          aria-label="Documents on this page"
          style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '0 0 36px' }}
        >
          {[
            { href: '#partner-terms', label: 'Partner Terms' },
            { href: '#submission-terms', label: 'Submission Terms' },
            { href: '#firm-addendum', label: 'Firm Addendum' },
            { href: '#team-access', label: 'Team access terms' },
          ].map(l => (
            <a
              key={l.href}
              href={l.href}
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: C.green,
                background: C.greenBg,
                border: `1px solid ${C.greenLine}`,
                borderRadius: 99,
                padding: '7px 14px',
                textDecoration: 'none',
                minHeight: 36,
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              {l.label}
            </a>
          ))}
        </nav>

        <section
          id="partner-terms"
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: '36px 34px',
            scrollMarginTop: 24,
          }}
        >
          <AgreementContent content={PARTNER_TERMS_TEXT} density="comfortable" showEyebrow={false} />
        </section>

        <section
          id="submission-terms"
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: '36px 34px',
            marginTop: 20,
            scrollMarginTop: 24,
          }}
        >
          <AgreementContent
            content={PARTNER_SUBMISSION_TERMS_TEXT}
            density="comfortable"
            showEyebrow={false}
          />
        </section>

        {/* The two firm documents. Referenced by version on every firm
            acceptance screen since 6 Sep 2026, and until now published
            nowhere: the link said "in full" and did not reach them. */}
        <p
          style={{
            fontSize: 10.5,
            fontWeight: 650,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: C.green,
            margin: '44px 0 14px',
          }}
        >
          If you work as a firm
        </p>
        <p style={{ fontSize: 15, lineHeight: 1.6, color: C.ink2, margin: '0 0 20px', maxWidth: '62ch' }}>
          One person signs the Firm Addendum for the company. Everyone else at the firm accepts the
          Team access terms for themselves, which cover their own use rather than the company&rsquo;s
          commercial position.
        </p>

        <section
          id="firm-addendum"
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: '36px 34px',
            scrollMarginTop: 24,
          }}
        >
          <AgreementContent content={FIRM_ADDENDUM_TEXT} density="comfortable" showEyebrow={false} />
        </section>

        <section
          id="team-access"
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: '36px 34px',
            marginTop: 20,
            scrollMarginTop: 24,
          }}
        >
          <AgreementContent content={FIRM_USER_TERMS_TEXT} density="comfortable" showEyebrow={false} />
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
          Partner Terms v{AGREEMENT_VERSIONS.partner}, Submission Terms v
          {AGREEMENT_VERSIONS.partnerSubmission}, Firm Addendum v{AGREEMENT_VERSIONS.firmAddendum}{' '}
          and Team access terms v{AGREEMENT_VERSIONS.firmUser}. Partners who joined before these came
          into effect keep the version they accepted. Questions any time:{' '}
          <a href="mailto:legal@refery.io" style={{ color: C.green }}>
            legal@refery.io
          </a>
          .
        </p>
      </main>
    </div>
  )
}
