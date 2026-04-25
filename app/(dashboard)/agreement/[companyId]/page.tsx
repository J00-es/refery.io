'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Check, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'

// Agreement version - increment when terms change
const AGREEMENT_VERSION = '1.0.0'

// Generate a hash of the agreement for audit trail
function generateAgreementHash(text: string): string {
  let hash = 0
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(16)
}

const AGREEMENT_SECTIONS = [
  {
    number: 1,
    title: "How It Works",
    content: "Refery connects your company (\"Client\") with independent recruiters and talent scouts (\"Partners\") who source candidates for your open roles. Submit roles through the platform. When you hire a candidate introduced through Refery, a placement fee applies. This agreement covers all roles you submit — now and in the future. No new agreement is needed for additional roles."
  },
  {
    number: 2,
    title: "Candidate Introduction",
    content: "A candidate is considered \"Introduced\" when Refery or a Partner shares their profile, resume, or identifying details with you. An introduction remains valid for twelve (12) months. If you hire an Introduced Candidate within this window — regardless of role, department, method, or whether they also applied directly — the placement fee applies."
  },
  {
    number: 3,
    title: "Placement Fee",
    content: "The placement fee is 10% of the hired candidate's first-year annual base salary. Bonuses, equity, commissions, and variable compensation are excluded from the calculation."
  },
  {
    number: 4,
    title: "Payment",
    content: "The placement fee is due within thirty (30) calendar days of the candidate's start date. If not paid within this period, a late fee of 1.5% per month accrues on the unpaid balance until paid in full. Refery may suspend services for balances overdue by more than 60 days."
  },
  {
    number: 5,
    title: "90-Day Guarantee",
    content: "If a placed candidate leaves or is terminated for cause within 90 days of starting, Refery refunds 100% of the placement fee. Notify Refery within 7 business days of departure. This guarantee does not apply if: (a) the role was materially changed from the original listing; (b) compensation or conditions differ from what was described; or (c) the departure resulted from layoffs or restructuring."
  },
  {
    number: 6,
    title: "Anti-Circumvention",
    content: "You agree not to hire any Introduced Candidate through channels that bypass Refery — including direct contact, other agencies, or contractor arrangements. If this occurs, the full placement fee remains due."
  },
  {
    number: 7,
    title: "Confidentiality",
    content: "All candidate information is confidential. Use it only to evaluate candidates for employment. Do not share candidate details with third parties without Refery's written consent."
  },
  {
    number: 8,
    title: "Liability",
    content: "Refery's total liability is capped at fees paid in the prior 12 months. Refery is not liable for indirect or consequential damages and does not guarantee any specific placement outcome."
  },
  {
    number: 9,
    title: "Term & Termination",
    content: "This agreement stays in effect until either party gives 30 days' written notice. Termination does not cancel: fees already owed, the 12-month introduction window for candidates already introduced, or active guarantee periods."
  },
  {
    number: 10,
    title: "General",
    content: "Governed by Delaware law. Disputes resolved by binding arbitration (AAA rules, conducted remotely). Refery may update terms with 30 days' notice — continued platform use after notice constitutes acceptance. This is the entire agreement between the parties."
  }
]

// Full text for hash generation
const FULL_AGREEMENT_TEXT = AGREEMENT_SECTIONS.map(s => `Section ${s.number} — ${s.title}\n${s.content}`).join('\n\n')

export default function AgreementPage() {
  const router = useRouter()
  const params = useParams()
  const companyId = params.companyId as string
  const supabase = createClient()

  const [company, setCompany] = useState<{ id: string; name: string } | null>(null)
  const [user, setUser] = useState<{ id: string; email: string; full_name?: string } | null>(null)
  const [existingAcceptance, setExistingAcceptance] = useState<any>(null)
  const [isChecked, setIsChecked] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadData() {
      setIsLoading(true)
      
      // Get current user
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) {
        router.push('/auth/login')
        return
      }

      // Get user profile
      const { data: userAdmin } = await supabase
        .from('users_admin')
        .select('full_name')
        .eq('user_id', authUser.id)
        .single()

      setUser({
        id: authUser.id,
        email: authUser.email || '',
        full_name: userAdmin?.full_name
      })

      // Get company
      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .select('id, name')
        .eq('id', companyId)
        .single()

      if (companyError || !companyData) {
        setError('Company not found')
        setIsLoading(false)
        return
      }

      setCompany(companyData)

      // Check for existing acceptance
      const { data: acceptance } = await supabase
        .from('agreement_acceptances')
        .select('*')
        .eq('user_id', authUser.id)
        .eq('company_id', companyId)
        .order('accepted_at', { ascending: false })
        .limit(1)
        .single()

      if (acceptance) {
        setExistingAcceptance(acceptance)
      }

      setIsLoading(false)
    }

    loadData()
  }, [companyId, router, supabase])

  const handleAccept = async () => {
    if (!isChecked || !user || !company) return

    setIsSubmitting(true)
    setError(null)

    try {
      const agreementHash = generateAgreementHash(FULL_AGREEMENT_TEXT)
      
      // Get IP address
      let ipAddress = null
      try {
        const ipRes = await fetch('https://api.ipify.org?format=json')
        const ipData = await ipRes.json()
        ipAddress = ipData.ip
      } catch (e) {
        console.log('Could not fetch IP address')
      }
      
      const { error: insertError } = await supabase
        .from('agreement_acceptances')
        .insert({
          user_id: user.id,
          user_email: user.email,
          user_name: user.full_name || user.email,
          company_name: company.name,
          company_id: company.id,
          ip_address: ipAddress,
          user_agent: navigator.userAgent,
          agreement_version: AGREEMENT_VERSION,
          agreement_hash: agreementHash,
          acceptance_method: 'clickwrap_checkbox_and_button',
          agreement_type: 'scout_partner'
        })

      if (insertError) {
        console.error('Error saving acceptance:', insertError)
        setError('Failed to save agreement acceptance. Please try again.')
        setIsSubmitting(false)
        return
      }

      // Refresh to show confirmed state
      const { data: newAcceptance } = await supabase
        .from('agreement_acceptances')
        .select('*')
        .eq('user_id', user.id)
        .eq('company_id', company.id)
        .order('accepted_at', { ascending: false })
        .limit(1)
        .single()

      setExistingAcceptance(newAcceptance)
    } catch (err) {
      setError('An unexpected error occurred. Please try again.')
    }

    setIsSubmitting(false)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f8f9fb] flex items-center justify-center" style={{ fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' }}>
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (error && !company) {
    return (
      <div className="min-h-screen bg-[#f8f9fb] flex items-center justify-center" style={{ fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' }}>
        <div className="bg-white rounded-xl shadow-sm p-8 max-w-md text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <Link href="/jobs">
            <Button variant="outline">Back to Jobs</Button>
          </Link>
        </div>
      </div>
    )
  }

  // Success state after acceptance
  if (existingAcceptance) {
    return (
      <div className="min-h-screen bg-[#f8f9fb] flex flex-col" style={{ fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' }}>
        {/* Dark header */}
        <div className="bg-[#111827] px-6 py-4">
          <span className="text-white font-bold italic text-xl">refery</span>
        </div>

        {/* Success content */}
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-sm max-w-[680px] w-full p-8 text-center">
            {/* Green checkmark */}
            <div className="mx-auto w-16 h-16 rounded-full bg-[#d1fae5] flex items-center justify-center mb-6">
              <svg className="w-8 h-8 text-[#059669]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <h1 className="text-2xl font-semibold text-gray-900 mb-3">Agreement Accepted</h1>
            <p className="text-gray-600 mb-8">
              A confirmation has been sent to your email. You can now start submitting roles.
            </p>

            {/* Summary box */}
            <div className="bg-gray-50 rounded-lg p-4 mb-8 text-left">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Company</span>
                  <p className="font-medium text-gray-900">{existingAcceptance.company_name}</p>
                </div>
                <div>
                  <span className="text-gray-500">Agreement Version</span>
                  <p className="font-medium text-gray-900">v{existingAcceptance.agreement_version}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-gray-500">Date Accepted</span>
                  <p className="font-medium text-gray-900">
                    {format(new Date(existingAcceptance.accepted_at), 'MMMM d, yyyy \'at\' h:mm a')}
                  </p>
                </div>
              </div>
            </div>

            <Link href="/jobs/new">
              <Button className="bg-[#111827] hover:bg-[#1f2937] text-white px-6">
                Submit Your First Role
                <svg className="ml-2 w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f8f9fb] flex flex-col" style={{ fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' }}>
      {/* Dark header */}
      <div className="bg-[#111827] px-6 py-4">
        <span className="text-white font-bold italic text-xl">refery</span>
      </div>

      {/* Main content */}
      <div className="flex-1 flex justify-center p-4 md:p-8">
        <div className="bg-white rounded-xl shadow-sm max-w-[680px] w-full flex flex-col">
          {/* Title Section */}
          <div className="p-6 md:p-8 pb-0">
            <h1 className="text-2xl md:text-[28px] font-semibold text-gray-900 mb-2">
              Recruitment Services Agreement
            </h1>
            <p className="text-gray-500">
              Review and accept to start receiving candidates.
            </p>
          </div>

          {/* Key Terms Banner */}
          <div className="mx-6 md:mx-8 mt-6 p-4 bg-[#f0fdf4] border border-[#d1fae5] rounded-lg">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl md:text-3xl font-bold text-gray-900">10%</div>
                <div className="text-xs md:text-sm text-gray-600">of first-year salary</div>
                <span className="inline-block mt-1 text-[10px] md:text-xs bg-[#d1fae5] text-[#059669] px-2 py-0.5 rounded-full font-medium">
                  Half the industry average
                </span>
              </div>
              <div>
                <div className="text-2xl md:text-3xl font-bold text-gray-900">30 days</div>
                <div className="text-xs md:text-sm text-gray-600">to pay after start date</div>
              </div>
              <div>
                <div className="text-2xl md:text-3xl font-bold text-gray-900">100%</div>
                <div className="text-xs md:text-sm text-gray-600">refund guarantee</div>
                <span className="inline-block mt-1 text-[10px] md:text-xs bg-[#d1fae5] text-[#059669] px-2 py-0.5 rounded-full font-medium">
                  If hire leaves within 90 days
                </span>
              </div>
            </div>
          </div>

          {/* Company Info Bar */}
          <div className="mx-6 md:mx-8 mt-4 bg-[#111827] rounded-lg px-4 py-3 flex justify-between items-center text-white text-sm">
            <span>Company: <strong>{company?.name}</strong></span>
            <span className="text-gray-400">Agreement: v{AGREEMENT_VERSION}</span>
          </div>

          {/* Scrollable Agreement Text */}
          <div className="mx-6 md:mx-8 mt-4 border border-gray-200 rounded-lg overflow-hidden flex-1 min-h-0">
            <div className="max-h-[420px] overflow-y-auto p-4 md:p-6 space-y-6">
              {AGREEMENT_SECTIONS.map((section) => (
                <div key={section.number} className="flex gap-3 md:gap-4">
                  <div className="shrink-0 w-7 h-7 md:w-8 md:h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm font-semibold text-gray-700">
                    {section.number}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 mb-1.5">
                      Section {section.number} — {section.title}
                    </h3>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      {section.content}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Acceptance Footer */}
          <div className="p-4 md:p-6 border-t border-gray-100 bg-white rounded-b-xl sticky bottom-0">
            {error && (
              <p className="text-sm text-red-600 mb-3">{error}</p>
            )}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <Checkbox 
                  id="accept" 
                  checked={isChecked}
                  onCheckedChange={(checked) => setIsChecked(checked === true)}
                  className="h-5 w-5"
                />
                <label htmlFor="accept" className="text-sm text-gray-700 cursor-pointer">
                  I agree on behalf of <strong>{company?.name}</strong>
                </label>
              </div>
              <Button 
                onClick={handleAccept}
                disabled={!isChecked || isSubmitting}
                className={`px-6 py-2.5 transition-all ${
                  isChecked && !isSubmitting
                    ? 'bg-[#111827] hover:bg-[#1f2937] text-white shadow-sm'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  'Accept & Continue'
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
