import { Metadata } from 'next'
import Link from 'next/link'
import { format } from 'date-fns'
import { createAdminClient } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: 'Agreement signed | Refery',
  description: 'Your Refery services agreement has been signed',
}

export const dynamic = 'force-dynamic'

const C = {
  bg: '#F8F8F3',
  card: '#FFFFFF',
  ink: '#100F0F',
  ink2: 'rgba(16,15,15,0.64)',
  ink3: 'rgba(16,15,15,0.40)',
  green: '#2A6B45',
  greenBg: '#EBF4EF',
  greenBorder: 'rgba(42,107,69,0.20)',
  border: 'rgba(16,15,15,0.10)',
  borderSoft: 'rgba(16,15,15,0.06)',
}

const SERIF = "'Instrument Serif', Georgia, 'Times New Roman', serif"
const SANS = "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"

const PDF_TTL_SECONDS = 60 * 60 * 24 * 7 // 7-day signed download URL

export default async function ConfirmedPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const adminClient = createAdminClient()

  const { data: link } = await adminClient
    .from('client_agreement_links')
    .select('id, company_name, agreement_version, signed_at, status')
    .eq('token', token)
    .maybeSingle()

  if (!link) return <NotFound />

  let signature: {
    id: string
    signer_name: string
    signer_email: string
    signed_at: string
    pdf_url: string | null
  } | null = null

  if (link.status === 'signed') {
    const { data: sig } = await adminClient
      .from('client_agreement_signatures')
      .select('id, signer_name, signer_email, signed_at, pdf_url')
      .eq('link_id', link.id)
      .order('signed_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    signature = sig
  }

  let downloadUrl: string | null = null
  if (signature?.pdf_url) {
    const { data: signed } = await adminClient.storage
      .from('signed-agreements')
      .createSignedUrl(signature.pdf_url, PDF_TTL_SECONDS)
    downloadUrl = signed?.signedUrl || null
  }

  if (!signature) return <NotYetSigned token={token} />

  return (
    <Shell>
      <main
        style={{
          maxWidth: 640,
          margin: '0 auto',
          padding: '80px 32px 96px',
          textAlign: 'center',
        }}
      >
        <CheckBadge />

        <h1
          style={{
            fontFamily: SERIF,
            fontWeight: 400,
            fontSize: 'clamp(36px, 5vw, 52px)',
            lineHeight: 1.04,
            letterSpacing: '-0.02em',
            color: C.ink,
            margin: '0 0 14px 0',
          }}
        >
          Agreement signed
          <em style={{ fontStyle: 'italic', color: C.green }}>.</em>
        </h1>

        <p
          style={{
            fontSize: 17,
            lineHeight: 1.6,
            color: C.ink2,
            margin: '0 auto 32px',
            maxWidth: 480,
            fontFamily: SANS,
          }}
        >
          A copy has been sent to{' '}
          <strong style={{ color: C.ink, fontWeight: 600 }}>
            {signature.signer_email}
          </strong>
          . Welcome to Refery.
        </p>

        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            padding: '22px 26px',
            textAlign: 'left',
            fontSize: 13,
            color: C.ink2,
            maxWidth: 480,
            margin: '0 auto 28px',
            fontFamily: SANS,
          }}
        >
          <Row label="Company" value={link.company_name} />
          <Divider />
          <Row label="Signer" value={signature.signer_name} />
          <Divider />
          <Row
            label="Signed at"
            value={format(new Date(signature.signed_at), "MMM d, yyyy 'at' HH:mm 'UTC'")}
          />
          <Divider />
          <Row label="Version" value={`v${link.agreement_version}`} />
        </div>

        {downloadUrl ? (
          <a href={downloadUrl} className="refery-cta-confirm" style={{ textDecoration: 'none' }}>
            Download signed PDF &rarr;
          </a>
        ) : (
          <p style={{ fontSize: 13, color: C.ink3, fontFamily: SANS }}>
            Your PDF is being generated. Check your email in a moment.
          </p>
        )}

        <div
          style={{
            marginTop: 36,
            fontSize: 13,
            color: C.ink3,
            fontFamily: SANS,
          }}
        >
          Questions?{' '}
          <a
            href="mailto:legal@refery.io"
            style={{ color: C.green, textDecoration: 'none' }}
          >
            legal@refery.io
          </a>
        </div>
      </main>
      <CtaStyles />
    </Shell>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 12,
        padding: '10px 0',
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
          fontSize: 13.5,
          color: C.ink,
          textAlign: 'right',
          fontFamily: SANS,
        }}
      >
        {value}
      </span>
    </div>
  )
}

function Divider() {
  return <div style={{ height: 1, background: C.borderSoft }} />
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: C.bg,
        fontFamily: SANS,
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
      }}
    >
      <nav
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: 'rgba(248,248,243,0.88)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: `1px solid ${C.border}`,
          display: 'flex',
          alignItems: 'center',
          padding: '0 28px',
          height: 58,
        }}
      >
        <a
          href="https://refery.io"
          style={{
            fontFamily: SERIF,
            fontSize: 20,
            color: C.ink,
            textDecoration: 'none',
          }}
        >
          Refery
          <em style={{ fontStyle: 'italic', color: C.green }}>.</em>
        </a>
      </nav>
      {children}
    </div>
  )
}

function CheckBadge() {
  return (
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
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <path
          d="M5 12.5L10 17.5L19 7.5"
          stroke={C.green}
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}

function CtaStyles() {
  return (
    <style>{`
      .refery-cta-confirm {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: ${C.ink};
        color: #fff;
        font-family: ${SANS};
        font-size: 15px;
        font-weight: 500;
        padding: 14px 28px;
        border-radius: 6px;
        border: 1px solid ${C.ink};
        cursor: pointer;
        transition: opacity 0.15s ease;
      }
      .refery-cta-confirm:hover { opacity: 0.92; }
    `}</style>
  )
}

function NotFound() {
  return (
    <Shell>
      <main style={{ maxWidth: 520, margin: '0 auto', padding: '120px 32px', textAlign: 'center' }}>
        <h1
          style={{
            fontFamily: SERIF,
            fontWeight: 400,
            fontSize: 36,
            color: C.ink,
            margin: '0 0 12px 0',
          }}
        >
          Agreement not found
        </h1>
        <p style={{ color: C.ink2, fontSize: 16 }}>
          The link may have expired or been revoked.
        </p>
      </main>
    </Shell>
  )
}

function NotYetSigned({ token }: { token: string }) {
  return (
    <Shell>
      <main style={{ maxWidth: 520, margin: '0 auto', padding: '120px 32px', textAlign: 'center' }}>
        <h1
          style={{
            fontFamily: SERIF,
            fontWeight: 400,
            fontSize: 36,
            color: C.ink,
            margin: '0 0 12px 0',
          }}
        >
          Not signed yet
        </h1>
        <p style={{ color: C.ink2, fontSize: 16, marginBottom: 24 }}>
          This agreement is ready, but no signature has been recorded.
        </p>
        <Link
          href={`/sign/client-agreement/${token}`}
          style={{
            color: C.green,
            textDecoration: 'none',
            borderBottom: `1px solid ${C.green}`,
            paddingBottom: 1,
          }}
        >
          Go to the signing page
        </Link>
      </main>
    </Shell>
  )
}
