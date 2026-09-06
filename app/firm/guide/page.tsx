import type { Metadata } from 'next'
import Link from 'next/link'

/**
 * How firm accounts work, for anyone deciding whether to be one.
 *
 * Public and login-free on purpose: the first person to read it is usually
 * someone on the sign-up form who has not committed to anything, and the second
 * is whoever they forwarded it to. Nothing here is specific to an account, so
 * there is nothing to protect.
 *
 * Deliberately generic. No worked example with invented names, because a reader
 * has to map a story onto their own firm before they can use it, and the story
 * is the part that gets in the way. "You", "your colleague", "the person who
 * can sign" is what they actually need to place themselves in it.
 *
 * Written mobile-first: one column at every width, nothing that scrolls
 * sideways, and the timeline rail collapses rather than squeezing.
 */

export const metadata: Metadata = {
  title: 'How firm accounts work on Refery',
  description:
    'One person signs for the company. Colleagues join without their own agreement, and the firm holds the submissions and gets paid.',
}

const STEPS: Array<{ n: string; title: string; who: string; body: React.ReactNode }> = [
  {
    n: '01',
    title: 'Someone sets the firm up',
    who: 'Anyone at your firm',
    body: (
      <>
        Choose <b>Recruiting Firm</b> when you sign up, then add your company: its name, the registered
        legal entity, and where it is registered. You do not need to be a founder or a director to do
        this part.
      </>
    ),
  },
  {
    n: '02',
    title: 'Someone signs for the company',
    who: 'Whoever can bind it',
    body: (
      <>
        We ask one question: <b>can you sign agreements for your company?</b> If yes, you accept and you
        are done. If not, name the person who can, and we email them. They do not need an account, and
        you do not have to wait around for them to finish setting up.
      </>
    ),
  },
  {
    n: '03',
    title: 'We review the firm',
    who: 'Refery',
    body: (
      <>
        Every firm is looked at by hand, usually the same day. Nothing goes live before this, and we
        will email you when it is done.
      </>
    ),
  },
  {
    n: '04',
    title: 'You invite your colleagues',
    who: 'Your firm admin',
    body: (
      <>
        Add them by email and pick what they can do. Each accepts short access terms of their own, which
        take a moment, and then they are in. <b>No separate approval, and no second agreement.</b>
      </>
    ),
  },
  {
    n: '05',
    title: 'You work as one team',
    who: 'Everyone',
    body: (
      <>
        The same candidates, the same submissions, the same searches. Anything anyone introduces is
        recorded for the firm, and we pay the firm rather than individuals.
      </>
    ),
  },
]

const ROLES: Array<{ name: string; can: string; note: string }> = [
  {
    name: 'Firm admin',
    can: 'Everything, plus inviting and removing people',
    note: 'Whoever set the firm up starts here.',
  },
  {
    name: 'Recruiter',
    can: 'Sees and submits across the whole firm',
    note: 'The one most people should have.',
  },
  {
    name: 'Coordinator',
    can: 'Only the candidates assigned to them, and cannot submit',
    note: 'For a contractor or a researcher you do not want holding the whole book.',
  },
]

const QA: Array<{ q: string; a: React.ReactNode }> = [
  {
    q: 'Does every person at the firm have to sign the agreement?',
    a: (
      <>
        No, and that is the point of a firm account. One person signs for the company. Everyone else
        accepts short access terms covering their own use of the platform: confidentiality, using their
        own login, and what continues after they leave. Those are about them personally, so the company
        cannot accept them on their behalf.
      </>
    ),
  },
  {
    q: 'What if the person who can sign is not the person setting it up?',
    a: (
      <>
        That is the normal case, and it is handled. Name them during sign-up and we email them a link.
        They read the terms, type their name and accept. They never need an account, and you keep going
        in the meantime.
      </>
    ),
  },
  {
    q: 'Who gets paid?',
    a: (
      <>
        The firm, always. How that is split internally is between the firm and its people, and not
        something Refery is party to or has a view on.
      </>
    ),
  },
  {
    q: 'What happens to our existing client relationships?',
    a: (
      <>
        They stay yours. Declare them and they are excluded, so working with Refery does not put a
        relationship you already built at risk.
      </>
    ),
  },
  {
    q: 'Someone leaves the firm. What happens?',
    a: (
      <>
        A firm admin removes them and their access ends immediately, not at the end of a session or a
        day. Anything they held passes to the admin who removed them, and the firm keeps every
        submission and every claim, because those belonged to the firm rather than to them. Both sides
        get an email, so a removal is never something you discover by finding a door locked.
      </>
    ),
  },
  {
    q: 'Can we leave?',
    a: (
      <>
        Yes, either side can end it. Candidates already submitted stay protected for 24 months, so work
        already done still pays if it turns into a hire.
      </>
    ),
  },
]

function Rule() {
  return <div className="h-px w-full bg-[#E4E3DC]" />
}

export default function FirmGuidePage() {
  return (
    <div className="min-h-svh bg-[#F2F1EB]">
      <div className="mx-auto w-full max-w-[680px] px-5 pb-24 pt-10 sm:px-6 sm:pt-16">
        <Link
          href="/"
          className="inline-block text-[20px] font-bold tracking-[-0.03em] text-[#1F3A2F]"
        >
          Refery<span className="italic">.</span>
        </Link>

        <header className="mt-8 sm:mt-10">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#1F3A2F]">
            Firm accounts
          </p>
          <h1 className="mt-3 text-balance text-[30px] font-semibold leading-[1.12] tracking-[-0.028em] text-[#161613] sm:text-[40px]">
            One signature for the company. Everyone else just joins.
          </h1>
          <p className="mt-4 text-[16px] leading-[1.6] text-[#6E6E68] sm:text-[17px]">
            If you work as a team, you should not each be negotiating your own agreement. One person
            signs for the firm, colleagues come in behind them, and the firm holds the work and gets
            paid. Here is exactly how it goes.
          </p>
        </header>

        {/* ── the five steps ─────────────────────────────────────── */}
        <section className="mt-11 sm:mt-14">
          <h2 className="text-[19px] font-semibold tracking-[-0.018em] text-[#161613] sm:text-[21px]">
            What happens, in order
          </h2>

          <ol className="mt-5 space-y-0">
            {STEPS.map((s, i) => (
              <li key={s.n} className="relative flex gap-4 sm:gap-5">
                {/* The rail. Drawn per row rather than as one absolute line so
                    it cannot drift out of step with content that wraps. */}
                <div className="flex flex-col items-center">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#1F3A2F] text-[11px] font-bold text-white sm:h-9 sm:w-9 sm:text-[12px]">
                    {s.n}
                  </span>
                  {i < STEPS.length - 1 && <span className="w-px flex-1 bg-[#D2D1C7]" />}
                </div>
                <div className={i < STEPS.length - 1 ? 'pb-7 sm:pb-8' : ''}>
                  <p className="text-[16.5px] font-semibold leading-[1.3] tracking-[-0.012em] text-[#161613] sm:text-[17.5px]">
                    {s.title}
                  </p>
                  <p className="mt-1 text-[11.5px] font-semibold uppercase tracking-[0.07em] text-[#9C9C95]">
                    {s.who}
                  </p>
                  <p className="mt-2.5 text-[14.5px] leading-[1.62] text-[#6E6E68] sm:text-[15px]">
                    {s.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* ── the fork, called out ───────────────────────────────── */}
        <section className="mt-11 rounded-[16px] border border-[#E4E3DC] bg-white p-5 sm:mt-14 sm:p-7">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#8A6A17]">
            The part people ask about
          </p>
          <h2 className="mt-2.5 text-balance text-[20px] font-semibold leading-[1.25] tracking-[-0.018em] text-[#161613] sm:text-[23px]">
            You do not have to be the boss to bring your firm here
          </h2>
          <p className="mt-3 text-[14.5px] leading-[1.62] text-[#6E6E68] sm:text-[15px]">
            Setting the account up and signing for the company are two different things, and they are
            often two different people. We keep them separate on purpose, so nobody signs something they
            are not in a position to sign.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[12px] border border-[#E4E3DC] bg-[#FAF9F5] p-4">
              <p className="text-[14.5px] font-semibold text-[#161613]">If you can sign</p>
              <p className="mt-1.5 text-[13.5px] leading-[1.55] text-[#6E6E68]">
                You read the terms and accept during sign-up. That is the whole thing.
              </p>
            </div>
            <div className="rounded-[12px] border border-[#E4E3DC] bg-[#FAF9F5] p-4">
              <p className="text-[14.5px] font-semibold text-[#161613]">If you cannot</p>
              <p className="mt-1.5 text-[13.5px] leading-[1.55] text-[#6E6E68]">
                Name the person who can. We email them, they sign without needing an account, and you
                are not asked to accept anything for the company.
              </p>
            </div>
          </div>
        </section>

        {/* ── roles ──────────────────────────────────────────────── */}
        <section className="mt-11 sm:mt-14">
          <h2 className="text-[19px] font-semibold tracking-[-0.018em] text-[#161613] sm:text-[21px]">
            What your colleagues can do
          </h2>
          <p className="mt-2 text-[14.5px] leading-[1.6] text-[#6E6E68] sm:text-[15px]">
            You pick this when you invite them, and you can remove anyone later.
          </p>

          <div className="mt-5 overflow-hidden rounded-[16px] border border-[#E4E3DC] bg-white">
            {ROLES.map((r, i) => (
              <div key={r.name}>
                {i > 0 && <Rule />}
                <div className="p-4 sm:p-5">
                  <p className="text-[15px] font-semibold text-[#161613]">{r.name}</p>
                  <p className="mt-1 text-[14px] leading-[1.55] text-[#6E6E68]">{r.can}</p>
                  <p className="mt-1.5 text-[13px] leading-[1.5] text-[#9C9C95]">{r.note}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── questions ──────────────────────────────────────────── */}
        <section className="mt-11 sm:mt-14">
          <h2 className="text-[19px] font-semibold tracking-[-0.018em] text-[#161613] sm:text-[21px]">
            Questions we get
          </h2>

          <div className="mt-5 space-y-3">
            {QA.map(item => (
              <details
                key={item.q}
                className="group overflow-hidden rounded-[14px] border border-[#E4E3DC] bg-white"
              >
                <summary className="flex cursor-pointer list-none items-start justify-between gap-3 p-4 text-[15px] font-semibold leading-[1.4] text-[#161613] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F3A2F]/40 sm:p-5 [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span
                    aria-hidden
                    className="mt-0.5 shrink-0 text-[18px] leading-none text-[#9C9C95] transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="px-4 pb-4 text-[14.5px] leading-[1.62] text-[#6E6E68] sm:px-5 sm:pb-5">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* ── close ──────────────────────────────────────────────── */}
        <section className="mt-11 rounded-[16px] bg-[#1F3A2F] p-6 sm:mt-14 sm:p-8">
          <h2 className="text-balance text-[20px] font-semibold leading-[1.25] tracking-[-0.018em] text-white sm:text-[23px]">
            Ready when you are
          </h2>
          <p className="mt-2.5 text-[14.5px] leading-[1.62] text-[#C6D6CC] sm:text-[15px]">
            Setting the firm up takes about two minutes. If someone else has to sign, they will get an
            email the moment you finish.
          </p>
          <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
            <Link
              href="/auth/sign-up"
              className="inline-flex min-h-[46px] items-center justify-center rounded-[10px] bg-white px-5 text-[15px] font-semibold text-[#1F3A2F] transition-colors hover:bg-[#F2F1EB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              Set up your firm
            </Link>
            <Link
              href="/partner-terms"
              className="inline-flex min-h-[46px] items-center justify-center rounded-[10px] border border-[#4B6B5C] px-5 text-[15px] font-semibold text-white transition-colors hover:bg-[#2A4A3C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              Read the terms
            </Link>
          </div>
        </section>

        <p className="mt-8 text-[13px] leading-[1.6] text-[#9C9C95]">
          Still unsure whether a firm account is right for you? Reply to any email from us, or write to{' '}
          <a
            href="mailto:hello@refery.io"
            className="text-[#1F3A2F] underline underline-offset-2"
          >
            hello@refery.io
          </a>
          .
        </p>
      </div>
    </div>
  )
}
