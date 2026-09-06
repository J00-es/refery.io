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
import { User, Search, Building, ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { PARTNER_TERMS_TEXT, AGREEMENT_VERSIONS } from '@/lib/agreements'
import { AgreementContent } from '@/components/agreement-content'

type Role = 'scout' | 'recruiter'
/**
 * What the person picks, which is not quite the same as the role stored.
 *
 * A firm's signer is a recruiter account like any other: the difference is the
 * entity they bind and the addendum they accept, not their permissions. Keeping
 * "firm" out of Role means nothing downstream has to learn a fourth role.
 */
type SignupKind = 'scout' | 'recruiter' | 'firm'
type Step = 1 | 2 | 3

const roleForKind = (k: SignupKind): Role => (k === 'firm' ? 'recruiter' : k)

const ROLE_OPTIONS: Array<{
  value: SignupKind
  title: string
  description: string
  icon: typeof User
  bg: string
  fg: string
}> = [
  {
    value: 'scout',
    title: 'Scout',
    description: 'You have a great network and want to share talented people you know.',
    icon: Search,
    bg: 'bg-[#E7EDE9]',
    fg: 'text-[#1F3A2F]',
  },
  {
    value: 'recruiter',
    title: 'Recruiting Partner',
    description: 'A professional recruiter or independent talent partner looking to collaborate.',
    icon: User,
    bg: 'bg-[#EDE8DF]',
    fg: 'text-[#6A5636]',
  },
  {
    value: 'firm',
    title: 'Recruiting Firm',
    description: 'You sign once for your company and your colleagues join without their own agreement.',
    icon: Building,
    bg: 'bg-[#E5E9EE]',
    fg: 'text-[#3D5468]',
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
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [linkedinUrl, setLinkedinUrl] = useState('')
  const [password, setPassword] = useState('')
  const [repeatPassword, setRepeatPassword] = useState('')
  const [acceptedAgreement, setAcceptedAgreement] = useState(false)
  const [hasScrolledAgreement, setHasScrolledAgreement] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const agreement = selectedRole ? getAgreementForRole(selectedRole as Role) : null

  useEffect(() => {
    track('page_view')
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

  const handleNextFromDetails = () => {
    setError(null)
    if (!fullName.trim()) {
      setError('Please enter your full legal name')
      return
    }
    if (!email.trim()) {
      setError('Please enter your email')
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
      setError('Please enter the registered legal entity you are signing for')
      return
    }
    const who = {
      role: selectedRole,
      email,
      full_name: fullName,
      linkedin_url: linkedinUrl,
    }
    track('details_completed', who)
    // Step 3 is the terms, so reaching it is the moment worth announcing.
    track('agreement_viewed', who)
    setStep(3)
  }

  const handleSubmit = async () => {
    setError(null)

    if (!acceptedAgreement) {
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

      router.push('/auth/sign-up-success')
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
            {[1, 2, 3].map((n) => (
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
                {n < 3 && (
                  <span className={`h-px w-8 ${step > n ? 'bg-primary/40' : 'bg-border'}`} />
                )}
              </li>
            ))}
          </ol>

          <Card className="border-0 sm:border shadow-lg sm:shadow-md">
            {step === 1 && (
              <>
                <CardHeader className="pb-4 sm:pb-6 px-4 sm:px-6">
                  <CardTitle className="text-xl sm:text-2xl">Welcome to Refery</CardTitle>
                  <CardDescription className="text-sm">
                    Let&apos;s start with what best describes you.
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-4 sm:px-6 pb-6">
                  <div className="grid gap-2.5">
                    {ROLE_OPTIONS.map((opt) => {
                      const Icon = opt.icon
                      const active = selectedKind === opt.value
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setSelectedKind(opt.value)}
                          className={`flex items-start gap-3 rounded-lg border p-3 sm:p-4 text-left transition-colors ${
                            active ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'
                          }`}
                        >
                          <span
                            className={`flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-full ${opt.bg} ${opt.fg}`}
                          >
                            <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium text-sm sm:text-base">{opt.title}</span>
                            <span className="block text-xs sm:text-sm text-muted-foreground leading-snug mt-0.5">
                              {opt.description}
                            </span>
                          </span>
                          <span
                            className={`mt-1 h-4 w-4 rounded-full border-2 shrink-0 ${
                              active ? 'border-primary bg-primary' : 'border-muted-foreground/30'
                            }`}
                            aria-hidden
                          />
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

            {step === 2 && (
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
                            You are signing on its behalf. Colleagues join by invitation afterwards.
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
                      className="flex-1 h-11 sm:h-10 text-base sm:text-sm"
                    >
                      Continue
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </>
            )}

            {step === 3 && (
              <>
                <CardHeader className="pb-4 sm:pb-6 px-4 sm:px-6">
                  <CardTitle className="text-xl sm:text-2xl">
                    {isFirm ? 'Partner Terms and Firm Addendum' : 'Partner Terms'}
                  </CardTitle>
                  <CardDescription className="text-sm">
                    {isFirm
                      ? 'You are accepting for your company. About a minute to read.'
                      : 'About a minute to read. Accept to finish creating your account.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-4 sm:px-6 pb-6">
                  {agreement ? (
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
                      onClick={() => { setError(null); setStep(2) }}
                      disabled={isLoading}
                      className="h-11 sm:h-10"
                    >
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      Back
                    </Button>
                    <Button
                      type="button"
                      onClick={handleSubmit}
                      disabled={isLoading || !acceptedAgreement}
                      className="flex-1 h-11 sm:h-10 text-base sm:text-sm"
                    >
                      {isLoading
                        ? 'Creating account...'
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
