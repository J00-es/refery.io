'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { format } from 'date-fns'
import { useRouter } from 'next/navigation'
import { AgreementContent } from '@/components/agreement-content'

/* ----------------------------------------------------------------------------
 * Refery brand tokens, kept identical to the partner sign page so this looks
 * like a sibling document, not a different product.
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
  company_name: string
  recipient_name: string | null
  recipient_email: string | null
  agreement_version: string
  agreement_content: string
  agreement_hash?: string
  fee_percentage: number
  fee_percent_display: string
  status: string
  expires_at: string | null
}

/* ----------------------------------------------------------------------------
 * Main component
 * -------------------------------------------------------------------------- */
export function ClientAgreementSigningClient({ token }: { token: string }) {
  const router = useRouter()
  const [agreement, setAgreement] = useState<AgreementData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [signing, setSigning] = useState(false)
  const [alreadySigned, setAlreadySigned] = useState(false)

  const [signerName, setSignerName] = useState('')
  const [signerTitle, setSignerTitle] = useState('')
  const [signerEmail, setSignerEmail] = useState('')
  const [authorized, setAuthorized] = useState(false)
  const [readAgreement, setReadAgreement] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function fetchAgreement() {
      try {
        const response = await fetch(`/api/agreements/client/${token}`, {
          cache: 'no-store',
        })
        const data = await response.json()
        if (cancelled) return

        if (!response.ok) {
          setError(data.error || 'Failed to load agreement')
          if (data.signed_at || data.already_signed) setAlreadySigned(true)
          return
        }
        if (data.already_signed) {
          setAlreadySigned(true)
          return
        }

        setAgreement(data)
        setSignerName(data.recipient_name || '')
        setSignerEmail(data.recipient_email || '')
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
    if (!canSign) return
    setSigning(true)
    setError(null)

    try {
      const response = await fetch(`/api/agreements/client/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signer_name: signerName,
          signer_title: signerTitle,
          signer_email: signerEmail,
          accepted: true,
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Failed to sign agreement')
        setSigning(false)
        return
      }

      // Redirect to the confirmation page. The server component renders the
      // full success state with a fresh signed PDF URL.
      router.push(`/sign/client-agreement/${token}/confirmed`)
    } catch {
      setError('Failed to sign agreement')
      setSigning(false)
    }
  }

  const canSign =
    authorized &&
    readAgreement &&
    signerName.trim().length > 1 &&
    /\S+@\S+\.\S+/.test(signerEmail) &&
    !signing

  if (loading) return <ShellLoading />
  if (alreadySigned) return <ShellAlreadySigned token={token} />
  if (error && !agreement) return <ShellError message={error} />
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
        />

        <RecipientCard agreement={agreement} />

        <DocumentCard content={agreement.agreement_content} />

        <div id="refery-sign-card">
        <SignCard
          companyName={agreement.company_name}
          signerName={signerName}
          signerTitle={signerTitle}
          signerEmail={signerEmail}
          authorized={authorized}
          readAgreement={readAgreement}
          signing={signing}
          canSign={canSign}
          error={error}
          onSignerNameChange={setSignerName}
          onSignerTitleChange={setSignerTitle}
          onSignerEmailChange={setSignerEmail}
          onAuthorizedChange={setAuthorized}
          onReadChange={setReadAgreement}
          onSign={handleSign}
        />
        </div>

        <Footer />
      </main>

      <JumpToSignBar />
    </PageShell>
  )
}

/**
 * Mobile-only bar pinned to the bottom of the viewport. The document is a
 * scroll away from the button, so on a phone the action would otherwise be
 * invisible until the very end. Hides itself once the sign card is on screen.
 */
function JumpToSignBar() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const target = document.getElementById('refery-sign-card')
    if (!target) return

    const observer = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting),
      { rootMargin: '-20% 0px 0px 0px' },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      className="refery-jumpbar"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 60,
        padding: '12px 16px calc(12px + env(safe-area-inset-bottom))',
        background: 'rgba(242,241,235,0.94)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderTop: `1px solid ${C.border}`,
        transform: visible ? 'translateY(0)' : 'translateY(120%)',
        transition: 'transform 0.25s ease',
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      <button
        type="button"
        className="refery-cta"
        style={{ width: '100%' }}
        onClick={() =>
          document
            .getElementById('refery-sign-card')
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      >
        Go to signature &darr;
      </button>
    </div>
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
        font-family: var(--font-dm-sans), 'DM Sans', system-ui, sans-serif;
        color: ${C.ink};
        background: #fff;
        border: 1px solid ${C.border};
        border-radius: 8px;
        outline: none;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
      }
      .refery-input::placeholder { color: ${C.ink3}; }
      .refery-input:hover { border-color: rgba(22,22,19,0.18); }
      .refery-input:focus {
        border-color: ${C.green};
        box-shadow: 0 0 0 3px rgba(31,58,47,0.12);
      }
      .refery-cta {
        background: ${C.ink};
        color: #fff;
        font-family: var(--font-dm-sans), 'DM Sans', system-ui, sans-serif;
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
      .refery-cta:hover:not(:disabled) { opacity: 0.92; }
      .refery-cta:active:not(:disabled) { transform: translateY(1px); }
      .refery-cta:disabled { opacity: 0.4; cursor: not-allowed; }
      .refery-check {
        appearance: none;
        -webkit-appearance: none;
        width: 18px; height: 18px; margin: 0;
        border: 1.5px solid ${C.ink4}; border-radius: 4px;
        background: #fff; cursor: pointer; flex-shrink: 0;
        position: relative;
        transition: border-color 0.15s ease, background 0.15s ease;
      }
      .refery-check:hover { border-color: ${C.ink3}; }
      .refery-check:checked { background: ${C.green}; border-color: ${C.green}; }
      .refery-check:checked::after {
        content: '';
        position: absolute; left: 5px; top: 1px;
        width: 5px; height: 10px;
        border: solid #fff; border-width: 0 2px 2px 0;
        transform: rotate(45deg);
      }
      .refery-check:focus-visible {
        box-shadow: 0 0 0 3px rgba(31,58,47,0.18);
      }
      .refery-jumpbar { display: none; }
      @media (max-width: 640px) {
        .refery-main { padding: 28px 16px 92px !important; }
        .refery-card { padding: 18px !important; }
        .refery-doc-pad { padding: 24px 18px !important; }
        .refery-recipient-grid { grid-template-columns: 1fr !important; gap: 14px !important; }
        .refery-form-grid { grid-template-columns: 1fr !important; }
        /* 16px keeps iOS Safari from zooming the page when a field is focused. */
        .refery-input { font-size: 16px !important; padding: 13px 14px !important; }
        .refery-cta { min-height: 52px; }
        /* Bigger tap targets for the two confirmations. */
        .refery-check { width: 22px !important; height: 22px !important; }
        .refery-check:checked::after { left: 7px !important; top: 3px !important; }
        .refery-jumpbar { display: block; }
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
        Services Agreement
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
      </div>
    </footer>
  )
}

/* ============================================================================
 * Page sections
 * ========================================================================== */
function Hero({ version }: { version: string }) {
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
        Recruitment Services Agreement · v{version}
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
        It&rsquo;s about a minute to read, and there&rsquo;s nothing hidden in it.
        Add your details at the bottom and a signed PDF lands in your inbox the
        moment you accept.
      </p>
    </section>
  )
}

function RecipientCard({ agreement }: { agreement: AgreementData }) {
  const expires = agreement.expires_at
    ? format(new Date(agreement.expires_at), 'MMM d, yyyy')
    : 'No expiry'
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
          gridTemplateColumns: '1fr 1fr',
          gap: 20,
        }}
      >
        <Field label="Company" value={agreement.company_name} />
        <Field label="Expires" value={expires} />
      </div>
    </div>
  )
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
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
  companyName: string
  signerName: string
  signerTitle: string
  signerEmail: string
  authorized: boolean
  readAgreement: boolean
  signing: boolean
  canSign: boolean
  error: string | null
  onSignerNameChange: (v: string) => void
  onSignerTitleChange: (v: string) => void
  onSignerEmailChange: (v: string) => void
  onAuthorizedChange: (v: boolean) => void
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
          Confirm your details and accept the terms to activate your engagement.
        </p>
      </div>

      <div
        className="refery-form-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 16,
          marginBottom: 16,
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
          label="Title"
          input={
            <input
              className="refery-input"
              type="text"
              value={props.signerTitle}
              onChange={(e) => props.onSignerTitleChange(e.target.value)}
              placeholder={`e.g. Head of Talent, ${props.companyName}`}
              autoComplete="organization-title"
            />
          }
        />
      </div>

      <div style={{ marginBottom: 22 }}>
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
          id="cas-read-confirm"
        >
          I&rsquo;ve read the agreement above and understand it.
        </CheckRow>

        <div style={{ height: 1, background: C.borderSoft }} />

        <CheckRow
          checked={props.authorized}
          onChange={props.onAuthorizedChange}
          id="cas-auth-confirm"
        >
          I&rsquo;m 18 or older and authorized to sign for{' '}
          <strong style={{ color: C.ink, fontWeight: 600 }}>
            {props.companyName}
          </strong>
          . My electronic signature counts the same as signing by hand.
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
        you create a legally binding electronic signature under the E-SIGN Act
        and UETA. Your IP address, browser, and timestamp are recorded as part
        of the signing record.
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

function FormField({ label, input }: { label: string; input: ReactNode }) {
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
 * Loading / Error / Already-signed states
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
        <p style={{ color: C.ink2, fontSize: 16, lineHeight: 1.6, margin: '0 0 24px 0' }}>
          {message}
        </p>
        <a
          href="mailto:legal@refery.io"
          style={{
            display: 'inline-block',
            color: C.green,
            fontWeight: 500,
            textDecoration: 'none',
            borderBottom: `1px solid ${C.green}`,
            paddingBottom: 1,
          }}
        >
          Contact legal@refery.io
        </a>
      </div>
    </PageShell>
  )
}

function ShellAlreadySigned({ token }: { token: string }) {
  // Already signed before the user landed, so bounce to the confirmation page
  // for a consistent success view.
  return (
    <PageShell>
      <BrandStyles />
      <meta httpEquiv="refresh" content={`0; url=/sign/client-agreement/${token}/confirmed`} />
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Spinner size={28} color={C.ink3} />
      </div>
    </PageShell>
  )
}

/* ============================================================================
 * Tiny icons
 * ========================================================================== */
function Spinner({ size = 16, color = '#fff' }: { size?: number; color?: string }) {
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
          to { transform: rotate(360deg); }
        }
      `}</style>
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden id={id}>
        <circle cx="12" cy="12" r="9" stroke={color} strokeOpacity="0.2" strokeWidth="2.5" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    </span>
  )
}
