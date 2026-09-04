'use client'

import Link from 'next/link'
import { useState } from 'react'
import { faqItems } from './home-faq'

/**
 * The refery.xyz landing page.
 *
 * This domain is the partner front door: scouts and independent recruiters,
 * nobody else. It used to carry the founder pitch, four Start Hiring buttons
 * and a page of copy about how expensive a bad engineering hire is, which was
 * written for people who never arrive here. Hiring managers are served by
 * refery.io, and the footer is the only place that says so.
 *
 * Every call to action goes to the existing sign-up flow rather than a separate
 * application form. That page already asks whether someone is a scout or a
 * recruiter, so asking again on the way in would be a second form to maintain
 * and a second place for the two lists to disagree.
 *
 * Palette and type are the app's own, so the page a partner reads before
 * signing up and the product they sign into are visibly one thing.
 */

const SIGN_UP = '/auth/sign-up'
const SIGN_IN = '/auth/login'

const PATHS = [
  {
    tag: 'Scouts',
    title: 'You are not a recruiter, and that is the point',
    body: 'Founders, engineers, operators and investors who know exceptional people and would stake their name on them. Refer someone when the moment is right. No quota, no pipeline to manage, no exclusivity.',
    points: [
      'Introduce someone in a few minutes',
      'We take it from first call to signed offer',
      'Paid when they start',
    ],
  },
  {
    tag: 'Recruiting partners',
    title: 'Keep the sourcing, drop the business development',
    body: 'Independent recruiters who are good at finding people and tired of winning clients, negotiating terms and chasing payment. We hold the client relationship. You work the searches.',
    points: [
      'Live searches at funded startups',
      'Terms already signed, fees already agreed',
      'We invoice, and we carry the guarantee',
    ],
  },
]

const STEPS = [
  {
    k: '01',
    title: 'Introduce someone',
    body: 'Add them in the app or email a CV. You do not need an open role: we match people against the searches we are running now and the ones that come next.',
  },
  {
    k: '02',
    title: 'We vet, match and represent',
    body: 'Every profile is reviewed. Strong ones go to our talent committee, then to the founders we are hiring for, with the context that makes a founder take the call.',
  },
  {
    k: '03',
    title: 'They start, you get paid',
    body: 'We invoice the client and pay your share. If the hire leaves inside 90 days, we carry the refund, not you.',
  },
]

const OURS = [
  'Winning and holding the client',
  'Terms, contracts and the fee negotiation',
  'Screening, committee calls and references',
  'Presenting the candidate and chasing feedback',
  'Invoicing, collection and your payout',
  'The 90-day guarantee, including the refund',
]

const YOURS = ['Knowing someone worth backing', 'Making the introduction']

const FIT = [
  {
    lead: 'Hands-on builders and sellers',
    rest: ', usually two to five years in. Individual contributors, not leadership.',
  },
  {
    lead: 'Ex-founders',
    rest: ', founding-team members and early startup operators with clear zero-to-one ownership.',
  },
  {
    lead: 'Engineering:',
    rest: ' Founding Engineer, AI/ML, Applied AI or Research, Full-Stack, Backend, DevOps, Forward-Deployed.',
  },
  {
    lead: 'GTM:',
    rest: ' Founding GTM, Founding AE, technical B2B or Enterprise Sales, Account Management.',
  },
  { lead: 'In the role’s city', rest: ', or ready to relocate to it.' },
]

const NOT_FIT = [
  'Big-company-only backgrounds with no meaningful startup experience.',
  'People who mainly want to manage rather than build.',
  'Remote-only candidates.',
  'Candidates who need new visa sponsorship.',
]

export default function HomeClient() {
  const [openFaq, setOpenFaq] = useState<number | null>(0)

  return (
    <div className="page">
      <nav className="nav">
        <div className="wrap nav-inner">
          <Link href="/" className="mark" aria-label="Refery home">
            Refery<span className="dot">.</span>
          </Link>
          <div className="nav-right">
            <a href="#how" className="nav-link only-lg">
              How it works
            </a>
            <a href="#split" className="nav-link only-lg">
              What you earn
            </a>
            <a href="#who" className="nav-link only-lg">
              Who we place
            </a>
            <Link href={SIGN_IN} className="nav-link">
              Sign in
            </Link>
            <Link href={SIGN_UP} className="btn btn-solid btn-sm">
              Sign up
            </Link>
          </div>
        </div>
      </nav>

      <header className="hero">
        <div className="wrap">
          <h1>
            You know the person. <em>We do the rest.</em>
          </h1>
          <p className="lede">
            Refery is where scouts and independent recruiters introduce people they would vouch
            for. We bring the clients, the contracts, the invoicing and the guarantee. You bring
            the person, and keep 70% of the fee.
          </p>
          <div className="cta-row">
            <Link href={SIGN_UP} className="btn btn-solid">
              Sign up
            </Link>
            <a href="#how" className="btn btn-ghost">
              See how it works
            </a>
          </div>
          <p className="hero-meta">
            Takes about three minutes. Already a partner?{' '}
            <Link href={SIGN_IN}>Sign in</Link>.
          </p>
        </div>
      </header>

      <div className="band">
        <div className="wrap stats">
          <div className="stat">
            <div className="n">70%</div>
            <div className="l">of the placement fee is yours on every hire you source.</div>
          </div>
          <div className="stat">
            <div className="n">24 months</div>
            <div className="l">
              your submission stays protected, so a slow hire is still your hire.
            </div>
          </div>
          <div className="stat">
            <div className="n">Zero</div>
            <div className="l">contracts to chase, invoices to send, or clients to win.</div>
          </div>
        </div>
      </div>

      <section className="sec">
        <div className="wrap">
          <p className="eyebrow">Two ways in</p>
          <h2>Built for people with a network, and for recruiters without a back office.</h2>
          <div className="two">
            {PATHS.map(p => (
              <article className="card" key={p.tag}>
                <span className="tag">{p.tag}</span>
                <h3>{p.title}</h3>
                <p>{p.body}</p>
                <ul>
                  {p.points.map(pt => (
                    <li key={pt}>{pt}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="sec" id="how">
        <div className="wrap">
          <p className="eyebrow">How it works</p>
          <h2>Three steps, and only the first one is yours.</h2>
          <div className="steps">
            {STEPS.map(s => (
              <div className="step" key={s.k}>
                <span className="k">{s.k}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sec" id="split">
        <div className="wrap">
          <p className="eyebrow">The division of labour</p>
          <h2>The parts of recruiting nobody enjoys are ours.</h2>
          <p className="lede">
            This is the whole deal in one table. If a line ever moves from the left column to the
            right, we have broken our side of it.
          </p>
          <div className="split">
            <div>
              <div className="col-h">Refery handles</div>
              <ul>
                {OURS.map(o => (
                  <li key={o}>
                    <span className="tick" aria-hidden>
                      ✓
                    </span>
                    <span>{o}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="col-h">You handle</div>
              <ul>
                {YOURS.map(y => (
                  <li key={y}>
                    <span className="tick" aria-hidden>
                      ✓
                    </span>
                    <span>{y}</span>
                  </li>
                ))}
              </ul>
              <p className="aside">
                That is the entire list. Our client fee is 10% to 20% of first-year base salary
                depending on the search, and 70% of it is yours, which is the deal precisely
                because everything else is on us.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="sec" id="who">
        <div className="wrap">
          <p className="eyebrow">Who we place</p>
          <h2>Narrow on purpose, so your introduction actually lands.</h2>
          <p className="lede">
            Seed to Series B startups, mostly San Francisco and New York, onsite. Knowing what we
            cannot place is worth as much as knowing what we can.
          </p>
          <div className="fit">
            <div className="yes">
              <h4>A strong fit</h4>
              <ul>
                {FIT.map(f => (
                  <li key={f.lead}>
                    <b>{f.lead}</b>
                    {f.rest}
                  </li>
                ))}
              </ul>
            </div>
            <div className="no">
              <h4>Not right now</h4>
              <ul>
                {NOT_FIT.map(f => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="wrap narrow">
          <p className="eyebrow">Questions</p>
          <h2>The things people ask before signing up.</h2>
          <div className="faq">
            {faqItems.map((item, i) => {
              const open = openFaq === i
              return (
                <div className="faq-item" key={item.q}>
                  <button
                    type="button"
                    className="faq-q"
                    aria-expanded={open}
                    aria-controls={`faq-${i}`}
                    onClick={() => setOpenFaq(open ? null : i)}
                  >
                    <span>{item.q}</span>
                    <span className="faq-sign" aria-hidden>
                      {open ? '−' : '+'}
                    </span>
                  </button>
                  {open && (
                    <p className="faq-a" id={`faq-${i}`}>
                      {item.a}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <div className="close">
        <div className="wrap">
          <p className="eyebrow on-dark">Get started</p>
          <h2>One introduction is enough to begin.</h2>
          <p className="close-p">
            Sign up in about three minutes. We review every application by hand and come back to
            you either way.
          </p>
          <div className="cta-row">
            <Link href={SIGN_UP} className="btn btn-light">
              Sign up
            </Link>
            <Link href={SIGN_IN} className="btn btn-outline-light">
              Sign in
            </Link>
          </div>
        </div>
      </div>

      <footer className="footer">
        <div className="wrap foot">
          <div className="foot-links">
            <Link href="/partner-terms">Partner terms</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/partner-guidelines">Guidelines</Link>
            <a href="mailto:lily@refery.io">Contact</a>
          </div>
          <div className="foot-note">
            Refery, Inc. · Hiring for your own team?{' '}
            <a href="https://refery.io">refery.io</a>
          </div>
        </div>
      </footer>

      <style jsx global>{`
        :root {
          --cream: #f2f1eb;
          --cream-deep: #e9e8e1;
          --paper: #faf9f5;
          --ink: #161613;
          --muted: #6e6e68;
          --faint: #9c9c95;
          --hair: #e4e3dc;
          --hair-2: #d2d1c7;
          --forest: #1f3a2f;
          --forest-deep: #142e24;
          --forest-bg: #e7ede9;
        }

        html {
          scroll-behavior: smooth;
        }
        @media (prefers-reduced-motion: reduce) {
          html {
            scroll-behavior: auto;
          }
        }

        .page {
          background: var(--cream);
          color: var(--ink);
          overflow-x: hidden;
        }

        .wrap {
          max-width: 1080px;
          margin: 0 auto;
          padding: 0 20px;
        }
        @media (min-width: 720px) {
          .wrap {
            padding: 0 32px;
          }
        }
        .narrow {
          max-width: 780px;
        }

        /* ── nav ─────────────────────────────────────────────── */
        .nav {
          position: sticky;
          top: 0;
          z-index: 40;
          background: rgba(242, 241, 235, 0.92);
          backdrop-filter: saturate(140%) blur(8px);
          border-bottom: 1px solid var(--hair);
        }
        .nav-inner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          height: 62px;
        }
        .mark {
          font-size: 20px;
          font-weight: 700;
          letter-spacing: -0.03em;
          color: var(--forest);
          text-decoration: none;
        }
        .mark .dot {
          font-style: italic;
        }
        .nav-right {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        @media (min-width: 900px) {
          .nav-right {
            gap: 26px;
          }
        }
        .nav-link {
          display: inline-flex;
          align-items: center;
          min-height: 44px;
          font-size: 14px;
          font-weight: 500;
          color: var(--muted);
          text-decoration: none;
        }
        .nav-link:hover {
          color: var(--ink);
        }
        .only-lg {
          display: none;
        }
        @media (min-width: 900px) {
          .only-lg {
            display: inline;
          }
        }

        /* ── buttons ─────────────────────────────────────────── */
        .btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 48px;
          padding: 0 22px;
          border-radius: 10px;
          font-size: 15px;
          font-weight: 600;
          text-decoration: none;
          white-space: nowrap;
          transition: background-color 0.15s, border-color 0.15s;
        }
        .btn-sm {
          min-height: 44px;
          padding: 0 16px;
          font-size: 14px;
          border-radius: 9px;
        }
        .btn-solid {
          background: var(--forest);
          color: #fff;
        }
        .btn-solid:hover {
          background: var(--forest-deep);
        }
        .btn-ghost {
          border: 1px solid var(--hair-2);
          color: var(--ink);
        }
        .btn-ghost:hover {
          border-color: var(--faint);
        }
        .btn-light {
          background: var(--cream);
          color: var(--forest);
        }
        .btn-outline-light {
          border: 1px solid rgba(242, 241, 235, 0.35);
          color: var(--cream);
        }
        .btn-outline-light:hover {
          border-color: rgba(242, 241, 235, 0.7);
        }
        .cta-row {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 28px;
        }
        .cta-row .btn {
          flex: 1 1 auto;
        }
        @media (min-width: 560px) {
          .cta-row .btn {
            flex: 0 0 auto;
          }
        }

        /* ── type ────────────────────────────────────────────── */
        .eyebrow {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--faint);
          margin: 0 0 14px;
        }
        .eyebrow.on-dark {
          color: rgba(242, 241, 235, 0.5);
        }
        .page h2 {
          margin: 0;
          font-size: clamp(25px, 4.4vw, 40px);
          line-height: 1.14;
          letter-spacing: -0.028em;
          font-weight: 600;
          text-wrap: balance;
        }
        .page h3 {
          margin: 0;
          font-size: 17px;
          font-weight: 600;
          letter-spacing: -0.012em;
        }
        .lede {
          margin: 16px 0 0;
          font-size: 16.5px;
          line-height: 1.62;
          color: var(--muted);
          max-width: 62ch;
        }

        /* ── hero ────────────────────────────────────────────── */
        .hero {
          padding: 52px 0 56px;
          border-bottom: 1px solid var(--hair);
        }
        @media (min-width: 720px) {
          .hero {
            padding: 76px 0 78px;
          }
        }
        .hero h1 {
          margin: 0;
          font-size: clamp(34px, 7vw, 66px);
          line-height: 1.04;
          letter-spacing: -0.035em;
          font-weight: 600;
          text-wrap: balance;
          max-width: 15ch;
        }
        .hero h1 em {
          font-style: normal;
          color: var(--forest);
        }
        .hero .lede {
          margin-top: 20px;
          font-size: clamp(16px, 2vw, 19px);
          max-width: 56ch;
        }
        .hero-meta {
          margin: 20px 0 0;
          font-size: 13.5px;
          color: var(--faint);
        }
        .hero-meta a {
          color: var(--forest);
          text-decoration: underline;
          text-underline-offset: 2px;
        }

        /* ── stat band ───────────────────────────────────────── */
        .band {
          background: var(--forest);
          color: var(--cream);
        }
        .band .stats {
          display: grid;
          gap: 26px;
          padding-top: 40px;
          padding-bottom: 40px;
        }
        @media (min-width: 720px) {
          .band .stats {
            grid-template-columns: repeat(3, 1fr);
            gap: 40px;
            padding-top: 46px;
            padding-bottom: 46px;
          }
        }
        .stat .n {
          font-size: clamp(32px, 5vw, 46px);
          font-weight: 600;
          letter-spacing: -0.03em;
          line-height: 1;
          font-variant-numeric: tabular-nums;
        }
        .stat .l {
          margin-top: 9px;
          font-size: 14.5px;
          line-height: 1.5;
          color: rgba(242, 241, 235, 0.66);
          max-width: 34ch;
        }

        /* ── sections ────────────────────────────────────────── */
        .sec {
          padding: 52px 0;
          border-bottom: 1px solid var(--hair);
        }
        @media (min-width: 720px) {
          .sec {
            padding: 70px 0;
          }
        }

        .two {
          display: grid;
          gap: 16px;
          margin-top: 30px;
        }
        @media (min-width: 800px) {
          .two {
            grid-template-columns: 1fr 1fr;
            gap: 20px;
          }
        }
        .card {
          background: #fff;
          border: 1px solid var(--hair);
          border-radius: 14px;
          padding: 22px;
        }
        @media (min-width: 720px) {
          .card {
            padding: 26px;
          }
        }
        .card .tag {
          display: inline-block;
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--forest);
          background: var(--forest-bg);
          padding: 4px 9px;
          border-radius: 5px;
          margin-bottom: 14px;
        }
        .card p {
          margin: 10px 0 0;
          font-size: 14.5px;
          line-height: 1.62;
          color: var(--muted);
        }
        .card ul {
          margin: 16px 0 0;
          padding: 0;
          list-style: none;
          display: grid;
          gap: 8px;
        }
        .card li {
          position: relative;
          padding-left: 17px;
          font-size: 14px;
          line-height: 1.55;
          color: var(--muted);
        }
        .card li::before {
          content: '';
          position: absolute;
          left: 0;
          top: 8px;
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: var(--forest);
        }

        /* steps */
        .steps {
          margin-top: 30px;
          border-top: 1px solid var(--hair);
        }
        .step {
          display: grid;
          grid-template-columns: 40px 1fr;
          gap: 4px 12px;
          padding: 22px 0;
          border-bottom: 1px solid var(--hair);
        }
        @media (min-width: 800px) {
          .step {
            grid-template-columns: 46px 260px 1fr;
            gap: 24px;
            align-items: baseline;
          }
        }
        .step .k {
          font-size: 13px;
          font-weight: 700;
          color: var(--forest);
          font-variant-numeric: tabular-nums;
        }
        .step h3 {
          grid-column: 2;
        }
        @media (min-width: 800px) {
          .step h3 {
            grid-column: auto;
          }
        }
        .step p {
          grid-column: 2;
          margin: 0;
          font-size: 14.5px;
          line-height: 1.62;
          color: var(--muted);
        }
        @media (min-width: 800px) {
          .step p {
            grid-column: auto;
          }
        }

        /* split */
        .split {
          display: grid;
          margin-top: 30px;
          border: 1px solid var(--hair);
          border-radius: 14px;
          overflow: hidden;
        }
        @media (min-width: 800px) {
          .split {
            grid-template-columns: 1fr 1fr;
          }
        }
        .split > div {
          padding: 22px;
          background: #fff;
        }
        @media (min-width: 720px) {
          .split > div {
            padding: 26px;
          }
        }
        .split > div + div {
          border-top: 1px solid var(--hair);
        }
        @media (min-width: 800px) {
          .split > div + div {
            border-top: 0;
            border-left: 1px solid var(--hair);
          }
        }
        .col-h {
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--faint);
          margin-bottom: 14px;
        }
        .split ul {
          margin: 0;
          padding: 0;
          list-style: none;
          display: grid;
          gap: 11px;
        }
        .split li {
          display: flex;
          gap: 10px;
          font-size: 14.5px;
          line-height: 1.5;
          color: var(--ink);
        }
        .tick {
          color: var(--forest);
          flex-shrink: 0;
        }
        .aside {
          margin: 18px 0 0;
          font-size: 14.5px;
          line-height: 1.62;
          color: var(--muted);
        }

        /* fit */
        .fit {
          display: grid;
          gap: 22px;
          margin-top: 28px;
        }
        @media (min-width: 800px) {
          .fit {
            grid-template-columns: 1fr 1fr;
            gap: 34px;
          }
        }
        .fit h4 {
          margin: 0 0 12px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .fit .yes h4 {
          color: var(--forest);
        }
        .fit .no h4 {
          color: #a8564c;
        }
        .fit ul {
          margin: 0;
          padding: 0;
          list-style: none;
          display: grid;
          gap: 9px;
        }
        .fit li {
          position: relative;
          padding-left: 17px;
          font-size: 14.5px;
          line-height: 1.55;
          color: var(--muted);
        }
        .fit li::before {
          content: '';
          position: absolute;
          left: 0;
          top: 8px;
          width: 5px;
          height: 5px;
          border-radius: 50%;
        }
        .fit .yes li::before {
          background: #2e9e6b;
        }
        .fit .no li::before {
          background: var(--hair-2);
        }
        .fit li b {
          color: var(--ink);
          font-weight: 600;
        }

        /* faq */
        .faq {
          margin-top: 28px;
          border-top: 1px solid var(--hair);
        }
        .faq-item {
          border-bottom: 1px solid var(--hair);
        }
        .faq-q {
          width: 100%;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          min-height: 56px;
          padding: 14px 0;
          background: none;
          border: 0;
          font: inherit;
          font-size: 15.5px;
          font-weight: 600;
          color: var(--ink);
          text-align: left;
          cursor: pointer;
        }
        .faq-sign {
          color: var(--faint);
          font-weight: 400;
          font-size: 20px;
          line-height: 1;
          flex-shrink: 0;
        }
        .faq-a {
          margin: 0;
          padding: 0 0 18px;
          font-size: 14.5px;
          line-height: 1.65;
          color: var(--muted);
          max-width: 68ch;
        }

        /* close */
        .close {
          background: var(--forest);
          color: var(--cream);
          padding: 56px 0;
        }
        @media (min-width: 720px) {
          .close {
            padding: 70px 0;
          }
        }
        .close h2 {
          color: var(--cream);
          max-width: 18ch;
        }
        .close-p {
          margin: 16px 0 0;
          font-size: 16px;
          line-height: 1.6;
          color: rgba(242, 241, 235, 0.72);
          max-width: 52ch;
        }

        /* footer */
        .footer {
          padding: 30px 0 44px;
        }
        .foot {
          display: flex;
          flex-wrap: wrap;
          gap: 14px;
          justify-content: space-between;
          align-items: center;
          font-size: 13px;
          color: var(--faint);
        }
        .foot-links a {
          display: inline-flex;
          align-items: center;
          min-height: 44px;
          color: var(--muted);
          text-decoration: none;
          margin-right: 18px;
        }
        .foot-links a:hover {
          color: var(--ink);
        }
        .foot-note a {
          color: var(--muted);
          text-decoration: underline;
          text-underline-offset: 2px;
        }

        :focus-visible {
          outline: 2px solid var(--forest);
          outline-offset: 2px;
        }
      `}</style>
    </div>
  )
}
