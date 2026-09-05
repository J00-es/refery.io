// Agreement Management System - Types and Constants

export const AGREEMENT_VERSIONS = {
  // Scouts and recruiters now accept one document. The old pair ran to 1,582 and
  // 3,614 words for what is legally the same relationship, and the long one was
  // shown inside a 320px scroll box during sign-up with the accept box locked
  // until you reached the bottom. Roughly a third of partners who had a real
  // conversation ever completed sign-up.
  //
  // v2.0 binds only what has to bind at account creation: confidentiality and
  // non circumvention, because a new partner immediately sees client names.
  // Attribution, candidate consent and indemnity describe rights that do not
  // exist until there is a candidate, so they bind at the first submission
  // instead (partnerSubmission below), when the partner is motivated to read.
  // v2.1 spells out the payout gate that v2.0 stated as a single date. A payout
  // needs two things to be true, not one: the hire has passed day 90, and the
  // client has actually paid. On the standard client terms the client pays on
  // day 30, so day 90 is the only wait. A client on longer terms would have made
  // v2.0's "within 14 business days of the candidate completing 90 days" a
  // promise we could not keep, so the document now names the real rule and
  // commits to showing the timing on the role.
  //
  // v2.0 is frozen above, not edited in place: 28 partners accepted it. The
  // clarification does not change anyone's economics (70%, day 90, 14 business
  // days are all untouched), so no acceptance needed re-taking, but a v2.0
  // acceptance still has to render the v2.0 body.
  //
  // v2.1 also restores the two introduction bonus programmes, which existed
  // only in the retired v1.2 document and had therefore quietly lapsed for
  // everyone who joined after August. Edited into v2.1 rather than bumped
  // again because v2.1 has no acceptances yet, and because the change only
  // adds earnings: a partner who signed a moment before it landed is better
  // off, not worse. Once v2.1 has its first acceptance this text freezes like
  // v2.0 did.
  partner: '2.1',
  partnerSubmission: '1.0',
  // Retained so historical acceptances still resolve to the text that was signed.
  scout: '1.2.0',
  recruiter: '1.2.0',
  // v2.8 is the current standard offer: pay 30 calendar days after the hire's
  // start date, one free replacement search if they leave inside 90 days,
  // cancel anytime, and no fee when someone reached the candidate before us
  // (widened in v2.7 from the client's own pipeline to any earlier
  // introduction, including a rival agency's, after Alcor Labs asked for
  // first-in-time attribution).
  //
  // v2.8 pulls apart the two clocks that v2.6 and v2.7 had welded together.
  // Those dated the invoice to day 90 itself, so the guarantee had nothing
  // left to do, and a founder was asked to wait a full quarter before the
  // first invoice, which reads as us doubting our own placements. Payment now
  // sits at day 30 and the guarantee runs its own 90 days on top of it, which
  // is the shape the rest of the market uses.
  client: '2.8',
  // v2.7: the previous standard (pay 10 business days after day 90, no fee at
  // all if the hire left inside 90 days). Retained so the agreements already
  // signed on it still render exactly what was signed. No new links issue on
  // this line.
  clientNet90: '2.7',
  // v2.5: negotiated deferred variant (Ergo, Aug 2026). Same shape as v2.6 but
  // a 14-business-day payment window. Kept as its own line so it is never
  // rewritten by a standard bump.
  clientDeferred: '2.5',
  // v2.7-A: negotiated for Alcor Labs (Aug 2026). The v2.7 body, but keeping the
  // payment terms they already agreed (30 days after start) and the
  // replacement-first guarantee with the 60-day cash backstop they proposed.
  clientStartPay: '2.7-A',
  // v2.4: an earlier standard (pay 30 days after start, replacement-search
  // guarantee). No new links are issued on it; unsigned ones upgrade to v2.8.
  clientLegacy: '2.4',
} as const

// Which payment/guarantee model a client agreement uses.
//   'net30' is v2.8, the current standard: fee due 30 calendar days after the
//   start date, and one free replacement search if the hire leaves inside 90
//   days. The two clocks are independent, which is what the market does.
//   'start' is v2.4: fee due 30 days after the start date, replacement-search guarantee.
//   'day90' is v2.5: fee due 14 business days after day 90, no fee if they leave inside 90 days.
//   'net10' is v2.6/v2.7: fee due 10 business days after day 90, no fee if they leave inside 90 days.
//   'start30' is v2.7-A: the v2.7 body on 30-days-after-start payment terms with
//   a replacement-first guarantee backed by a 60-day cash refund, proposed by
//   Alcor Labs themselves.
//
// Collecting on day 30 restores, word for word, what the signed partner and
// recruiter agreements already describe: "the client pays Refery within 30 days
// of the candidate's start date, and Refery holds these funds during the 90-day
// guarantee period." Partner payout timing is unchanged and stays consent-
// protected under recruiter section 13: partners are still paid 14 business
// days after the hire's 90th day, out of money Refery has been holding since
// day 30, so no partner is exposed to a clawback.
export type ClientPaymentTiming = 'start' | 'day90' | 'net10' | 'start30' | 'net30'

const TIMING_VERSION: Record<ClientPaymentTiming, string> = {
  start: AGREEMENT_VERSIONS.clientLegacy,
  day90: AGREEMENT_VERSIONS.clientDeferred,
  net10: AGREEMENT_VERSIONS.clientNet90,
  start30: AGREEMENT_VERSIONS.clientStartPay,
  net30: AGREEMENT_VERSIONS.client,
}

export function clientAgreementVersion(timing: ClientPaymentTiming): string {
  return TIMING_VERSION[timing]
}

// Which model an already-issued version belongs to, so a link always renders
// the document it was issued under.
const CLIENT_VERSION_TIMING: Record<string, ClientPaymentTiming> = {
  '2.4': 'start',
  '2.5': 'day90',
  '2.6': 'net10',
  '2.7': 'net10',
  '2.7-A': 'start30',
  '2.8': 'net30',
}

export function clientPaymentTimingForVersion(version: string): ClientPaymentTiming | null {
  return CLIENT_VERSION_TIMING[version] ?? null
}

// Versions that were individually negotiated. An unsigned link on one of these
// must never be auto-rewritten to the standard offer, since that would silently undo
// the negotiation. Everything else sits on the standard line.
const NEGOTIATED_CLIENT_VERSIONS = new Set<string>([
  AGREEMENT_VERSIONS.clientDeferred,
  AGREEMENT_VERSIONS.clientStartPay,
])

// The version an unsigned link should be upgraded to when viewed, or null to
// leave it alone. Standard-line links (legacy v1.x, v2.4) roll forward to the
// current standard so a client who finally opens an old link sees today's terms.
export function clientUpgradeTarget(version: string): string | null {
  if (NEGOTIATED_CLIENT_VERSIONS.has(version)) return null
  if (version === AGREEMENT_VERSIONS.client) return null
  return AGREEMENT_VERSIONS.client
}

// One-line payment/guarantee summaries for the post-signature email and PDF.
// Keep these in step with the "short version" table in each document, because a signer
// must never be told terms that differ from what they signed.
export function clientTermsSummary(version: string): { payment: string; guarantee: string } {
  switch (clientPaymentTimingForVersion(version)) {
    case 'net30':
      return {
        payment: 'Invoiced on the start date, due 30 calendar days after it',
        guarantee: 'One free replacement if they leave within 90 days',
      }
    case 'net10':
      return {
        payment: '10 business days after the 90th day',
        guarantee: 'No fee if the hire leaves within 90 days',
      }
    case 'start30':
      return {
        payment: '30 days after start date',
        guarantee: 'Replacement search, or your fee back in cash if unfilled in 60 days',
      }
    case 'day90':
      return {
        payment: '14 business days after the 90th day of employment',
        guarantee: 'No fee if the hire leaves within 90 days',
      }
    default:
      return {
        payment: '30 days after start date',
        guarantee: '90-day free replacement search',
      }
  }
}

export type AgreementType = 'scout' | 'recruiter'
export type ClientAgreementType = 'client'

// Client Agreement Link Interface
export interface ClientAgreementLink {
  id: string
  token: string
  company_id: string
  company_name: string
  recipient_name: string
  recipient_email: string
  agreement_version: string
  agreement_hash: string
  agreement_content: string
  fee_percentage: number
  payment_window_days: number
  late_fee_percentage: number
  guarantee_days: number
  intro_validity_months: number
  status: 'sent' | 'viewed' | 'signed' | 'revoked' | 'expired'
  created_by: string
  sent_at: string
  viewed_at: string | null
  signed_at: string | null
  revoked_at: string | null
  expires_at: string
  created_at: string
  updated_at: string
}

// Client Agreement Signature Interface
export interface ClientAgreementSignature {
  id: string
  link_id: string | null
  company_id: string
  company_name: string
  signer_name: string
  signer_email: string
  agreement_version: string
  agreement_hash: string
  fee_percentage: number
  payment_window_days: number
  late_fee_percentage: number
  guarantee_days: number
  intro_validity_months: number
  acceptance_method: string
  ip_address: string | null
  user_agent: string | null
  signed_at: string
  created_at: string
}

// Client Agreement Terms Configuration
export interface ClientAgreementTerms {
  feePercentage: number
  paymentWindowDays: number
  lateFeePct: number
  guaranteeDays: number
  introValidityMonths: number
}

export const DEFAULT_CLIENT_TERMS: ClientAgreementTerms = {
  // 10% is what every recent deal actually goes out at; the old 20% default
  // meant the real number had to be passed in on every call.
  feePercentage: 10,
  paymentWindowDays: 30,
  lateFeePct: 1.5,
  guaranteeDays: 90,
  // 12, not 24: the client body text has always said "hired within 12 months
  // of introduction". This column is a denormalized summary of that text, and
  // read 24 by mistake on every link issued before Aug 2026.
  introValidityMonths: 12,
}

// Business days between the hire's 90th day and the payment due date on the
// retired v2.6/v2.7 line. The current standard (v2.8) invoices 30 calendar days
// after the start date instead; see DEFAULT_CLIENT_TERMS.paymentWindowDays.
export const STANDARD_PAYMENT_BUSINESS_DAYS = 10

export interface AgreementLink {
  id: string
  token: string
  recruiter_id: string
  recruiter_name: string
  recruiter_email: string
  agreement_type: AgreementType
  agreement_version: string
  agreement_hash: string
  agreement_content: string
  status: 'sent' | 'viewed' | 'signed' | 'revoked' | 'expired'
  created_by: string | null
  sent_at: string
  viewed_at: string | null
  signed_at: string | null
  revoked_at: string | null
  expires_at: string
  created_at: string
  updated_at: string
}

export interface AgreementSignature {
  id: string
  link_id: string | null
  recruiter_id: string
  signer_name: string
  signer_email: string
  agreement_type: AgreementType
  agreement_version: string
  agreement_hash: string
  acceptance_method: string
  ip_address: string | null
  user_agent: string | null
  signed_at: string
  created_at: string
}

// Generate SHA-256 hash of agreement content for integrity verification
export async function generateAgreementHash(content: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(content)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

// Generate secure random token for signing links
export function generateSigningToken(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('')
}



/**
 * Partner Terms v2.0, frozen.
 *
 * 28 partners accepted this exact text between 13 Aug and 4 Sep 2026, so it
 * has to keep resolving to what they saw. v2.1 clarifies the payout condition
 * rather than changing it, so no acceptance needed re-taking, but a v2.0
 * acceptance must never render the v2.1 body under the v2.0 label.
 *
 * Do not edit. Bump the version and add a new frozen copy instead.
 */
const PARTNER_TERMS_V2_0_TEXT = `# Partner Terms

**v2.0** · Refery and you · The table below is the whole deal

## The short version

| | |
|---|---|
| **You earn** | 70% of the placement fee on every hire you source |
| **You pay** | Nothing, ever. No fees, no minimums, no exclusivity |
| **Your commitment** | None. Work with whoever else you like, leave whenever |
| **What we ask** | Keep what you see inside Refery confidential |

## The details

**1. What you earn.** You keep 70% of the placement fee on every candidate you source who is hired and stays 90 days. Refery keeps 30% and handles the client, the contract, the invoice and the chasing. A role's fee is either a percentage of first year base salary, usually 10 to 20%, or a fixed amount. Either way it is shown on the role before you work it.

**2. When you get paid.** Within 14 business days of the candidate completing 90 days, once we have collected from the client. We hold the money until then, so you will never face a clawback. If a placement does not last, no money changes hands in either direction.

**3. Keep our clients confidential.** Everything inside Refery is confidential: company names, roles, hiring managers, pay and team detail. Many of these companies are in stealth. You can describe a role to a candidate in general terms, such as "a Series B fintech in New York", but please do not name or identify the company until that candidate has been vetted and signed our confidentiality terms. This one continues after you leave.

**4. Please don't go around us.** We pay to bring these companies onto the platform. For 12 months after you last work on a client's roles, please don't place candidates with them outside Refery. Any relationship you already had before joining is yours, and is carved out.

**5. You work for yourself.** You are an independent contractor, not an employee. No exclusivity, no non compete, no minimum activity, no set hours. You handle your own taxes, and we report payments where the law requires it.

**6. How we use AI.** We use AI to read CVs and match people to roles, with providers like Anthropic, OpenAI and Google under confidentiality terms. We do not sell your data and we do not let it train public models. People make the final calls.

**7. Leaving.** Either of us can end this at any time, in writing. Three things continue: confidentiality, the 12 month clause above, and your right to be paid on candidates you have already submitted.

**8. The legal basics.** Delaware law. Disputes go to individual arbitration (AAA, remote, no class actions), though either of us can still use small claims court, and either of us can ask a court to stop a breach of confidentiality. Our liability is capped at what we have paid you over the last 12 months.

## Accept

When you submit your first candidate we will show you the submission terms, which cover how attribution works and what you are confirming about the candidate. Everything is readable any time at refery.xyz/partner-terms.

Ticking the box and creating your account is a legally binding signature under the E-SIGN Act and UETA.`

/**
 * Partner Terms v2.0, shown at sign-up to scouts and recruiters alike.
 *
 * Same lightweight markup as the client agreement. The account still records
 * whether someone joined as a scout or a recruiter; only the document is shared.
 */
export const PARTNER_TERMS_TEXT = `# Partner Terms

**v2.1** · Refery and you · The table below is the whole deal

## The short version

| | |
|---|---|
| **You earn** | 70% of the placement fee on every hire you source |
| **You also earn** | 10% of the fee on hires at a company you introduce, and $1,000 a hire for a partner you bring |
| **You get paid** | 14 business days after the client pays us, never before day 90 |
| **You pay** | Nothing, ever. No fees, no minimums, no exclusivity |
| **Your commitment** | None. Work with whoever else you like, leave whenever |
| **What we ask** | Keep what you see inside Refery confidential |

## The details

**1. What you earn.** You keep 70% of the placement fee on every candidate you source who is hired and stays 90 days. Refery keeps 30% and handles the client, the contract, the invoice and the chasing. A role's fee is either a percentage of first year base salary, usually 10 to 20%, or a fixed amount. Either way it is shown on the role before you work it.

**2. When you get paid.** Two things have to be true: the person has passed 90 days in the job, and the client has paid us. Once both are true, your payout goes out within 14 business days.

The 90 days is the guarantee we give the client. If the person leaves inside it, for any reason, we run a free replacement search for the client at no extra fee. Nothing is paid out to you on that placement and nothing is owed back either.

On our standard client terms the client pays 30 days after the start date, so by day 90 the money is already with us and day 90 is the only thing you are waiting on. A few clients are on longer terms, and there your payout follows their payment instead. We show you that timing on the role before you work it.

We hold the money until it is yours, so you will never face a clawback. If a placement does not last, no money changes hands in either direction.

**3. Keep our clients confidential.** Everything inside Refery is confidential: company names, roles, hiring managers, pay and team detail. Many of these companies are in stealth. You can describe a role to a candidate in general terms, such as "a Series B fintech in New York", but please do not name or identify the company until that candidate has been vetted and signed our confidentiality terms. This one continues after you leave.

**4. Please don't go around us.** We pay to bring these companies onto the platform. For 12 months after you last work on a client's roles, please don't place candidates with them outside Refery. Any relationship you already had before joining is yours, and is carved out.

**5. You work for yourself.** You are an independent contractor, not an employee. No exclusivity, no non compete, no minimum activity, no set hours. You handle your own taxes, and we report payments where the law requires it.

**6. How we use AI.** We use AI to read CVs and match people to roles, with providers like Anthropic, OpenAI and Google under confidentiality terms. We do not sell your data and we do not let it train public models. People make the final calls.

**7. Leaving.** Either of us can end this at any time, in writing. Three things continue: confidentiality, the 12 month clause above, and your right to be paid on candidates you have already submitted.

**8. The legal basics.** Delaware law. Disputes go to individual arbitration (AAA, remote, no class actions), though either of us can still use small claims court, and either of us can ask a court to stop a breach of confidentiality. Our liability is capped at what we have paid you over the last 12 months.

**9. Two more ways to earn.** Both stack on top of anything you already earn on a placement.

- **Bring us a company.** Introduce a startup that becomes a Refery client and, for 24 months from that introduction, you earn an extra 10% of the placement fee on every hire that closes there. If you also sourced the person hired, you earn both.
- **Bring us a partner.** Introduce a recruiter or scout who joins and makes a real submission within 30 days, and you earn $1,000 for every hire they close that lasts 90 days, up to $20,000 for any one person you introduce.

Copy hello@refery.io into the introduction so it is on the record. If two people claim the same introduction the first confirmed one wins, and our timestamps settle it. Bonuses do not chain: if you introduce someone who introduces someone else, you earn on theirs and not on the third person's. We can pause either of these with 30 days' notice, and anything already earned, plus hires that close within 12 months of an introduction you made before then, is still paid.

## Accept

When you submit your first candidate we will show you the submission terms, which cover how attribution works and what you are confirming about the candidate. Everything is readable any time at refery.xyz/partner-terms.

Ticking the box and creating your account is a legally binding signature under the E-SIGN Act and UETA.`

/**
 * Submission Terms v1.0, shown once before a partner's first candidate goes in.
 *
 * These are the obligations that only come into existence when there is a
 * candidate: attribution, consent, accuracy, and the two narrow restrictions.
 */
export const PARTNER_SUBMISSION_TERMS_TEXT = `# Before your first submission

**v1.0** · One screen, once. These apply to every candidate you submit from here.

**What counts as a submission.** Your submission is on the record when you give us the candidate's CV, their contact details and a short note on why they fit, and we confirm and timestamp it. A name on its own, or a forwarded CV with no context, does not start your protection.

**Your candidate is yours for 24 months.** If the client hires them within 24 months of your confirmed submission, in any role, on any team, you earn the payout. That includes hires through the client's parent company, subsidiaries and affiliates. If two partners submit the same person, the first confirmed submission wins, and our timestamps settle it.

**You have their permission.** By submitting someone you confirm they agreed to share their information with Refery and our clients, and that what you have told us is accurate as far as you know. If someone's experience turns out to be materially misrepresented, you cover us for what that costs.

**Two more things to avoid.** While you are working a client's roles, and for 12 months after, please don't recruit that client's own employees into other Refery roles. And once one of your candidates is in an active process with a client, that placement runs through Refery. Outside that specific pairing your network stays entirely yours.`

// Scout/Partner Agreement Text — v1.2
// Uses lightweight markup parsed by <AgreementContent />:
//   "# "  document title
//   "## " numbered section heading
//   "### " sub-heading
//   "- "  bullet item
//   "**bold**" inline emphasis
//   "---" horizontal rule
export const SCOUT_AGREEMENT_TEXT = `# Scout Partner Agreement

This Scout Partner Agreement ("Agreement") is between Refery and the individual accepting these terms ("Scout" or "Partner"). It covers every candidate you submit through Refery — now and in the future.

## 1. What Refery provides

Refery handles the entire business side so you can focus on what you do best — surfacing great people. On every placement that closes, Refery handles:

**Client acquisition.** Refery finds, qualifies, and signs hiring companies. You receive ready-to-work role briefs with full context: company stage, funding, salary range, must-haves, hiring manager preferences, and timeline. You never cold-pitch a client.

**Contracts and legal.** Refery negotiates and manages all client agreements, terms, and legal documentation. You never draft, review, or chase a contract.

**Invoicing and collection.** Refery invoices clients, tracks payments, enforces late fees, and resolves all billing matters. You never send an invoice or chase a payment.

**Guarantee administration.** Refery manages the 90-day guarantee process with clients, including any refund situations. You are never involved in refund discussions or disputes.

**Talent vetting.** Refery operates a Talent Committee — the team responsible for vetting candidates before they're shared with clients across the broader network. This is what keeps the network high-trust on both sides.

**Candidate tracking and protection.** Every qualified submission is timestamped and recorded. Your work is documented and protected from the moment Refery confirms your submission.

**Multi-role matching.** Candidates who pass vetting are matched across every relevant open role on the platform — not just the role you submitted them for. One strong submission has compounding value.

## 2. Your payout

You earn 70% of the placement fee for every successful placement. Refery retains 30%. This split is the same for every Scout Partner from your first placement onward — no tiers, no scaling, no fine print.

Refery works with a growing network of VC-backed startups, each with their own fee arrangement. Depending on the client relationship, a role's placement fee may appear in one of two formats:

- **Percentage-based:** A percentage of the candidate's first-year annual base salary (typically 10–20%), as negotiated between Refery and the client. Your payout is 70% of this fee.
- **Fixed referral fee:** A specific dollar amount (e.g. $10,000, $25,000, $50,000) set by the client. Your payout is 70% of this amount.

Each role on the platform shows the confirmed fee structure when active. The fee shown at the time of your submission is the fee that applies to any resulting placement.

## 3. How payouts work

Refery handles all invoicing and payment collection from clients. The client pays Refery within 30 days of the candidate's start date, and Refery holds these funds during the 90-day guarantee period.

Your payout is processed within 14 business days after the candidate completes 90 days of continuous employment, once Refery has collected the placement fee from the client. Because Refery holds the funds until the guarantee clears, you will never face a clawback. If the placement doesn't work out within 90 days, no money changes hands — clean and final. Once your payout lands, it's yours.

On the rare occasion a client doesn't pay despite our enforcement, Refery pursues collection on your behalf and pays you as soon as funds arrive — our interests are aligned with yours. Payouts are tied to actual collection, which is industry standard and what allows us to work with early-stage companies.

### What "continuous employment" means

The 90-day clock runs from the candidate's start date. Continuous employment means the candidate is still employed at the end of day 90 — the standard the recruiting industry has used for decades. It covers all the normal reasons a hire might not stick: the candidate resigns, the company terminates them, the role is eliminated, or the engagement ends for any other reason. Standard time off, vacation, holidays, and approved leaves of absence (medical, parental, military) under the hiring company's own leave policies during the 90 days don't affect this. If the hire is still on the team at day 90, your payout clears.

## 4. What counts as a qualified submission

A submission is "qualified" — and starts your candidate protection — when all three of the following are met:

- **(a)** You share the candidate's resume or CV, their contact information, and a written assessment of why they are relevant to the role — not just a name or an unvetted profile;
- **(b)** You have personally vetted the candidate or can speak to their fit based on direct knowledge or a trusted warm introduction;
- **(c)** Refery confirms receipt and logs the submission on the platform with a timestamp.

Simply uploading a name, forwarding a resume without context, or sending an unvetted profile does not constitute a qualified submission and does not start candidate protection.

## 5. Your candidates are protected

A candidate from a qualified submission is attributed to you for twenty-four (24) months from the confirmed submission date. We chose 24 months because we want you to feel safe sourcing once and getting paid even when hiring cycles run long. If that candidate is hired by the same client within 24 months — for any role, in any department — you earn the payout. This includes hiring through any parent company, subsidiary, affiliate, or related entity of the client.

If multiple Partners submit the same candidate, the first qualified submission wins. Refery's timestamped platform records are the source of truth on attribution — once a submission is logged, your work is protected.

## 6. Your work, your way

You are an independent contractor, not an employee of Refery. You set your own pace, use your own methods, and submit on your own schedule. You are responsible for your own taxes, insurance, and business expenses. Refery does not provide benefits, equipment, or employment protections.

There is no exclusivity requirement and no non-compete. You are free to source for other platforms, agencies, or direct clients outside of Refery. The restrictions that do apply are narrow and explained in Section 7 — they exist to protect the clients and candidates that make Refery work, not to limit your broader sourcing activity.

**On taxes.** Refery may report payments made to you to the relevant tax authorities as required by applicable law (in the US, under Section 6050W of the Internal Revenue Code) and provide applicable tax forms (such as a 1099-NEC for US-based partners, or the equivalent for partners in other jurisdictions) at year end. If Refery is audited and your records are relevant, you agree to cooperate promptly.

## 7. What's restricted, and what isn't

Two narrow restrictions apply, each tied to a specific concern.

### (a) Don't go around Refery to clients you met through us

Refery invests significantly to bring clients onto the platform — business development, sales, contracts, invoicing, payment collection, account management. Because of that:

You agree not to contact Refery's clients directly for recruitment business, bypass the platform to place candidates, or solicit clients to work with you outside of Refery. This applies to clients you first discovered through Refery, for 12 months after your last interaction with that client's roles.

If a client relationship pre-dates your time on Refery, that relationship is fully carved out and remains yours. If a pre-existing relationship is disputed, Refery may request reasonable supporting evidence such as prior invoices or email history.

### (b) Keep candidate and client information confidential

You agree to keep non-public information about Refery's clients, candidates, fee structures, and platform operations confidential, and to handle candidate information in line with applicable privacy laws. You will not use information you receive through Refery for purposes outside this Agreement.

## 8. Candidate consent

By submitting a candidate, you represent that you have obtained the candidate's permission to share their information with Refery and Refery's clients for the purpose of pursuing roles on the platform.

## 9. Representations and warranties

You represent and warrant that: (a) you have the right to enter into this Agreement; (b) you will comply with all applicable laws; (c) all candidate information you submit is accurate to the best of your knowledge; and (d) you have obtained the necessary candidate consents.

## 10. Term and termination

This Agreement begins on the date you accept it and continues until either party terminates it with 30 days' written notice.

If this Agreement ends, your platform access is revoked, but your protection periods for previously submitted candidates remain in effect. You remain entitled to payouts for placements that close during those protection periods, on the same terms as Section 3.

## 11. Limitation of liability

To the maximum extent permitted by law, neither party will be liable for any indirect, incidental, special, consequential, or punitive damages. Refery's total liability under this Agreement is capped at the total payouts paid to you in the 12 months immediately preceding the claim.

## 12. General

This Agreement is the entire agreement between you and Refery on this subject. Other than the protected economics in Section 2 (which can't be changed without your express written consent), Refery may update operational terms with 30 days' notice. Disputes will be resolved through binding arbitration under the rules of the American Arbitration Association. This Agreement is governed by the laws of the State of Delaware, without regard to conflicts of law principles. If any provision is found unenforceable, the remaining provisions stay in effect.

BY ACCEPTING THIS AGREEMENT, YOU ACKNOWLEDGE THAT YOU HAVE READ, UNDERSTOOD, AND AGREE TO BE BOUND BY ALL TERMS AND CONDITIONS SET FORTH HEREIN.`

// Recruiter Agreement Text — Recruiting Partner Agreement v1.2
// Uses lightweight markup parsed by <AgreementContent />:
//   "# "  document title
//   "## " numbered section heading
//   "### " sub-heading
//   "- "  bullet item
//   "**bold**" inline emphasis (lead-ins, defined terms)
//   "---" horizontal rule
export const RECRUITER_AGREEMENT_TEXT = `# Recruiting Partner Agreement

This Recruiting Partner Agreement ("Agreement") is between Refery and the individual accepting these terms ("Recruiting Partner" or "Partner"). It covers all roles you work on through Refery — now and in the future.

## 1. What Refery provides

Refery runs the entire business side so you can focus on what you do best — finding great candidates. Here is what Refery handles on every placement:

**Client acquisition.** Refery finds, qualifies, and signs hiring companies. You receive ready-to-work role briefs with full context: company stage, funding, salary range, must-haves, hiring manager preferences, and timeline. You never cold-pitch a client.

**Contracts and legal.** Refery negotiates and manages all client agreements, terms, and legal documentation. You never draft, review, or chase a contract.

**Invoicing and collection.** Refery invoices clients, tracks payments, enforces late fees, and resolves all billing matters. You never send an invoice or chase a payment.

**Guarantee administration.** Refery manages the 90-day guarantee process with clients, including any refund situations. You are never involved in refund discussions or disputes.

**Talent vetting.** Refery operates a Talent Committee — the team responsible for vetting candidates before they're shared with clients across the broader network. This is what keeps the network high-trust on both sides.

**Candidate tracking and protection.** Every qualified submission is timestamped and recorded. Your work is documented and protected from the moment Refery confirms your submission.

**Multi-role matching.** Candidates who pass vetting are matched across every relevant open role on the platform — not just the role you submitted them for. One strong submission has compounding value.

## 2. Your payout

You earn 70% of the placement fee for every successful placement. Refery retains 30%. This split is the same for every Recruiting Partner from your first placement onward — no tiers, no scaling, no fine print.

Refery works with a growing network of VC-backed startups, each with their own fee arrangement. Depending on the client relationship, a role's placement fee may appear in one of two formats:

- **Percentage-based:** A percentage of the candidate's first-year annual base salary (typically 10–20%), as negotiated between Refery and the client. Your payout is 70% of this fee.
- **Fixed referral fee:** A specific dollar amount (e.g. $10,000, $25,000, $50,000) set by the client. Your payout is 70% of this amount.

Each role on the platform shows the confirmed fee structure when active. The fee shown at the time of your submission is the fee that applies to any resulting placement.

## 3. How payouts work

Refery handles all invoicing and payment collection from clients. The client pays Refery within 30 days of the candidate's start date, and Refery holds these funds during the 90-day guarantee period.

Your payout is processed within 14 business days after the candidate completes 90 days of continuous employment, once Refery has collected the placement fee from the client. Because Refery holds the funds until the guarantee clears, you will never face a clawback. If the placement doesn't work out within 90 days, no money changes hands — clean and final. Once your payout lands, it's yours.

On the rare occasion a client doesn't pay despite our enforcement, Refery pursues collection on your behalf and pays you as soon as funds arrive — our interests are aligned with yours. Payouts are tied to actual collection, which is industry standard and what allows us to work with early-stage companies.

### What "continuous employment" means

The 90-day clock runs from the candidate's start date. Continuous employment means the candidate is still employed at the end of day 90 — the standard the recruiting industry has used for decades. It covers all the normal reasons a hire might not stick: the candidate resigns, the company terminates them, the role is eliminated, or the engagement ends for any other reason. Standard time off, vacation, holidays, and approved leaves of absence (medical, parental, military) under the hiring company's own leave policies during the 90 days don't affect this. If the hire is still on the team at day 90, your payout clears.

### On the 90-day guarantee

The 90-day, 100%-refund guarantee is the industry default. On select engagements, Refery negotiates more partner-friendly structures with clients — for example, a free replacement search instead of a refund, or earlier payout timing tied to a shorter guarantee. Across all engagements, Refery's goal is to push terms in the partner's direction without losing client relationships. Your interests and ours are aligned: better terms mean faster, cleaner payouts.

## 4. What counts as a qualified submission

A submission is "qualified" — and starts your candidate protection — when all three of the following are met:

- **(a)** You share the candidate's resume or CV, their contact information, and a written assessment of why they are relevant to the role — not just a name or an unvetted profile;
- **(b)** You have personally vetted the candidate or can speak to their fit based on direct knowledge or a trusted warm introduction;
- **(c)** Refery confirms receipt and logs the submission on the platform with a timestamp.

Simply uploading a name, forwarding a resume without context, or sending an unvetted profile does not constitute a qualified submission and does not start candidate protection. Most partners source against the profile types Refery hires for in general (e.g. senior engineering, growth, founding GTM) and match strong candidates across multiple roles — the qualified submission rule applies the same way regardless of how you sourced.

## 5. Your candidates are protected

A candidate from a qualified submission is attributed to you for twenty-four (24) months from the confirmed submission date. We chose 24 months because we want you to feel safe sourcing once and getting paid even when hiring cycles run long. If that candidate is hired by the same client within 24 months — for any role, in any department — you earn the payout. This includes hiring through any parent company, subsidiary, affiliate, or related entity of the client.

If multiple Recruiting Partners submit the same candidate, the first qualified submission wins. Refery's timestamped platform records are the source of truth on attribution — once a submission is logged, your work is protected. The same source-of-truth rule applies anywhere this Agreement references attribution disputes (Section 9 company introductions, Section 10 partner introductions).

## 6. Your work, your way

You are an independent contractor, not an employee of Refery. You set your own schedule, use your own methods, and choose your own tools. You are responsible for your own taxes, insurance, and business expenses. Refery does not provide benefits, equipment, or employment protections.

There is no exclusivity requirement and no non-compete. You are free to work with other platforms, agencies, or direct clients outside of Refery. The restrictions that do apply are narrow and explained in Section 7 below — they exist to protect the clients and candidates that make Refery work, not to limit your broader recruiting career.

**On taxes.** Refery may report payments made to you to the relevant tax authorities as required by applicable law (in the US, under Section 6050W of the Internal Revenue Code) and provide applicable tax forms (such as a 1099-NEC for US-based partners, or the equivalent for partners in other jurisdictions) at year end. If Refery is audited and your records are relevant, you agree to cooperate promptly.

## 7. What's restricted, and what isn't

Three narrow restrictions apply, each tied to a specific concern. Together they're the only limits on your work outside of Refery.

### (a) Don't go around Refery to clients you met through us

Refery invests significantly to bring clients onto the platform — business development, sales, contracts, invoicing, payment collection, account management. Because of that:

You agree not to contact Refery's clients directly for recruitment business, bypass the platform to place candidates, or solicit clients to work with you outside of Refery. This applies to clients you first discovered through Refery, for 12 months after your last interaction with that client's roles.

**What this means in practice.** This clause is triggered only when you actively route a placement, candidate submission, or recruiting engagement around Refery to avoid fees on a client you discovered through us — not by legitimate recruiting work outside the platform, inbound interest from someone who happens to be at a Refery client, or relationships that exist independently of Refery. If you actively circumvent the platform, you owe Refery the full placement fee that would have been earned through it.

**Pre-existing relationships are fully carved out.** This clause does not apply to clients with whom you had an active, documented business relationship before first accessing their roles on Refery. If a dispute arises, you may be asked to provide evidence such as prior invoices, emails, or placement records.

### (b) Don't recruit a client's existing employees to other Refery clients

While you're actively working with a client through Refery, and for twelve (12) months after your last interaction with that client's roles, you agree not to solicit, recruit, or attempt to place that client's existing employees into roles at other Refery clients.

This doesn't restrict your general network, inbound candidates, or people who approach you independently. It only means you won't use information or relationships you gained through Refery to actively recruit from a client whose roles you've worked on.

### (c) Don't reroute a candidate who's in an active Refery process

When a candidate of yours enters Refery's pipeline for a specific client — meaning Refery has confirmed your submission and the client is actively considering them — that placement, with that specific client, must flow through Refery. You can't reroute the same candidate to the same client through another channel to avoid the platform fee. This applies only to that specific candidate-client pairing while the process is active.

Outside that specific active process, nothing changes. The same candidate is still yours to place anywhere else — different companies, your other clients, your direct relationships. Your network is your network.

## 8. How confidentiality works on Refery

The companies hiring through Refery trust us because we protect them. Many are in stealth, haven't announced their round, or simply don't want candidates reaching out directly using their name. Respecting this trust is how we keep the best roles flowing to you — and how you keep access to them.

**What's confidential.** Everything you see inside Refery is confidential: company names, role details, hiring manager identities, compensation data, team information, and interview feedback. This obligation continues after this agreement ends.

### The two-gate rule for sharing with candidates

**Before vetting.** You may discuss opportunities with candidates using only high-level anonymized signals — for example, "a Series B fintech in New York that raised $40M," or "a seed-stage AI infra company in SF led by a repeat founder." What you cannot share: the company name, the hiring manager's name, specific product details, the role's URL, or any combination that would make the company identifiable. When in doubt, go more anonymous, not less.

**After vetting.** Once a candidate passes Refery's Talent Committee vetting and signs Refery's Candidate Confidentiality Acknowledgment, they get full visibility — including company, product, team, and hiring manager. From that point, you can speak freely with them about the opportunity.

### Public sourcing posts — encouraged

Generic posts about the kinds of profiles you're looking for are encouraged. For example: "Looking for forward-deployed engineers in NY at seed/Series A startups" or "Open to talking with senior infra engineers exploring Series B opportunities in SF." These help you find great people and don't breach confidentiality — the company isn't named or identifiable.

**The line is specificity.** Anything that names or could identify a particular client — even with the name redacted — isn't allowed. Common examples to avoid: combining unique product details with stage and location, naming the founder, sharing screenshots of role pages, or describing a company in a way only its insiders would recognize.

### Always off-limits

- Contacting hiring managers directly using their name or information learned through Refery.
- Posting Refery roles on LinkedIn, Indeed, Glassdoor, or any job board under the company's name or disguised as the company.
- Holding yourself out as an employee or representative of the client company.
- Sharing role-specific content on social media, newsletters, or public forums in a way that names or identifies a particular client.

When unsure, ask us first. Email legal@refery.io or message your Refery contact — we'll tell you exactly what you can and can't say about a given role.

If a confidentiality breach occurs, Refery may deactivate your account, forfeit pending referral payouts, and — in cases of serious harm to a client — seek damages for actual losses.

## 9. How Refery uses AI

Refery is an AI-native platform. We use artificial intelligence and machine-learning systems to operate and improve the service — including parsing resumes, matching candidates to roles, summarizing role briefs, surfacing patterns across the network, and helping our team work efficiently.

### What this means for you

Information you submit through Refery — candidate notes, fit assessments, communications with the Refery team, and your platform interactions — may be processed by Refery's AI systems and by trusted third-party AI providers (such as Anthropic, OpenAI, and Google) acting as our sub-processors under confidentiality and data-protection terms. By using the platform, you grant Refery a non-exclusive, worldwide license to use, process, and analyze this content for the purpose of operating, improving, and securing the service.

### What Refery commits to

- Refery does not sell your data.
- Refery does not allow third-party AI providers to use your content to train their public foundation models.
- Final placement decisions are made by humans — Refery's AI supports matching and operations but does not make hiring decisions.
- Confidentiality obligations apply to AI-processed content the same way they apply to anything else: client information stays confidential at every layer.

If you have questions about how a specific piece of information is used, email legal@refery.io.

## 10. Earn more by growing the network

Beyond placements, Refery offers two ways for partners to earn additional income by helping the network grow. These programs stack with each other and with your placement payouts.

### (a) Bring great companies

If you know great startups (Seed to Series B, SF or NY based) that are actively hiring, we'd love an introduction. Send them to refery.io — that's our hiring manager side. To make sure your intro is on the record, copy hello@refery.io when you make the introduction.

For every placement that comes through a startup you introduced to Refery within twenty-four (24) months of the introduction, you earn an additional 10% of the placement fee on top of any other earnings on that placement (including your Recruiting Partner payout). This stacks: if you also submitted the placed candidate, both apply.

A qualified company introduction means you made a warm introduction directly to the company's hiring team (a real conversation or thread — not a forwarded link) and Refery confirms a hiring engagement results from that introduction. The 24-month clock starts when Refery confirms the introduction. If multiple partners introduce the same company, the first confirmed introduction wins.

### (b) Bring great recruiters and scouts

If you know other great recruiters or scouts who would be a fit for Refery, introduce them. Copy hello@refery.io when you connect them with the Refery team.

For each successful hire that comes through a recruiter or scout you introduced — meaning the candidate they submitted is hired and clears the 90-day guarantee — you earn a $1,000 bonus per hire, up to $20,000 lifetime per person you introduce (a maximum of 20 hires from any single introduction). This bonus is on top of any other earnings on the placement and is paid alongside the underlying payout, subject to the same 90-day hold and client collection rules.

### How to qualify for the recruiter/scout bonus

- You make a warm introduction in good faith directly to the Refery team (a real conversation, email thread, or scheduled intro — not a forwarded link).
- The recruiter or scout you introduced is onboarded to Refery and signs the applicable agreement.
- They make at least one qualified submission within 30 days of the warm introduction. This activation step is what triggers your eligibility for the bonus on their future hires.

### Notes on both programs

- First confirmed introduction wins for any contested attribution; Refery's timestamped records are the source of truth.
- Bonuses do not chain through multiple referral levels — if Partner A introduces Partner B, who introduces Partner C, only A earns on B's hires (not on C's).
- Refery may pause or end either program at any time with 30 days' notice. Bonuses already earned, and bonuses on hires that close within 12 months of any introduction made before the program ends, are honored under the terms in effect when the introduction was made.
- Refery may decline to credit introductions that don't reflect a genuine relationship or were made in bad faith.

## 11. Your responsibilities

Submit only candidates who meet the role requirements. Include accurate information and do not misrepresent a candidate's experience, skills, availability, or compensation expectations. By submitting a candidate, you confirm that you have their consent to share their personal information with Refery and its clients for employment evaluation purposes.

You are responsible for the accuracy of the information you provide about candidates. If a candidate's qualifications or experience are materially misrepresented, you agree to indemnify Refery against any resulting claims, costs, or damages from clients.

### What Refery commits to

In return: Refery indemnifies Partner against third-party claims that arise from Refery's gross negligence, willful misconduct, or material breach of this Agreement — capped at the total payouts Partner has earned in the 12 months preceding the claim. Both parties' indemnification obligations are mutual in scope and proportional to the harm.

## 12. Account access and ending the agreement

Refery's value to clients depends on the quality of the network. If quality concerns arise, Refery will notify you and give you a reasonable opportunity to improve. If the issue continues, Refery may reduce your role access, deactivate your account, or terminate this agreement. In cases of dishonesty, material misrepresentation, serious misconduct, breach of confidentiality, or violation of any term in this agreement, Refery may deactivate your account immediately, without prior notice.

Either party can end this agreement at any time, for any reason, without notice. The following obligations survive termination:

- Payouts earned and pending the 90-day hold (subject to client collection)
- The 24-month candidate protection window for candidates already submitted
- The 24-month company introduction window under Section 10(a)
- Recruiter/scout introduction bonus rights for hires that close within 12 months of an introduction made while the program was active
- The three restrictions in Section 7
- Confidentiality (Section 8)
- AI license for content already submitted (Section 9)
- Tax cooperation (Section 6)
- Mutual indemnification (Section 11)

## 13. Updates to this agreement

Refery may update operational terms (such as quality standards, platform rules, and confidentiality provisions) with 30 days' notice. Continued use of the platform after the notice period constitutes acceptance of those changes.

**Two protections for you.** First, changes to your payout percentage or payment timing require your written consent and do not take effect through continued platform use alone. Second, updates that materially expand your obligations or restrict your work outside Refery require your acceptance, not just continued use. Your economics and your independence are protected.

## 14. Disputes and resolution

Most issues get resolved with a quick conversation. For anything that escalates: this Agreement is governed by Delaware law. Disputes are resolved by binding arbitration (AAA rules, conducted remotely) on an individual basis — both parties waive the right to participate in class actions or class-wide arbitration. Either party may bring claims within the jurisdiction of small claims court without first arbitrating. Either party may also seek injunctive relief in court to prevent actual or threatened breaches of confidentiality, non-solicitation, or non-circumvention obligations.

If a dispute arises between two Recruiting Partners (for example, over candidate or company attribution), Refery will review the platform's timestamped records and make a determination. Both partners agree that Refery's good-faith determination is final, and Refery is not liable for that determination as long as it's based on the platform's records.

Neither party is liable for delays or failures in performance caused by events beyond reasonable control — including natural disasters, government actions, banking failures, or pandemics — provided the affected party communicates promptly and resumes performance as soon as practicable.

## 15. General

The Refery platform and services are provided on an "as-is" basis. Refery makes no warranties about platform uptime, the quality of individual clients or candidates, or specific placement outcomes beyond what is expressly stated in this agreement. Refery's total monetary liability is capped at the total payouts you earned in the 12 months preceding any claim.

Refery may assign this agreement to a successor entity in the event of a merger, acquisition, or restructuring. If any provision is found unenforceable, the remaining provisions remain in full effect. This is the entire agreement between the parties and supersedes all prior discussions, representations, or agreements relating to its subject matter. Questions about anything in this agreement: legal@refery.io.

## Acceptance

By clicking "Accept Agreement" below, you confirm that you are at least 18 years old and have the legal capacity to enter this agreement, that you have read and understood it in full, and that you agree to its terms as an independent Recruiting Partner.

Your click constitutes a legally binding electronic signature under applicable electronic signature laws (E-SIGN Act, UETA), with the same legal force as a handwritten signature. Refery records the date, time, IP address, user-agent, and account associated with your acceptance as evidence of this agreement.

---

Refery Recruiting Partner Agreement v1.1 · Confidential`

// Format fee percentage: whole number as "20", fractional as "17.5".
export function formatFeePercent(pct: number): string {
  return Number.isInteger(pct) ? String(pct) : pct.toFixed(1)
}

// Recruitment Services Agreement. Uses the same lightweight markup as the
// scout/recruiter agreements (parsed by <AgreementContent />), plus a markdown
// table for the "At a glance" block. Two configurable terms: the fee percent,
// and the payment/guarantee model (see ClientPaymentTiming). Everything else —
// the 90-day guarantee and the 12-month intro window — is baked into the text.
export function generateClientAgreementText(
  companyName: string,
  options: { feePercent?: number; paymentTiming?: ClientPaymentTiming } = {},
): string {
  const feePercent = options.feePercent ?? DEFAULT_CLIENT_TERMS.feePercentage
  const timing = options.paymentTiming ?? 'net30'
  if (timing === 'net10' || timing === 'start30' || timing === 'net30') {
    return generateStandardClientAgreement(companyName, feePercent, timing)
  }
  return generateLegacyClientAgreement(companyName, feePercent, timing)
}

/**
 * v2.8 is the current standard offer. This also renders the two older shapes
 * built on the same body: v2.7 (retired, pay 10 business days after day 90) and
 * the negotiated v2.7-A.
 *
 * Written to be signed by the one operator in the room rather than routed to
 * counsel: plain words, short sentences, the whole commercial deal visible in
 * the table before any prose. Refery's three real protections are all still
 * here: attribution (§1, §4), collectability (§1 reporting duty, §4
 * re-engagement), and confidentiality (§5). They are just no longer buried.
 */
function generateStandardClientAgreement(
  companyName: string,
  feePercent: number,
  timing: 'net10' | 'start30' | 'net30' = 'net30',
): string {
  const fee = formatFeePercent(feePercent)
  const onStart = timing === 'start30'
  const version = clientAgreementVersion(timing)

  // Payment and guarantee are two independent clocks on v2.8. The invoice lands
  // 30 days after the start date, and the guarantee runs its own 90 days from
  // that same start date. v2.7 collapsed the two into one, which is why it had
  // nothing left to promise beyond "you owe nothing".
  const glancePayment =
    timing === 'net10'
      ? '10 business days after their 90th day with you'
      : timing === 'net30'
        ? 'Invoiced on their first day, due 30 days after it'
        : '30 days after their start date'

  // Alcor Labs kept the payment terms they had already agreed and proposed the
  // replacement-first wording themselves, so that variant mirrors their own
  // language rather than the standard's.
  const glanceGuarantee =
    timing === 'net30'
      ? 'Gone within 90 days? We find their replacement, free'
      : onStart
        ? 'Gone within 90 days? We replace them, or refund your fee in cash'
        : 'Gone within 90 days? You owe nothing, and anything paid comes back'

  const section1 =
    timing === 'net30'
      ? `**1. You pay 30 days after they start.** Hire someone we introduced, in any role, within 12 months of the introduction, and the fee is ${fee}% of their first-year base salary, taken from their signed offer letter. Bonuses, equity, and commission aren't counted. We invoice on their first day, and payment is due 30 calendar days after that start date. Please tell us within 5 business days when someone accepts, along with their start date and salary. Anything still unpaid from day 31 adds 1.5% a month.`
      : onStart
        ? `**1. You pay only when you hire.** Hire someone we introduced, in any role, within 12 months of the introduction, and the fee is ${fee}% of their first-year base salary, taken from their signed offer letter. Bonuses, equity, and commission aren't counted. It's due within 30 calendar days of their start date. Please tell us within 5 business days when someone accepts, along with their start date and salary. Late invoices add 1.5% a month.`
        : `**1. You only pay for a hire who stays.** Hire someone we introduced, in any role, within 12 months of the introduction, and the fee is ${fee}% of their first-year base salary, taken from their signed offer letter. Bonuses, equity, and commission aren't counted. It's due 10 business days after their 90th day. Please tell us within 5 business days when someone accepts, along with their start date and salary. Late invoices add 1.5% a month.`

  const section2 =
    timing === 'net30'
      ? `**2. If they leave within 90 days, we replace them free.** Any reason at all: they resign, it wasn't the right fit, the role changed, or you had to restructure. There are no exclusions. Tell us within 10 business days and we'll run a replacement search for the same role at no further placement fee. We start within 5 business days of hearing from you and stay on it until the seat is filled. That is one replacement per placement, and if the role itself has gone, we'll carry the guarantee over to the next role you hire for with us, for 12 months.`
      : onStart
        ? `**2. If they leave within 90 days, we replace them or refund you.** Any reason at all: they resign, it wasn't the right fit, the role changed, or you had to restructure. There are no exclusions. Tell us within 10 business days and we'll run a replacement search at no further fee. If we haven't produced a replacement who accepts your offer within 60 days of that notice, we refund the fee in full, in cash, within 30 days.`
        : `**2. If they leave within 90 days, you owe nothing.** Any reason at all: they resign, it wasn't the right fit, the role changed, or you had to restructure. There are no exclusions. Anything already paid comes back within 30 days. Just tell us within 10 business days so we can start again for you.`

  // Alcor proposed 5 business days themselves; the standard offers 10.
  const flagWindow = onStart ? '5 business days' : '10 business days'

  const survival =
    timing === 'net30'
      ? `Four things carry on: fees for anyone already hired, any replacement we still owe you, the 12-month window on introductions already made, and confidentiality.`
      : onStart
        ? `Four things carry on: fees for anyone already hired, any replacement or refund we still owe you, the 12-month window on introductions already made, and confidentiality.`
        : `Three things carry on: fees for anyone already hired, the 12-month window on introductions already made, and confidentiality.`

  return `# Recruitment Services Agreement

**v${version}** · Refery & ${companyName} · The table below is the whole deal

We keep this short on purpose. This is the entire agreement, and it covers every role you hire for with us.

## The short version

| | |
|---|---|
| **What it costs** | Nothing, unless you hire someone we introduce |
| **The fee** | ${fee}% of their first-year base salary |
| **When you pay** | ${glancePayment} |
| **If it doesn't work out** | ${glanceGuarantee} |
| **Commitment** | None. No exclusivity, no minimums, cancel anytime |

## The details

${section1}

${section2}

**3. If someone reached them before us, there's no fee.** You pay only where our written introduction came first. That means no fee if you already knew a candidate, and no fee if another recruiter introduced them to you first. Send us something dated from before our introduction, like an ATS record, an email, or a LinkedIn message, within ${flagWindow}, and we'll close it out.

**4. Please don't route around us.** The fee still applies if you hire someone we introduced through another agency, as a contractor, or via a sister company. The same goes if someone leaves early and you rehire them within 12 months. Our introduction records are the reference.

**5. We keep your details private.** Your name, roles, team, pay, and plans stay confidential, and we never post your roles publicly. Candidates learn who you are only after vetting and signing our confidentiality terms. Please do the same with candidate information. This continues after the agreement ends.

**6. How we use AI.** We use AI to read resumes and match people to roles, with providers like Anthropic, OpenAI, and Google under confidentiality terms. We don't sell your data or let it train public models. **Every hiring decision is yours**, as is your hiring process and the employment law that applies to you.

**7. The legal basics.** Our service is provided as-is, and we can't promise any particular hire. Each of us covers claims from our own serious mistakes or breach, capped at the greater of what you've paid us in the last 12 months or the fee on the placement in question. Delaware law. Disputes go to individual arbitration (AAA, remote, no class actions); small claims court stays open to both of us. If any part fails, the rest stands.

**8. Leaving is easy.** Either of us can end this in writing at any time, effective immediately. ${survival} We may update operating details with 30 days' notice, but anything touching fees or payment needs your say-so. If Refery is acquired, this moves with us.

## Sign

Add your name and email below, then click Accept. That's a legally binding signature under the E-SIGN Act and UETA. Questions any time: **legal@refery.io**.

We're glad you're here.`
}

/** v2.4 and v2.5: previous standard and the negotiated deferred variant. */
function generateLegacyClientAgreement(
  companyName: string,
  feePercent: number,
  timing: 'start' | 'day90',
): string {
  const fee = formatFeePercent(feePercent)
  const version = clientAgreementVersion(timing)
  const deferred = timing === 'day90'

  // Sections 1, 2, 3 and 8 carry the whole difference between the two models.
  // Sections 4-7 are identical, so the skeleton below is shared.
  const glancePayment = deferred
    ? `Due 14 business days after the candidate's 90th day`
    : `Due 30 days after candidate's start date`
  const glanceGuarantee = deferred
    ? `No fee if the hire doesn't start or leaves within 90 days`
    : `Free replacement search if hire leaves within 90 days`

  const section1 = deferred
    ? `**1. Fee and payment.** When a candidate introduced by Refery or its partners is hired by Client within 12 months of introduction, for any role in any department, Client pays Refery ${fee}% of the candidate's first-year annual base salary as stated in the executed offer letter. Signing bonuses, equity, commissions, and other variable compensation are excluded. Payment is due within 14 business days after the candidate's 90th day of employment — the same window in which Refery pays the recruiting partner who sourced them. If the candidate never starts, or leaves before day 90, no fee is owed (Section 2). Day 90 is the 90th calendar day after the start date; approved leave under Client's policies (medical, parental, or military) doesn't interrupt it. Client will notify Refery in writing of the accepted offer, start date, and base salary within 5 business days of offer acceptance. Overdue balances accrue interest at 1.5% per month, or the maximum rate permitted by law, whichever is lower.`
    : `**1. Fee and payment.** When a candidate introduced by Refery or its partners is hired by Client within 12 months of introduction, for any role in any department, Client pays Refery ${fee}% of the candidate's first-year annual base salary. Signing bonuses, equity, commissions, and variable compensation are excluded. Payment is due within 30 calendar days of the candidate's start date. Overdue balances accrue interest at 1.5% per month, or the maximum rate permitted by law, whichever is lower.`

  const section2 = deferred
    ? `**2. 90-day guarantee.** If the placed candidate's employment ends for any reason within 90 days of starting, no fee is owed, and any fee already paid is refunded in full within 30 days. There are no exclusions — resignation, performance, restructuring, and layoff all count equally. Client will notify Refery within 10 business days of the departure. The one exception is re-engagement, covered in Section 3.`
    : `**2. 90-day guarantee.** If the placed candidate's employment ends within 90 days of starting due to resignation, performance, or termination for cause, Refery will conduct a free replacement search to fill the same role at no additional placement fee. Notify Refery within 14 business days of departure. The guarantee doesn't apply where the role, compensation, or working conditions materially changed from the original listing, or where departure resulted from layoffs, restructuring, or reduction in force. The guarantee is conditioned on Client not being materially overdue on undisputed payment obligations.`

  // The re-engagement sentence is what keeps the "no fee if they leave" promise
  // from being a free-hire loophole (hire, part ways at day 80, rehire later).
  const reEngagement = deferred
    ? ` It also remains due if a candidate who never started, or who left within 90 days, is re-engaged by Client or an affiliate in any capacity within 12 months; the fee is then payable 14 business days after that engagement's 90th day.`
    : ``

  const termination = deferred
    ? `Either party may terminate at any time on written notice, effective immediately, and Refery stops making introductions on termination.`
    : `Either party may terminate on 30 days' written notice.`

  const survival = deferred
    ? `Termination doesn't cancel: fees owed, the 12-month introduction window for candidates introduced before the termination date, active guarantees, or the obligations in Sections 4 (Confidentiality) and 5 (AI).`
    : `Termination doesn't cancel: fees owed, the 12-month introduction window for already-introduced candidates, active guarantees, or the obligations in Sections 4 (Confidentiality) and 5 (AI).`

  return `# RECRUITMENT SERVICES AGREEMENT

**v${version}** · Effective on electronic acceptance · ~90-second read

This Agreement is between **Refery** ("Platform") and ${companyName} ("Client"). It covers every role Client submits through Refery, now and in the future. One agreement, all roles.

## At a glance

| | |
|---|---|
| **Fee** | ${fee}% of first-year base salary |
| **Payment** | ${glancePayment} |
| **Guarantee** | ${glanceGuarantee} |

## Terms

${section1}

${section2}

**3. Anti-circumvention.** Client agrees not to hire an introduced candidate through any channel that bypasses Refery, including direct contact, other agencies, contractor arrangements, or hiring through affiliates. The full placement fee remains due in any such case.${reEngagement} Refery's platform records, emails, and written introduction records constitute prima facie evidence of the date and fact of introduction.

**4. Confidentiality.** Refery and every recruiter and scout on its platform are contractually bound to hold Client's information confidential. Company name, role details, hiring manager identities, compensation, and team information aren't shared publicly or posted on job boards, and aren't disclosed to candidates until those candidates pass Refery's Talent Committee vetting and sign Refery's Candidate Confidentiality Acknowledgment. In turn, Client treats all candidate information received from Refery as confidential and uses it only to evaluate candidates for employment. Both obligations survive termination of this Agreement.

**5. How Refery uses AI.** Refery uses AI to parse resumes, match candidates to roles, and operate the platform, with trusted providers (such as Anthropic, OpenAI, and Google) acting as sub-processors under confidentiality and data-protection terms. Refery doesn't sell Client data and doesn't allow third-party AI providers to use it to train their public foundation models. Refery's AI supports matching and operations. **Final hiring decisions are made by Client.** Refery is responsible for the operation of its platform and AI tools. Client is responsible for its own hiring process, employment decisions, and any compliance obligations that apply to Client as the employer making the hire (such as those under NYC Local Law 144, the Illinois AI Video Interview Act, Colorado SB 205, and the EU AI Act).

**6. Liability, warranties, and indemnification.** The Refery platform and services are provided on an "as-is" basis. Refery doesn't guarantee placement outcomes or warrant individual candidates beyond its Talent Committee vetting standard. Refery's total monetary liability under this Agreement is capped at fees paid in the prior 12 months, and Refery isn't liable for indirect, incidental, or consequential damages. Each party indemnifies the other for third-party claims arising from its own material breach of this Agreement, gross negligence, or willful misconduct, capped at the same amount.

**7. Disputes.** This Agreement is governed by Delaware law, without regard to conflicts-of-law rules. Disputes will be resolved by binding individual arbitration under the American Arbitration Association (AAA) Commercial Arbitration Rules, conducted remotely. Both parties waive any right to class actions or class-wide arbitration. Either party may bring claims in small claims court or seek injunctive relief in court without first arbitrating. Neither party is liable for delays or failures caused by events beyond reasonable control.

**8. General.** ${termination} ${survival} Refery may update operational terms (such as platform features and rules) with 30 days' notice. Material changes to fees, payment terms, or core obligations require Client's affirmative consent. If Client objects to any update, Client may terminate without penalty during the notice period. Refery may assign this Agreement to a successor entity in a merger, acquisition, or restructuring. If any provision is unenforceable, the remaining provisions remain in full effect. This is the entire agreement between the parties.

## Acceptance

By checking the box and clicking **Accept**, the signer confirms they are at least 18 years old, authorized to bind their company, have read this Agreement, and agree to its terms. This constitutes a legally binding electronic agreement under the E-SIGN Act and UETA. Questions: **legal@refery.io**.`
}

// Current partner document. Scouts and recruiters share it; the account still
// records which they joined as.
export function getAgreementText(_type: AgreementType): string {
  return PARTNER_TERMS_TEXT
}

export function getAgreementVersion(_type: AgreementType): string {
  return AGREEMENT_VERSIONS.partner
}

// The exact text behind a version already on file, so historical acceptances and
// their integrity hashes still resolve to what was actually signed.
export function partnerAgreementTextForVersion(
  version: string,
  type: AgreementType,
): string {
  // Every version maps to the exact text it was. A partner opening their own
  // agreement has to see what they accepted, not what the document says today.
  //   2.0   28 acceptances, Aug-Sep 2026
  //   1.2.0 18 scout and 22 recruiter acceptances, May-Aug 2026
  if (version === AGREEMENT_VERSIONS.partner) return PARTNER_TERMS_TEXT
  if (version === '2.0') return PARTNER_TERMS_V2_0_TEXT
  if (version.startsWith('2.')) return PARTNER_TERMS_TEXT
  return type === 'scout' ? SCOUT_AGREEMENT_TEXT : RECRUITER_AGREEMENT_TEXT
}

// Agreement status labels for display
export const AGREEMENT_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  sent: { label: 'Sent', color: 'bg-blue-100 text-blue-700' },
  viewed: { label: 'Viewed', color: 'bg-amber-100 text-amber-700' },
  signed: { label: 'Signed', color: 'bg-emerald-100 text-emerald-700' },
  revoked: { label: 'Revoked', color: 'bg-red-100 text-red-700' },
  expired: { label: 'Expired', color: 'bg-gray-100 text-gray-600' },
}

// Agreement type labels for display
// The names of the two documents partners signed before v2.0. Kept for
// labelling those historical acceptances, not for anything current.
export const AGREEMENT_TYPE_LABELS: Record<AgreementType, string> = {
  scout: 'Scout/Partner Agreement',
  recruiter: 'Recruiter Partner Agreement',
}

/**
 * What to call a signature in the UI.
 *
 * Scouts and recruiters have signed one shared document, Partner Terms, since
 * v2.0. Before that they signed two separately named ones. A signature has to
 * be labelled with the document it actually was, so an acceptance on v1.2.0
 * still reads "Scout/Partner Agreement" while everything on the v2 line reads
 * "Partner Terms".
 */
export function agreementTypeLabel(type: AgreementType, version?: string | null): string {
  if (version && version.startsWith('2.')) return 'Partner Terms'
  return AGREEMENT_TYPE_LABELS[type]
}

// Client Agreement type label
export const CLIENT_AGREEMENT_TYPE_LABEL = 'Recruitment Services Agreement'

// Format terms for display
export function formatClientTerms(terms: ClientAgreementTerms): string {
  return `${terms.feePercentage}% fee, ${terms.paymentWindowDays}-day payment, ${terms.guaranteeDays}-day guarantee`
}
