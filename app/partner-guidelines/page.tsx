'use client'

import React, { useState, useEffect } from 'react'

export default function PartnerGuidelinesPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [counter, setCounter] = useState(0)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible')
          }
        })
      },
      { threshold: 0.05 }
    )
    document.querySelectorAll('.reveal').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const target = 200
    const duration = 2000
    const steps = 40
    const stepValue = target / steps
    const stepTime = duration / steps
    let current = 0
    const interval = setInterval(() => {
      current += stepValue
      if (current >= target) {
        setCounter(target)
        clearInterval(interval)
      } else {
        setCounter(Math.floor(current))
      }
    }, stepTime)
    return () => clearInterval(interval)
  }, [])

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index)
  }

  const faqData = [
    {
      category: 'Getting started',
      items: [
        { q: 'Who is Refery for?', a: "Professional independent recruiters and talent partners who specialize in tech — engineering, product, or GTM — and have a track record placing at startups or high-growth companies. Deep networks in SF, NY, or London. Quality-over-volume approach. If you're looking to run a curated, high-conversion desk without the overhead of running an agency or the grind of doing BD, you're in the right place." },
        { q: 'How do I join?', a: "Three steps. (1) Book a 15-minute intro call — we align on your expertise, network, and the best-fit roles. (2) Sign the partner agreement — it's a one-click clickwrap that takes 30 seconds, covering the 70% split and 24-month candidate protection. (3) Get full platform access — browse every open role with complete context, salary bands, and estimated payouts. Most partners are submitting their first candidates within days of joining." },
        { q: 'Do I need prior recruiting experience?', a: "Yes. Refery partner recruiters are professionals with a demonstrable track record — people who've run successful desks, placed senior talent at startups, and built reputations in their specific domain. If you're earlier in your career or looking to refer opportunistically without a full recruiting motion, our operator scout program is a better fit — ask about it on your intro call." },
        { q: 'Is there a commitment or minimum?', a: 'None. No minimum placements. No monthly quota. No platform fee. Work the roles that match your network when you have the bandwidth. We bet that great recruiters with great deal flow place consistently — the volume takes care of itself.' },
        { q: 'How long until my first placement?', a: "Depends on your activity level and network fit. Most partners submit their first candidates within the first week. Talent Committee vetting is 48 hours. Time-to-placement typically runs 4–8 weeks depending on the client's interview process. First payouts typically land 10–14 weeks after your first submission, accounting for interview cycles, offer acceptance, start date, and the guarantee period." },
        { q: 'What does onboarding look like?', a: 'After you sign the partner agreement, you have full access to the platform and visibility to all available jobs. You start sending over candidates, and we take it from there.' },
      ]
    },
    {
      category: 'Money & payout',
      items: [
        { q: 'How much do I earn per placement?', a: "70% of the placement fee. A role's fee is either a percentage of the candidate's first-year base salary — usually 10–20%, negotiated between Refery and the client — or a fixed referral fee (e.g. $10,000, $25,000, $50,000). Each role shows its confirmed fee structure before you work it, and the fee shown when you submit is the fee that applies to any resulting placement. On a $350K senior hire, a 10% fee pays you $24,500 and a 20% fee pays you $49,000. On a fixed $15K referral fee, you earn $10,500. Your 70% share is constant — no tiering, caps, or clawbacks." },
        { q: 'When do I get paid?', a: "Within 14 business days after the candidate completes 90 days of continuous employment, once Refery has collected the placement fee from the client. The 90-day clock runs from the candidate's start date; standard time off and approved leave (medical, parental, military) under the employer's own policies don't interrupt it. Once they pass day 90, we release your payout — no back-and-forth, no chasing." },
        { q: 'How do I actually receive the money?', a: 'Direct bank transfer (ACH or wire) for US-based partners, and Wise for international partners.' },
        { q: "What if the hire's employment ends during the guarantee period?", a: "If the hire's employment ends for any reason within the 90 days — resignation, performance, restructuring, layoff — no payout is made, but there is no clawback either. Refery holds the client's fee through the guarantee period and handles any refund directly, so nothing has been paid out to you and there is nothing to return. You are never involved in refund discussions or disputes. Your 24-month candidate protection on that person remains fully active for any other role they match with on the platform." },
        { q: "What if the client doesn't pay Refery?", a: "We handle all collection end-to-end, including late-fee enforcement written into every client agreement. Your payout is contingent on us collecting — but our agreements are enforceable and we have every incentive to collect (we don't earn a dime either until the client pays). In practice, collection on placed candidates is close to 100%." },
        { q: 'Does Refery charge me anything?', a: "Zero. No subscription, no platform fee, no membership, no tool costs. Refery makes its 30% share only when you place successfully. If you don't earn, we don't earn. That alignment is the foundation of how this works." },
        { q: 'Are there other ways to earn beyond placements?', a: "Two, both written into the partner agreement. (1) Company introductions — introduce a startup to Refery and, for 24 months from the confirmed introduction, you earn an additional 10% of the placement fee on every hire that closes there. This stacks: if you also submitted the placed candidate, you collect both. (2) Partner introductions — introduce a recruiter or scout who makes a qualified submission within 30 days, and you earn $1,000 per hire they close that clears the 90-day guarantee, up to $20,000 lifetime per person you introduce. Both bonuses follow the same 90-day hold and client-collection rules as your placement payouts." },
      ]
    },
    {
      category: 'Roles & deal flow',
      items: [
        { q: 'How do I access roles?', a: 'Full platform access after signing the partner agreement. Browse every open role with complete context: company name, stage, funding history, product, salary band, must-haves, hiring timeline, and confirmed fee structure (either a fixed referral fee or 10–20% of first-year base). Filter by domain, level, and location.' },
        { q: 'How many roles are live at any time?', a: 'Growing every week. Our 200+ VC-backed startups maintain a rolling pipeline of engineering and GTM roles — typically 50–100 active roles at any given moment, with 5–15 new roles launched per week as we onboard new clients.' },
        { q: 'Are these real roles with real budgets?', a: "Yes — confirmed partnership roles have signed agreements with clear fee structures. You'll also see roles marked \"In Pipeline\" — these are companies we're actively targeting or in discussions with. We display them so you can start identifying candidates proactively. When the partnership confirms, we match within 48 hours. Each role clearly shows its status and fee arrangement." },
        { q: 'What types of companies am I recruiting for?', a: 'VC-backed startups from seed to Series B, primarily in SF (~80%), New York, and London. Backed by YC, Sequoia, a16z, Index Ventures, General Catalyst, Lightspeed, Founders Fund, Tiger Global, Greylock, and more. Salary bands typically $250–350K base on senior roles, with founding engineers and specialist leadership roles reaching higher.' },
        { q: 'What roles are most in-demand right now?', a: 'Highest demand: AI/ML engineers, forward deployed engineers, staff and senior software engineers, founding engineers, and backend engineers (Go, Rust, Python). Also strong demand for product managers, enterprise AEs, account directors, and heads of growth. The list shifts weekly as new clients onboard.' },
        { q: 'What does "In Pipeline" mean on a role?', a: "These are companies we're actively targeting or in early discussions with. The role is real and the company is hiring, but partnership terms aren't confirmed yet. We show these so you can start identifying candidates proactively. Once the partnership is finalized, we can match your candidates within 48 hours — giving you a head start." },
      ]
    },
    {
      category: 'How the process works',
      items: [
        { q: 'How do I submit candidates?', a: "Through the platform or via email to your partner contact. Each submission includes: resume or CV, your verdict (1–2 paragraphs on why this candidate fits), the candidate's contact details, and context on their situation — comp expectations, availability, interview readiness, any relevant flags. A submission is \"qualified\" — and your 24-month candidate protection starts — only when all three are true: you've shared the CV, contact details, and a written assessment of fit; you've personally vetted the candidate or can speak to their fit from direct knowledge or a trusted warm intro; and Refery confirms and timestamps it on the platform. A name on its own, or a forwarded CV with no context, does not start your protection. By submitting, you confirm you have the candidate's permission to share their details with Refery and our client companies. To help with positioning, think through: What stage of startups are you most excited about, and why? Can you share the names of roles you're looking for? (e.g. founding engineer, backend engineer, Sr. ML/AI engineer, etc.) What locations are you open to? Are you open to relocate? If yes, which cities? What work setup do you prefer? (On-site / hybrid / remote / flexible — note that most roles we work on are on-site.) What base comp range are you targeting? When would you be available to start? Are there any industries you're especially excited about, or any you want to avoid?" },
        { q: 'What makes a great submission?', a: 'Three things. (1) Personal endorsement — you know this person, or someone you deeply trust knows them. (2) Specific fit — why this candidate, for this role, right now. Not "strong engineer," but "built the exact system this company is building, shipped it at scale, left amicably." (3) Honest context — including any caveats. Resume-blast operators burn out in one cycle; curators build compounding careers here.' },
        { q: 'What happens after I submit?', a: "A Talent Committee member schedules a qualifying conversation with the candidate within 48 hours. If they pass the vetting, the candidate is matched across every relevant open role on the platform. You have full visibility into every stage — vetting outcome, match list, each client's response, interview progress, and offer status." },
        { q: 'What is the Talent Committee?', a: "A rotating panel of investors, angels, operators, and founders who've built startups themselves. They spend 25–30 minutes with each candidate to understand background, motivations, fit, and communication style. Candidates who pass get significantly higher interview rates from hiring managers — the vetting signal is trusted across the network. It's designed to accelerate your results, not gate them." },
        { q: 'Do I earn if my candidate is hired for a different role?', a: 'Yes. You earn on every placement from your submission, regardless of which role your candidate ultimately lands in. Your 24-month candidate protection locks the attribution across every role on the platform during that window.' },
      ]
    },
    {
      category: 'Protection & terms',
      items: [
        { q: 'Why can\'t I share company names with candidates directly?', a: "Our founders have asked us to keep role details confidential until candidates are vetted. Many have close relationships with us and want their opportunities shared only with carefully selected talent — protecting their employer brand and avoiding unsolicited outreach. The process: you identify promising candidates, they have a conversation with our Talent Committee, and once vetted, we share specific opportunities privately. If helpful for attracting talent beforehand, you can mention basics like stage, vertical (e.g. fintech), funding, and location — or simply introduce them to Lily, who knows the full landscape. This approach keeps founders happy and ensures your referrals get premium treatment." },
        { q: 'What is 24-month candidate protection?', a: 'When you submit a candidate, that attribution is locked to you for 24 months. For any role they get placed in on the Refery platform — at any company, in any city, at any stage — within that window, you earn the payout. No other partner can claim them. First submission wins, timestamped on the platform.' },
        { q: 'Can I work with other platforms or run my own agency in parallel?', a: "Absolutely. No exclusivity. No non-compete. No minimum activity. Work with other marketplaces, run your own book, keep direct clients — whatever the mix of your business. Three narrow restrictions apply, and they exist to protect the clients and candidates that make Refery work: (1) once one of your candidates is in an active process with a client, that placement runs through Refery — so no dual-submitting the same candidate to the same company through another channel; (2) while you're working a client's roles and for 12 months after, don't recruit that client's own employees into other Refery roles; (3) the 12-month non-circumvention on clients you discovered through Refery. Outside those specific pairings, your network stays entirely yours." },
        { q: 'What about my existing clients and candidates?', a: 'Pre-existing relationships are fully carved out. The non-circumvention clause (12 months) applies only to clients you discover through Refery. Your existing book is your book — Refery has no claim on relationships that predate your partnership with us. If a pre-existing relationship is disputed, we may ask for supporting evidence like prior invoices or email history.' },
        { q: 'Can I stop anytime?', a: 'Yes. Either party can end the partnership at any time, for any reason, with no notice required. Pending payouts survive termination — you still get paid on every candidate you submitted before stopping. Your 24-month candidate protection also survives for any in-pipeline placements.' },
        { q: 'Are there any clawbacks I should know about?', a: "Zero clawbacks, ever. Refery holds the client's fee through the 90-day guarantee period and only pays you out once it clears, so there is never money in your account that could be taken back. The only \"no-payout\" scenario is a hire whose employment ends before day 90. Once your payout lands, it's yours." },
        { q: 'Can Refery change my payout terms?', a: "Operational terms can be updated with 30 days' notice. But your payout percentage and payment timing can never be changed without your written consent. That's in the agreement — your economics are protected." },
      ]
    },
    {
      category: 'About Refery',
      items: [
        { q: 'How established is the platform?', a: "We're in a transition phase — moving from a community-driven network to a professional platform. This means you're joining at an inflection point: early enough to shape the platform and build relationships, established enough to have 200+ companies and proven placements. Some legacy terms from our community phase remain, while new partnerships follow our standardized model." },
        { q: "Who's behind Refery?", a: "Operators and investors with 9- and 10-figure exits, who've built companies from first hire to acquisition, and who've deployed capital into some of the most recognizable startups of the last decade. We've lived both sides of the hiring problem — the founder side, the fund side, and the operator side. Refery is what we built to fix it." },
        { q: 'How is Refery different from other recruiting platforms?', a: 'Three structural differences no one else has. (1) Talent Committee vetting by real investors and operators, which lifts interview rates significantly. (2) One candidate matched across every role continuously — not one shot, one role. (3) Independent recruiters + operator scouts combined in a single network, giving startups and partners a hybrid model that neither pure agencies nor pure marketplaces can match.' },
        { q: 'Is this AI-driven?', a: "AI powers matching, vetting workflows, and platform logistics — it doesn't replace human judgment. Every candidate gets a real conversation with a Talent Committee member. Every match decision involves a human review. AI sits in the engine room; the judgment stays with us and with you." },
        { q: 'Why do some roles show different fee structures?', a: "We're professionalizing from a community model to standardized terms, and every client negotiates its own arrangement. Some roles carry a fixed referral fee (e.g. $10,000, $25,000, $50,000) from earlier agreements; new partnerships are percentage-based at 10–20% of first-year base salary. Every role displays its confirmed fee — you always know exactly what you'll earn before submitting candidates." },
      ]
    },
  ]

  return (
    <>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@300;400;500;600;700&display=swap');
        
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        
        :root {
          --bg: #F8F8F3;
          --bg-2: #EAE9E1;
          --bg-3: #E8E8E1;
          --card: #FFFFFF;
          --ink: #100F0F;
          --ink-2: rgba(16,15,15,0.64);
          --ink-3: rgba(16,15,15,0.40);
          --ink-4: rgba(16,15,15,0.20);
          --green: #2A6B45;
          --green-bg: #EBF4EF;
          --border: rgba(16,15,15,0.10);
          --r: 10px;
          --r-sm: 6px;
        }
        
        html { scroll-behavior: smooth; }
        body {
          background: var(--bg);
          font-family: 'Inter', system-ui, sans-serif;
          color: var(--ink);
          line-height: 1.6;
          overflow-x: hidden;
        }

        .reveal { opacity: 0; transform: translateY(20px); transition: opacity 0.6s cubic-bezier(.4,0,.2,1), transform 0.6s cubic-bezier(.4,0,.2,1); }
        .reveal.visible { opacity: 1; transform: translateY(0); }

        @keyframes flipWords {
          0%, 20% { transform: translateY(0); }
          26%, 53% { transform: translateY(-33.333%); }
          59%, 86% { transform: translateY(-66.666%); }
          92%, 100% { transform: translateY(0); }
        }

        @keyframes tick {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }

        .ticker-inner { display: flex; white-space: nowrap; animation: tick 55s linear infinite; }
        .ticker-inner:hover { animation-play-state: paused; }
        .flip-track { display: flex; flex-direction: column; animation: flipWords 6s cubic-bezier(.4,0,.2,1) infinite; }

        @media (max-width: 900px) {
          .nav-links-desktop { display: none !important; }
          .nav-ham { display: flex !important; }
          .hero-stats { flex-direction: column !important; }
          .hero-stat { border-right: none !important; border-bottom: 1px solid var(--border) !important; }
          .hero-stat:last-child { border-bottom: none !important; }
          .pain-grid, .net-grid, .model-grid { grid-template-columns: 1fr !important; }
          .friction-grid, .earn-scale { grid-template-columns: 1fr 1fr !important; }
          .test-grid { grid-template-columns: 1fr 1fr !important; }
          .about-split { grid-template-columns: 1fr !important; gap: 32px !important; }
          .footer-top { grid-template-columns: 1fr 1fr !important; }
          .scout-strip, .net-cta-strip { flex-direction: column !important; text-align: center !important; }
          .sec { padding: 64px 24px !important; }
          .hero { padding: 60px 24px 48px !important; }
        }

        @media (max-width: 560px) {
          .hero h1 { font-size: 36px !important; }
          .hero-cta { flex-direction: column !important; }
          .test-grid { grid-template-columns: 1fr !important; }
          .friction-grid { grid-template-columns: 1fr 1fr !important; }
          .footer-top { grid-template-columns: 1fr !important; }
          .sec { padding: 48px 16px !important; }
          .hero { padding: 40px 16px 44px !important; }
          .clients-grid { grid-template-columns: 1fr !important; gap: 32px !important; }
        }
      `}</style>

      {/* NAV */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(248,248,243,0.88)',
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 40px', height: 58
      }}>
        <a href="/" style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 20, color: 'var(--ink)', textDecoration: 'none' }}>
          Refery<em style={{ fontStyle: 'italic' }}>.</em>
        </a>
        <div className="nav-links-desktop" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <a href="#why" style={{ fontSize: 14, color: 'var(--ink-2)', textDecoration: 'none', padding: '6px 14px', borderRadius: 99 }}>Why Refery</a>
          <a href="#earnings" style={{ fontSize: 14, color: 'var(--ink-2)', textDecoration: 'none', padding: '6px 14px', borderRadius: 99 }}>Earnings</a>
          <a href="#how" style={{ fontSize: 14, color: 'var(--ink-2)', textDecoration: 'none', padding: '6px 14px', borderRadius: 99 }}>How it Works</a>
          <a href="#faq" style={{ fontSize: 14, color: 'var(--ink-2)', textDecoration: 'none', padding: '6px 14px', borderRadius: 99 }}>{"Q&A"}</a>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="nav-links-desktop" style={{
            fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
            color: 'var(--green)', background: 'var(--green-bg)',
            padding: '8px 16px', borderRadius: 99, border: '1px solid rgba(42, 107, 69, 0.2)',
            cursor: 'default', userSelect: 'none'
          }}>Scout &amp; Partner Guidelines</span>
          <a href="/auth/login" style={{
            fontSize: 14, fontWeight: 500, color: '#fff', background: 'var(--green)',
            padding: '8px 20px', borderRadius: 6, textDecoration: 'none'
          }}>Access</a>
          <button 
            className="nav-ham"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            style={{ display: 'none', background: 'none', border: 'none', cursor: 'pointer', padding: 4, flexDirection: 'column', gap: 5 }}
          >
            <span style={{ display: 'block', width: 20, height: 1.5, background: 'var(--ink)' }} />
            <span style={{ display: 'block', width: 20, height: 1.5, background: 'var(--ink)' }} />
            <span style={{ display: 'block', width: 20, height: 1.5, background: 'var(--ink)' }} />
          </button>
        </div>
      </nav>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div style={{
          position: 'fixed', top: 58, left: 0, right: 0,
          background: 'var(--bg)', borderBottom: '1px solid var(--border)',
          padding: '1rem 1.25rem', zIndex: 99, display: 'flex', flexDirection: 'column'
        }}>
          <a href="#why" onClick={() => setMobileMenuOpen(false)} style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink-2)', textDecoration: 'none', padding: '0.85rem 0', borderBottom: '1px solid var(--border)' }}>Why Refery</a>
          <a href="#earnings" onClick={() => setMobileMenuOpen(false)} style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink-2)', textDecoration: 'none', padding: '0.85rem 0', borderBottom: '1px solid var(--border)' }}>Earnings</a>
          <a href="#how" onClick={() => setMobileMenuOpen(false)} style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink-2)', textDecoration: 'none', padding: '0.85rem 0', borderBottom: '1px solid var(--border)' }}>How it Works</a>
          <a href="#faq" onClick={() => setMobileMenuOpen(false)} style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink-2)', textDecoration: 'none', padding: '0.85rem 0', borderBottom: '1px solid var(--border)' }}>{"Q&A"}</a>
          <a href="/auth/login" onClick={() => setMobileMenuOpen(false)} style={{ fontSize: 15, fontWeight: 500, color: 'var(--green)', textDecoration: 'none', padding: '0.85rem 0' }}>Access Platform</a>
        </div>
      )}

      {/* HERO */}
      <section style={{ maxWidth: 900, margin: '0 auto', padding: '80px 40px 64px' }} className="hero">
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 13, fontWeight: 500, color: 'var(--ink-2)',
          background: 'var(--card)', border: '1px solid var(--border)',
          padding: '5px 12px', borderRadius: 99, marginBottom: 32
        }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#3DB86A' }} />
          For scouts &amp; recruiting partners
        </span>

        <h1 style={{
          fontFamily: "'Instrument Serif', Georgia, serif",
          fontSize: 'clamp(46px, 6vw, 76px)',
          fontWeight: 400, lineHeight: 1.02, letterSpacing: '-0.02em',
          color: 'var(--ink)', marginBottom: 28
        }}>
          {"The guidelines for scouts and "}
          <span style={{ display: 'inline-block', height: '1.15em', overflow: 'hidden', verticalAlign: 'bottom', position: 'relative', paddingTop: '0.05em' }}>
            <span className="flip-track">
              <span style={{ height: '1.15em', display: 'flex', alignItems: 'baseline', fontStyle: 'italic', color: 'var(--green)', paddingBottom: '0.05em' }}>partners.</span>
              <span style={{ height: '1.15em', display: 'flex', alignItems: 'baseline', fontStyle: 'italic', color: 'var(--green)', paddingBottom: '0.05em' }}>recruiters.</span>
              <span style={{ height: '1.15em', display: 'flex', alignItems: 'baseline', fontStyle: 'italic', color: 'var(--green)', paddingBottom: '0.05em' }}>operators.</span>
            </span>
          </span>
        </h1>

        <p style={{ fontSize: 19, fontWeight: 400, lineHeight: 1.75, color: 'var(--ink-2)', maxWidth: 620, marginBottom: 40 }}>
          {"Everything you need to work the Refery network: what you earn and when, which candidates get matched, how submissions and attribution work, and the terms that protect you. Written to mirror the partner agreement — if the two ever disagree, the signed agreement governs."}
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }} className="hero-cta">
          <a href="https://cal.com/refery-lily/15" target="_blank" rel="noopener noreferrer" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'var(--ink)', color: '#fff',
            fontSize: 16, fontWeight: 500, padding: '14px 28px', borderRadius: 6, textDecoration: 'none'
          }}>{"Apply to Join the Network →"}</a>
          <a href="#earnings" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'transparent', color: 'var(--ink)',
            fontSize: 16, fontWeight: 500, padding: '13px 28px', borderRadius: 6, textDecoration: 'none',
            border: '1px solid var(--border)'
          }}>See the economics</a>
        </div>

        <p style={{ fontSize: 14, color: 'var(--ink-3)', marginTop: 20 }}>
          Read the full terms:{' '}
          <a href="/recruiting-partner-agreement" style={{ color: 'var(--green)', textDecoration: 'none', fontWeight: 500 }}>Recruiting Partner Agreement</a>
          {' · '}
          <a href="/scout-agreement" style={{ color: 'var(--green)', textDecoration: 'none', fontWeight: 500 }}>Scout Partner Agreement</a>
        </p>

        <div className="hero-stats reveal" style={{
          display: 'flex', gap: 0,
          border: '1px solid var(--border)', borderRadius: 10,
          background: 'var(--card)', overflow: 'hidden', marginTop: 56
        }}>
          <div className="hero-stat" style={{ flex: 1, padding: '24px 28px', borderRight: '1px solid var(--border)' }}>
            <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 36, lineHeight: 1, marginBottom: 6, color: 'var(--ink)' }}>
              <em style={{ fontStyle: 'italic', color: 'var(--green)' }}>70%</em>
            </div>
            <div style={{ fontSize: 14, color: 'var(--ink-3)' }}>of the placement fee is yours</div>
          </div>
          <div className="hero-stat" style={{ flex: 1, padding: '24px 28px', borderRight: '1px solid var(--border)' }}>
            <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 36, lineHeight: 1, marginBottom: 6, color: 'var(--ink)' }}>
              {counter}+
            </div>
            <div style={{ fontSize: 14, color: 'var(--ink-3)' }}>VC-backed startups hiring</div>
          </div>
          <div className="hero-stat" style={{ flex: 1, padding: '24px 28px', borderRight: '1px solid var(--border)' }}>
            <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 36, lineHeight: 1, marginBottom: 6, color: 'var(--ink)' }}>
              <em style={{ fontStyle: 'italic', color: 'var(--green)' }}>$0</em>
            </div>
            <div style={{ fontSize: 14, color: 'var(--ink-3)' }}>cost to you — ever</div>
          </div>
          <div className="hero-stat" style={{ flex: 1, padding: '24px 28px' }}>
            <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 36, lineHeight: 1, marginBottom: 6, color: 'var(--ink)' }}>
              Zero
            </div>
            <div style={{ fontSize: 14, color: 'var(--ink-3)' }}>BD, contracts, or admin work</div>
          </div>
        </div>
      </section>

      {/* TICKER */}
      <div style={{ overflow: 'hidden', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: '12px 0', background: 'var(--bg-2)' }}>
        <div className="ticker-inner">
          {[...Array(2)].map((_, i) => (
            <React.Fragment key={i}>
              <span style={{ fontSize: 12, letterSpacing: '0.06em', color: 'var(--ink-3)', textTransform: 'uppercase', padding: '0 1.5rem', fontWeight: 500 }}>70% of the Placement Fee is Yours</span>
              <span style={{ color: 'var(--green)', opacity: 0.5 }}> · </span>
              <span style={{ fontSize: 12, letterSpacing: '0.06em', color: 'var(--ink-3)', textTransform: 'uppercase', padding: '0 1.5rem', fontWeight: 500 }}>Zero Business Development</span>
              <span style={{ color: 'var(--green)', opacity: 0.5 }}> · </span>
              <span style={{ fontSize: 12, letterSpacing: '0.06em', color: 'var(--ink-3)', textTransform: 'uppercase', padding: '0 1.5rem', fontWeight: 500 }}>YC, Sequoia, a16z Startups</span>
              <span style={{ color: 'var(--green)', opacity: 0.5 }}> · </span>
              <span style={{ fontSize: 12, letterSpacing: '0.06em', color: 'var(--ink-3)', textTransform: 'uppercase', padding: '0 1.5rem', fontWeight: 500 }}>24-Month Candidate Protection</span>
              <span style={{ color: 'var(--green)', opacity: 0.5 }}> · </span>
              <span style={{ fontSize: 12, letterSpacing: '0.06em', color: 'var(--ink-3)', textTransform: 'uppercase', padding: '0 1.5rem', fontWeight: 500 }}>{"One Candidate → Every Matching Role"}</span>
              <span style={{ color: 'var(--green)', opacity: 0.5 }}> · </span>
              <span style={{ fontSize: 12, letterSpacing: '0.06em', color: 'var(--ink-3)', textTransform: 'uppercase', padding: '0 1.5rem', fontWeight: 500 }}>No Exclusivity</span>
              <span style={{ color: 'var(--green)', opacity: 0.5 }}> · </span>
              <span style={{ fontSize: 12, letterSpacing: '0.06em', color: 'var(--ink-3)', textTransform: 'uppercase', padding: '0 1.5rem', fontWeight: 500 }}>SF · NY</span>
              <span style={{ color: 'var(--green)', opacity: 0.5 }}> · </span>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* WHY SECTION */}
      <div id="why" className="sec reveal" style={{ background: 'var(--ink)', padding: '80px 40px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#5FBF84', marginBottom: 16 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#5FBF84' }} />
            The problem
          </div>
          <h2 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 'clamp(32px, 4vw, 52px)', fontWeight: 400, lineHeight: 1.05, color: '#F8F8F3', marginBottom: 16 }}>
            {"You're too good to be"}<br />stuck doing <em style={{ fontStyle: 'italic', color: '#5FBF84' }}>BD.</em>
          </h2>
          <p style={{ fontSize: 18, color: 'rgba(248,248,243,0.45)', lineHeight: 1.75, maxWidth: 580, marginBottom: 48 }}>
            {"You can find world-class talent. That's a rare and valuable skill. But right now, half your time is spent on everything that isn't recruiting."}
          </p>
          
          <div className="pain-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 48 }}>
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '28px 24px' }}>
              <h4 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 23, fontWeight: 400, color: '#F8F8F3', marginBottom: 14, lineHeight: 1.2 }}>The agency trap</h4>
              <p style={{ fontSize: 15, color: 'rgba(248,248,243,0.45)', lineHeight: 1.7 }}>{"You build the agency's book of business and take home 20–30% of the fee. They keep the clients. They keep the brand. You keep grinding."}</p>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '28px 24px' }}>
              <h4 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 23, fontWeight: 400, color: '#F8F8F3', marginBottom: 14, lineHeight: 1.2 }}>The solo grind</h4>
              <p style={{ fontSize: 15, color: 'rgba(248,248,243,0.45)', lineHeight: 1.7 }}>{"Go independent and suddenly you're a salesperson, an accountant, a contract negotiator, and a recruiter. Half your week is spent not recruiting."}</p>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '28px 24px' }}>
              <h4 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 23, fontWeight: 400, color: '#F8F8F3', marginBottom: 14, lineHeight: 1.2 }}>One shot per candidate</h4>
              <p style={{ fontSize: 15, color: 'rgba(248,248,243,0.45)', lineHeight: 1.7 }}>{"You submit a candidate for one role at one company. If the timing isn't right, that great talent is wasted. Months of effort — gone on a single miss."}</p>
            </div>
          </div>

          <div style={{ fontSize: 20, lineHeight: 1.7, color: 'rgba(248,248,243,0.55)', fontWeight: 300, maxWidth: 640, borderLeft: '3px solid #5FBF84', paddingLeft: 24 }}>
            <strong style={{ color: '#F8F8F3', fontWeight: 500 }}>What if you could keep 70% of every fee, never source a client again, and have every candidate you submit matched across hundreds of roles — automatically?</strong><br /><br />
            {"That's not a hypothetical. "}<em style={{ color: '#5FBF84', fontStyle: 'normal', fontWeight: 600 }}>{"That's Refery."}</em>
          </div>
        </div>
      </div>

      {/* EARNINGS SECTION */}
      <div id="earnings" className="sec reveal" style={{ padding: '80px 40px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--green)', marginBottom: 16 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)' }} />
            The economics
          </div>
          <h2 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 'clamp(32px, 4vw, 52px)', fontWeight: 400, lineHeight: 1.05, color: 'var(--ink)', marginBottom: 16 }}>
            Do the math. Then do it <em style={{ fontStyle: 'italic', color: 'var(--green)' }}>again.</em>
          </h2>
          <p style={{ fontSize: 18, color: 'var(--ink-2)', lineHeight: 1.75, maxWidth: 580, marginBottom: 48 }}>
            {"Placement fees run 10–20% of the candidate's first-year base salary, negotiated per client and scaling with startup stage and role seniority. Some roles instead carry a fixed referral fee. Either way you keep 70% of it — compare that to the 20–30% you'd take home at an agency. Here's what that compounds to."}
          </p>

          {/* Earnings Banner */}
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 'clamp(40px, 5.5vw, 60px)', fontWeight: 400, lineHeight: 1.05, color: 'var(--ink)', marginBottom: 16 }}>
              <em style={{ fontStyle: 'italic', color: 'var(--green)' }}>$24,500 – $49,000</em> per placement.
            </div>
            <div style={{ fontSize: 18, color: 'var(--ink-2)', marginBottom: 20 }}>
              Example: 10–20% fee on a $350K senior hire · your 70% share
            </div>
          </div>

          {/* Earnings Scale */}
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-3)', margin: '56px 0 18px' }}>
            Earnings at scale · $24.5K–$49K per placement
          </div>
          <div className="earn-scale" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: 'var(--border)', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ background: 'var(--bg)', padding: '20px 16px', textAlign: 'center' }}>
              <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 22, fontWeight: 400, color: 'var(--ink)', lineHeight: 1.15 }}>$294K–$588K</div>
              <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 6 }}>per year</div>
              <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 4, fontWeight: 500 }}>1 / MONTH</div>
            </div>
            <div style={{ background: 'var(--bg)', padding: '20px 16px', textAlign: 'center' }}>
              <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 22, fontWeight: 400, color: 'var(--ink)', lineHeight: 1.15 }}>$588K–$1.18M</div>
              <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 6 }}>per year</div>
              <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 4, fontWeight: 500 }}>2 / MONTH</div>
            </div>
            <div style={{ background: 'var(--ink)', padding: '20px 16px', textAlign: 'center' }}>
              <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 22, fontWeight: 400, color: '#5FBF84', lineHeight: 1.15 }}>$882K–$1.76M</div>
              <div style={{ fontSize: 13, color: 'rgba(248,248,243,0.5)', marginTop: 6 }}>per year</div>
              <div style={{ fontSize: 11, color: 'rgba(248,248,243,0.3)', marginTop: 4, fontWeight: 500 }}>3 / MONTH</div>
            </div>
            <div style={{ background: 'var(--bg)', padding: '20px 16px', textAlign: 'center' }}>
              <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 22, fontWeight: 400, color: 'var(--ink)', lineHeight: 1.15 }}>$1.18M–$2.35M</div>
              <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 6 }}>per year</div>
              <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 4, fontWeight: 500 }}>4 / MONTH</div>
            </div>
          </div>

          {/* Transition Note */}
          <div style={{ 
            marginTop: 48, 
            padding: '24px 28px', 
            background: 'var(--green-bg)', 
            border: '1px solid rgba(42,107,69,0.15)', 
            borderRadius: 10,
            borderLeft: '3px solid var(--green)'
          }}>
            <div style={{ 
              fontSize: 11, 
              fontWeight: 600, 
              letterSpacing: '0.1em', 
              textTransform: 'uppercase', 
              color: 'var(--green)', 
              marginBottom: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
              Platform Evolution
            </div>
            <p style={{ fontSize: 15, color: 'var(--ink)', lineHeight: 1.7, marginBottom: 12 }}>
              <strong>{"We're professionalizing."}</strong> Refery started as a community-driven network where founders set bonuses informally. {"We're"} now transitioning to a structured, professional model with standardized terms.
            </p>
            <p style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.7 }}>
              <strong>What this means for fees:</strong> Some roles carry a fixed referral fee (e.g. $10,000, $25,000, $50,000) from existing relationships. New partnerships are percentage-based at 10–20% of first-year base salary. Each role in the platform clearly shows the confirmed fee structure — either a fixed amount or a percentage — and the fee shown when you submit is the fee that applies to any resulting placement. Roles we{"'"}re actively targeting or in early discussions with are marked as {"\"In Pipeline\""} so you can start identifying candidates proactively; when the partnership confirms, we match within 48 hours.
            </p>
          </div>
        </div>
      </div>

      {/* OUR CLIENTS SECTION */}
      <div className="sec reveal" style={{ padding: '80px 40px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--green)', marginBottom: 16 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)' }} />
            Our clients
          </div>
          <h2 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 'clamp(32px, 4vw, 52px)', fontWeight: 400, lineHeight: 1.05, color: 'var(--ink)', marginBottom: 16 }}>
            200+ <em style={{ fontStyle: 'italic', color: 'var(--green)' }}>VC-backed</em> companies
          </h2>
          <p style={{ fontSize: 18, color: 'var(--ink-2)', lineHeight: 1.75, maxWidth: 700, marginBottom: 48 }}>
            We work exclusively with startups that have raised institutional VC funding — from pre-seed through Series B and beyond. These are high-quality, credible companies that take hiring seriously.
          </p>

          <div className="clients-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, marginBottom: 40 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 16 }}>Stage Range</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {['Pre-seed', 'Seed', 'Series A', 'Series B'].map((stage) => (
                  <span key={stage} style={{
                    padding: '10px 18px',
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: 99,
                    fontSize: 14,
                    fontWeight: 500,
                    color: 'var(--ink)'
                  }}>{stage}</span>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 16 }}>Locations</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {['San Francisco', 'New York'].map((loc) => (
                  <span key={loc} style={{
                    padding: '10px 18px',
                    background: 'var(--green-bg)',
                    border: '1px solid rgba(42,107,69,0.15)',
                    borderRadius: 99,
                    fontSize: 14,
                    fontWeight: 500,
                    color: 'var(--green)'
                  }}>{loc}</span>
                ))}
              </div>
            </div>
          </div>

          <div style={{ 
            padding: '20px 24px', 
            background: '#FEF9E7', 
            border: '1px solid rgba(180,140,60,0.2)', 
            borderRadius: 10,
            borderLeft: '3px solid #C4A24D'
          }}>
            <p style={{ fontSize: 15, color: 'var(--ink)', lineHeight: 1.7 }}>
              Our vetting process means founders take candidate referrals seriously. When Refery surfaces a candidate, hiring managers engage — our platform reputation is a trust accelerator for your referrals.
            </p>
          </div>
        </div>
      </div>

      {/* HIGH-DEMAND ROLES SECTION */}
      <div className="sec reveal" style={{ background: 'var(--bg-2)', padding: '80px 40px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--green)', marginBottom: 16 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)' }} />
            {"What we're hiring for"}
          </div>
          <h2 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 'clamp(32px, 4vw, 52px)', fontWeight: 400, lineHeight: 1.05, color: 'var(--ink)', marginBottom: 48 }}>
            High-demand <em style={{ fontStyle: 'italic', color: 'var(--green)' }}>roles</em>
          </h2>

          {/* Highest Demand */}
          <div style={{ marginBottom: 36 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#B8860B', marginBottom: 16 }}>
              <span>{"🔥"}</span> Highest Demand
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {['AI / ML Engineer', 'Forward Deploying Engineer', 'Staff / Senior Software Engineer', 'Founding Engineer', 'Backend Engineer', 'Frontend Engineer', 'Full Stack Engineer', 'Infrastructure / Platform Engineer', 'Security Engineer', 'Data Engineer'].map((role) => (
                <span key={role} style={{
                  padding: '10px 18px',
                  background: '#F5EED6',
                  border: '1px solid rgba(180,140,60,0.25)',
                  borderRadius: 99,
                  fontSize: 14,
                  fontWeight: 500,
                  color: '#5C4A1F',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}>
                  <span style={{ fontSize: 12 }}>{"🔥"}</span> {role}
                </span>
              ))}
            </div>
          </div>

          {/* Product & Design */}
          <div style={{ marginBottom: 36 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--green)', marginBottom: 16 }}>
              Product & Design
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {['Product Manager', 'Product Designer', 'Head of Product'].map((role) => (
                <span key={role} style={{
                  padding: '10px 18px',
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: 99,
                  fontSize: 14,
                  fontWeight: 500,
                  color: 'var(--ink)'
                }}>{role}</span>
              ))}
            </div>
          </div>

          {/* GTM & Revenue */}
          <div style={{ marginBottom: 36 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--green)', marginBottom: 16 }}>
              GTM & Revenue <span style={{ fontSize: 10, background: '#F5EED6', color: '#5C4A1F', padding: '2px 8px', borderRadius: 99, fontWeight: 600 }}>{"🔥"} HIGH DEMAND</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {['Head of GTM', 'Founding GTM', 'Enterprise Account Executive', 'Account Director', 'Product Marketing Manager', 'Head of Growth'].map((role) => (
                <span key={role} style={{
                  padding: '10px 18px',
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: 99,
                  fontSize: 14,
                  fontWeight: 500,
                  color: 'var(--ink)'
                }}>{role}</span>
              ))}
            </div>
          </div>

          {/* People & Operations */}
          <div style={{ marginBottom: 36 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--green)', marginBottom: 16 }}>
              People & Operations
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {['GTM Recruiter', 'Sourcer', 'Customer Operations', 'Founding Operator'].map((role) => (
                <span key={role} style={{
                  padding: '10px 18px',
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: 99,
                  fontSize: 14,
                  fontWeight: 500,
                  color: 'var(--ink)'
                }}>{role}</span>
              ))}
            </div>
          </div>

          <div style={{ 
            padding: '20px 24px', 
            background: '#FEF9E7', 
            border: '1px solid rgba(180,140,60,0.2)', 
            borderRadius: 10,
            borderLeft: '3px solid #C4A24D'
          }}>
            <p style={{ fontSize: 15, color: 'var(--ink)', lineHeight: 1.7 }}>
              <span style={{ fontSize: 14 }}>{"🌷"}</span> <strong>~80% of roles are based in the Bay Area (San Francisco)</strong>, with some in New York. Most are onsite or hybrid — a smaller number are fully remote.
            </p>
          </div>
        </div>
      </div>

      {/* WHO GETS MATCHED SECTION */}
      <div className="sec reveal" style={{ padding: '80px 40px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--green)', marginBottom: 16 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)' }} />
            Candidate fit
          </div>
          <h2 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 'clamp(32px, 4vw, 52px)', fontWeight: 400, lineHeight: 1.05, color: 'var(--ink)', marginBottom: 48 }}>
            Who gets <em style={{ fontStyle: 'italic', color: 'var(--green)' }}>matched</em>
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              { 
                icon: 'check', 
                type: 'strong',
                title: 'CS degree from top school', 
                desc: 'MIT, Stanford, CMU, Berkeley, Caltech, ETH Zurich, and other universities known for CS/engineering. Top-ranked programs signal technical rigor to our clients.'
              },
              { 
                icon: 'check', 
                type: 'strong',
                title: 'Big Tech or well-known startup experience', 
                desc: 'Google, Meta, Apple, Amazon, Microsoft, Stripe, Airbnb, OpenAI, Anthropic, and similar. Known tech logos carry weight with early-stage founders.'
              },
              { 
                icon: 'check', 
                type: 'strong',
                title: 'Startup experience is a huge bonus', 
                desc: 'Early-stage company experience (seed, Series A) is particularly valued. It shows adaptability, ownership, and comfort with ambiguity — exactly what our clients need.'
              },
              { 
                icon: 'check', 
                type: 'strong',
                title: '3-15 years of experience is the sweet spot', 
                desc: 'Senior enough to contribute immediately, early enough to grow with the company. These profiles have the highest placement rate across our client base.'
              },
              { 
                icon: 'check', 
                type: 'strong',
                title: 'Salary expectations: $200K-$350K base', 
                desc: 'Plus equity and bonus, depending on experience. Most of our open roles sit in this range. Candidates expecting significantly below or above may have fewer matches.'
              },
              { 
                icon: 'note', 
                type: 'note',
                title: 'Work authorization required (US)', 
                desc: 'Very few of our clients offer visa sponsorship. Candidates should have valid US work authorization (US citizen, green card holder, or valid work permit). Flag this early.'
              },
              { 
                icon: 'note', 
                type: 'note',
                title: 'Recent graduates — lower match rate', 
                desc: 'New grads and those under 3 years of experience are harder to place given the seniority profile most clients are hiring for. They can still be submitted, but set expectations accordingly.'
              },
            ].map((item, i) => (
              <div key={i} style={{
                display: 'flex',
                gap: 16,
                padding: '24px',
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 10
              }}>
                <div style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: item.type === 'strong' ? 'var(--green-bg)' : '#FEF9E7',
                  border: `1px solid ${item.type === 'strong' ? 'rgba(42,107,69,0.2)' : 'rgba(180,140,60,0.2)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  {item.icon === 'check' ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#B8860B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <h4 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 18, fontWeight: 400, color: 'var(--ink)', marginBottom: 8 }}>{item.title}</h4>
                  <div style={{
                    display: 'inline-block',
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    padding: '4px 10px',
                    borderRadius: 4,
                    marginBottom: 10,
                    background: item.type === 'strong' ? 'var(--green-bg)' : '#FEF9E7',
                    color: item.type === 'strong' ? 'var(--green)' : '#B8860B'
                  }}>
                    {item.type === 'strong' ? 'Strong Signal' : 'Note'}
                  </div>
                  <p style={{ fontSize: 15, color: 'var(--ink-2)', lineHeight: 1.7 }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* HOW IT WORKS */}
      <div id="how" className="sec reveal" style={{ background: 'var(--bg-2)', padding: '80px 40px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--green)', marginBottom: 16 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)' }} />
            How it works
          </div>
          <h2 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 'clamp(32px, 4vw, 52px)', fontWeight: 400, lineHeight: 1.05, color: 'var(--ink)', marginBottom: 16 }}>
            From submission to <em style={{ fontStyle: 'italic', color: 'var(--green)' }}>payout.</em>
          </h2>
          <p style={{ fontSize: 18, color: 'var(--ink-2)', lineHeight: 1.75, maxWidth: 580, marginBottom: 48 }}>
            {"You source great people. Our Talent Committee vets them. Our platform matches them. You get paid. Here's the full flow."}
          </p>

          <div style={{ position: 'relative', paddingLeft: 52, maxWidth: 640, marginTop: 8 }}>
            <div style={{ position: 'absolute', left: 15, top: 16, bottom: 16, width: 1, background: 'linear-gradient(to bottom, var(--border) 0%, var(--border) 85%, transparent 100%)' }} />
            
            {[
              { num: '01', time: 'At any time', title: 'Browse live roles', desc: 'Full context on every role: company, stage, funding, salary, must-haves, timeline, and your estimated payout. Pick the ones that match your network.' },
              { num: '02', time: 'When ready', title: 'Source, curate, and submit', desc: 'Find candidates your way. Submit via email or platform with resume, your verdict, and notes. Quality over volume — 3 exceptional beats 30 average.' },
              { num: '03', time: 'Within 48 hours', title: 'Talent Committee vetting', desc: "Investors, angels, and operators who've built startups have a real conversation with each candidate. Candidates who pass get significantly higher interview rates — more of your submissions convert." },
              { num: '04', time: 'Ongoing', title: 'Multi-role matching', desc: 'Qualified candidates are matched to every relevant open role simultaneously. Not just one shot — continuous matching as new roles arrive. You have full visibility at every stage.' },
              { num: '05', time: 'On placement', title: 'Payout within 14 days', desc: "Candidate is hired and completes 90 days of continuous employment → payout processed within 14 business days, once Refery has collected from the client. You earn regardless of which role they were ultimately placed in." },
            ].map((step, i) => (
              <div key={i} style={{ position: 'relative', padding: '4px 0 38px' }}>
                <div style={{
                  position: 'absolute', left: -52, top: 2,
                  width: 30, height: 30, borderRadius: '50%',
                  background: 'var(--bg-2)', border: '1.5px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: "'Instrument Serif', serif", fontSize: 13, fontWeight: 500, fontStyle: 'italic', color: 'var(--ink-3)'
                }}>{step.num}</div>
                <span style={{
                  display: 'inline-block', fontSize: 10, fontWeight: 600, letterSpacing: '0.12em',
                  textTransform: 'uppercase', color: 'var(--green)', background: 'var(--green-bg)',
                  padding: '4px 10px', borderRadius: 99, marginBottom: 10, border: '1px solid rgba(42,107,69,0.15)'
                }}>{step.time}</span>
                <h4 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 22, fontWeight: 400, lineHeight: 1.25, color: 'var(--ink)', marginBottom: 6 }}>{step.title}</h4>
                <p style={{ fontSize: 15, color: 'var(--ink-2)', lineHeight: 1.75 }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* FAQ SECTION */}
      <div id="faq" className="sec reveal" style={{ padding: '80px 40px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--green)', marginBottom: 16 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)' }} />
            {"Q&A"}
          </div>
          <h2 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 'clamp(32px, 4vw, 52px)', fontWeight: 400, lineHeight: 1.05, color: 'var(--ink)', marginBottom: 16 }}>
            Every question, <em style={{ fontStyle: 'italic', color: 'var(--green)' }}>answered.</em>
          </h2>
          <p style={{ fontSize: 18, color: 'var(--ink-2)', lineHeight: 1.75, maxWidth: 580, marginBottom: 48 }}>
            {"The full brief — from joining to payout, from terms to tools. If we've missed something, your intro call is the place to raise it."}
          </p>

          <div style={{ maxWidth: 720 }}>
            {faqData.map((category, catIdx) => (
              <React.Fragment key={catIdx}>
                <div style={{
                  fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase',
                  color: 'var(--green)', margin: catIdx === 0 ? '8px 0 2px' : '44px 0 2px',
                  padding: '14px 0 10px', display: 'flex', alignItems: 'center', gap: 12
                }}>
                  <span>{category.category}</span>
                  <span style={{ flex: 1, height: 1, background: 'rgba(42,107,69,0.18)' }} />
                </div>
                {category.items.map((item, itemIdx) => {
                  const globalIdx = catIdx * 100 + itemIdx
                  const isOpen = openFaq === globalIdx
                  return (
                    <div key={itemIdx} style={{ borderBottom: '1px solid var(--border)' }}>
                      <button
                        onClick={() => toggleFaq(globalIdx)}
                        style={{
                          width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '20px 0', background: 'none', border: 'none', cursor: 'pointer',
                          textAlign: 'left', gap: 16
                        }}
                      >
                        <span style={{
                          fontFamily: "'Instrument Serif', Georgia, serif",
                          fontSize: 19, fontWeight: 400, color: isOpen ? 'var(--green)' : 'var(--ink)', lineHeight: 1.3
                        }}>{item.q}</span>
                        <span style={{
                          fontSize: 22, color: isOpen ? 'var(--green)' : 'var(--ink-3)', lineHeight: 1, flexShrink: 0, fontWeight: 300,
                          transform: isOpen ? 'rotate(45deg)' : 'rotate(0)', transition: 'transform 0.3s'
                        }}>+</span>
                      </button>
                      <div style={{
                        fontSize: 16, color: 'var(--ink-2)', lineHeight: 1.8,
                        maxHeight: isOpen ? 1400 : 0, overflow: 'hidden',
                        paddingBottom: isOpen ? 22 : 0, transition: 'max-height 0.4s ease, padding-bottom 0.3s'
                      }}>
                        {item.a}
                      </div>
                    </div>
                  )
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* CTA SECTION */}
      <div className="sec reveal" style={{ padding: '80px 40px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ background: 'var(--ink)', borderRadius: 10, padding: '48px 40px', textAlign: 'center' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#5FBF84', marginBottom: 16 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#5FBF84' }} />
              Join the network
            </div>
            <h2 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 'clamp(32px, 4vw, 52px)', fontWeight: 400, lineHeight: 1.05, color: '#F8F8F3', marginBottom: 16 }}>
              Your next placement<br />starts <em style={{ fontStyle: 'italic', color: '#5FBF84' }}>here.</em>
            </h2>
            <p style={{ fontSize: 17, color: 'rgba(248,248,243,0.45)', marginBottom: 28, lineHeight: 1.7 }}>
              15-minute call to align on your expertise and the best-fit roles.<br />
              Then: full access, live deal flow, and a partnership built on placements.
            </p>
            <a href="https://cal.com/refery-lily/15" target="_blank" rel="noopener noreferrer" style={{
              display: 'inline-flex', alignItems: 'center',
              background: '#F8F8F3', color: 'var(--ink)',
              fontSize: 16, fontWeight: 600, padding: '15px 32px', borderRadius: 6, textDecoration: 'none'
            }}>{"Apply to Join → Book a Call"}</a>
            <div style={{ fontSize: 14, color: 'rgba(248,248,243,0.3)', marginTop: 16 }}>
              or reach us directly — <a href="mailto:partners@refery.io" style={{ color: 'rgba(248,248,243,0.45)', textDecoration: 'none' }}>partners@refery.io</a>
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <footer style={{ background: 'var(--ink)', padding: '48px 40px 28px' }}>
        <div className="footer-top" style={{
          display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 1fr', gap: 40,
          paddingBottom: 40, borderBottom: '1px solid rgba(248,248,243,0.08)',
          maxWidth: 900, margin: '0 auto'
        }}>
          <div>
            <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 18, color: 'rgba(248,248,243,0.35)', marginBottom: 10 }}>
              Refery<em style={{ fontStyle: 'italic' }}>.</em>
            </div>
            <div style={{ fontSize: 14, color: 'rgba(248,248,243,0.2)', lineHeight: 1.7, maxWidth: 190 }}>
              {"Referral hiring for the world's best startups."}
            </div>
          </div>
          <div>
            <h4 style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(248,248,243,0.2)', marginBottom: 16 }}>Partners</h4>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <li><a href="https://cal.com/refery-lily/15" target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, color: 'rgba(248,248,243,0.35)', textDecoration: 'none' }}>Apply to Join</a></li>
              <li><a href="#how" style={{ fontSize: 14, color: 'rgba(248,248,243,0.35)', textDecoration: 'none' }}>How it Works</a></li>
              <li><a href="#faq" style={{ fontSize: 14, color: 'rgba(248,248,243,0.35)', textDecoration: 'none' }}>{"Q&A"}</a></li>
            </ul>
          </div>
          <div>
            <h4 style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(248,248,243,0.2)', marginBottom: 16 }}>Startups</h4>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
              
              <li><a href="mailto:hello@refery.io" style={{ fontSize: 14, color: 'rgba(248,248,243,0.35)', textDecoration: 'none' }}>hello@refery.io</a></li>
            </ul>
          </div>
          <div>
            <h4 style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(248,248,243,0.2)', marginBottom: 16 }}>Company</h4>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <li><a href="mailto:partners@refery.io" style={{ fontSize: 14, color: 'rgba(248,248,243,0.35)', textDecoration: 'none' }}>Contact</a></li>
              <li><a href="https://www.linkedin.com/company/refery-io/" target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, color: 'rgba(248,248,243,0.35)', textDecoration: 'none' }}>LinkedIn</a></li>
            </ul>
          </div>
        </div>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12,
          paddingTop: 24, maxWidth: 900, margin: '0 auto'
        }}>
          <div style={{ fontSize: 12, color: 'rgba(248,248,243,0.18)' }}>© 2026 Refery.io. All rights reserved.</div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <a href="/terms" style={{ fontSize: 12, color: 'rgba(248,248,243,0.18)', textDecoration: 'none' }}>Terms</a>
            <a href="/privacy" style={{ fontSize: 12, color: 'rgba(248,248,243,0.18)', textDecoration: 'none' }}>Privacy</a>
            <a href="/partner-guidelines" style={{ fontSize: 12, color: 'rgba(248,248,243,0.35)', textDecoration: 'none' }}>Scout &amp; Partner Guidelines</a>
            <a href="/recruiting-partner-agreement" style={{ fontSize: 12, color: 'rgba(248,248,243,0.18)', textDecoration: 'none' }}>Recruiting Partner Agreement</a>
          </div>
        </div>
      </footer>
    </>
  )
}
