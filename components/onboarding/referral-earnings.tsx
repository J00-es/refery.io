import { CARD, META, RULE } from '@/lib/desk-ui'

/**
 * Two more ways to earn, on the Start page.
 *
 * A partner who has no search to work on today still has a network that
 * includes founders who are hiring and recruiters who are not on Refery yet.
 * Both pay, and both are in the partner terms (section 9), but the terms are a
 * page nobody re-reads. This card says the two numbers and gives each one a
 * button that opens an introduction email with hello@refery.io already on it,
 * which is how the terms say an introduction goes on the record.
 *
 * The copy repeats the terms exactly and adds nothing: 10% of the fee for
 * 24 months on a company, $1,000 a hire up to $20,000 on a partner. If the
 * terms change, change them here in the same commit.
 */
const APPLY_URL = 'https://refery.io/join-as-scout'
const RECORD_EMAIL = 'hello@refery.io'

function mailto(subject: string, body: string): string {
  return `mailto:?cc=${RECORD_EMAIL}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

export function ReferralEarnings({ partnerName }: { partnerName: string }) {
  const first = partnerName.trim().split(/\s+/)[0] || ''
  const signoff = first ? `\n\n${first}` : ''

  const founderMail = mailto(
    'Intro to Refery',
    `Hi,\n\nYou mentioned you are hiring. I work with Refery: they place senior people at seed to Series B startups through people like me who already know the candidates. Founders pay on hire only, and there is a free replacement if it does not work out.\n\nCopying Lily, who runs it, so she can take it from here.${signoff}`,
  )
  const partnerMail = mailto(
    'Intro to Refery',
    `Hi,\n\nI think you would do well on Refery. It is a referral network for seed to Series B startups: you introduce people you know, they handle the client, the contract and the invoice, and you keep 70% of the fee on a hire. No cost, no exclusivity.\n\nYou can apply here: ${APPLY_URL}\n\nCopying Lily, who runs it, in case you have questions.${signoff}`,
  )

  const rows = [
    {
      title: 'Introduce a founder who is hiring',
      earn: '10% of the fee on every hire',
      blurb: 'On top of anything you earn on the placement itself. For 24 months from the introduction, whoever sources the person.',
      href: founderMail,
      cta: 'Write the intro',
    },
    {
      title: 'Bring in a recruiter or scout',
      earn: '$1,000 a hire, up to $20,000',
      blurb: 'For every hire they close that lasts 90 days, once they have made a real submission within 30 days of joining.',
      href: partnerMail,
      cta: 'Write the intro',
    },
  ]

  return (
    <section className={`overflow-hidden ${CARD}`}>
      <div className="px-4 pt-4">
        <span className="text-[13px] font-semibold">Two more ways to earn</span>
        <p className={`mt-0.5 ${META}`}>Both stack on top of what you earn on a placement, and neither needs a search to be open.</p>
      </div>
      <ul className={`mt-3 divide-y ${RULE}`}>
        {rows.map(r => (
          <li key={r.title} className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold">{r.title}</p>
              <p className="mt-0.5 text-[13px] font-semibold text-[#1F3A2F]">{r.earn}</p>
              <p className={`mt-0.5 ${META}`}>{r.blurb}</p>
            </div>
            <a
              href={r.href}
              className="inline-flex min-h-[40px] shrink-0 items-center justify-center rounded-full border border-[#1F3A2F] px-4 text-[13px] font-semibold text-[#1F3A2F] hover:bg-[#E7EDE9]"
            >
              {r.cta}
            </a>
          </li>
        ))}
      </ul>
      <p className={`border-t px-4 py-3 ${RULE} ${META}`}>
        Copy {RECORD_EMAIL} into the introduction so it is on the record. First confirmed introduction wins.
      </p>
    </section>
  )
}
