import Link from 'next/link'

/**
 * How Refery works, for someone deciding whether to join. Public, two
 * minutes, and the only place the model is explained in full. Every figure
 * here is in the signed partner terms; nothing states a placement count or
 * a promise the system cannot keep.
 */
export const metadata = { title: 'How Refery works' }

const STEPS = [
  { t: 'You introduce someone you would hire yourself', s: 'Ask them first. Then their CV as a PDF, and a few lines on why. Nobody contacts them until you say so.' },
  { t: 'We read them against the live searches', s: 'You hear back within two working days, either way, with the reason. If there is a fit, Lily talks to them.' },
  { t: 'We run the process with the client', s: 'Refery talks to the founder, schedules, and chases. You follow every step in Pipeline, with dates.' },
]

const FAQ = [
  { q: 'Can I see the client before I sign?', a: 'You see one anonymised live search before anything. Client names open after the partner terms, because every client has a confidentiality agreement with us.' },
  { q: 'How much time does it take?', a: 'None required. No minimum volume, no hours, no exclusivity. Introduce someone when someone comes to mind.' },
  { q: 'I already work with one of your clients', a: 'Relationships you had before joining are yours and carved out. Tell us and we will note it.' },
  { q: 'What about visas?', a: 'Depends on the role. The brief says what the client can do. Most cannot start fresh sponsorship; transfers often work.' },
  { q: 'What if there is no match for someone I send?', a: 'We tell you within two working days, with the specific requirement that is missing. With their permission we keep the person for future searches and re-check every week.' },
]

export default function HowItWorksPage() {
  return (
    <div className="min-h-svh bg-[#F2F1EB] text-[#161613]">
      <div className="mx-auto w-full max-w-md px-5 pb-14 pt-10 sm:max-w-xl sm:pt-14">
        <p className="text-[18px] font-semibold">Refery<span className="text-[#1F3A2F]">.</span></p>
        <p className="mt-6 font-mono text-[12px] text-[#9C9C95]">How Refery works · two minutes</p>
        <h1 className="mt-1 text-[26px] font-semibold leading-tight tracking-[-0.02em]">You vouch for someone. We do the rest.</h1>

        <ol className="mt-6 grid gap-2">
          {STEPS.map((x, i) => (
            <li key={x.t} className="flex gap-3 rounded-[14px] border border-[#E4E3DC] bg-white px-4 py-3">
              <span className="w-4 shrink-0 pt-0.5 font-mono text-[12px] text-[#9C9C95]">{i + 1}</span>
              <span><span className="block text-[14px] font-semibold">{x.t}</span><span className="block text-[12.5px] text-[#6E6E68]">{x.s}</span></span>
            </li>
          ))}
          <li className="flex gap-3 rounded-[14px] bg-[#1F3A2F] px-4 py-3 text-[#FAF9F5]">
            <span className="w-4 shrink-0 pt-0.5 font-mono text-[12px] text-[#B9CBBF]">4</span>
            <span><span className="block text-[14px] font-semibold">They are hired. 70% of the placement fee is yours.</span><span className="block text-[12.5px] text-[#D9E3DC]">Paid once they have passed 90 days in the job and the client has paid us, within 14 business days of both. Nothing upfront on either side.</span></span>
          </li>
        </ol>

        <section className="mt-5 rounded-[14px] border border-[#E4E3DC] bg-white p-4">
          <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[#9C9C95]">Worked example</p>
          <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-[13.5px]">
            <dt className="text-[#6E6E68]">Founding engineer, SF, base salary</dt><dd className="text-right font-mono">$200,000</dd>
            <dt className="text-[#6E6E68]">Client fee on that role, 15%</dt><dd className="text-right font-mono">$30,000</dd>
            <dt className="border-t border-[#E4E3DC] pt-1.5 font-semibold">To you, 70%</dt><dd className="border-t border-[#E4E3DC] pt-1.5 text-right font-mono font-semibold text-[#1F3A2F]">$21,000</dd>
          </dl>
          <p className="mt-2 text-[12px] text-[#9C9C95]">Fees are usually 10 to 20% of first-year base and differ by role. Each search shows its own fee and your share before you decide.</p>
        </section>

        <section className="mt-5">
          <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[#9C9C95]">What protects your introduction</p>
          <div className="mt-2 divide-y divide-[#E4E3DC] rounded-[14px] border border-[#E4E3DC] bg-white text-[13px]">
            <p className="px-4 py-3"><span className="font-semibold">A confirmed submission is yours for 24 months</span> <span className="text-[#6E6E68]">with that client, in any role. It counts from the moment we confirm and timestamp it, not from saving a name. First confirmed submission wins.</span></p>
            <p className="px-4 py-3"><span className="font-semibold">You need their permission</span> <span className="text-[#6E6E68]">to share their details with Refery and our clients. We ask you to confirm it on each introduction.</span></p>
            <p className="px-4 py-3"><span className="font-semibold">Client names are confidential</span> <span className="text-[#6E6E68]">until a candidate is actively being screened. Every brief has a shareable version you can pass on.</span></p>
          </div>
          <p className="mt-2 text-[12.5px] text-[#6E6E68]">The full partner terms and the submission terms: <Link href="/partner-terms" className="font-semibold text-[#1F3A2F] underline underline-offset-2">refery.xyz/partner-terms</Link></p>
        </section>

        <section className="mt-5">
          <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[#9C9C95]">Asked on most calls</p>
          <div className="mt-2 divide-y divide-[#E4E3DC] rounded-[14px] border border-[#E4E3DC] bg-white">
            {FAQ.map(f => (
              <details key={f.q} className="group px-4 py-3">
                <summary className="flex min-h-[28px] cursor-pointer list-none items-center justify-between gap-3 text-[13.5px] font-semibold">
                  {f.q}
                  <span className="text-[#9C9C95] transition-transform group-open:rotate-180" aria-hidden>⌄</span>
                </summary>
                <p className="mt-1.5 text-[12.5px] text-[#6E6E68]">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <div className="mt-6 grid gap-2">
          <Link href="/auth/login" className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-[#1F3A2F] text-[14px] font-semibold text-white">I have an account</Link>
          <a href="https://refery.io/join-as-scout" className="inline-flex min-h-[48px] items-center justify-center rounded-full border border-[#D2D1C7] text-[14px] font-semibold">Apply to join</a>
        </div>
      </div>
    </div>
  )
}
