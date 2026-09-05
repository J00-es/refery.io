'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { format } from 'date-fns'
import { AGREEMENT_TYPE_LABELS } from '@/lib/agreements'
import { AgreementContent } from '@/components/agreement-content'

/* ----------------------------------------------------------------------------
 * Refery brand tokens
 * -------------------------------------------------------------------------- */
const C = {
  bg: '#F2F1EB',
  bg2: '#E9E8E1',
  bg3: '#E4E3DC',
  card: '#FAF9F5',
  ink: '#161613',
  ink2: 'rgba(22,22,19,0.64)',
  ink3: 'rgba(22,22,19,0.40)',
  ink4: 'rgba(22,22,19,0.20)',
  green: '#1F3A2F',
  greenBg: '#E7EDE9',
  greenBorder: 'rgba(31,58,47,0.20)',
  border: 'rgba(22,22,19,0.10)',
  borderSoft: 'rgba(22,22,19,0.06)',
  red: '#B0413E',
  redBg: '#FBEAE9',
}

// The serif is retired platform-wide. Display and body are both DM Sans, which
// layout.tsx already loads as --font-dm-sans, so display type earns its contrast
// from weight and tracking rather than a second family. SERIF is kept as an alias
// so every existing heading keeps pointing at the display face.
const SANS = "var(--font-dm-sans), 'DM Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
const SERIF = SANS

/* ----------------------------------------------------------------------------
 * Types
 * -------------------------------------------------------------------------- */
interface AgreementData {
  id: string
  recruiter_name: string
  recruiter_email: string
  agreement_type: 'scout' | 'recruiter'
  agreement_version: string
  agreement_content: string
  agreement_hash?: string
  status: string
  expires_at: string
}

interface SigningResult {
  success: boolean
  signature_id: string
  signed_at: string
  agreement_hash: string
}

/* ----------------------------------------------------------------------------
 * Main component
 * -------------------------------------------------------------------------- */
export function AgreementSigningClient({ token }: { token: string }) {
  const [agreement, setAgreement] = useState<AgreementData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [signing, setSigning] = useState(false)
  const [signed, setSigned] = useState(false)
  const [signatureResult, setSignatureResult] = useState<SigningResult | null>(null)

  const [signerName, setSignerName] = useState('')
  const [signerEmail, setSignerEmail] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [readAgreement, setReadAgreement] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function fetchAgreement() {
      try {
        const response = await fetch(`/api/agreements/public/${token}`, {
          cache: 'no-store',
        })

        const data = await response.json()
        if (cancelled) return

        if (!response.ok) {
          setError(data.error || 'Failed to load agreement')
          if (data.signed_at || data.already_signed) setSigned(true)
          return
        }

        if (data.already_signed) {
          setSigned(true)
          return
        }

        setAgreement(data)
        setSignerName(data.recruiter_name || '')
        setSignerEmail(data.recruiter_email || '')
      } catch {
        if (!cancelled) setError('Failed to load agreement')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchAgreement()

    return () => {
      cancelled = true
    }
  }, [token])

  const handleSign = async () => {
    if (!accepted || !readAgreement || !signerName || !signerEmail) return

    setSigning(true)
    setError(null)

    try {
      const response = await fetch(`/api/agreements/public/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signer_name: signerName,
          signer_email: signerEmail,
          accepted: true,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Failed to sign agreement')
        return
      }

      setSignatureResult(data)
      setSigned(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch {
      setError('Failed to sign agreement')
    } finally {
      setSigning(false)
    }
  }

  const canSign =
    accepted &&
    readAgreement &&
    signerName.trim().length > 1 &&
    /\S+@\S+\.\S+/.test(signerEmail) &&
    !signing

  if (loading) return <ShellLoading />
  if (error && !agreement && !signed) return <ShellError message={error} />
  if (signed) return <ShellSuccess result={signatureResult} email={signerEmail} />
  if (!agreement) return null

  return (
    <PageShell>
      <BrandStyles />
      <Nav />

      <main
        className="refery-main"
        style={{ maxWidth: 880, margin: '0 auto', padding: '56px 32px 96px' }}
      >
        <Hero
          version={agreement.agreement_version}
          typeLabel={AGREEMENT_TYPE_LABELS[agreement.agreement_type]}
        />

        <RecipientCard agreement={agreement} />

        <DocumentCard content={agreement.agreement_content} />

        <SignCard
          signerName={signerName}
          signerEmail={signerEmail}
          accepted={accepted}
          readAgreement={readAgreement}
          signing={signing}
          canSign={canSign}
          error={error}
          onSignerNameChange={setSignerName}
          onSignerEmailChange={setSignerEmail}
          onAcceptedChange={setAccepted}
          onReadChange={setReadAgreement}
          onSign={handleSign}
        />

        <Footer />
      </main>
    </PageShell>
  )
}

/* ============================================================================
 * Shell + Brand
 * ========================================================================== */
function PageShell({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: C.bg,
        color: C.ink,
        fontFamily: SANS,
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
      }}
    >
      {children}
    </div>
  )
}

function BrandStyles() {
  return (
    <style jsx global>{`
      .refery-input {
        width: 100%;
        padding: 12px 14px;
        font-size: 15px;
        font-family: 'Inter', system-ui, sans-serif;
        color: ${C.ink};
        background: #fff;
        border: 1px solid ${C.border};
        border-radius: 8px;
        outline: none;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
      }

      .refery-input::placeholder {
        color: ${C.ink3};
      }

      .refery-input:hover {
        border-color: rgba(16, 15, 15, 0.18);
      }

      .refery-input:focus {
        border-color: ${C.green};
        box-shadow: 0 0 0 3px rgba(42, 107, 69, 0.12);
      }

      .refery-cta {
        background: ${C.ink};
        color: #fff;
        font-family: 'Inter', system-ui, sans-serif;
        font-size: 16px;
        font-weight: 500;
        padding: 14px 28px;
        border-radius: 6px;
        border: 1px solid ${C.ink};
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        transition: opacity 0.15s ease, transform 0.05s ease;
      }

      .refery-cta:hover:not(:disabled) {
        opacity: 0.92;
      }

      .refery-cta:active:not(:disabled) {
        transform: translateY(1px);
      }

      .refery-cta:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      .refery-check {
        appearance: none;
        -webkit-appearance: none;
        width: 18px;
        height: 18px;
        margin: 0;
        border: 1.5px solid ${C.ink4};
        border-radius: 4px;
        background: #fff;
        cursor: pointer;
        flex-shrink: 0;
        position: relative;
        transition: border-color 0.15s ease, background 0.15s ease;
      }

      .refery-check:hover {
        border-color: ${C.ink3};
      }

      .refery-check:checked {
        background: ${C.green};
        border-color: ${C.green};
      }

      .refery-check:checked::after {
        content: '';
        position: absolute;
        left: 5px;
        top: 1px;
        width: 5px;
        height: 10px;
        border: solid #fff;
        border-width: 0 2px 2px 0;
        transform: rotate(45deg);
      }

      .refery-check:focus-visible {
        box-shadow: 0 0 0 3px rgba(42, 107, 69, 0.18);
      }

      @media (max-width: 640px) {
        .refery-main {
          padding: 32px 20px 64px !important;
        }

        .refery-card {
          padding: 20px !important;
        }

        .refery-doc-pad {
          padding: 28px 22px !important;
        }

        .refery-recipient-grid {
          grid-template-columns: 1fr !important;
        }

        .refery-form-grid {
          grid-template-columns: 1fr !important;
        }
      }
    `}</style>
  )
}

function Nav() {
  return (
    <nav
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'rgba(242,241,235,0.88)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: `1px solid ${C.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 28px',
        height: 58,
      }}
    >
      <a
        href="https://refery.io"
        style={{
          fontFamily: SERIF,
          fontWeight: 600,
          letterSpacing: '-0.02em',
          fontSize: 20,
          color: C.ink,
          textDecoration: 'none',
        }}
      >
        Refery
        <em style={{ fontStyle: 'italic', color: C.green }}>.</em>
      </a>

      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: C.green,
          background: C.greenBg,
          padding: '6px 14px',
          borderRadius: 99,
          border: `1px solid ${C.greenBorder}`,
          userSelect: 'none',
        }}
      >
        Partner Agreement
      </span>
    </nav>
  )
}

function Footer() {
  return (
    <footer
      style={{
        marginTop: 64,
        paddingTop: 32,
        borderTop: `1px solid ${C.border}`,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 16,
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: 13,
        color: C.ink3,
      }}
    >
      <div>
        <span style={{ fontFamily: SERIF, fontWeight: 600, letterSpacing: '-0.02em', fontSize: 16, color: C.ink2 }}>
          Refery<em style={{ fontStyle: 'italic', color: C.green }}>.</em>
        </span>
        <span style={{ marginLeft: 12 }}>© {new Date().getFullYear()} Refery, Inc.</span>
      </div>

      <div style={{ display: 'flex', gap: 20 }}>
        <a href="mailto:legal@refery.io" style={{ color: C.ink2, textDecoration: 'none' }}>
          legal@refery.io
        </a>
        <a href="mailto:partners@refery.io" style={{ color: C.ink2, textDecoration: 'none' }}>
          partners@refery.io
        </a>
      </div>
    </footer>
  )
}

/* ============================================================================
 * Page sections
 * ========================================================================== */
function Hero({ version, typeLabel }: { version: string; typeLabel: string }) {
  return (
    <section style={{ textAlign: 'center', marginBottom: 40 }}>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: C.green,
          background: C.greenBg,
          border: `1px solid ${C.greenBorder}`,
          padding: '6px 14px',
          borderRadius: 99,
          marginBottom: 22,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: C.green,
          }}
        />
        {typeLabel} · v{version}
      </span>

      <h1
        style={{
          fontFamily: SERIF,
          fontWeight: 600,
          fontSize: 'clamp(40px, 5.5vw, 60px)',
          lineHeight: 1.04,
          letterSpacing: '-0.035em',
          color: C.ink,
          margin: '0 0 18px 0',
        }}
      >
        Welcome to Refery
        <em style={{ fontStyle: 'italic', color: C.green }}>.</em>
      </h1>

      <p
        style={{
          fontSize: 18,
          lineHeight: 1.6,
          color: C.ink2,
          maxWidth: 560,
          margin: '0 auto',
        }}
      >
        Take a few minutes to review your partner agreement below. Once you sign,
        you&apos;ll have full access to the platform.
      </p>
    </section>
  )
}

function RecipientCard({ agreement }: { agreement: AgreementData }) {
  return (
    <div
      className="refery-card"
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: '22px 26px',
        marginBottom: 20,
      }}
    >
      <div
        className="refery-recipient-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 20,
        }}
      >
        <Field label="Prepared for" value={agreement.recruiter_name} />
        <Field label="Email" value={agreement.recruiter_email} mono />
        <Field label="Expires" value={format(new Date(agreement.expires_at), 'MMM d, yyyy')} />
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: C.ink3,
          marginBottom: 6,
        }}
      >
        {label}
      </div>

      <div
        style={{
          fontSize: 15,
          fontWeight: 500,
          color: C.ink,
          fontFamily: mono
            ? "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
            : SANS,
          letterSpacing: mono ? '-0.005em' : 'normal',
          wordBreak: 'break-word',
        }}
      >
        {value}
      </div>
    </div>
  )
}

function DocumentCard({ content }: { content: string }) {
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        marginBottom: 28,
        overflow: 'hidden',
        boxShadow: '0 1px 0 rgba(22,22,19,0.02)',
      }}
    >
      <div className="refery-doc-pad" style={{ padding: '52px 56px' }}>
        <AgreementContent content={content} showEyebrow={false} />
      </div>
    </div>
  )
}

function SignCard(props: {
  signerName: string
  signerEmail: string
  accepted: boolean
  readAgreement: boolean
  signing: boolean
  canSign: boolean
  error: string | null
  onSignerNameChange: (v: string) => void
  onSignerEmailChange: (v: string) => void
  onAcceptedChange: (v: boolean) => void
  onReadChange: (v: boolean) => void
  onSign: () => void
}) {
  return (
    <div
      className="refery-card"
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: '32px 36px',
      }}
    >
      <div style={{ marginBottom: 24 }}>
        <h2
          style={{
            fontFamily: SERIF,
            fontWeight: 600,
            fontSize: 'clamp(24px, 3vw, 30px)',
            lineHeight: 1.15,
            letterSpacing: '-0.025em',
            color: C.ink,
            margin: '0 0 6px 0',
          }}
        >
          Sign the agreement
        </h2>

        <p style={{ fontSize: 14, color: C.ink2, margin: 0 }}>
          Confirm your details and accept the terms to activate your access.
        </p>
      </div>

      <div
        className="refery-form-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 16,
          marginBottom: 22,
        }}
      >
        <FormField
          label="Full name"
          input={
            <input
              className="refery-input"
              type="text"
              value={props.signerName}
              onChange={(e) => props.onSignerNameChange(e.target.value)}
              placeholder="Your full legal name"
              autoComplete="name"
            />
          }
        />

        <FormField
          label="Email"
          input={
            <input
              className="refery-input"
              type="email"
              value={props.signerEmail}
              onChange={(e) => props.onSignerEmailChange(e.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
            />
          }
        />
      </div>

      <div
        style={{
          background: C.bg,
          border: `1px solid ${C.borderSoft}`,
          borderRadius: 10,
          padding: '18px 20px',
          marginBottom: 18,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <CheckRow
          checked={props.readAgreement}
          onChange={props.onReadChange}
          id="read-confirm"
        >
          I have read and understood the entire agreement above — including the terms on
          compensation, candidate protection, confidentiality, and non-circumvention.
        </CheckRow>

        <div style={{ height: 1, background: C.borderSoft }} />

        <CheckRow
          checked={props.accepted}
          onChange={props.onAcceptedChange}
          id="accept-confirm"
        >
          I agree to be legally bound by all terms and conditions of this agreement. I
          understand my electronic signature has the same legal effect as a handwritten
          signature.
        </CheckRow>
      </div>

      <div
        style={{
          background: C.bg2,
          border: `1px solid ${C.borderSoft}`,
          borderRadius: 8,
          padding: '12px 14px',
          marginBottom: 20,
          fontSize: 12.5,
          lineHeight: 1.55,
          color: C.ink2,
        }}
      >
        By clicking <strong style={{ color: C.ink, fontWeight: 600 }}>Accept Agreement</strong>,
        you create a legally binding electronic signature under the E-SIGN Act and UETA.
        Your IP address, browser, and timestamp are recorded as part of the signing record.
      </div>

      {props.error && (
        <div
          role="alert"
          style={{
            background: C.redBg,
            border: `1px solid rgba(176,65,62,0.20)`,
            borderRadius: 8,
            padding: '10px 14px',
            fontSize: 13.5,
            color: C.red,
            marginBottom: 16,
          }}
        >
          {props.error}
        </div>
      )}

      <button
        type="button"
        className="refery-cta"
        onClick={props.onSign}
        disabled={!props.canSign}
        style={{ width: '100%', height: 52, fontSize: 16 }}
      >
        {props.signing ? (
          <>
            <Spinner size={16} />
            Signing…
          </>
        ) : (
          <>Accept Agreement &rarr;</>
        )}
      </button>
    </div>
  )
}

function FormField({
  label,
  input,
}: {
  label: string
  input: ReactNode
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.04em',
          color: C.ink2,
        }}
      >
        {label}
      </span>
      {input}
    </label>
  )
}

function CheckRow({
  checked,
  onChange,
  id,
  children,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  id: string
  children: ReactNode
}) {
  return (
    <label
      htmlFor={id}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        cursor: 'pointer',
        fontSize: 14,
        lineHeight: 1.55,
        color: C.ink2,
      }}
    >
      <input
        id={id}
        type="checkbox"
        className="refery-check"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop: 2 }}
      />
      <span style={{ flex: 1 }}>{children}</span>
    </label>
  )
}

/* ============================================================================
 * Loading / Error / Success states
 * ========================================================================== */
function ShellLoading() {
  return (
    <PageShell>
      <BrandStyles />
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <Spinner size={28} color={C.ink3} />
          <p style={{ marginTop: 16, color: C.ink3, fontSize: 14 }}>
            Loading agreement…
          </p>
        </div>
      </div>
    </PageShell>
  )
}

function ShellError({ message }: { message: string }) {
  return (
    <PageShell>
      <BrandStyles />
      <Nav />

      <div
        style={{
          maxWidth: 520,
          margin: '0 auto',
          padding: '120px 32px',
          textAlign: 'center',
        }}
      >
        <h1
          style={{
            fontFamily: SERIF,
            fontWeight: 600,
            fontSize: 'clamp(32px, 4vw, 42px)',
            lineHeight: 1.1,
            letterSpacing: '-0.03em',
            color: C.ink,
            margin: '0 0 14px 0',
          }}
        >
          We couldn&apos;t load this agreement
        </h1>

        <p
          style={{
            color: C.ink2,
            fontSize: 16,
            lineHeight: 1.6,
            margin: '0 0 24px 0',
          }}
        >
          {message}
        </p>

        <a
          href="mailto:partners@refery.io"
          style={{
            display: 'inline-block',
            color: C.green,
            fontWeight: 500,
            textDecoration: 'none',
            borderBottom: `1px solid ${C.green}`,
            paddingBottom: 1,
          }}
        >
          Contact partners@refery.io
        </a>
      </div>
    </PageShell>
  )
}

function ShellSuccess({
  result,
  email,
}: {
  result: SigningResult | null
  email: string
}) {
  return (
    <PageShell>
      <BrandStyles />
      <Nav />

      <main
        style={{
          maxWidth: 640,
          margin: '0 auto',
          padding: '80px 32px 96px',
          textAlign: 'center',
        }}
      >
        <div
          aria-hidden
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: C.greenBg,
            border: `1px solid ${C.greenBorder}`,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 24,
          }}
        >
          <CheckIcon />
        </div>

        <h1
          style={{
            fontFamily: SERIF,
            fontWeight: 600,
            fontSize: 'clamp(36px, 5vw, 52px)',
            lineHeight: 1.04,
            letterSpacing: '-0.035em',
            color: C.ink,
            margin: '0 0 14px 0',
          }}
        >
          You&apos;re in
          <em style={{ fontStyle: 'italic', color: C.green }}>.</em>
        </h1>

        <p
          style={{
            fontSize: 17,
            lineHeight: 1.6,
            color: C.ink2,
            margin: '0 auto 32px',
            maxWidth: 480,
          }}
        >
          Your agreement has been signed. A confirmation has been sent to{' '}
          <strong style={{ color: C.ink, fontWeight: 600 }}>{email}</strong>. Welcome
          to the Refery network.
        </p>

        {result && (
          <div
            style={{
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              padding: '20px 24px',
              textAlign: 'left',
              fontSize: 13,
              color: C.ink2,
              maxWidth: 480,
              margin: '0 auto',
            }}
          >
            <Receipt label="Signed at" value={format(new Date(result.signed_at), 'PPpp')} />
            <ReceiptDivider />
            <Receipt label="Signature ID" value={result.signature_id} mono truncate />
            <ReceiptDivider />
            <Receipt label="Agreement hash" value={result.agreement_hash} mono truncate />
          </div>
        )}

        <div style={{ marginTop: 40 }}>
          <a
            href="https://refery.xyz"
            className="refery-cta"
            style={{ textDecoration: 'none' }}
          >
            Go to platform &rarr;
          </a>
        </div>
      </main>
    </PageShell>
  )
}

function Receipt({
  label,
  value,
  mono,
  truncate,
}: {
  label: string
  value: string
  mono?: boolean
  truncate?: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 12,
        padding: '8px 0',
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: C.ink3,
          flexShrink: 0,
        }}
      >
        {label}
      </span>

      <span
        style={{
          fontFamily: mono
            ? "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
            : SANS,
          fontSize: mono ? 12 : 13.5,
          color: C.ink,
          textAlign: 'right',
          maxWidth: '70%',
          overflow: truncate ? 'hidden' : 'visible',
          textOverflow: truncate ? 'ellipsis' : 'clip',
          whiteSpace: truncate ? 'nowrap' : 'normal',
        }}
        title={value}
      >
        {value}
      </span>
    </div>
  )
}

function ReceiptDivider() {
  return <div style={{ height: 1, background: C.borderSoft }} />
}

/* ============================================================================
 * Tiny icons
 * ========================================================================== */
function Spinner({
  size = 16,
  color = '#fff',
}: {
  size?: number
  color?: string
}) {
  const id = useMemo(() => `spinner-${Math.random().toString(36).slice(2)}`, [])

  return (
    <span
      role="status"
      aria-label="Loading"
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        animation: 'refery-spin 0.7s linear infinite',
      }}
    >
      <style jsx>{`
        @keyframes refery-spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>

      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        aria-hidden
        id={id}
      >
        <circle
          cx="12"
          cy="12"
          r="9"
          stroke={color}
          strokeOpacity="0.2"
          strokeWidth="2.5"
        />
        <path
          d="M21 12a9 9 0 0 0-9-9"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
    </span>
  )
}

function CheckIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 12.5L10 17.5L19 7.5"
        stroke={C.green}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}