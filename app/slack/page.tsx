/**
 * refery.xyz/slack: the link behind "Ask questions via Slack" in partner
 * emails.
 *
 * Slack's own share-a-DM links expire, and the first launch emails went out
 * with one. This page does not: a partner types the email their account is
 * under, and the app either sends the Slack Connect invitation itself or hands
 * the address to Lily (see app/api/slack/connect). Public, no sign-in, because
 * the whole point is reaching Lily before you have found your password.
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { SlackConnectForm } from '@/components/partners/slack-connect-form'

export const metadata: Metadata = {
  title: 'Talk to Lily on Slack · Refery',
  description: 'Partners: type the email your Refery account is under and get a Slack Connect invitation to a private room with Lily.',
  robots: { index: false, follow: false },
}

export default function SlackConnectPage() {
  return (
    <main className="min-h-screen bg-[#F2F1EB] px-5 py-12 text-[#161613] sm:py-20">
      <div className="mx-auto max-w-[560px]">
        <Link href="https://refery.xyz" className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[#6E6E68] no-underline">
          Refery
        </Link>
        <h1 className="mt-4 text-[32px] font-semibold leading-[1.15] tracking-[-0.01em] sm:text-[38px]">
          Ask Lily anything on Slack
        </h1>
        <p className="mt-4 max-w-[52ch] text-[16px] leading-relaxed text-[#6E6E68]">
          For the quick questions between searches: a brief that reads oddly, a candidate you are not sure fits, a client you want context on. One private room, you and Lily, in your own Slack.
        </p>

        <div className="mt-8">
          <SlackConnectForm />
        </div>

        <div className="mt-10 grid gap-3 text-[14px] leading-relaxed text-[#6E6E68]">
          <p>
            Candidates still go through the platform, not Slack, so ownership and grading are recorded. <Link href="/guide" className="font-semibold text-[#1F3A2F]">How Searches and Pipeline work</Link>.
          </p>
          <p>
            Prefer email? <a href="mailto:lily@refery.io" className="font-semibold text-[#1F3A2F]">lily@refery.io</a> works too, it is just slower.
          </p>
        </div>
      </div>
    </main>
  )
}
