/**
 * The partner desk — the companies we are retained by, the roles we are
 * actually working, and who is allowed to see which.
 *
 * The jobs board is a sourced watchlist: 29,260 open roles, almost all of them
 * ingested from a careers page with nobody's agreement behind them. This
 * surface is the opposite — a row in `partner_roles` exists only because a
 * super admin put it there, which means we have a mandate and a scout's evening
 * spent on it will not be wasted.
 *
 * Two access questions, deliberately answered separately:
 *
 *   Can I see that this company exists?  Everyone, if it is published. The card
 *                                        is anonymised until you are assigned.
 *   Can I see who it is and act on it?   Only if you are assigned to that
 *                                        company, or you are an admin.
 *
 * Assignment is granted at company level and never per role: a scout who can
 * see the company can see every live mandate under it. That is the rule the
 * whole surface is built on, so it lives in one function —
 * `resolvePartnerAccess` in lib/partners-access.ts.
 *
 * This module stays free of server-only imports so client components can share
 * its vocabulary — the status ladder, the payout formatting, the redaction
 * rules. `AppUser` is imported as a type alone for the same reason; a value
 * import would drag `next/headers` into the browser bundle.
 */

import type { AppUser } from '@/lib/current-user'
import { stageLabel } from '@/lib/company-ui'

/**
 * While the desk is still being built, only the super admin can reach it.
 *
 * Everything underneath is already written for the full audience — the
 * anonymised card, the assignment model, the per-viewer submission scoping — so
 * opening it up is flipping this one flag, not unpicking a special case. It is
 * here rather than inlined at each call site so there is exactly one thing to
 * change and nothing to miss.
 */
export const DESK_SUPER_ADMIN_ONLY = true

// ── priority ────────────────────────────────────────────────────────────────

export type RolePriority = 'urgent' | 'high' | 'normal'

export const PRIORITY_META: Record<RolePriority, { label: string; dot: string; chip: string }> = {
  urgent: { label: 'Urgent', dot: 'bg-[#C2544B]', chip: 'bg-[#FBEDEB] text-[#A3423A]' },
  high: { label: 'Priority', dot: 'bg-[#C79A2E]', chip: 'bg-[#F5EEDD] text-[#8A6A1F]' },
  normal: { label: 'Open', dot: 'bg-[#5E8571]', chip: 'bg-[#E9F0EC] text-[#1F4D3A]' },
}

export const PRIORITY_ORDER: Record<RolePriority, number> = { urgent: 0, high: 1, normal: 2 }

// ── submission status ───────────────────────────────────────────────────────

export type SubmissionStatus =
  | 'submitted'
  | 'shortlisted'
  | 'sent_to_client'
  | 'client_interview'
  | 'offer'
  | 'placed'
  | 'declined'
  | 'withdrawn'

export interface SubmissionStatusConfig {
  value: SubmissionStatus
  /** What a scout reads. Never the enum value. */
  label: string
  /** The one line that explains what is actually happening right now. */
  blurb: string
  dot: string
  chip: string
  category: 'in_progress' | 'won' | 'closed'
  /** Position on the submission timeline. Closed states sit off the track. */
  order: number
}

/**
 * The stages a submission moves through, from a scout pressing Submit to a
 * placement. Deliberately distinct from `job_candidate_pipeline.stage`: that
 * column tracks machine matching, and 96% of its rows are matches nobody has
 * vouched for. A submission is a human putting their name to someone.
 */
export const SUBMISSION_STATUSES: SubmissionStatusConfig[] = [
  {
    value: 'submitted',
    label: 'Submitted',
    blurb: 'With the Refery team for review.',
    dot: 'bg-[#7C93A8]',
    chip: 'bg-[#E7EDF2] text-[#3F5A70]',
    category: 'in_progress',
    order: 1,
  },
  {
    value: 'shortlisted',
    label: 'Shortlisted',
    blurb: 'We agree. Being packaged for the client.',
    dot: 'bg-[#5E8BA8]',
    chip: 'bg-[#E7EDF2] text-[#33566E]',
    category: 'in_progress',
    order: 2,
  },
  {
    value: 'sent_to_client',
    label: 'Sent to client',
    blurb: 'In front of the hiring manager, waiting on their read.',
    dot: 'bg-[#3F8F73]',
    chip: 'bg-[#E1F5EE] text-[#1D6B55]',
    category: 'in_progress',
    order: 3,
  },
  {
    value: 'client_interview',
    label: 'Interviewing',
    blurb: 'In the company’s own process.',
    dot: 'bg-[#1F4D3A]',
    chip: 'bg-[#E9F0EC] text-[#1F4D3A]',
    category: 'in_progress',
    order: 4,
  },
  {
    value: 'offer',
    label: 'Offer',
    blurb: 'An offer is on the table.',
    dot: 'bg-[#8A6A1F]',
    chip: 'bg-[#F5EEDD] text-[#8A6A1F]',
    category: 'in_progress',
    order: 5,
  },
  {
    value: 'placed',
    label: 'Placed',
    blurb: 'Hired. Your payout is on its way.',
    dot: 'bg-[#1F4D3A]',
    chip: 'bg-[#1F4D3A] text-white',
    category: 'won',
    order: 6,
  },
  {
    value: 'declined',
    label: 'Not moving forward',
    blurb: 'Passed on for this role.',
    dot: 'bg-[#C2544B]',
    chip: 'bg-[#FBEDEB] text-[#A3423A]',
    category: 'closed',
    order: 7,
  },
  {
    value: 'withdrawn',
    label: 'Withdrawn',
    blurb: 'Pulled back by the scout.',
    dot: 'bg-[#B8B8B0]',
    chip: 'bg-[#F0F0EA] text-[#6E6E68]',
    category: 'closed',
    order: 8,
  },
]

export function submissionStatus(value?: string | null): SubmissionStatusConfig {
  return SUBMISSION_STATUSES.find(s => s.value === value) ?? SUBMISSION_STATUSES[0]
}

/** The stages drawn on the timeline. Closed outcomes are shown as an endpoint. */
export const SUBMISSION_TRACK: SubmissionStatus[] = [
  'submitted',
  'shortlisted',
  'sent_to_client',
  'client_interview',
  'offer',
  'placed',
]

/** Statuses that still occupy one of a role's submission slots. */
export const ACTIVE_SUBMISSION_STATUSES: SubmissionStatus[] = [
  'submitted',
  'shortlisted',
  'sent_to_client',
  'client_interview',
  'offer',
  'placed',
]

/** Who is allowed to move a submission to a given status. */
export function isAdminOnlyStatus(status: SubmissionStatus): boolean {
  return status !== 'withdrawn'
}

// ── row shapes ──────────────────────────────────────────────────────────────

export interface PartnerCompanyRow {
  company_id: string
  display_name: string | null
  relationship: string
  is_active: boolean
  is_published: boolean
  anon_alias: string | null
  public_blurb: string | null
  engagement_notes: string | null
  convo_stage: string | null
  next_step: string | null
  channel: string | null
  contact_name: string | null
  contact_email: string | null
  last_contact: string | null
  added_at: string
  company_name: string | null
  logo_url: string | null
  website: string | null
  stage: string | null
  industry: string | null
  location: string | null
  employee_count: string | null
  description: string | null
  last_funding_amount_usd: number | null
  last_funding_type: string | null
  last_funding_date: string | null
  top_investors: string | null
  live_roles: number
  live_role_titles: string[]
  submission_count: number
  assigned_user_ids: string[]
  company_brief_id: string | null
  company_brief_status: string | null
}

export interface PartnerRoleRow {
  job_id: string
  company_id: string
  is_live: boolean
  priority: RolePriority
  headline: string | null
  context: string | null
  fee_percentage: number | null
  fee_flat: number | null
  scout_payout: number | null
  scout_share: number | null
  payout_note: string | null
  exclusivity: 'exclusive' | 'shared' | null
  submission_cap: number | null
  target_start: string | null
  added_at: string
  updated_at: string
  title: string
  department: string | null
  location: string | null
  remote_policy: string | null
  job_status: string
  salary_min: number | null
  salary_max: number | null
  visa_requirement: string | null
  job_post_url: string | null
  description: string | null
  requirements: string[] | null
  skills_required: string[] | null
  experience_years_min: number | null
  experience_years_max: number | null
  hiring_manager_name: string | null
  referral_bonus: number | null
  referral_bonus_type: string | null
  job_created_at: string | null
  seniority: string | null
  location_buckets: string[] | null
  company_name: string | null
  company_logo_url: string | null
  company_stage: string | null
  brief_id: string | null
  brief_status: string | null
  submission_count: number
  live_submission_count: number
  submitter_ids: string[]
  submitted_candidate_ids: string[]
}

export interface SubmissionRow {
  id: string
  job_id: string
  candidate_id: string
  company_id: string
  submitted_by_user_id: string
  status: SubmissionStatus
  pitch: string
  highlights: string[]
  reviewed_by: string | null
  reviewed_at: string | null
  review_note: string | null
  decided_at: string | null
  created_at: string
  updated_at: string
  candidate_name: string | null
  candidate_grade: string | null
  candidate_location: string | null
  candidate_availability: string | null
  candidate_experience_years: number | null
  candidate_owner_id: string | null
  job_title: string | null
  company_name: string | null
  submitted_by_name: string | null
  submitted_by_email: string | null
}

// ── access ──────────────────────────────────────────────────────────────────

export interface PartnerAccess {
  appUser: AppUser
  /**
   * Whether this user may reach the desk at all. Gated by
   * `DESK_SUPER_ADMIN_ONLY` while it is still being built.
   */
  canUseDesk: boolean
  /** Manage mandates, briefs, assignments and submission status. */
  canManage: boolean
  /** See every partner company in full, whether assigned or not. */
  seesEverything: boolean
  /** Read every scout's submissions, not just your own. */
  seesAllSubmissions: boolean
  /**
   * Browse candidates that are not your own — the separate, narrower power.
   * An admin runs the desk but still only picks from their own book.
   */
  seesAllCandidates: boolean
  /** Company ids this user has been assigned to. Empty for admins, who don't need it. */
  assignedCompanyIds: Set<string>
  /** Company ids with a pending access request from this user. */
  pendingRequestCompanyIds: Set<string>
}

/**
 * True when this viewer may see the company's real identity, its brief and its
 * roles in full. Everyone else gets the anonymised card.
 */
export function isUnlocked(access: PartnerAccess, companyId: string): boolean {
  return access.seesEverything || access.assignedCompanyIds.has(companyId)
}

/**
 * The name to render for a company this viewer is not assigned to.
 *
 * Never invents detail. When no alias has been written, it is composed from
 * the stage and industry we already hold — "Series A · AI infrastructure" —
 * and falls back to something deliberately plain rather than a guess.
 */
export function anonLabel(company: {
  anon_alias?: string | null
  stage?: string | null
  industry?: string | null
}): string {
  if (company.anon_alias?.trim()) return company.anon_alias.trim()
  const parts = [stageLabel(company.stage), shortIndustry(company.industry)].filter(Boolean)
  if (parts.length) return `${parts.join(' · ')} company`
  return 'Confidential client'
}

/**
 * The one industry label worth putting on a chip.
 *
 * `companies.industry` arrives in two shapes, both of them piles: a Crunchbase
 * comma list ("Artificial Intelligence (AI), Banking, Blockchain, Cloud
 * Computing, Cryptocurrency, Financial Services, FinTech, Payments, Software")
 * and a taxonomy path ("B2B Software and Services -> Engineering, Product and
 * Design"). Rendered whole, either one sets the card's min-content width and
 * reads as a database dump. The first segment is the only part that is a label.
 */
export function shortIndustry(industry?: string | null): string | null {
  const first = industry?.split(/,|->|\//)[0]?.trim()
  return first || null
}

/**
 * A company description reduced to something that reads as a sentence.
 *
 * `companies.description` is scraped and frequently arrives as markdown —
 * "**Voice AI for developers.** ### Why Join ### Founders **Jordan Dearsley**
 * — Founder, CEO @ Vapi LinkedIn:…" — so rendering it raw puts asterisks and
 * hash marks on the card. This is not a markdown renderer: the blurb slot is
 * two lines of prose, so the markers are stripped and the rest is cut at a
 * sentence boundary rather than mid-word.
 */
export function plainBlurb(text?: string | null, maxLength = 180): string | null {
  if (!text) return null
  const flat = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s*#{1,6}\s*/gm, ' ')
    .replace(/#{2,6}\s+/g, ' ')
    .replace(/[*_`>|]/g, '')
    .replace(/^\s*[-•]\s*/gm, ' ')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!flat) return null
  if (flat.length <= maxLength) return flat

  const cut = flat.slice(0, maxLength)
  const sentenceEnd = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '))
  if (sentenceEnd > maxLength * 0.4) return cut.slice(0, sentenceEnd + 1)
  const wordEnd = cut.lastIndexOf(' ')
  return `${cut.slice(0, wordEnd > 0 ? wordEnd : maxLength)}…`
}

/**
 * The shape a company takes on screen once access is applied.
 *
 * Redaction happens here, once, rather than being remembered at each render
 * site. A locked company still carries its real role titles, counts and market
 * signals — that is the point of the anonymised card: enough to decide whether
 * to ask for access, nothing that identifies the client.
 */
export interface PartnerCompanyView {
  companyId: string
  unlocked: boolean
  /** Company name when unlocked, alias when not. Always safe to render. */
  name: string
  logoUrl: string | null
  website: string | null
  /** Two lines, for a card in a grid. */
  blurb: string | null
  /** A paragraph, for the client's own page. Same source, cut less hard. */
  longBlurb: string | null
  stage: string | null
  industry: string | null
  location: string | null
  employeeCount: string | null
  lastFundingAmountUsd: number | null
  lastFundingType: string | null
  lastFundingDate: string | null
  topInvestors: string | null
  relationship: string
  liveRoles: number
  liveRoleTitles: string[]
  submissionCount: number
  assignedUserIds: string[]
  hasBrief: boolean
  briefPublished: boolean
  requestPending: boolean
  /** Desk-management fields, present only for admins. */
  admin: {
    isPublished: boolean
    isActive: boolean
    anonAlias: string | null
    publicBlurb: string | null
    convoStage: string | null
    nextStep: string | null
    engagementNotes: string | null
    contactName: string | null
    contactEmail: string | null
    channel: string | null
  } | null
}

export function toCompanyView(
  row: PartnerCompanyRow,
  access: PartnerAccess,
): PartnerCompanyView {
  const unlocked = isUnlocked(access, row.company_id)
  const displayName = row.display_name?.trim() || row.company_name || 'Unnamed company'

  return {
    companyId: row.company_id,
    unlocked,
    name: unlocked ? displayName : anonLabel(row),
    logoUrl: unlocked ? row.logo_url : null,
    website: unlocked ? row.website : null,
    // A locked card falls back to nothing rather than to `description`: the
    // scraped description names the company in its first clause about half the
    // time, which would defeat the alias entirely.
    blurb: unlocked
      ? plainBlurb(row.public_blurb) || plainBlurb(row.description)
      : plainBlurb(row.public_blurb),
    longBlurb: unlocked
      ? plainBlurb(row.public_blurb, 520) || plainBlurb(row.description, 520)
      : plainBlurb(row.public_blurb, 520),
    stage: row.stage,
    industry: shortIndustry(row.industry),
    location: row.location,
    employeeCount: row.employee_count,
    lastFundingAmountUsd: row.last_funding_amount_usd,
    lastFundingType: row.last_funding_type,
    lastFundingDate: row.last_funding_date,
    topInvestors: unlocked ? row.top_investors : null,
    relationship: row.relationship,
    liveRoles: row.live_roles,
    liveRoleTitles: row.live_role_titles ?? [],
    submissionCount: row.submission_count,
    assignedUserIds: row.assigned_user_ids ?? [],
    hasBrief: Boolean(row.company_brief_id),
    briefPublished: row.company_brief_status === 'published',
    requestPending: access.pendingRequestCompanyIds.has(row.company_id),
    admin: access.canManage
      ? {
          isPublished: row.is_published,
          isActive: row.is_active,
          anonAlias: row.anon_alias,
          publicBlurb: row.public_blurb,
          convoStage: row.convo_stage,
          nextStep: row.next_step,
          engagementNotes: row.engagement_notes,
          contactName: row.contact_name,
          contactEmail: row.contact_email,
          channel: row.channel,
        }
      : null,
  }
}

// ── formatting ──────────────────────────────────────────────────────────────

// Payout arithmetic and formatting live in lib/fees.ts. They used to be here as
// `formatPayout` and `payoutLine`, which only knew how to echo back a figure
// somebody had typed — so every mandate without one read "Payout not set yet"
// even though the fee has always been a knowable percentage of base.

/**
 * Remaining submission slots, or null when the role is uncapped.
 *
 * Counted against submissions that are still in play — a withdrawn or declined
 * candidate frees the slot back up, which is the behaviour a scout assumes.
 */
export function slotsLeft(role: {
  submission_cap?: number | null
  live_submission_count?: number | null
}): number | null {
  if (!role.submission_cap) return null
  return Math.max(0, role.submission_cap - (role.live_submission_count ?? 0))
}

export const RELATIONSHIP_META: Record<string, { label: string; chip: string }> = {
  client: { label: 'Signed client', chip: 'bg-[#E9F0EC] text-[#1F4D3A]' },
  prospect: { label: 'In conversation', chip: 'bg-[#F5EEDD] text-[#8A6A1F]' },
}

export function relationshipMeta(relationship?: string | null) {
  return (
    RELATIONSHIP_META[relationship ?? ''] ?? {
      label: relationship ? relationship.replace(/_/g, ' ') : 'Partner',
      chip: 'bg-[#F0F0EA] text-[#6E6E68]',
    }
  )
}
