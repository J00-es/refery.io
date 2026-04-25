// Agreement Management System - Types and Constants

export const AGREEMENT_VERSIONS = {
  scout: '1.0.0',
  recruiter: '1.0.0',
  client: '1.0.0',
} as const

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
  feePercentage: 20,
  paymentWindowDays: 30,
  lateFeePct: 1.5,
  guaranteeDays: 90,
  introValidityMonths: 24,
}

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



// Scout/Partner Agreement Text
export const SCOUT_AGREEMENT_TEXT = `REFERY SCOUT/PARTNER AGREEMENT

Version 1.0.0
Effective Date: Upon Electronic Acceptance

This Scout/Partner Agreement ("Agreement") is entered into between Refery, Inc. ("Refery," "we," "us," or "our") and the individual or entity accepting this Agreement ("Scout," "Partner," "you," or "your").

1. DEFINITIONS

1.1 "Candidate" means any individual whose information you submit to Refery for potential employment opportunities.

1.2 "Client" means any company or organization that has engaged Refery for recruitment services.

1.3 "Placement" means when a Candidate you submit is hired by a Client and successfully completes the applicable guarantee period.

1.4 "Placement Fee" means the fee paid by the Client to Refery for a successful Placement.

1.5 "Platform" means Refery's proprietary recruitment platform, including all related tools, systems, and services.

2. SCOUT/PARTNER RELATIONSHIP

2.1 Independent Contractor Status. You are an independent contractor and not an employee, agent, or partner of Refery. Nothing in this Agreement creates an employment, agency, joint venture, or partnership relationship.

2.2 No Exclusivity. This Agreement is non-exclusive. You may engage in other recruiting activities, and Refery may engage other scouts and recruiters.

2.3 Platform Access. Upon acceptance of this Agreement, you will receive access to the Platform to view available roles and submit Candidates.

3. CANDIDATE SUBMISSION AND PROTECTION

3.1 Submission Process. You may submit Candidates through the Platform by providing: (a) the Candidate's resume or CV; (b) your assessment of why the Candidate is a good fit; (c) the Candidate's contact information; and (d) any relevant context about the Candidate's situation.

3.2 Candidate Protection Period. For each Candidate you submit, you receive exclusive protection for that Candidate for a period of twenty-four (24) months from the date of submission acknowledgment ("Protection Period"). During this period, you are entitled to the applicable payout for any Placement of that Candidate with any Client on the Platform.

3.3 Submission Confirmation. Your submission is confirmed, and your Protection Period begins, when Refery acknowledges receipt of the Candidate on the Platform.

3.4 Candidate Consent. By submitting a Candidate, you represent and warrant that you have obtained the Candidate's permission to share their information with Refery and our Clients.

4. COMPENSATION

4.1 Payout Percentage. For each successful Placement, you will receive seventy percent (70%) of the Placement Fee ("Your Payout").

4.2 Fee Structure. Placement Fees vary by role and Client:
    (a) Some roles have fixed referral bonuses (typically $10,000 - $25,000)
    (b) Other roles have percentage-based fees (typically 15-20% of base salary)
    (c) Each role on the Platform displays its confirmed fee structure

4.3 Payment Terms. Your Payout will be processed within thirty (30) days after the Client pays the Placement Fee to Refery.

4.4 Payment Method. Payments are made via direct bank transfer (ACH or wire) for US-based partners, or via Wise for international partners.

4.5 No Clawbacks. Once Your Payout is paid, it is yours to keep. There are no clawback provisions.

4.6 Guarantee Period Failure. If a hire's employment ends for any reason during the Client's guarantee period, no Payout is made. However, your Protection Period for that Candidate remains active for other roles.

5. PROTECTED ECONOMICS

5.1 Payout Protection. Your payout percentage (70%) and payment timing (within 30 days of Client payment) cannot be changed without your express written consent.

5.2 Operational Changes. Refery may update operational terms (such as submission processes or Platform features) with thirty (30) days' notice.

6. CONFIDENTIALITY

6.1 Confidential Information. You agree to keep confidential all non-public information about Clients, Candidates, fee structures, and Platform operations.

6.2 Candidate Information. You will handle all Candidate information in accordance with applicable privacy laws and will not use such information for purposes outside of this Agreement.

7. NON-CIRCUMVENTION

7.1 Client Protection. For a period of twelve (12) months following your last interaction with a Client through the Platform, you agree not to directly solicit recruitment business from that Client outside of Refery.

7.2 Pre-Existing Relationships. This non-circumvention clause applies only to Clients you discover through Refery. Your existing client relationships are fully carved out and remain yours.

7.3 Disputes. If a pre-existing relationship is disputed, Refery may request supporting evidence such as prior invoices or email history.

8. REPRESENTATIONS AND WARRANTIES

8.1 You represent and warrant that:
    (a) You have the right to enter into this Agreement
    (b) You will comply with all applicable laws
    (c) All Candidate information you submit is accurate to the best of your knowledge
    (d) You have obtained necessary consents from Candidates

9. TERM AND TERMINATION

9.1 Term. This Agreement begins upon your acceptance and continues until terminated.

9.2 Termination. Either party may terminate this Agreement with thirty (30) days' written notice.

9.3 Effect of Termination. Upon termination:
    (a) Your Platform access will be revoked
    (b) Your Protection Periods for previously submitted Candidates remain in effect
    (c) You remain entitled to Payouts for Placements made during your Protection Periods

10. LIMITATION OF LIABILITY

10.1 To the maximum extent permitted by law, neither party shall be liable for any indirect, incidental, special, consequential, or punitive damages.

10.2 Refery's total liability under this Agreement shall not exceed the total Payouts made to you in the twelve (12) months preceding the claim.

11. GENERAL PROVISIONS

11.1 Entire Agreement. This Agreement constitutes the entire agreement between the parties regarding its subject matter.

11.2 Amendments. Except as provided in Section 5, this Agreement may only be amended in writing signed by both parties.

11.3 Governing Law. This Agreement is governed by the laws of the State of Delaware, without regard to conflicts of law principles.

11.4 Dispute Resolution. Any disputes shall be resolved through binding arbitration in accordance with the rules of the American Arbitration Association.

11.5 Severability. If any provision is found unenforceable, the remaining provisions shall continue in effect.

BY ACCEPTING THIS AGREEMENT, YOU ACKNOWLEDGE THAT YOU HAVE READ, UNDERSTOOD, AND AGREE TO BE BOUND BY ALL TERMS AND CONDITIONS SET FORTH HEREIN.`

// Recruiter Agreement Text (more comprehensive for full recruiting partners)
export const RECRUITER_AGREEMENT_TEXT = `REFERY RECRUITER PARTNER AGREEMENT

Version 1.0.0
Effective Date: Upon Electronic Acceptance

This Recruiter Partner Agreement ("Agreement") is entered into between Refery, Inc. ("Refery," "we," "us," or "our") and the individual or entity accepting this Agreement ("Recruiter," "Partner," "you," or "your").

1. DEFINITIONS

1.1 "Candidate" means any individual whose information you submit to Refery for potential employment opportunities.

1.2 "Client" means any company or organization that has engaged Refery for recruitment services.

1.3 "Placement" means when a Candidate you submit is hired by a Client and successfully completes the applicable guarantee period.

1.4 "Placement Fee" means the fee paid by the Client to Refery for a successful Placement.

1.5 "Platform" means Refery's proprietary recruitment platform, including all related tools, systems, and services.

1.6 "Exclusive Role" means a role for which you have been granted exclusive recruiting rights for a specified period.

2. RECRUITER PARTNER RELATIONSHIP

2.1 Independent Contractor Status. You are an independent contractor and not an employee, agent, or partner of Refery. Nothing in this Agreement creates an employment, agency, joint venture, or partnership relationship.

2.2 Non-Exclusive Arrangement. Unless specifically designated as an Exclusive Role, this Agreement is non-exclusive. You may engage in other recruiting activities, and Refery may engage other recruiters.

2.3 Platform Access. Upon acceptance of this Agreement, you will receive full access to the Platform to view available roles, submit Candidates, track pipeline progress, and manage your recruiting activities.

2.4 Professional Standards. As a Recruiter Partner, you agree to maintain professional standards in all interactions with Candidates and Clients, including timely communication, accurate representation, and ethical conduct.

3. CANDIDATE SUBMISSION AND PROTECTION

3.1 Submission Process. You may submit Candidates through the Platform by providing:
    (a) The Candidate's resume or CV
    (b) Your detailed assessment of why the Candidate is a good fit
    (c) The Candidate's contact information
    (d) Compensation expectations and availability
    (e) Any relevant context about the Candidate's situation

3.2 Candidate Protection Period. For each Candidate you submit, you receive exclusive protection for that Candidate for a period of twenty-four (24) months from the date of submission acknowledgment ("Protection Period"). During this period, you are entitled to the applicable payout for any Placement of that Candidate with any Client on the Platform.

3.3 Submission Confirmation. Your submission is confirmed, and your Protection Period begins, when Refery acknowledges receipt of the Candidate on the Platform.

3.4 Candidate Consent. By submitting a Candidate, you represent and warrant that you have obtained the Candidate's permission to share their information with Refery and our Clients.

3.5 Quality Standards. To maintain platform quality, submissions should include thoughtful assessments that help match Candidates to appropriate roles.

4. COMPENSATION

4.1 Payout Percentage. For each successful Placement, you will receive seventy percent (70%) of the Placement Fee ("Your Payout").

4.2 Fee Structure. Placement Fees vary by role and Client:
    (a) Fixed referral bonuses typically range from $10,000 to $25,000
    (b) Percentage-based fees typically range from 15% to 20% of base salary
    (c) Each role on the Platform displays its confirmed fee structure
    (d) For a $350,000 senior hire at 20%, Your Payout would be $49,000
    (e) For a $250,000 role at 15%, Your Payout would be $26,250

4.3 Payment Terms. Your Payout will be processed within thirty (30) days after the Client pays the Placement Fee to Refery.

4.4 Payment Method. Payments are made via direct bank transfer (ACH or wire) for US-based partners, or via Wise for international partners.

4.5 No Clawbacks. Once Your Payout is paid, it is yours to keep. There are no clawback provisions on paid placements.

4.6 Guarantee Period. If a hire's employment ends for any reason during the Client's guarantee period:
    (a) No Payout is made for that specific placement
    (b) No money changes hands (Refery refunds the Client directly)
    (c) Your Protection Period for that Candidate remains fully active for other roles

5. PROTECTED ECONOMICS

5.1 Payout Protection. Your payout percentage (70%) and payment timing (within 30 days of Client payment) can never be changed without your express written consent. This protection is fundamental to our partnership.

5.2 Operational Changes. Refery may update operational terms (such as submission processes, Platform features, or communication protocols) with thirty (30) days' notice.

6. CONFIDENTIALITY

6.1 Confidential Information. You agree to keep confidential all non-public information about:
    (a) Clients, including company strategies and hiring plans
    (b) Candidates, including personal and professional information
    (c) Fee structures and commercial terms
    (d) Platform operations and proprietary processes

6.2 Candidate Information. You will handle all Candidate information in accordance with applicable privacy laws and will not use such information for purposes outside of this Agreement.

6.3 Duration. Confidentiality obligations survive termination of this Agreement.

7. NON-CIRCUMVENTION

7.1 Client Protection. For a period of twelve (12) months following your last interaction with a Client through the Platform, you agree not to directly solicit recruitment business from that Client outside of Refery.

7.2 Pre-Existing Relationships. This non-circumvention clause applies only to Clients you discover through Refery. Your existing client relationships are fully carved out and remain exclusively yours.

7.3 Dispute Resolution. If a pre-existing relationship is disputed, Refery may request supporting evidence such as prior invoices, email correspondence, or other documentation of the prior relationship.

8. REPRESENTATIONS AND WARRANTIES

8.1 You represent and warrant that:
    (a) You have the legal right and authority to enter into this Agreement
    (b) You will comply with all applicable laws and regulations
    (c) All Candidate information you submit is accurate to the best of your knowledge
    (d) You have obtained all necessary consents from Candidates
    (e) You will maintain professional standards in all recruiting activities
    (f) You will not engage in any discriminatory practices

9. TERM AND TERMINATION

9.1 Term. This Agreement begins upon your electronic acceptance and continues until terminated by either party.

9.2 Termination for Convenience. Either party may terminate this Agreement with thirty (30) days' written notice.

9.3 Termination for Cause. Either party may terminate immediately upon written notice if the other party materially breaches this Agreement and fails to cure within fifteen (15) days of notice.

9.4 Effect of Termination. Upon termination:
    (a) Your Platform access will be revoked
    (b) Your Protection Periods for previously submitted Candidates remain in full effect
    (c) You remain entitled to Payouts for Placements made during active Protection Periods
    (d) Confidentiality and non-circumvention obligations survive

10. LIMITATION OF LIABILITY

10.1 Exclusion of Damages. To the maximum extent permitted by law, neither party shall be liable for any indirect, incidental, special, consequential, or punitive damages, regardless of the cause of action or theory of liability.

10.2 Cap on Liability. Refery's total aggregate liability under this Agreement shall not exceed the total Payouts made to you in the twelve (12) months preceding the claim giving rise to liability.

11. INDEMNIFICATION

11.1 You agree to indemnify and hold harmless Refery from any claims, damages, or expenses arising from:
    (a) Your breach of this Agreement
    (b) Your violation of any applicable law
    (c) Any claim by a Candidate related to your handling of their information

12. GENERAL PROVISIONS

12.1 Entire Agreement. This Agreement constitutes the entire agreement between the parties regarding its subject matter and supersedes all prior agreements and understandings.

12.2 Amendments. Except as provided in Section 5 (Protected Economics), this Agreement may only be amended in writing signed by authorized representatives of both parties.

12.3 Governing Law. This Agreement shall be governed by and construed in accordance with the laws of the State of Delaware, without regard to its conflicts of law principles.

12.4 Dispute Resolution. Any disputes arising under this Agreement shall be resolved through binding arbitration in accordance with the Commercial Arbitration Rules of the American Arbitration Association. The arbitration shall take place in San Francisco, California.

12.5 Severability. If any provision of this Agreement is found to be unenforceable, the remaining provisions shall continue in full force and effect.

12.6 Waiver. The failure of either party to enforce any right under this Agreement shall not constitute a waiver of that right.

12.7 Assignment. You may not assign this Agreement without Refery's prior written consent. Refery may assign this Agreement in connection with a merger, acquisition, or sale of substantially all assets.

12.8 Notices. All notices shall be in writing and delivered via email to the addresses on file.

BY ACCEPTING THIS AGREEMENT, YOU ACKNOWLEDGE THAT YOU HAVE READ, UNDERSTOOD, AND AGREE TO BE BOUND BY ALL TERMS AND CONDITIONS SET FORTH HEREIN. YOU FURTHER ACKNOWLEDGE THAT THIS AGREEMENT IS LEGALLY BINDING AND ENFORCEABLE.`

// Client Recruitment Services Agreement Template (with placeholders)
export function generateClientAgreementText(
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
