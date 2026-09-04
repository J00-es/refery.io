import Link from 'next/link'

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="mb-8">
          <Link href="/" className="font-semibold text-2xl text-foreground">
            Refery<span className="text-green-500">.</span>io
          </Link>
        </div>
        
        <h1 className="text-4xl font-bold mb-8 text-foreground">Privacy Policy</h1>
        
        <div className="prose prose-gray dark:prose-invert max-w-none space-y-6">
          <p className="text-muted-foreground">Last updated: {new Date().toLocaleDateString()}</p>
          
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">1. Introduction</h2>
            <p className="text-foreground">
              Refery.io (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) is committed to protecting your privacy. This Privacy Policy explains 
              how we collect, use, disclose, and safeguard your information when you use our platform.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">2. Information We Collect</h2>
            <h3 className="text-xl font-medium text-foreground">Personal Information</h3>
            <ul className="list-disc list-inside text-foreground space-y-2">
              <li>Full name and contact information</li>
              <li>Email address</li>
              <li>LinkedIn profile URL</li>
              <li>Professional information and work history</li>
              <li>Account credentials</li>
            </ul>
            
            <h3 className="text-xl font-medium text-foreground mt-4">Candidate Data</h3>
            <ul className="list-disc list-inside text-foreground space-y-2">
              <li>Resumes and CV documents</li>
              <li>Professional experience and skills</li>
              <li>Contact information</li>
              <li>Salary expectations</li>
              <li>Location and work preferences</li>
            </ul>

            <h3 className="text-xl font-medium text-foreground mt-4">Usage Data</h3>
            <ul className="list-disc list-inside text-foreground space-y-2">
              <li>Log data and device information</li>
              <li>Usage patterns and preferences</li>
              <li>Communication records within the platform</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">3. How We Use Your Information</h2>
            <p className="text-foreground">We use the collected information to:</p>
            <ul className="list-disc list-inside text-foreground space-y-2">
              <li>Provide and maintain our services</li>
              <li>Match candidates with job opportunities</li>
              <li>Process referral payments</li>
              <li>Communicate with you about our services</li>
              <li>Improve and optimize our platform</li>
              <li>Ensure security and prevent fraud</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">4. Data Sharing</h2>
            <p className="text-foreground">We may share your information with:</p>
            <ul className="list-disc list-inside text-foreground space-y-2">
              <li>Hiring companies (candidate information with consent)</li>
              <li>Service providers who assist in operating our platform</li>
              <li>Legal authorities when required by law</li>
            </ul>
            <p className="text-foreground mt-2">
              We do not sell your personal information to third parties.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">5. Data Security</h2>
            <p className="text-foreground">
              We implement appropriate technical and organizational measures to protect your information, including:
            </p>
            <ul className="list-disc list-inside text-foreground space-y-2">
              <li>Encryption of data in transit and at rest</li>
              <li>Access controls and authentication</li>
              <li>Regular security assessments</li>
              <li>Employee training on data protection</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">6. Data Retention</h2>
            <p className="text-foreground">
              We retain your information for as long as your account is active or as needed to provide services. 
              You may request deletion of your data at any time by contacting us.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">7. Your Rights</h2>
            <p className="text-foreground">You have the right to:</p>
            <ul className="list-disc list-inside text-foreground space-y-2">
              <li>Access your personal data</li>
              <li>Correct inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Object to processing of your data</li>
              <li>Export your data in a portable format</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">8. Cookies</h2>
            <p className="text-foreground">
              We use cookies and similar technologies to enhance your experience. You can manage cookie preferences 
              through your browser settings.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">9. Changes to This Policy</h2>
            <p className="text-foreground">
              We may update this Privacy Policy from time to time. We will notify you of any changes by posting 
              the new policy on this page and updating the &quot;Last updated&quot; date.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">10. Contact Us</h2>
            <p className="text-foreground">
              If you have questions about this Privacy Policy, please contact us at privacy@refery.io
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
