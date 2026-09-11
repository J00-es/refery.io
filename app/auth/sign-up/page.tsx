'use client'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { PARTNER_TERMS_TEXT, AGREEMENT_VERSIONS } from '@/lib/agreements'
import { EMPTY_PREFERENCES, PreferencesFields, preferencesComplete, type PreferencesValue } from '@/components/onboarding/preferences-fields'
import { AgreementContent } from '@/components/agreement-content'
import { emailProblem, isPlausibleEmail } from '@/lib/email-format'

type Role = 'scout' | 'recruiter'
/**
 * What the person picks, which is not quite the same as the role stored.
 *
 * A firm's signer is a recruiter account like any other: the difference is the
 * entity they bind and the addendum they accept, not their permissions. Keeping
 * "firm" out of Role means nothing downstream has to learn a fourth role.
 */
type SignupKind = 'scout' | 'recruiter' | 'firm'
type Step = 1 | 2 | 3 | 4

const roleForKind = (k: SignupKind): Role => (k === 'firm' ? 'recruiter' : k)

type AccountState = 'none' | 'pending' | 'partner' | 'in_firm' | 'not_partner'
interface KnownAccount {
  state: AccountState
  firmName?: string | null
  firstName?: string | null
}

/**
 * The firm details, parked so they survive a trip through the login screen.
 *
 * sessionStorage rather than a query string: this is a company's registered
 * name and number, and it has no business sitting in a URL, in history, or in
 * a server log. It is read once by /firm/new and cleared.
 */
const DRAFT_KEY = 'refery_firm_draft'

function parkFirmDraft(draft: Record<string, string>) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  } catch {
    // A blocked storage costs them retyping six fields, not the flow.
  }
}

const ROLE_OPTIONS: Array<{
  value: SignupKind
  title: string
  description: string
}> = [
  {
    value: 'scout',
    title: 'Scout',
    description: 'You have a great network and want to share talented people you know.',
  },
  {
    value: 'recruiter',
    title: 'Recruiting Partner',
    description: 'A professional recruiter or independent talent partner looking to collaborate.',
  },
  {
    value: 'firm',
    title: 'Recruiting Firm',
    description: 'One authorised person signs the commercial agreement for your company. Each colleague accepts short team-access terms when joining.',
  },
]

// Simple deterministic hash so client and server agree on the agreement_hash value.
function generateAgreementHash(text: string): string {
  let hash = 0
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(16)
}

// Scouts and recruiters accept the same Partner Terms. The account still records
// which of the two they joined as, so nothing downstream loses that distinction.
function getAgreementForRole(role: Role): { text: string; version: string; type: string } | null {
  if (role === 'scout' || role === 'recruiter') {
    return {
      text: PARTNER_TERMS_TEXT,
      version: AGREEMENT_VERSIONS.partner,
      type: role,
    }
  }
  return null
}

/**
 * One id per visit, so the funnel can tell "the same person reached step 3"
 * from "three people reached step 1". Kept in sessionStorage, never sent
 * anywhere except our own beacon.
 */
function signupSessionId(): string {
  if (typeof window === 'undefined') return 'ssr'
  try {
    const KEY = 'refery_signup_session'
    let id = sessionStorage.getItem(KEY)
    if (!id) {
      id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
      sessionStorage.setItem(KEY, id)
    }
    return id
  } catch {
    return `nostore-${Math.random().toString(36).slice(2, 10)}`
  }
}

type TrackStep =
  | 'page_view'
  | 'role_selected'
  | 'details_completed'
  | 'agreement_viewed'
  | 'completed'
  | 'failed'

function track(step: TrackStep, data: Record<string, unknown> = {}) {
  try {
    void fetch('/api/signup/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step, session_id: signupSessionId(), ...data }),
      keepalive: true,
    }).catch(() => {})
  } catch {
    /* telemetry must never interrupt sign-up */
  }
}

export default function Page() {
  const router = useRouter()
  const [step, setStep] = useState<Step>(1)
  const [selectedKind, setSelectedKind] = useState<SignupKind | ''>('')
  const selectedRole: Role | '' = selectedKind ? roleForKind(selectedKind) : ''
  const isFirm = selectedKind === 'firm'
  // The entity, collected in the same breath as the person who signs for it.
  const [firmName, setFirmName] = useState('')
  const [firmLegalName, setFirmLegalName] = useState('')
  const [firmJurisdiction, setFirmJurisdiction] = useState('')
  const [firmCompanyNumber, setFirmCompanyNumber] = useState('')
  const [signerTitle, setSignerTitle] = useState('')
  const [firmBillingEmail, setFirmBillingEmail] = useState('')
  // Setting the firm up and binding it are two acts, and often two people. The
  // champion who brings Refery in is frequently not the one who can sign.
  const [signerSelf, setSignerSelf] = useState(true)
  const [nomineeName, setNomineeName] = useState('')
  const [nomineeEmail, setNomineeEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [linkedinUrl, setLinkedinUrl] = useState('')
  const [password, setPassword] = useState('')
  const [repeatPassword, setRepeatPassword] = useState('')
  const [acceptedAgreement, setAcceptedAgreement] = useState(false)
  const [hasScrolledAgreement, setHasScrolledAgreement] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  /**
   * What we found out about this email, and what to offer because of it.
   *
   * Held rather than thrown, because every one of these states has a way
   * forward and the old behaviour had none.
   */
  const [known, setKnown] = useState<KnownAccount | null>(null)
  const [prefs, setPrefs] = useState<PreferencesValue>(EMPTY_PREFERENCES)
  const [inviteToken, setInviteToken] = useState<string | null>(null)
  const [invited, setInvited] = useState(false)

  /**
   * Arriving from an approval email: the token prefills what the person
   * already told us on the application, and the account is active the moment
   * it exists. Read from the URL directly so the page needs no Suspense.
   */
  useEffect(() => {
    let token: string | null = null
    try {
      token = new URLSearchParams(window.location.search).get('invite')
    } catch {
      token = null
    }
    if (!token) return
    setInviteToken(token)
    fetch(`/api/invite/prefill?token=${encodeURIComponent(token)}`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (!data) return
        setFullName(prev => prev || data.fullName || '')
        setEmail(prev => prev || data.email || '')
        setLinkedinUrl(prev => prev || data.linkedinUrl || '')
        setSelectedKind(prev => prev || data.kind || 'scout')
        if (data.preferences) setPrefs(p => ({ ...p, ...data.preferences }))
        setInvited(true)
      })
      .catch(() => {})
  }, [])
  const [checking, setChecking] = useState(false)
  /** Somebody who is already signed in and does not need this form at all. */
  const [signedInAs, setSignedInAs] = useState<string | null>(null)

  const agreement = selectedRole ? getAgreementForRole(selectedRole as Role) : null

  useEffect(() => {
    track('page_view')
  }, [])

  /**
   * Recognise a session before they type anything.
   *
   * A partner reaches this page constantly: a link from the guide, an old
   * bookmark, habit. Letting them fill the form and then telling them the
   * account exists is the same wall, reached more slowly.
   */
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const { createClient } = await import('@/lib/supabase/client')
        const { data } = await createClient().auth.getUser()
        if (!cancelled && data.user?.email) setSignedInAs(data.user.email)
      } catch {
        // No session, or the check failed. Either way the form still works.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const handleNextFromRole = () => {
    setError(null)
    if (!selectedKind) {
      setError('Please select your role to continue')
      return
    }
    track('role_selected', { role: selectedKind })
    setStep(2)
  }

  /**
   * Recognises an existing account before anything is spent on the form.
   *
   * Runs on the way out of the details step rather than on every keystroke: one
   * request per attempt, and by then the address is complete enough to mean
   * something.
   */
  async function checkAccount(): Promise<KnownAccount | null> {
    setChecking(true)
    try {
      const res = await fetch('/api/auth/account-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) return null
      const data = (await res.json()) as KnownAccount
      return data.state === 'none' ? null : data
    } catch {
      // If the check fails we simply carry on and let sign-up answer. Worse
      // experience, still not a dead end.
      return null
    } finally {
      setChecking(false)
    }
  }

  const handleNextFromDetails = async () => {
    setError(null)
    if (!fullName.trim()) {
      setError('Please enter your full legal name')
      return
    }
    // The shape of the address, not just its presence. Supabase rejects a
    // bad one with a message that names no field, two steps from here.
    const emailIssue = emailProblem(email, 'your email')
    if (emailIssue) {
      setError(emailIssue)
      return
    }
    if (!linkedinUrl.trim()) {
      setError('LinkedIn profile URL is required')
      return
    }
    if (!linkedinUrl.includes('linkedin.com')) {
      setError('Please enter a valid LinkedIn URL')
      return
    }
    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    if (password !== repeatPassword) {
      setError('Passwords do not match')
      return
    }
    if (isFirm && !firmName.trim()) {
      setError('Please enter your firm name')
      return
    }
    if (isFirm && !firmLegalName.trim()) {
      setError('Please enter the registered legal entity')
      return
    }
    if (isFirm && !signerSelf && !nomineeName.trim()) {
      setError('Please enter the name of the person who can sign')
      return
    }
    if (isFirm && !signerSelf) {
      const nomineeIssue = emailProblem(nomineeEmail, 'the email of the person who can sign')
      if (nomineeIssue) {
        setError(nomineeIssue)
        return
      }
    }
    if (isFirm && firmBillingEmail.trim() && !isPlausibleEmail(firmBillingEmail)) {
      setError(emailProblem(firmBillingEmail, 'the billing email'))
      return
    }
    // Before the terms, not after them.
    const found = await checkAccount()
    if (found) {
      if (isFirm) {
        parkFirmDraft({
          name: firmName,
          legal_name: firmLegalName,
          jurisdiction: firmJurisdiction,
          company_number: firmCompanyNumber,
          signer_title: signerTitle,
          billing_email: firmBillingEmail,
          signer_self: signerSelf ? 'yes' : 'no',
          signer_name: nomineeName,
          signer_email: nomineeEmail,
        })
      }
      setKnown(found)
      return
    }

    const who = {
      role: selectedRole,
      email,
      full_name: fullName,
      linkedin_url: linkedinUrl,
    }
    track('details_completed', who)
    setStep(3)
  }

  const handleNextFromPreferences = () => {
    setError(null)
    if (!preferencesComplete(prefs)) {
      setError('Pick at least one city and one kind of people, so we know what to suggest')
      return
    }
    // The terms are the last step, so reaching them is the moment worth announcing.
    track('agreement_viewed', { role: selectedRole, email, full_name: fullName, linkedin_url: linkedinUrl })
    setStep(4)
  }

  const handleSubmit = async () => {
    setError(null)

    if (signerSelf && !acceptedAgreement) {
      setError('Please accept the agreement to continue')
      return
    }

    setIsLoading(true)
    try {
      const payload: Record<string, unknown> = {
        email,
        password,
        fullName,
        linkedinUrl,
        role: selectedRole,
        preferences: prefs,
        invite: inviteToken,
      }

      // A firm is created by the sign-up handler itself. It cannot be done from
      // the browser afterwards: sign-up sends a verification email and leaves no
      // session, so there is nobody to authenticate a second call as.
      if (isFirm) {
        payload.firm = {
          name: firmName,
          legal_name: firmLegalName,
          jurisdiction: firmJurisdiction,
          company_number: firmCompanyNumber,
          signer_title: signerTitle,
          billing_email: firmBillingEmail,
          signer_self: signerSelf,
          signer_name: nomineeName,
          signer_email: nomineeEmail,
        }
      }

      if (agreement && acceptedAgreement) {
        payload.agreement = {
          version: agreement.version,
          type: agreement.type,
          hash: generateAgreementHash(agreement.text),
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        }
      }

      const res = await fetch('/api/auth/sign-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) {
        // A rejected address is fixed on the details step, not here: the box
        // is two steps back and the last step never shows what was typed.
        if (data.field === 'email' || data.field === 'signer_email') {
          setKnown(null)
          setStep(2)
        }
        throw new Error(data.error || 'Sign up failed')
      }

      track('completed', {
        role: selectedKind,
        email,
        full_name: fullName,
        linkedin_url: linkedinUrl,
      })

      try {
        localStorage.setItem('pendingVerificationEmail', email)
      } catch {
        // ignore storage errors
      }

      router.push(data.approved ? '/auth/sign-up-success?approved=1' : '/auth/sign-up-success')
    } catch (err: unknown) {
      track('failed', { role: selectedKind, email })
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  // When agreement scroll reaches near bottom, allow checkbox
  const handleAgreementScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) {
      setHasScrolledAgreement(true)
    }
  }

  return (
    <div className="flex min-h-svh w-full items-start sm:items-center justify-center p-4 sm:p-6 md:p-10 bg-muted/30">
      <div className="w-full max-w-xl">
        <div className="flex flex-col gap-4 sm:gap-6">
          <div className="text-center mb-1 sm:mb-2">
            <Link href="/" className="font-semibold text-xl sm:text-2xl text-foreground">
              Refery<span className="text-green-500">.</span>
            </Link>
          </div>

          {/* Stepper */}
          <ol className="flex items-center justify-center gap-2 text-xs">
            {[1, 2, 3, 4].map((n) => (
              <li key={n} className="flex items-center gap-2">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full font-medium ${
                    step === n
                      ? 'bg-primary text-primary-foreground'
                      : step > n
                        ? 'bg-primary/15 text-primary'
                        : 'bg-muted text-muted-foreground'
                  }`}
                  aria-current={step === n ? 'step' : undefined}
                >
                  {step > n ? <Check className="h-3.5 w-3.5" /> : n}
                </span>
                {n < 4 && (
                  <span className={`h-px w-8 ${step > n ? 'bg-primary/40' : 'bg-border'}`} />
                )}
              </li>
            ))}
          </ol>

          <Card className="border-0 sm:border shadow-lg sm:shadow-md">
            {signedInAs && step === 1 && (
              <div className="px-4 sm:px-6 pt-5">
                <div className="rounded-lg border bg-muted/30 p-4">
                  <p className="text-sm font-medium text-foreground">
                    You are already signed in as {signedInAs}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    You do not need a second account. If you want to work as a firm, set it up on the
                    one you have and keep all your candidates and history.
                  </p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <Button asChild size="sm" className="h-10">
                      <Link href="/firm">Set up your firm</Link>
                    </Button>
                    <Button asChild size="sm" variant="outline" className="h-10">
                      <Link href="/candidates">Go to your candidates</Link>
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {step === 1 && (
              <>
                <CardHeader className="pb-4 sm:pb-6 px-4 sm:px-6">
                  <CardTitle className="text-xl sm:text-2xl">Welcome to Refery</CardTitle>
                  <CardDescription className="text-sm">
                    Let&apos;s start with what best describes you.
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-4 sm:px-6 pb-6">
                  <div role="radiogroup" aria-label="What best describes you" className="grid gap-2.5">
                    {ROLE_OPTIONS.map((opt) => {
                      const active = selectedKind === opt.value
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => setSelectedKind(opt.value)}
                          className={`flex items-start gap-3 rounded-lg border px-4 py-3.5 sm:px-5 sm:py-4 text-left transition-colors ${
                            active
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:border-foreground/25 hover:bg-muted/40'
                          }`}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium text-[15px] sm:text-base leading-tight">{opt.title}</span>
                            <span className="block text-[13px] sm:text-sm text-muted-foreground leading-snug mt-1">
                              {opt.description}
                            </span>
                          </span>
                          <span
                            className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                              active ? 'border-primary' : 'border-muted-foreground/30'
                            }`}
                            aria-hidden
                          >
                            {active && <span className="h-2 w-2 rounded-full bg-primary" />}
                          </span>
                        </button>
                      )
                    })}
                  </div>

                  {error && (
                    <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200">
                      <p className="text-sm text-red-600">{error}</p>
                    </div>
                  )}

                  <Button
                    type="button"
                    onClick={handleNextFromRole}
                    className="w-full h-11 sm:h-10 mt-4 text-base sm:text-sm"
                  >
                    Continue
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>

                  {/* Asked here rather than only at the acceptance screen: the
                      person weighing up "are we a firm?" is weighing it now. */}
                  {isFirm && (
                    <div className="mt-3 text-center">
                      <Link
                        href="/firm/guide"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-primary underline underline-offset-4"
                      >
                        See how firm accounts work
                      </Link>
                    </div>
                  )}

                  <div className="mt-4 text-center text-sm text-muted-foreground">
                    Already have an account?{' '}
                    <Link
                      href="/auth/login"
                      className="text-primary font-medium hover:underline underline-offset-4"
                    >
                      Sign in
                    </Link>
                  </div>
                </CardContent>
              </>
            )}

            {step === 2 && known && (
              <>
                <CardHeader className="pb-4 sm:pb-6 px-4 sm:px-6">
                  <CardTitle className="text-xl sm:text-2xl">
                    {known.firstName ? `Welcome back, ${known.firstName}` : 'You already have an account'}
                  </CardTitle>
                  <CardDescription className="text-sm">
                    {known.state === 'partner' && isFirm
                      ? 'Good news: you do not need a second one. Sign in and we will set the firm up on the account you have.'
                      : known.state === 'partner'
                        ? 'Sign in and carry on where you left off.'
                        : known.state === 'in_firm'
                          ? `You are already part of ${known.firmName ?? 'a firm'} on Refery.`
                          : known.state === 'pending'
                            ? 'Your account is with us and waiting to be approved.'
                            : 'This email is already registered.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-4 sm:px-6 pb-6">
                  <div className="rounded-lg border bg-muted/30 p-4 text-sm leading-relaxed text-foreground/80">
                    {known.state === 'partner' && isFirm && (
                      <>
                        <p className="mb-3">
                          We have kept everything you just typed about{' '}
                          <strong className="text-foreground">{firmLegalName.trim() || 'your firm'}</strong>.
                          Sign in and the form will be waiting, filled in.
                        </p>
                        <p className="text-muted-foreground">
                          Your existing candidates, submissions and history stay exactly as they are.
                          Setting up a firm adds your company to the account; it does not start a new one.
                        </p>
                      </>
                    )}
                    {known.state === 'partner' && !isFirm && (
                      <p>You already have a Refery account with this email. Sign in to keep going.</p>
                    )}
                    {known.state === 'in_firm' && (
                      <p>
                        Sign in and you will land on your team page, where you can invite colleagues
                        and see everyone&apos;s submissions.
                      </p>
                    )}
                    {known.state === 'pending' && (
                      <>
                        <p className="mb-3">
                          We review every account by hand, usually the same day, and we will email you
                          the moment yours is live.
                        </p>
                        {isFirm && (
                          <p className="text-muted-foreground">
                            We have noted that you want a firm account. Nothing else is needed from
                            you now.
                          </p>
                        )}
                      </>
                    )}
                    {known.state === 'not_partner' && (
                      <p>
                        This email is registered, but not as a scout or recruiting partner. Reply to
                        any email from us, or write to{' '}
                        <a href="mailto:hello@refery.io" className="underline underline-offset-2">
                          hello@refery.io
                        </a>
                        , and we will sort it out.
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 mt-5 sm:flex-row">
                    {(known.state === 'partner' || known.state === 'in_firm') && (
                      <Button asChild className="flex-1 h-11 sm:h-10 text-base sm:text-sm">
                        <Link
                          href={`/auth/login?returnTo=${encodeURIComponent(
                            known.state === 'in_firm' ? '/firm/members' : isFirm ? '/firm/new' : '/candidates',
                          )}`}
                        >
                          Sign in to continue
                        </Link>
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => { setKnown(null); setError(null) }}
                      className="h-11 sm:h-10 text-base sm:text-sm"
                    >
                      Use a different email
                    </Button>
                  </div>
                </CardContent>
              </>
            )}

            {step === 2 && !known && (
              <>
                <CardHeader className="pb-4 sm:pb-6 px-4 sm:px-6">
                  <CardTitle className="text-xl sm:text-2xl">Your details</CardTitle>
                  <CardDescription className="text-sm">
                    Use your full legal name. This is what we&apos;ll use on your agreement.
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-4 sm:px-6 pb-6">
                  <div className="flex flex-col gap-3 sm:gap-4">
                    <div className="grid gap-1.5">
                      <Label htmlFor="fullName" className="text-sm">Full Legal Name *</Label>
                      <Input
                        id="fullName"
                        type="text"
                        placeholder="Jane Doe"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="h-11 sm:h-10 text-base sm:text-sm"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="email" className="text-sm">Email *</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="jane@example.com"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="h-11 sm:h-10 text-base sm:text-sm"
                        autoCapitalize="none"
                        autoCorrect="off"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="linkedinUrl" className="text-sm">LinkedIn Profile URL *</Label>
                      <Input
                        id="linkedinUrl"
                        type="url"
                        placeholder="linkedin.com/in/yourprofile"
                        required
                        value={linkedinUrl}
                        onChange={(e) => setLinkedinUrl(e.target.value)}
                        className="h-11 sm:h-10 text-base sm:text-sm"
                        autoCapitalize="none"
                        autoCorrect="off"
                      />
                    </div>
                    {isFirm && (
                      <>
                        {/* The entity, asked for beside the person who signs for
                            it, because those two facts are only meaningful
                            together and splitting them across screens is how a
                            signer forgets which one they are answering as. */}
                        <div className="mt-1 border-t pt-4">
                          <p className="text-sm font-medium">Your firm</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            You are signing on its behalf. Colleagues join by invitation afterwards.{' '}
                            <Link
                              href="/firm/guide"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium text-primary underline underline-offset-2"
                            >
                              How this works
                            </Link>
                          </p>
                        </div>
                        <div className="grid gap-1.5">
                          <Label htmlFor="firmName" className="text-sm">Firm Name *</Label>
                          <Input
                            id="firmName"
                            type="text"
                            placeholder="Alder Talent"
                            value={firmName}
                            onChange={(e) => setFirmName(e.target.value)}
                            className="h-11 sm:h-10 text-base sm:text-sm"
                          />
                        </div>
                        <div className="grid gap-1.5">
                          <Label htmlFor="firmLegalName" className="text-sm">Registered Legal Entity *</Label>
                          <Input
                            id="firmLegalName"
                            type="text"
                            placeholder="Alder Talent Ltd"
                            value={firmLegalName}
                            onChange={(e) => setFirmLegalName(e.target.value)}
                            className="h-11 sm:h-10 text-base sm:text-sm"
                          />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                          <div className="grid gap-1.5">
                            <Label htmlFor="firmJurisdiction" className="text-sm">Jurisdiction</Label>
                            <Input
                              id="firmJurisdiction"
                              type="text"
                              placeholder="Delaware, US"
                              value={firmJurisdiction}
                              onChange={(e) => setFirmJurisdiction(e.target.value)}
                              className="h-11 sm:h-10 text-base sm:text-sm"
                            />
                          </div>
                          <div className="grid gap-1.5">
                            <Label htmlFor="firmCompanyNumber" className="text-sm">Company Number</Label>
                            <Input
                              id="firmCompanyNumber"
                              type="text"
                              placeholder="09283711"
                              value={firmCompanyNumber}
                              onChange={(e) => setFirmCompanyNumber(e.target.value)}
                              className="h-11 sm:h-10 text-base sm:text-sm"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                          <div className="grid gap-1.5">
                            <Label htmlFor="signerTitle" className="text-sm">Your Job Title</Label>
                            <Input
                              id="signerTitle"
                              type="text"
                              placeholder="Managing Director"
                              value={signerTitle}
                              onChange={(e) => setSignerTitle(e.target.value)}
                              className="h-11 sm:h-10 text-base sm:text-sm"
                            />
                          </div>
                          <div className="grid gap-1.5">
                            <Label htmlFor="firmBillingEmail" className="text-sm">Billing Email</Label>
                            <Input
                              id="firmBillingEmail"
                              type="email"
                              placeholder="accounts@aldertalent.com"
                              value={firmBillingEmail}
                              onChange={(e) => setFirmBillingEmail(e.target.value)}
                              className="h-11 sm:h-10 text-base sm:text-sm"
                              autoCapitalize="none"
                              autoCorrect="off"
                            />
                          </div>
                        </div>
                        {/* The question that decides who takes on the authority
                            representation. Asked plainly, because a champion
                            who cannot sign should not have to guess that
                            ticking the box later is a personal undertaking. */}
                        <div className="grid gap-1.5">
                          <Label className="text-sm">Who signs for {firmName.trim() || 'the firm'}?</Label>
                          <div className="grid gap-2">
                            <button
                              type="button"
                              onClick={() => setSignerSelf(true)}
                              className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                                signerSelf ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'
                              }`}
                            >
                              <span className="font-medium">I can sign for the company</span>
                              <span className="block text-xs text-muted-foreground mt-0.5">
                                You accept on the next step.
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setSignerSelf(false)}
                              className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                                !signerSelf ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'
                              }`}
                            >
                              <span className="font-medium">Someone else signs</span>
                              <span className="block text-xs text-muted-foreground mt-0.5">
                                We email them to accept. You still set everything up.
                              </span>
                            </button>
                          </div>
                        </div>
                        {!signerSelf && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                            <div className="grid gap-1.5">
                              <Label htmlFor="nomineeName" className="text-sm">Their Name *</Label>
                              <Input
                                id="nomineeName"
                                type="text"
                                placeholder="Priya Raman"
                                value={nomineeName}
                                onChange={(e) => setNomineeName(e.target.value)}
                                className="h-11 sm:h-10 text-base sm:text-sm"
                              />
                            </div>
                            <div className="grid gap-1.5">
                              <Label htmlFor="nomineeEmail" className="text-sm">Their Email *</Label>
                              <Input
                                id="nomineeEmail"
                                type="email"
                                placeholder="priya@aldertalent.com"
                                value={nomineeEmail}
                                onChange={(e) => setNomineeEmail(e.target.value)}
                                className="h-11 sm:h-10 text-base sm:text-sm"
                                autoCapitalize="none"
                                autoCorrect="off"
                              />
                            </div>
                          </div>
                        )}
                        <div className="border-t pt-4" />
                      </>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                      <div className="grid gap-1.5">
                        <Label htmlFor="password" className="text-sm">Password *</Label>
                        <Input
                          id="password"
                          type="password"
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="h-11 sm:h-10 text-base sm:text-sm"
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="repeat-password" className="text-sm">Confirm *</Label>
                        <Input
                          id="repeat-password"
                          type="password"
                          required
                          value={repeatPassword}
                          onChange={(e) => setRepeatPassword(e.target.value)}
                          className="h-11 sm:h-10 text-base sm:text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  {error && (
                    <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200">
                      <p className="text-sm text-red-600">{error}</p>
                    </div>
                  )}

                  <div className="flex items-center gap-2 mt-5">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => { setError(null); setStep(1) }}
                      className="h-11 sm:h-10"
                    >
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      Back
                    </Button>
                    <Button
                      type="button"
                      onClick={handleNextFromDetails}
                      disabled={checking}
                      className="flex-1 h-11 sm:h-10 text-base sm:text-sm"
                    >
                      {checking ? 'Checking\u2026' : 'Continue'}
                      {!checking && <ArrowRight className="ml-2 h-4 w-4" />}
                    </Button>
                  </div>
                </CardContent>
              </>
            )}

            {step === 3 && (
              <>
                <CardHeader className="pb-4 sm:pb-6 px-4 sm:px-6">
                  <CardTitle className="text-xl sm:text-2xl">Where your people are</CardTitle>
                  <CardDescription className="text-sm">
                    {invited ? 'Filled in from your application. Fix anything that is off.' : 'We suggest your first search from this.'} You can change it any time.
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-4 sm:px-6 pb-6">
                  <PreferencesFields value={prefs} onChange={setPrefs} />
                  {error && (
                    <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200">
                      <p className="text-sm text-red-600">{error}</p>
                    </div>
                  )}
                  <div className="mt-5 flex gap-2">
                    <Button type="button" variant="outline" onClick={() => { setError(null); setStep(2) }} className="h-11 sm:h-10">
                      Back
                    </Button>
                    <Button type="button" onClick={handleNextFromPreferences} className="h-11 sm:h-10 flex-1 text-base sm:text-sm">
                      Continue to the terms
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </>
            )}

            {step === 4 && (
              <>
                <CardHeader className="pb-4 sm:pb-6 px-4 sm:px-6">
                  <CardTitle className="text-xl sm:text-2xl">
                    {isFirm && !signerSelf
                      ? 'One last thing'
                      : isFirm
                        ? 'Partner Terms and Firm Addendum'
                        : 'Partner Terms'}
                  </CardTitle>
                  <CardDescription className="text-sm">
                    {isFirm && !signerSelf
                      ? `We will email ${nomineeName.trim() || 'them'} to sign for the company.`
                      : isFirm
                        ? 'You are accepting for your company. About a minute to read.'
                        : 'About a minute to read. Accept to finish creating your account.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-4 sm:px-6 pb-6">
                  {/* A nominator has nothing to accept. Showing them terms they
                      cannot agree to would invite them to agree anyway, which is
                      the exact thing this whole branch exists to prevent. */}
                  {isFirm && !signerSelf ? (
                    <div className="rounded-lg border bg-muted/30 p-4 text-sm leading-relaxed text-foreground/80">
                      <p className="mb-3">
                        Creating your account for {email.trim() || 'you'} and{' '}
                        <strong className="text-foreground">{firmLegalName.trim() || 'your firm'}</strong>.
                      </p>
                      <p className="mb-3">
                        We will email{' '}
                        <strong className="text-foreground">{nomineeName.trim() || 'your colleague'}</strong>{' '}
                        at {nomineeEmail.trim() || 'their address'} and ask them to accept the Partner
                        Terms, Submission Terms and Firm Addendum on the company&apos;s behalf. They do
                        not need an account.
                      </p>
                      <p className="mb-3">
                        You will be able to invite colleagues once they have signed and we have
                        reviewed the firm. We will let you know at each step.
                      </p>
                      <p className="text-muted-foreground">
                        You are not signing anything for the company yourself.{' '}
                        <Link href="/partner-terms" target="_blank" className="underline underline-offset-2">
                          Read the terms
                        </Link>{' '}
                        if you would like to see what they cover.
                      </p>
                    </div>
                  ) : agreement ? (
                    <>
                      <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground flex flex-wrap items-center justify-between gap-2 mb-3">
                        <span>
                          Signing as <strong className="text-foreground">{fullName}</strong>
                        </span>
                        <span>Version {agreement.version}</span>
                      </div>

                      <div
                        onScroll={handleAgreementScroll}
                        className="border rounded-lg max-h-[320px] sm:max-h-[380px] overflow-y-auto px-4 sm:px-6 py-5 bg-white"
                      >
                        <AgreementContent
                          content={agreement.text}
                          density="compact"
                          showEyebrow={false}
                        />
                      </div>
                      {!hasScrolledAgreement && (
                        <p className="text-xs text-muted-foreground mt-2">
                          Scroll to the end of the agreement to enable acceptance.
                        </p>
                      )}

                      <div className="flex items-start gap-2 mt-4">
                        <Checkbox
                          id="accept-agreement"
                          checked={acceptedAgreement}
                          onCheckedChange={(checked) => setAcceptedAgreement(checked === true)}
                          disabled={!hasScrolledAgreement}
                          className="mt-0.5"
                        />
                        <label
                          htmlFor="accept-agreement"
                          className={`text-sm leading-snug cursor-pointer ${!hasScrolledAgreement ? 'opacity-60' : ''}`}
                        >
                          {isFirm ? (
                            <>
                              I accept the Partner Terms, the Submission Terms and the Firm Addendum for{' '}
                              <strong>{firmLegalName.trim() || 'my firm'}</strong>. In my individual capacity I
                              confirm that I am authorised to bind it. My click constitutes a legally binding
                              electronic signature.
                            </>
                          ) : (
                            <>
                              I have read and agree to the Partner Terms.
                              My click constitutes a legally binding electronic signature.
                            </>
                          )}
                        </label>
                      </div>
                    </>
                  ) : (
                    <div className="rounded-lg border bg-muted/30 p-4 text-sm leading-relaxed text-foreground/80">
                      <p className="mb-2">
                        Thanks, <strong className="text-foreground">{fullName}</strong>.
                      </p>
                      <p>
                        We&apos;ll review your account and reach out to set up your company. Your
                        Refery service agreement will be sent to you separately by our team for
                        electronic signature.
                      </p>
                    </div>
                  )}

                  {error && (
                    <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200">
                      <p className="text-sm text-red-600">{error}</p>
                    </div>
                  )}

                  <div className="flex items-center gap-2 mt-5">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => { setError(null); setStep(3) }}
                      disabled={isLoading}
                      className="h-11 sm:h-10"
                    >
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      Back
                    </Button>
                    <Button
                      type="button"
                      onClick={handleSubmit}
                      disabled={isLoading || (signerSelf && !acceptedAgreement)}
                      className="flex-1 h-11 sm:h-10 text-base sm:text-sm"
                    >
                      {isLoading
                        ? 'Creating account...'
                        : isFirm && !signerSelf
                          ? 'Create account & send for signature'
                          : agreement
                            ? 'Accept & Create Account'
                            : 'Create Account'}
                    </Button>
                  </div>
                </CardContent>
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
