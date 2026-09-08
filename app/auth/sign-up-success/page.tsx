'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowRight, FileCheck } from 'lucide-react'

/**
 * After sign-up. Two truths, said plainly.
 *
 * Approved (Lily already said yes on the application, or an invitation
 * carried her decision): the account is active and Start is next, once the
 * email is verified. Everyone else: the application is with Lily.
 */
export default function Page() {
  const [approved, setApproved] = useState(false)
  useEffect(() => {
    try {
      setApproved(new URLSearchParams(window.location.search).get('approved') === '1')
    } catch {
      setApproved(false)
    }
  }, [])

  return (
    <div className="min-h-svh w-full bg-[#F2F1EB] font-[var(--font-dm-sans),'DM_Sans',system-ui,sans-serif]">
      <header className="fixed left-0 right-0 top-0 z-10 border-b border-[#161613]/10 bg-[#F2F1EB]/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-[22px] font-semibold text-[#161613]">
            Refery<span className="text-[#1F3A2F]">.</span>
          </Link>
        </div>
      </header>

      <main className="px-6 pb-16 pt-32">
        <div className="mx-auto max-w-xl text-center">
          <div className="mx-auto mb-8 flex h-16 w-16 items-center justify-center rounded-full bg-[#E7EDE9]">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1F3A2F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>

          <h1 className="mb-4 text-[36px] font-semibold leading-[1.1] tracking-[-0.02em] text-[#161613] sm:text-[42px]">
            {approved ? 'You are in.' : 'Thank you for signing up'}
          </h1>
          <p className="mx-auto mb-10 max-w-md text-[16px] leading-relaxed text-[#161613]/65">
            {approved
              ? 'Your account is active. Check your inbox for the verification link, then log in and your Start page has the one search we suggest and what to do first.'
              : 'Lily reads every application herself. You will hear from her by email within two working days.'}
          </p>

          <div className="mb-10 rounded-[10px] border border-[#161613]/10 bg-white p-6 text-left">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#E7EDE9]">
                <FileCheck className="h-5 w-5 text-[#1F3A2F]" />
              </div>
              <div>
                <h3 className="mb-1.5 text-[15px] font-semibold text-[#161613]">Partner agreement</h3>
                <p className="text-[14px] leading-relaxed text-[#161613]/65">
                  {approved
                    ? 'Your signed copy is on its way to your inbox. Everything you accepted is readable any time at refery.xyz/partner-terms.'
                    : 'A signed copy is on its way to your inbox. Once Lily approves the account, you get an email saying so and where to start.'}
                </p>
              </div>
            </div>
          </div>

          <Link href={approved ? '/start' : '/auth/login'} className="inline-flex items-center gap-2 text-[14px] font-medium text-[#1F3A2F]">
            {approved ? 'Go to Start' : 'Back to login'}
            <ArrowRight className="h-4 w-4" />
          </Link>

          <div className="mt-16 border-t border-[#161613]/5 pt-8">
            <p className="text-[13px] text-[#161613]/40">
              Questions? Reply to any email from Lily, or write to{' '}
              <a href="mailto:lily@refery.io" className="font-medium text-[#1F3A2F]">lily@refery.io</a>
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
