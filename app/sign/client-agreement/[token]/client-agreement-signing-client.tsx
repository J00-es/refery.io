'use client'

/**
 * The client agreement sign page, in the desk's own language (lib/desk-ui):
 * cream ground, white cards, DM Sans, one forest accent.
 *
 * Built to be signed on a phone in under two minutes. Three cards, top to
 * bottom: the plan (two search approaches for standard IC hires, the suggested
 * one pre-selected, leadership as a rule underneath), the document (the
 * short-version table open, the full text folded), and the signature (name,
 * title, email, one confirmation). Everything that would distract is folded,
 * not removed: the clauses and the explanation of the two approaches are a tap
 * away, and the clauses are part of what is signed.
 */

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AgreementContent } from '@/components/agreement-content'
import { BTN_PRIMARY, BTN_QUIET, CARD, CHIP_VALUE, FIELD, FIELD_LABEL, FOCUS, H1, META } from '@/lib/desk-ui'

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
  /** Plans on offer when the link lets the signer pick; null when the fee is fixed. */
  fee_options: number[] | null
  /** The document rendered at each option, keyed by the percentage as a string. */
  fee_contents: Record<string, string> | null
  /** True once a choice has been saved on the link; the default is only a default until then. */
  fee_chosen: boolean
  /** Head/Director/VP/C-suite and Staff/Principal minimum on a tiered agreement. */
  leadership_fee_percentage: number | null
  /** Per-client copy: a note from Lily above the options, and the tailored leadership line. */
  page_notes: { from_lily?: string; leadership?: string } | null
  /** The signer names the entity they sign for; the document is bound to that name. */
  entity_editable: boolean
  /** A name already saved on the link, if any. */
  signing_entity: string | null
  status: string
  expires_at: string | null
}

/**
 * The two search approaches for standard individual-contributor hires. The
 * difference is sourcing, not candidate quality. Keyed by percentage so a link
 * offering a negotiated number still renders something sane.
 */
const PLANS: Record<string, { name: string; line: string; more: string }> = {
  '10': {
    name: 'Introductions',
    line: 'Warm introductions from our network. No dedicated sourcing.',
    more: 'Your role goes to our network of scouts, founders and operators, who introduce people they already know and rate. Nobody is assigned to source for the role.',
  },
  '15': {
    name: 'Search',
    line: 'A dedicated recruiter finds, screens and introduces relevant candidates for your role.',
    more: 'A dedicated recruiter is assigned to the role, maps the market, reaches out directly to people who fit, screens them and introduces the relevant ones.',
  },
}

/** `**bold**` only, for the per-client notes. */
function Emphasis({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**') ? (
          <strong key={i} className="font-semibold text-[#161613]">
            {p.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  )
}

/**
 * The document in two parts: everything up to the clauses (title, intro, the
 * short-version table) stays open; the clauses fold. Both halves are the text
 * that gets signed; only the presentation differs.
 */
function splitDocument(content: string): { head: string; tail: string } {
  // The page already carries its own title, so the document's "# Recruitment
  // Services Agreement" line is not drawn twice; the version line under it is.
  const body = content.replace(/^# [^\n]*\n+/, '')
  const marker = ['\n## The details', '\n## Terms'].map(m => body.indexOf(m)).find(i => i >= 0)
  if (marker === undefined) return { head: body, tail: '' }
  return { head: body.slice(0, marker), tail: body.slice(marker + 1) }
}

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
  const [entity, setEntity] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  // The plan picked on the page. Starts on the link's saved or recommended fee.
  const [fee, setFee] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    async function fetchAgreement() {
      try {
        const response = await fetch(`/api/agreements/client/${token}`, { cache: 'no-store' })
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
        setFee(Number(data.fee_percentage))
        setSignerName(data.recipient_name || '')
        setSignerEmail(data.recipient_email || '')
        setEntity(data.signing_entity || '')
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

  // Save the pick straight away so a reload, or a second device, opens on the
  // choice already made rather than the default.
  const choosePlan = (next: number) => {
    setFee(next)
    fetch(`/api/agreements/client/${token}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fee_percent: next }),
    }).catch(() => {})
  }

  const entityEditable = agreement?.entity_editable === true
  const entityOk = !entityEditable || entity.trim().length >= 2
  const canSign = confirmed && entityOk && signerName.trim().length > 1 && /\S+@\S+\.\S+/.test(signerEmail) && !signing

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
          fee_percent: fee,
          signing_entity: entity.trim(),
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        setError(data.error || 'Failed to sign agreement')
        setSigning(false)
        return
      }
      // The confirmation page renders the success state with a fresh signed PDF URL.
      router.push(`/sign/client-agreement/${token}/confirmed`)
    } catch {
      setError('Failed to sign agreement')
      setSigning(false)
    }
  }

  if (loading) return <Shell centered>Loading the agreement…</Shell>
  if (alreadySigned) return <AlreadySigned token={token} />
  if (error && !agreement) return <ErrorShell message={error} />
  if (!agreement) return null

  const feeOptions = agreement.fee_options
  const chosenFee = fee ?? Number(agreement.fee_percentage)
  const rendered =
    feeOptions && agreement.fee_contents?.[String(chosenFee)] ? agreement.fee_contents[String(chosenFee)] : agreement.agreement_content
  // The name the agreement binds. On an editable link the document follows
  // what is typed, and the server re-renders it under that name at signature.
  const boundName = entityEditable ? entity.trim() || 'the entity named below' : agreement.company_name
  const content = entityEditable ? rendered.split(agreement.company_name).join(boundName) : rendered
  const plan = PLANS[String(chosenFee)]

  return (
    <Shell ribbon={`Private link · ${agreement.company_name}`}>
      <div className="mx-auto max-w-[720px] px-4 pb-28 pt-7 sm:px-6 sm:pt-11 lg:pb-16">
        <header>
          <h1 className={H1}>Agreement</h1>
        </header>

        <div className="mt-6 space-y-4">
          {feeOptions && (
            <PlanCard
              options={feeOptions}
              suggested={agreement.fee_chosen ? null : Number(agreement.fee_percentage)}
              value={chosenFee}
              onChange={choosePlan}
              leadershipFee={agreement.leadership_fee_percentage}
              notes={agreement.page_notes}
            />
          )}

          <DocumentCard content={content} />

          <section id="refery-sign-card" className={`${CARD} scroll-mt-6 px-5 py-5 sm:px-7 sm:py-7`} aria-label="Sign">
            <h2 className="text-[20px] font-semibold leading-tight tracking-[-0.02em] text-[#161613]">Sign</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {entityEditable && (
                <div className="sm:col-span-2">
                  <label htmlFor="cas-entity" className={FIELD_LABEL}>
                    Company or entity you&rsquo;re signing for
                  </label>
                  <input id="cas-entity" type="text" autoComplete="organization" value={entity} onChange={e => setEntity(e.target.value)} placeholder="Legal name of the entity" maxLength={160} className={FIELD} />
                </div>
              )}
              <div>
                <label htmlFor="cas-name" className={FIELD_LABEL}>
                  Full name
                </label>
                <input id="cas-name" type="text" autoComplete="name" value={signerName} onChange={e => setSignerName(e.target.value)} placeholder="Your full legal name" className={FIELD} />
              </div>
              <div>
                <label htmlFor="cas-title" className={FIELD_LABEL}>
                  Title
                </label>
                <input id="cas-title" type="text" autoComplete="organization-title" value={signerTitle} onChange={e => setSignerTitle(e.target.value)} placeholder="e.g. Chief Product Officer" className={FIELD} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="cas-email" className={FIELD_LABEL}>
                  Email
                </label>
                <input id="cas-email" type="email" autoComplete="email" value={signerEmail} onChange={e => setSignerEmail(e.target.value)} placeholder="you@company.com" className={FIELD} />
              </div>
            </div>

            <label htmlFor="cas-confirm" className="mt-4 flex cursor-pointer items-start gap-3 rounded-[10px] border border-[#E4E3DC] bg-[#F2F1EB] px-4 py-3.5 text-[14px] leading-relaxed text-[#2A2A26]">
              <input id="cas-confirm" type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="mt-[3px] h-[18px] w-[18px] shrink-0 accent-[#1F3A2F]" />
              <span>
                I&rsquo;ve read it and I&rsquo;m authorised to sign for <strong className="font-semibold text-[#161613]">{entityEditable ? entity.trim() || 'the entity named above' : agreement.company_name}</strong>.
              </span>
            </label>

            {error && (
              <p role="alert" className="mt-3 rounded-[8px] border border-[#E8C9C5] bg-[#F9EBE9] px-3.5 py-2.5 text-[13.5px] text-[#9C3F37]">
                {error}
              </p>
            )}

            <button type="button" onClick={handleSign} disabled={!canSign} className={`${BTN_PRIMARY} mt-4 min-h-[48px] w-full text-[15px]`}>
              {signing ? 'Signing…' : feeOptions && plan ? `Accept · ${plan.name} ${chosenFee}%` : 'Accept agreement'}
            </button>
            <p className={`mt-3 text-center ${META}`}>Binding e-signature (E-SIGN, UETA). Your IP address, browser and the time are recorded with it.</p>
          </section>
        </div>

        <footer className={`mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-[#E4E3DC] pt-5 ${META}`}>
          <span>© {new Date().getFullYear()} Refery</span>
          <a href="mailto:legal@refery.io" className="hover:text-[#1F3A2F]">
            legal@refery.io
          </a>
        </footer>
      </div>

      <JumpToSignBar />
    </Shell>
  )
}

/**
 * Two search approaches, one tap, the suggested one pre-selected until a
 * choice has been saved. Leadership and Staff/Principal hires are not an
 * option here: they carry their own minimum, stated underneath, whichever
 * approach is chosen.
 */
function PlanCard({
  options,
  suggested,
  value,
  onChange,
  leadershipFee,
  notes,
}: {
  options: number[]
  /** Which option to badge as suggested; null once the signer has saved a choice. */
  suggested: number | null
  value: number
  onChange: (fee: number) => void
  leadershipFee: number | null
  notes: { from_lily?: string; leadership?: string } | null
}) {
  return (
    <section className={`${CARD} px-5 py-5 sm:px-7 sm:py-6`} aria-label="Choose your search approach">
      <h2 className="text-[20px] font-semibold leading-tight tracking-[-0.02em] text-[#161613]">Choose your search approach</h2>
      <p className="mt-1 text-[13.5px] text-[#6E6E68]">For standard individual-contributor hires.</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Search approach">
        {options.map(opt => {
          const key = String(opt)
          const plan = PLANS[key] ?? { name: `${opt}% fee`, line: 'Of first-year base salary, per hire.', more: '' }
          const active = value === opt
          const badge = suggested !== null && opt === suggested
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(opt)}
              className={`relative flex min-h-[64px] items-start gap-3 rounded-[14px] border px-4 py-4 text-left transition-[border-color,box-shadow] ${FOCUS} ${
                active ? 'border-[#1F3A2F] bg-white shadow-[0_0_0_1px_#1F3A2F]' : 'border-[#E4E3DC] bg-[#FAF9F5] hover:border-[#D2D1C7]'
              }`}
            >
              {badge && <span className={`${CHIP_VALUE} absolute -top-2.5 left-3.5 px-2 py-1 text-[11px]`}>Suggested</span>}
              <span className="w-[52px] shrink-0 pt-0.5 text-[24px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-[#161613]">{opt}%</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold leading-tight text-[#161613]">{plan.name}</span>
                <span className="mt-1 block text-[13px] leading-snug text-[#6E6E68]">{plan.line}</span>
              </span>
              <span
                aria-hidden
                className={`mt-0.5 h-[18px] w-[18px] shrink-0 rounded-full border ${active ? 'border-[#1F3A2F] bg-[#1F3A2F] shadow-[inset_0_0_0_3px_#fff]' : 'border-[#D2D1C7] bg-white'}`}
              />
            </button>
          )
        })}
      </div>

      <p className="mt-3 text-[13px] text-[#6E6E68]">Pay only when you hire. Fees are based on first-year base salary.</p>

      {notes?.from_lily && (
        <div className="mt-4 border-l-2 border-[#1F3A2F]/30 pl-3.5">
          <p className="text-[12px] font-semibold text-[#9C9C95]">A note from Lily</p>
          <p className="mt-1 text-[14.5px] leading-relaxed text-[#2A2A26]">
            <Emphasis text={notes.from_lily} />
          </p>
        </div>
      )}

      {leadershipFee && (
        <div className="mt-4 border-t border-[#E9E8E1] pt-4">
          <p className="text-[13.5px] font-semibold text-[#161613]">Leadership &amp; specialist hires · {leadershipFee}% minimum</p>
          <p className="mt-1 text-[13px] leading-relaxed text-[#6E6E68]">
            Head, Director, VP, C-suite and Staff/Principal hires are {leadershipFee}%, whichever option you choose. Any higher rate must be agreed in writing before the search starts.
          </p>
          {notes?.leadership && <p className="mt-1.5 text-[13.5px] font-semibold text-[#161613]">{notes.leadership}</p>}
        </div>
      )}

      <details className="mt-2">
        <summary className={`flex min-h-[40px] cursor-pointer list-none items-center gap-2 text-[13.5px] font-semibold text-[#1F3A2F] [&::-webkit-details-marker]:hidden ${FOCUS}`}>
          <Chevron />
          What&rsquo;s the difference?
        </summary>
        <div className="grid gap-2.5 pb-1 pt-1 text-[13.5px] leading-relaxed text-[#2A2A26]">
          {options.map(opt => {
            const plan = PLANS[String(opt)]
            if (!plan?.more) return null
            return (
              <p key={opt}>
                <strong className="font-semibold text-[#161613]">
                  {opt}% {plan.name}.
                </strong>{' '}
                {plan.more}
              </p>
            )
          })}
          {leadershipFee && (
            <p>
              <strong className="font-semibold text-[#161613]">Leadership &amp; specialist.</strong> Head, Director, VP, C-suite and Staff/Principal hires are {leadershipFee}% minimum whichever approach you choose. Any higher rate is agreed in writing before the search starts.
            </p>
          )}
        </div>
      </details>
    </section>
  )
}

/** The short version open, the clauses a tap away. Both are the signed text. */
function DocumentCard({ content }: { content: string }) {
  const { head, tail } = useMemo(() => splitDocument(content), [content])
  return (
    <section className={`${CARD} px-5 py-5 sm:px-7 sm:py-6`} aria-label="The agreement">
      <AgreementContent content={head} density="compact" showEyebrow={false} />
      {tail && (
        <details className="mt-1 border-t border-[#E9E8E1] pt-2">
          <summary className={`flex min-h-[44px] cursor-pointer list-none items-center gap-2 text-[13.5px] font-semibold text-[#1F3A2F] [&::-webkit-details-marker]:hidden ${FOCUS}`}>
            <Chevron />
            Read the full text
          </summary>
          <div className="pt-1">
            <AgreementContent content={tail} density="compact" showEyebrow={false} />
          </div>
        </details>
      )}
    </section>
  )
}

function Chevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3.5 6l4.5 4.5L12.5 6" />
    </svg>
  )
}

/**
 * Phone-only bar pinned to the bottom of the screen. The signature card is a
 * scroll away, so it would otherwise be invisible until the very end. Hides
 * itself once the card is on screen.
 */
function JumpToSignBar() {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const target = document.getElementById('refery-sign-card')
    if (!target) return
    const observer = new IntersectionObserver(([entry]) => setVisible(!entry.isIntersecting), { rootMargin: '-20% 0px 0px 0px' })
    observer.observe(target)
    return () => observer.disconnect()
  }, [])
  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-30 border-t border-[#E4E3DC] bg-[#FAF9F5]/95 px-4 py-2.5 backdrop-blur transition-transform lg:hidden print:hidden ${visible ? 'translate-y-0' : 'pointer-events-none translate-y-full'}`}
    >
      <button type="button" className={`${BTN_PRIMARY} w-full`} onClick={() => document.getElementById('refery-sign-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
        Go to signature ↓
      </button>
    </div>
  )
}

/* ── shells ─────────────────────────────────────────────────────────── */

function Shell({ children, ribbon, centered }: { children: React.ReactNode; ribbon?: string; centered?: boolean }) {
  return (
    // Always the cream page, whatever the reader's OS theme: every colour here
    // is a fixed value, and colorScheme keeps the native inputs light too.
    <div className="min-h-screen bg-[#F2F1EB] text-[#161613]" style={{ colorScheme: 'light' }}>
      <div className="border-b border-[#E4E3DC] bg-white">
        <div className="mx-auto flex max-w-[1120px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <a href="https://refery.io" className="text-[19px] font-semibold tracking-[-0.02em] text-[#161613]">
            Refery.
          </a>
          {ribbon && <span className={`truncate ${META}`}>{ribbon}</span>}
        </div>
      </div>
      {centered ? <div className="flex min-h-[60vh] items-center justify-center px-4 text-[14px] text-[#9C9C95]">{children}</div> : children}
    </div>
  )
}

function ErrorShell({ message }: { message: string }) {
  return (
    <Shell>
      <div className="mx-auto max-w-[520px] px-4 py-24 text-center">
        <h1 className={H1}>We couldn&rsquo;t load this agreement</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-[#2A2A26]">{message}</p>
        <a href="mailto:legal@refery.io" className={`${BTN_QUIET} mt-6`}>
          Write to legal@refery.io
        </a>
      </div>
    </Shell>
  )
}

function AlreadySigned({ token }: { token: string }) {
  // Signed before the reader landed, so bounce to the confirmation page for a
  // consistent success view.
  return (
    <Shell centered>
      <meta httpEquiv="refresh" content={`0; url=/sign/client-agreement/${token}/confirmed`} />
      Already signed. Taking you to the confirmation…
    </Shell>
  )
}
