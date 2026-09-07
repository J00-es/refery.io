import type { Metadata } from 'next'
import Link from 'next/link'

/**
 * Service Providers and International Processing Register.
 *
 * Counsel asked for this to be public and versioned rather than "available on
 * request", and they are right that naming providers is the stronger position.
 *
 * The hard part is honesty. Every provider here is one the code genuinely uses,
 * read off the source rather than remembered. But a provider's headquarters is
 * not its processing region, and a published business term is not evidence of
 * our own account settings, so anything not actually confirmed says so instead
 * of being filled in with something plausible. A register that guesses is worse
 * than no register, because it is the document somebody relies on.
 */

export const metadata: Metadata = {
  title: 'Service Providers and International Processing Register · Refery',
  description:
    'The service providers Refery uses, what each one does, and the verification status of its contract and processing location.',
}

/** Bumped by hand when a row changes. A register nobody dates is not a record. */
const VERSION = '1.0'
const PUBLISHED = '7 September 2026'

type Status = 'confirmed' | 'checking'

const PROVIDERS: Array<{
  name: string
  role: string
  data: string
  status: Status
  note?: string
}> = [
  {
    name: 'Vercel',
    role: 'Hosting and application delivery',
    data: 'Everything the application serves, in transit. Request logs.',
    status: 'checking',
    note: 'Deployment, edge and log regions being confirmed against the plan we are on.',
  },
  {
    name: 'Supabase',
    role: 'Database, authentication and file storage',
    data: 'Candidate records, CVs, accounts, agreements.',
    status: 'checking',
    note: 'Project region, storage privacy settings, backup and log retention being confirmed.',
  },
  {
    name: 'Resend',
    role: 'Transactional email',
    data: 'Recipient addresses and message content, including signed agreements.',
    status: 'checking',
    note: 'Retention of message content and processing countries being confirmed.',
  },
  {
    name: 'Vercel AI Gateway',
    role: 'Routing model requests to the providers below',
    data: 'Whatever a given request contains, in transit.',
    status: 'checking',
    note: 'Downstream contract chain and the settings on every fallback route being confirmed.',
  },
  {
    name: 'Anthropic',
    role: 'Model inference',
    data: 'CV text and role descriptions, for assessment and drafting.',
    status: 'checking',
    note: 'Whether we reach it directly or through the gateway, and the no-training and retention terms that apply to that route, being confirmed.',
  },
  {
    name: 'OpenAI',
    role: 'Model inference',
    data: 'CV text and role descriptions, for assessment and drafting.',
    status: 'checking',
    note: 'Endpoint behaviour, data-sharing settings and retention eligibility being confirmed.',
  },
  {
    name: 'Google',
    role: 'Model inference, and separately mailbox and calendar access',
    data: 'CV text for inference. Mail and calendar entries for scheduling and correspondence.',
    status: 'checking',
    note: 'These are different services under different terms and are being recorded separately rather than as one entry.',
  },
  {
    name: 'Slack',
    role: 'Internal notification and approval',
    data: 'Candidate names and short summaries in internal messages.',
    status: 'checking',
    note: 'Message payload minimisation, workspace region and deletion being confirmed.',
  },
  {
    name: 'Granola',
    role: 'Meeting notes and transcripts',
    data: 'Notes and transcripts of calls, which may mention candidates.',
    status: 'checking',
    note: 'Recording notice, retention and onward AI processing chain being confirmed.',
  },
]

export default function ProvidersPage() {
  return (
    <div className="min-h-svh bg-[#F2F1EB]">
      <div className="mx-auto w-full max-w-[760px] px-5 pb-24 pt-10 sm:px-6 sm:pt-16">
        <Link href="/" className="inline-block text-[20px] font-bold tracking-[-0.03em] text-[#1F3A2F]">
          Refery<span className="italic">.</span>
        </Link>

        <header className="mt-8 sm:mt-10">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#1F3A2F]">
            Version {VERSION} · {PUBLISHED}
          </p>
          <h1 className="mt-3 text-balance text-[28px] font-semibold leading-[1.14] tracking-[-0.026em] text-[#161613] sm:text-[36px]">
            Service Providers and International Processing Register
          </h1>
          <p className="mt-4 text-[16px] leading-[1.62] text-[#6E6E68]">
            The companies that process information on Refery&rsquo;s behalf, what each one does, and
            what we hold about them. If you are a candidate and want to know where your information
            goes, this is the list.
          </p>
        </header>

        <div className="mt-7 rounded-[14px] border border-[#E4E3DC] bg-[#FAF9F5] p-5">
          <p className="text-[14.5px] font-semibold text-[#161613]">What &ldquo;being confirmed&rdquo; means</p>
          <p className="mt-2 text-[14px] leading-[1.6] text-[#6E6E68]">
            Every provider below is one we genuinely use. What is still being established for each is
            the exact contracting entity, the regions it processes in, and the contract terms that
            apply to our own account. We would rather publish that plainly than fill the gaps with
            something that sounds right. A provider&rsquo;s head office is not the same fact as where
            your data is processed, and a company&rsquo;s published terms are not evidence of the
            settings on our account.
          </p>
        </div>

        <div className="mt-6 overflow-hidden rounded-[16px] border border-[#E4E3DC] bg-white">
          {PROVIDERS.map((p, i) => (
            <div key={p.name} className={i > 0 ? 'border-t border-[#E4E3DC]' : ''}>
              <div className="p-4 sm:p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[15.5px] font-semibold text-[#161613]">{p.name}</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] ${
                      p.status === 'confirmed'
                        ? 'bg-[#E7EDE9] text-[#1F3A2F]'
                        : 'bg-[#FAF0D7] text-[#8A6A17]'
                    }`}
                  >
                    {p.status === 'confirmed' ? 'Confirmed' : 'Being confirmed'}
                  </span>
                </div>
                <p className="mt-1.5 text-[14px] leading-[1.55] text-[#161613]">{p.role}</p>
                <p className="mt-1 text-[13.5px] leading-[1.55] text-[#6E6E68]">{p.data}</p>
                {p.note && (
                  <p className="mt-2 text-[13px] leading-[1.5] text-[#9C9C95]">{p.note}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        <section className="mt-9">
          <h2 className="text-[18px] font-semibold tracking-[-0.018em] text-[#161613]">
            About model providers
          </h2>
          <p className="mt-2.5 text-[14.5px] leading-[1.62] text-[#6E6E68]">
            We use automated tools to read CVs, summarise them, suggest which roles someone may suit
            and draft correspondence.{' '}
            <b className="font-semibold text-[#161613]">
              Candidate information is not used to train these providers&rsquo; models.
            </b>{' '}
            That is a commitment we make in our partner agreement, and every route a request can take
            is on an approved list: a model that is not on it cannot be reached, even by
            misconfiguration, so a provider being unavailable can never quietly move your data
            somewhere we have not approved.
          </p>
          <p className="mt-3 text-[14.5px] leading-[1.62] text-[#6E6E68] sm:text-[15px]">
            What we are still documenting is the contractual chain behind each route: the exact
            contracting entity, the terms that apply to our account, and how long a provider holds a
            request for its own abuse monitoring. No training and no retention are different
            promises, and we would rather show our working than round the second one up to the first.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-[18px] font-semibold tracking-[-0.018em] text-[#161613]">
            Asking us about this
          </h2>
          <p className="mt-2.5 text-[14.5px] leading-[1.62] text-[#6E6E68]">
            If you want the detail behind any row, including the contracting entity and the terms we
            hold, write to{' '}
            <a href="mailto:privacy@refery.io" className="text-[#1F3A2F] underline underline-offset-2">
              privacy@refery.io
            </a>
            . See also our{' '}
            <Link href="/privacy" className="text-[#1F3A2F] underline underline-offset-2">
              privacy notice
            </Link>
            .
          </p>
        </section>

        <p className="mt-9 border-t border-[#E4E3DC] pt-5 text-[13px] leading-[1.6] text-[#9C9C95]">
          This register is versioned. When a provider is added, removed, or its status changes, the
          version and date at the top change with it.
        </p>
      </div>
    </div>
  )
}
