import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'

export const metadata = {
  title: 'Scout/Partner Recruiter Agreement - Refery',
  description: 'Terms and conditions for Scout and Partner Recruiters on the Refery platform',
}

export default function ScoutAgreementPage() {
  return (
    <div className="min-h-svh bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link href="/auth/sign-up">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <Link href="/" className="font-semibold text-xl text-foreground">
              Refery<span className="text-primary">.</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 py-8 sm:py-12">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
            Scout/Partner Recruiter Agreement
          </h1>
          <p className="text-muted-foreground">
            Last updated: January 2025
          </p>
        </div>

        <div className="prose prose-sm sm:prose max-w-none text-foreground prose-headings:text-foreground prose-strong:text-foreground">
          <p className="lead text-lg text-muted-foreground">
            This Scout/Partner Recruiter Agreement (&quot;Agreement&quot;) is entered into between you (&quot;Scout&quot;, &quot;Partner Recruiter&quot;, or &quot;You&quot;) and Refery, Inc. (&quot;Refery&quot;, &quot;we&quot;, or &quot;us&quot;).
          </p>

          <h2>1. Services and Scope</h2>
          <p>
            As a Scout/Partner Recruiter on the Refery platform, you agree to:
          </p>
          <ul>
            <li>Source and refer qualified candidates for job opportunities posted on the Refery platform</li>
            <li>Provide accurate and truthful information about candidates you submit</li>
            <li>Maintain professional standards in all communications with candidates and hiring companies</li>
            <li>Comply with all applicable laws, including employment and data protection regulations</li>
          </ul>

          <h2>2. Candidate Submissions</h2>
          <p>
            When submitting candidates to the Refery platform, you represent and warrant that:
          </p>
          <ul>
            <li>You have obtained the candidate&apos;s consent to submit their information</li>
            <li>The candidate is aware they are being referred for job opportunities</li>
            <li>All information provided is accurate and not misleading</li>
            <li>You have no knowledge of any reason the candidate would be unsuitable for employment</li>
          </ul>

          <h2>3. Referral Fees and Compensation</h2>
          <p>
            Refery will pay referral fees according to the following terms:
          </p>
          <ul>
            <li>Referral fees are paid only for successful placements where the candidate is hired and completes the guarantee period</li>
            <li>Fee amounts are displayed on each job listing and may vary by position</li>
            <li>Payment will be processed within 30 days of the guarantee period completion</li>
            <li>You are responsible for any applicable taxes on referral fees received</li>
          </ul>

          <h2>4. Confidentiality</h2>
          <p>
            You agree to maintain strict confidentiality regarding:
          </p>
          <ul>
            <li>All job details and company information accessed through the platform</li>
            <li>Candidate information and interview feedback</li>
            <li>Referral fee structures and business terms</li>
            <li>Any proprietary information shared by Refery or hiring companies</li>
          </ul>

          <h2>5. Non-Circumvention</h2>
          <p>
            You agree not to:
          </p>
          <ul>
            <li>Directly contact hiring companies to circumvent the Refery platform</li>
            <li>Submit candidates directly to companies you learned about through Refery</li>
            <li>Share job details with competing recruiting platforms or agencies</li>
            <li>Attempt to recruit from Refery&apos;s client companies for a period of 12 months after accessing their job listings</li>
          </ul>

          <h2>6. Data Protection</h2>
          <p>
            You acknowledge and agree that:
          </p>
          <ul>
            <li>You will handle all personal data in compliance with applicable data protection laws (including GDPR and CCPA)</li>
            <li>Candidate data may only be used for the purpose of job placement through Refery</li>
            <li>You will not sell, share, or transfer candidate data to third parties</li>
            <li>You will promptly report any data breaches or security incidents</li>
          </ul>

          <h2>7. Term and Termination</h2>
          <p>
            This Agreement:
          </p>
          <ul>
            <li>Begins when you accept these terms during registration</li>
            <li>Remains in effect until terminated by either party</li>
            <li>May be terminated by Refery at any time for violation of these terms</li>
            <li>Confidentiality and non-circumvention obligations survive termination</li>
          </ul>

          <h2>8. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law:
          </p>
          <ul>
            <li>Refery is not liable for any indirect, incidental, or consequential damages</li>
            <li>Our total liability is limited to the referral fees paid to you in the preceding 12 months</li>
            <li>We make no guarantees regarding job placement success or referral fee earnings</li>
          </ul>

          <h2>9. Dispute Resolution</h2>
          <p>
            Any disputes arising from this Agreement shall be:
          </p>
          <ul>
            <li>First attempted to be resolved through good-faith negotiation</li>
            <li>Subject to binding arbitration in accordance with AAA rules if negotiation fails</li>
            <li>Governed by the laws of the State of Delaware</li>
          </ul>

          <h2>10. Modifications</h2>
          <p>
            Refery reserves the right to modify this Agreement at any time. We will notify you of material changes via email or platform notification. Continued use of the platform after changes constitutes acceptance of the modified terms.
          </p>

          <h2>11. Entire Agreement</h2>
          <p>
            This Agreement, together with Refery&apos;s Terms of Service and Privacy Policy, constitutes the entire agreement between you and Refery regarding your participation as a Scout/Partner Recruiter.
          </p>

          <div className="mt-8 p-4 bg-muted rounded-lg border">
            <p className="text-sm text-muted-foreground mb-0">
              By checking the &quot;Scout/Partner Recruiter Agreement&quot; box during registration, you acknowledge that you have read, understood, and agree to be bound by all terms and conditions of this Agreement.
            </p>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t">
          <Link href="/auth/sign-up">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Sign Up
            </Button>
          </Link>
        </div>
      </main>
    </div>
  )
}
