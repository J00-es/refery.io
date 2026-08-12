// Agreement Management System - Types and Constants

export const AGREEMENT_VERSIONS = {
  scout: '1.2.0',
  recruiter: '1.2.0',
  // v2.6 is the current standard offer: pay 10 business days after the hire's
  // 90th day, full-refund guarantee, prior-contact carve-out, cancel anytime.
  client: '2.6',
  // v2.5 — negotiated deferred variant (Ergo, Aug 2026). Same shape as v2.6 but
  // a 14-business-day payment window. Kept as its own line so it is never
  // rewritten by a standard bump.
  clientDeferred: '2.5',
  // v2.4 — the previous standard (pay 30 days after start, replacement-search
  // guarantee). No new links are issued on it; unsigned ones upgrade to v2.6.
  clientLegacy: '2.4',
} as const

// Which payment/guarantee model a client agreement uses.
//   'start' — v2.4: fee due 30 days after the start date, replacement-search guarantee.
//   'day90' — v2.5: fee due 14 business days after day 90, full-refund guarantee.
//   'net10' — v2.6: fee due 10 business days after day 90, full-refund guarantee.
//
// 10 business days is not arbitrary. The signed partner agreements owe partners
// their payout "within 14 business days after the candidate completes 90 days,
// once Refery has collected" — and recruiter §13 makes partner payment timing
// consent-protected. Collecting on day ~104 keeps that promise intact without
// renegotiating it.
export type ClientPaymentTiming = 'start' | 'day90' | 'net10'

const TIMING_VERSION: Record<ClientPaymentTiming, string> = {
  start: AGREEMENT_VERSIONS.clientLegacy,
  day90: AGREEMENT_VERSIONS.clientDeferred,
  net10: AGREEMENT_VERSIONS.client,
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
}

export function clientPaymentTimingForVersion(version: string): ClientPaymentTiming | null {
  return CLIENT_VERSION_TIMING[version] ?? null
}

// Versions that were individually negotiated. An unsigned link on one of these
// must never be auto-rewritten to the standard offer — that would silently undo
// the negotiation. Everything else sits on the standard line.
const NEGOTIATED_CLIENT_VERSIONS = new Set<string>([AGREEMENT_VERSIONS.clientDeferred])

// The version an unsigned link should be upgraded to when viewed, or null to
// leave it alone. Standard-line links (legacy v1.x, v2.4) roll forward to the
// current standard so a client who finally opens an old link sees today's terms.
export function clientUpgradeTarget(version: string): string | null {
  if (NEGOTIATED_CLIENT_VERSIONS.has(version)) return null
  if (version === AGREEMENT_VERSIONS.client) return null
  return AGREEMENT_VERSIONS.client
}

// One-line payment/guarantee summaries for the post-signature email and PDF.
// Keep these in step with the "short version" table in each document — a signer
// must never be told terms that differ from what they signed.
export function clientTermsSummary(version: string): { payment: string; guarantee: string } {
  switch (clientPaymentTimingForVersion(version)) {
    case 'net10':
      return {
        payment: '10 business days after the 90th day',
        guarantee: 'No fee if the hire leaves within 90 days',
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

// Business days between the hire's 90th day and the payment due date on v2.6.
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

- **Percentage-based:** A percentage of the candidate's first-year annual base salary (typically 15–20%), as negotiated between Refery and the client. Your payout is 70% of this fee.
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

- **Percentage-based:** A percentage of the candidate's first-year annual base salary (typically 15–20%), as negotiated between Refery and the client. Your payout is 70% of this fee.
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
// 90-day guarantee, 12-month intro window — is baked into the text.
export function generateClientAgreementText(
  companyName: string,
  options: { feePercent?: number; paymentTiming?: ClientPaymentTiming } = {},
): string {
  const feePercent = options.feePercent ?? DEFAULT_CLIENT_TERMS.feePercentage
  const timing = options.paymentTiming ?? 'net10'
  if (timing === 'net10') {
    return generateStandardClientAgreement(companyName, feePercent)
  }
  return generateLegacyClientAgreement(companyName, feePercent, timing)
}

/**
 * v2.6 — the current standard offer.
 *
 * Written to be signed by the one operator in the room rather than routed to
 * counsel: plain words, short sentences, the whole commercial deal visible in
 * the table before any prose. Refery's three real protections are all still
 * here — attribution (§1, §4), collectability (§1 reporting duty, §4
 * re-engagement), and confidentiality (§5) — they are just no longer buried.
 */
function generateStandardClientAgreement(companyName: string, feePercent: number): string {
  const fee = formatFeePercent(feePercent)

  return `# Recruitment Services Agreement

**v${AGREEMENT_VERSIONS.client}** · Refery & ${companyName} · The table below is the whole deal

We keep this short on purpose. This is the entire agreement, and it covers every role you hire for with us.

## The short version

| | |
|---|---|
| **What it costs** | Nothing, unless you hire someone we introduce |
| **The fee** | ${fee}% of their first-year base salary |
| **When you pay** | 10 business days after their 90th day with you |
| **If it doesn't work out** | Gone within 90 days? You owe nothing, and anything paid comes back |
| **Commitment** | None — no exclusivity, no minimums, cancel anytime |

## The details

**1. You only pay for a hire who stays.** Hire someone we introduced — any role, within 12 months of the introduction — and the fee is ${fee}% of their first-year base salary, from their signed offer letter. Bonuses, equity, and commission aren't counted. It's due 10 business days after their 90th day. Please tell us within 5 business days when someone accepts, with their start date and salary. Late invoices add 1.5% a month.

**2. If they leave within 90 days, you owe nothing.** Any reason — they resign, wrong fit, the role changed, you had to restructure. No exclusions. Anything already paid comes back within 30 days. Just tell us within 10 business days so we can start again for you.

**3. If you already knew them, there's no fee.** Send us something dated — an application, an ATS record, an email — within 10 business days of the introduction, and we'll close it out.

**4. Please don't route around us.** The fee still applies if you hire someone we introduced through another agency, as a contractor, or via a sister company — or if someone leaves early and you rehire them within 12 months. Our introduction records are the reference.

**5. We keep your details private.** Your name, roles, team, pay, and plans stay confidential, and we never post your roles publicly. Candidates learn who you are only after vetting and signing our confidentiality terms. Please do the same with candidate information. This continues after the agreement ends.

**6. How we use AI.** We use AI to read resumes and match people to roles, with providers like Anthropic, OpenAI, and Google under confidentiality terms. We don't sell your data or let it train public models. **Every hiring decision is yours**, as is your hiring process and the employment law that applies to you.

**7. The legal basics.** Our service is provided as-is, and we can't promise any particular hire. Each of us covers claims from our own serious mistakes or breach, capped at the greater of what you've paid us in the last 12 months or the fee on the placement in question. Delaware law. Disputes go to individual arbitration (AAA, remote, no class actions); small claims court stays open to both of us. If any part fails, the rest stands.

**8. Leaving is easy.** Either of us can end this in writing at any time, effective immediately. Three things carry on: fees for anyone already hired, the 12-month window on introductions already made, and confidentiality. We may update operating details with 30 days' notice, but anything touching fees or payment needs your say-so. If Refery is acquired, this moves with us.

## Sign

Add your name and email below and click Accept — a legally binding signature under the E-SIGN Act and UETA. Questions any time: **legal@refery.io**.

We're glad you're here.`
}

/** v2.4 / v2.5 — previous standard and the negotiated deferred variant. */
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

// Legacy generator kept for the old company_agreements code path (which is not
// in active use but is referenced by app/api/agreements/sign/route.ts). New
// callers should use generateClientAgreementText() above.
export function generateClientAgreementTextLegacy(
  companyName: string,
  terms: ClientAgreementTerms
): string {
  return `RECRUITMENT SERVICES AGREEMENT

Version ${AGREEMENT_VERSIONS.client}
Effective Date: Upon Electronic Acceptance

This Recruitment Services Agreement ("Agreement") is entered into between Refery, Inc. ("Refery," "we," "us," or "our") and ${companyName} ("Client," "Company," "you," or "your").

1. DEFINITIONS

1.1 "Candidate" means any individual introduced or referred to Client by Refery for potential employment.

1.2 "Introduction" means the first communication to Client identifying a specific Candidate, whether by name, resume, profile, or other identifying information.

1.3 "Placement" means when a Candidate accepts an offer of employment from Client and commences work.

1.4 "Base Salary" means the Candidate's annual base compensation, excluding bonuses, equity, benefits, and other forms of compensation.

1.5 "Platform" means Refery's proprietary recruitment platform and related systems.

2. SERVICES

2.1 Recruitment Services. Refery agrees to provide recruitment services to Client, including:
    (a) Sourcing and identifying qualified Candidates
    (b) Initial screening and assessment of Candidates
    (c) Coordinating introductions and interviews
    (d) Providing market intelligence and compensation guidance

2.2 Client Cooperation. Client agrees to:
    (a) Provide accurate job descriptions and requirements
    (b) Respond to Candidate introductions within a reasonable timeframe
    (c) Keep Refery informed of hiring decisions and timelines
    (d) Maintain confidentiality of Candidate information

3. FEES AND PAYMENT

3.1 Placement Fee. For each successful Placement, Client agrees to pay Refery a fee equal to ${terms.feePercentage}% of the Candidate's first-year Base Salary ("Placement Fee").

3.2 Fee Calculation Examples:
    (a) For a $200,000 Base Salary: Placement Fee = $${(200000 * terms.feePercentage / 100).toLocaleString()}
    (b) For a $300,000 Base Salary: Placement Fee = $${(300000 * terms.feePercentage / 100).toLocaleString()}
    (c) For a $400,000 Base Salary: Placement Fee = $${(400000 * terms.feePercentage / 100).toLocaleString()}

3.3 Payment Terms. Payment is due within ${terms.paymentWindowDays} days of the Candidate's start date. Refery will issue an invoice upon confirmed start date.

3.4 Late Payment. Invoices not paid within ${terms.paymentWindowDays} days will accrue interest at ${terms.lateFeePct}% per month on the outstanding balance.

3.5 Payment Method. Payment may be made via wire transfer, ACH, or other method agreed upon by the parties.

4. CANDIDATE INTRODUCTION VALIDITY

4.1 Introduction Period. Once Refery introduces a Candidate to Client, that introduction remains valid for ${terms.introValidityMonths} months ("Introduction Period").

4.2 Fee Obligation. If Client hires an introduced Candidate at any time during the Introduction Period, the Placement Fee is due regardless of:
    (a) Whether the Candidate applied through other channels
    (b) The specific role the Candidate is hired for
    (c) Whether there was a gap in the hiring process

4.3 Extension. If Client and a Candidate are in active discussions at the end of the Introduction Period, the period automatically extends until a final hiring decision is made.

5. GUARANTEE

5.1 Guarantee Period. Refery provides a ${terms.guaranteeDays}-day guarantee from the Candidate's start date.

5.2 Guarantee Terms. If a Candidate's employment terminates for any reason within the Guarantee Period:
    (a) Client must notify Refery in writing within 5 business days
    (b) Refery will provide a replacement search at no additional fee, OR
    (c) Refery will refund the Placement Fee on a pro-rata basis

5.3 Guarantee Exclusions. The guarantee does not apply if:
    (a) Client terminates the Candidate due to company restructuring, layoffs, or budget cuts
    (b) The Candidate's role is materially changed from what was originally discussed
    (c) Client fails to notify Refery within the required timeframe

6. EXCLUSIVITY AND NON-CIRCUMVENTION

6.1 Candidate Ownership. Candidates introduced by Refery remain associated with Refery for purposes of this Agreement throughout the Introduction Period.

6.2 Non-Circumvention. Client agrees not to:
    (a) Hire introduced Candidates through other agencies or channels to avoid paying the Placement Fee
    (b) Refer introduced Candidates to affiliated companies or subsidiaries without Refery's consent
    (c) Engage in any arrangement designed to circumvent the fee obligations under this Agreement

6.3 Affiliated Entities. If an introduced Candidate is hired by any entity that controls, is controlled by, or is under common control with Client, the Placement Fee remains due.

7. CONFIDENTIALITY

7.1 Confidential Information. Each party agrees to keep confidential all non-public information received from the other party, including:
    (a) Candidate information and resumes
    (b) Fee structures and commercial terms
    (c) Business strategies and hiring plans
    (d) Proprietary processes and systems

7.2 Permitted Disclosure. Confidential information may be disclosed:
    (a) To employees and contractors with a need to know
    (b) As required by law or legal process
    (c) With the prior written consent of the disclosing party

8. REPRESENTATIONS AND WARRANTIES

8.1 Refery represents and warrants that:
    (a) It has the right to provide the services contemplated by this Agreement
    (b) It will perform services in a professional manner
    (c) It will comply with all applicable employment and anti-discrimination laws

8.2 Client represents and warrants that:
    (a) It has the authority to enter into this Agreement
    (b) It will comply with all applicable employment laws
    (c) All job descriptions and requirements provided are accurate
    (d) It will treat all Candidates fairly and in accordance with applicable laws

9. LIMITATION OF LIABILITY

9.1 Exclusion of Damages. Neither party shall be liable for any indirect, incidental, special, consequential, or punitive damages arising from this Agreement.

9.2 Cap on Liability. Refery's total aggregate liability under this Agreement shall not exceed the total fees paid by Client in the twelve (12) months preceding the claim.

9.3 No Guarantee of Hire. Refery does not guarantee that any Candidate will accept an offer or that any search will result in a Placement.

10. TERM AND TERMINATION

10.1 Term. This Agreement becomes effective upon electronic acceptance and continues for one (1) year, automatically renewing for successive one-year terms unless terminated.

10.2 Termination for Convenience. Either party may terminate this Agreement with thirty (30) days' written notice.

10.3 Effect of Termination. Upon termination:
    (a) All outstanding invoices become immediately due
    (b) Introduction Periods for previously introduced Candidates remain in effect
    (c) Fee obligations for Placements made during active Introduction Periods survive
    (d) Confidentiality obligations survive

11. GENERAL PROVISIONS

11.1 Entire Agreement. This Agreement constitutes the entire agreement between the parties regarding recruitment services and supersedes all prior agreements.

11.2 Amendments. This Agreement may only be amended in writing signed by authorized representatives of both parties.

11.3 Governing Law. This Agreement shall be governed by the laws of the State of Delaware, without regard to conflicts of law principles.

11.4 Dispute Resolution. Any disputes shall be resolved through binding arbitration in San Francisco, California, in accordance with AAA Commercial Arbitration Rules.

11.5 Severability. If any provision is found unenforceable, the remaining provisions continue in full effect.

11.6 Assignment. Neither party may assign this Agreement without prior written consent, except that Refery may assign in connection with a merger or acquisition.

11.7 Notices. All notices shall be in writing and delivered to the email addresses on file.

11.8 Independent Contractors. The parties are independent contractors. Nothing in this Agreement creates an employment, agency, or partnership relationship.

AGREED TERMS SUMMARY:
- Placement Fee: ${terms.feePercentage}% of Base Salary
- Payment Window: ${terms.paymentWindowDays} days from start date
- Late Fee: ${terms.lateFeePct}% per month
- Guarantee Period: ${terms.guaranteeDays} days
- Introduction Validity: ${terms.introValidityMonths} months

BY ACCEPTING THIS AGREEMENT, THE UNDERSIGNED REPRESENTS THAT THEY HAVE THE AUTHORITY TO BIND ${companyName.toUpperCase()} TO THE TERMS AND CONDITIONS SET FORTH HEREIN AND ACKNOWLEDGES THAT THIS AGREEMENT IS LEGALLY BINDING AND ENFORCEABLE.`
}

// Get agreement text by type
export function getAgreementText(type: AgreementType): string {
  return type === 'scout' ? SCOUT_AGREEMENT_TEXT : RECRUITER_AGREEMENT_TEXT
}

// Get agreement version by type
export function getAgreementVersion(type: AgreementType): string {
  return AGREEMENT_VERSIONS[type]
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
export const AGREEMENT_TYPE_LABELS: Record<AgreementType, string> = {
  scout: 'Scout/Partner Agreement',
  recruiter: 'Recruiter Partner Agreement',
}

// Client Agreement type label
export const CLIENT_AGREEMENT_TYPE_LABEL = 'Recruitment Services Agreement'

// Format terms for display
export function formatClientTerms(terms: ClientAgreementTerms): string {
  return `${terms.feePercentage}% fee, ${terms.paymentWindowDays}-day payment, ${terms.guaranteeDays}-day guarantee`
}
