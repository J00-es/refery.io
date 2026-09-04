import Link from 'next/link'

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="mb-8">
          <Link href="/" className="font-semibold text-2xl text-foreground">
            Refery<span className="text-green-500">.</span>io
          </Link>
        </div>
        
        <h1 className="text-4xl font-bold mb-8 text-foreground">Terms & Conditions</h1>
        
        <div className="prose prose-gray dark:prose-invert max-w-none space-y-6">
          <p className="text-muted-foreground">Last updated: {new Date().toLocaleDateString()}</p>
          
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">1. Acceptance of Terms</h2>
            <p className="text-foreground">
              By accessing and using Refery.io (&quot;the Platform&quot;), you agree to be bound by these Terms & Conditions. 
              If you do not agree to these terms, please do not use our services.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">2. Services Description</h2>
            <p className="text-foreground">
              Refery.io is a partner recruiter network platform that connects recruiters with companies seeking talent. 
              Our services include:
            </p>
            <ul className="list-disc list-inside text-foreground space-y-2">
              <li>Job posting and management tools</li>
              <li>Candidate tracking and matching</li>
              <li>AI-powered resume analysis</li>
              <li>Referral bonus tracking</li>
              <li>Communication tools for recruiters and hiring managers</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">3. User Accounts</h2>
            <p className="text-foreground">
              To use our services, you must create an account and provide accurate information including your full name, 
              email address, and LinkedIn profile. You are responsible for maintaining the confidentiality of your account 
              credentials.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">4. User Responsibilities</h2>
            <p className="text-foreground">As a user of Refery.io, you agree to:</p>
            <ul className="list-disc list-inside text-foreground space-y-2">
              <li>Provide accurate and truthful information</li>
              <li>Maintain the confidentiality of candidate information</li>
              <li>Not share login credentials with unauthorized parties</li>
              <li>Use the platform only for legitimate recruiting purposes</li>
              <li>Comply with all applicable employment and data protection laws</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">5. Referral Fees and Payments</h2>
            <p className="text-foreground">
              Referral bonuses are paid according to the terms specified for each job posting. Payment terms, 
              guarantee periods, and conditions are determined by the hiring company and communicated through the platform.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">6. Intellectual Property</h2>
            <p className="text-foreground">
              All content, features, and functionality of Refery.io are owned by us and are protected by international 
              copyright, trademark, and other intellectual property laws.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">7. Limitation of Liability</h2>
            <p className="text-foreground">
              Refery.io is provided &quot;as is&quot; without warranties of any kind. We are not liable for any indirect, 
              incidental, or consequential damages arising from your use of the platform.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">8. Termination</h2>
            <p className="text-foreground">
              We reserve the right to suspend or terminate your account at any time for violation of these terms 
              or for any other reason at our discretion.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">9. Changes to Terms</h2>
            <p className="text-foreground">
              We may update these terms from time to time. Continued use of the platform after changes constitutes 
              acceptance of the modified terms.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">10. Contact</h2>
            <p className="text-foreground">
              For questions about these Terms & Conditions, please contact us at legal@refery.io
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t">
          <Link href="/auth/sign-up" className="text-primary hover:underline">
            Back to Sign Up
          </Link>
        </div>
      </div>
    </div>
  )
}
