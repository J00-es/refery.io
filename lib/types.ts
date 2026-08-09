import type { JourneyStage, PanelGrade } from './journey'

export interface Job {
  id: string
  title: string
  department: string | null
  location: string | null
  remote_policy: 'remote' | 'hybrid' | 'onsite' | null
  description: string
  requirements: string[] | null
  skills_required: string[] | null
  experience_years_min: number
  experience_years_max: number | null
  salary_min: number | null
  salary_max: number | null
  status: 'open' | 'closed' | 'draft'
  created_at: string
  updated_at: string
  user_id: string
  // New fields
  company_name: string | null
  job_post_url: string | null
  referral_bonus: number | null
  referral_bonus_type: 'usd' | 'percent' | null
  company_stage: 'seed' | 'series-a' | 'series-b' | 'series-c' | 'series-d' | 'public' | 'established' | null
  tags: string[] | null
  hiring_manager_name: string | null
  hiring_manager_linkedin: string | null
  hiring_manager_email: string | null
  recruiter_notes: string | null
  visa_requirement: 'us_citizen_only' | 'us_authorized' | 'sponsorship_available' | 'no_restriction' | null
  owner_user_id: string | null
  company_id: string | null
  internal_deal_type: 'pipeline' | 'partnership' | 'direct' | 'public' | null
}

// Internal deal type display configuration (admin only)
export const INTERNAL_DEAL_TYPES = {
  pipeline: { label: 'Pipeline', color: 'bg-amber-100 text-amber-700', description: 'Gathering candidates, company not yet in Refery' },
  partnership: { label: 'Partnership', color: 'bg-purple-100 text-purple-700', description: 'From partner recruiters' },
  direct: { label: 'Direct', color: 'bg-emerald-100 text-emerald-700', description: 'Direct relationship' },
  public: { label: 'Public', color: 'bg-blue-100 text-blue-700', description: 'Public referral bonus' },
} as const

export interface Candidate {
  id: string
  name: string
  email: string | null
  phone: string | null
  resume_blob_pathname: string
  resume_filename: string | null
  parsed_data: ParsedResumeData | null
  skills: string[] | null
  experience_years: number | null
  location: string | null
  remote_preference: string | null
  salary_expectation_min: number | null
  salary_expectation_max: number | null
  /**
   * @deprecated Superseded by `journey_stage`. Kept because the external nightly
   * automation still writes it; 99% of rows are 'new' or 'reviewing' and neither
   * means anything. Read `journey_stage` instead — see lib/journey.ts.
   */
  status: 'new' | 'reviewing' | 'shortlisted' | 'rejected' | 'hired'
  /** Where we are with the person. See lib/journey.ts. */
  journey_stage: JourneyStage
  journey_stage_at: string | null
  journey_stage_source: 'rule' | 'human' | 'automation' | 'backfill' | null
  /**
   * The panel verdict as a comparable grade. NULL where `recruiter_verdict` holds
   * prose rather than one of the five enum values — those need re-panelling, and
   * no rule should guess at them.
   */
  panel_grade: PanelGrade | null
  /** Whether they can take a job right now — independent of `journey_stage`. */
  availability_status: 'active' | 'off_market' | 'not_yet_talked' | 'not_qualified' | null
  created_at: string
  updated_at: string
  user_id: string
  // New fields
  linkedin_url: string | null
  last_contacted: string | null
  owner_user_id: string | null
  uploaded_by_user_id: string | null
  /** Work authorization as stated on the resume, e.g. "US citizen", "H-1B". */
  visa_status: string | null
  // Verdict fields
  recruiter_verdict: 'very_strong' | 'strong' | 'moderate' | 'weak' | 'pass' | null
  lily_verdict: 'very_strong' | 'strong' | 'moderate' | 'weak' | 'pass' | null
  ai_analysis: string | null
  brief: string | null
}

// Availability status display configuration
export const AVAILABILITY_STATUSES = {
  active: { label: 'Actively Looking', color: 'bg-green-100 text-green-700' },
  off_market: { label: 'Off Market', color: 'bg-gray-100 text-gray-500' },
  not_yet_talked: { label: 'Not Yet Talked', color: 'bg-amber-100 text-amber-700' },
  not_qualified: { label: 'Not Qualified', color: 'bg-red-100 text-red-700' },
} as const

export interface RecruiterNote {
  id: string
  candidate_id: string
  user_id: string
  note_type: 'general' | 'call' | 'salary' | 'location' | 'availability' | 'feedback'
  content: string
  created_at: string
  updated_at: string
}

export interface UserAdmin {
  id: string
  user_id: string | null
  email: string
  role: 'super_admin' | 'admin' | 'recruiter' | 'scout' | 'hiring_manager' | 'viewer'
  status: 'active' | 'inactive' | 'pending'
  created_at: string
  updated_at: string
  full_name: string | null
  linkedin_url: string | null
  company_id: string | null
  accepted_terms_at: string | null
}

export interface Company {
  id: string
  name: string
  website: string | null
  description: string | null
  industry: string | null
  stage: 'seed' | 'series-a' | 'series-b' | 'series-c' | 'series-d' | 'public' | 'established' | null
  location: string | null
  employee_count: string | null
  linkedin_url: string | null
  logo_url: string | null
  created_at: string
  updated_at: string
  created_by_user_id: string | null
  funding_raised: string | null
  hiring_insights: string | null
}

export interface CompanyNote {
  id: string
  company_id: string
  user_id: string
  note_type: 'general' | 'strategy' | 'contact' | 'hiring' | 'gtm'
  content: string
  created_at: string
  updated_at: string
}

export interface CompanyEmployee {
  id: string
  company_id: string
  name: string
  title: string | null
  linkedin_url: string | null
  email: string | null
  phone: string | null
  notes: string | null
  cv_content: string | null
  created_at: string
  updated_at: string
}

export interface JobInternalNote {
  id: string
  job_id: string
  user_id: string
  note_type: 'general' | 'interview' | 'candidate' | 'change' | 'strategy'
  content: string
  created_at: string
  updated_at: string
}

// Pipeline stage type — matches the job_candidate_pipeline.stage DB CHECK
// constraint exactly. The matching automation writes auto_matched/auto_passed/
// screening; the rest are set as candidates progress. There is no separate
// "hired" pipeline stage (placement is tracked elsewhere).
export type PipelineStage =
  // Active flow
  | 'auto_matched'
  | 'screening'
  | 'job_matched'
  | 'job_shared'
  | 'interest_confirmed'
  | 'hm_shared'
  // Terminal negative
  | 'auto_passed'
  | 'rejected'

export interface JobCandidatePipeline {
  id: string
  job_id: string
  candidate_id: string
  stage: PipelineStage
  added_by_user_id: string | null
  owner_user_id: string | null
  created_at: string
  updated_at: string
  why_good_fit?: string | null
  // Joined data
  candidate?: Candidate
  owner?: { email: string; full_name: string | null }
  notes?: JobCandidateNote[]
}

export interface JobCandidateNote {
  id: string
  job_candidate_pipeline_id: string
  user_id: string
  content: string
  created_at: string
  updated_at: string
  // Joined data
  user?: { email: string; full_name: string | null }
}

export interface PipelineStageHistory {
  id: string
  pipeline_id: string
  job_id: string
  candidate_id: string
  previous_stage: string | null  // NULL if first entry (candidate just added)
  new_stage: string
  changed_by_user_id: string | null
  changed_at: string
  time_in_previous_stage: string | null  // PostgreSQL interval as string (e.g., "2 days 3 hours")
  notes: string | null  // Optional notes for why the change was made
  // Joined data
  changed_by?: { email: string; full_name: string | null }
  candidate?: Candidate
  job?: Job
}

// Role permissions mapping
export const ROLE_PERMISSIONS = {
  super_admin: {
    canManageUsers: true,
    canManageRoles: true,
    canViewAllAnalytics: true,
    canViewAllCandidates: true,
    canViewAllJobs: true,
    canViewAllCompanies: true,
    canManageJobs: true,
    canManageCandidates: true,
    canSendEmails: true,
    canViewRecruiterNotes: true,
    canAccessAdmin: true,
    canAssignOwnership: true,
  },
  admin: {
    canManageUsers: true,
    canManageRoles: false,
    canViewAllAnalytics: true,
    canViewAllCandidates: true,
    canViewAllJobs: true,
    canViewAllCompanies: true,
    canManageJobs: true,
    canManageCandidates: true,
    canSendEmails: true,
    canViewRecruiterNotes: true,
    canAccessAdmin: true,
    canAssignOwnership: true,
  },
  recruiter: {
    canManageUsers: false,
    canManageRoles: false,
    canViewAllAnalytics: false,
    canViewAllCandidates: false,  // Only sees owned/assigned candidates
    canViewAllJobs: true,          // Can see ALL jobs
    canViewAllCompanies: false,
    canManageJobs: true,
    canManageCandidates: true,
    canSendEmails: true,
    canViewRecruiterNotes: true,
    canAccessAdmin: false,
    canAssignOwnership: true,
  },
  scout: {
    canManageUsers: false,
    canManageRoles: false,
    canViewAllAnalytics: false,
    canViewAllCandidates: false,  // Only sees owned/assigned candidates
    canViewAllJobs: false,         // Only sees owned/assigned jobs
    canViewAllCompanies: false,
    canManageJobs: false,
    canManageCandidates: true,
    canSendEmails: false,
    canViewRecruiterNotes: true,
    canAccessAdmin: false,
    canAssignOwnership: true,
  },
  hiring_manager: {
    canManageUsers: false,
    canManageRoles: false,
    canViewAllAnalytics: false,
    canViewAllCandidates: false,  // Only sees owned/assigned candidates
    canViewAllJobs: false,         // Only sees owned/assigned jobs
    canViewAllCompanies: false,
    canManageJobs: true,
    canManageCandidates: false,
    canSendEmails: false,
    canViewRecruiterNotes: false,
    canAccessAdmin: false,
    canAssignOwnership: true,
  },
  viewer: {
    canManageUsers: false,
    canManageRoles: false,
    canViewAllAnalytics: false,
    canViewAllCandidates: false,
    canViewAllJobs: false,
    canViewAllCompanies: false,
    canManageJobs: false,
    canManageCandidates: false,
    canSendEmails: false,
    canViewRecruiterNotes: false,
    canAccessAdmin: false,
    canAssignOwnership: false,
  },
} as const

/**
 * Everything we extract from a resume.
 *
 * Fields added after the first version are optional so that the hundreds of
 * profiles parsed by the original, much thinner extractor still typecheck and
 * still render — the detail page treats every one of them as "show it if we
 * have it". Re-running the analysis on an old candidate backfills them.
 */
export interface ParsedResumeData {
  name: string
  email: string | null
  phone: string | null
  skills: string[]
  experience_years: number
  location: string | null
  remote_preference: string | null
  salary_expectation_min: number | null
  salary_expectation_max: number | null
  summary: string
  work_history: WorkExperience[]
  education: Education[]
  certifications: string[]

  // --- Identity and positioning ---
  /** One-line self-description, usually the line under the name. */
  headline?: string | null
  current_title?: string | null
  current_company?: string | null
  seniority_level?: string | null

  // --- Links ---
  linkedin_url?: string | null
  github_url?: string | null
  portfolio_url?: string | null
  other_links?: string[]

  // --- Availability and eligibility ---
  work_authorization?: string | null
  willing_to_relocate?: boolean | null
  salary_currency?: string | null
  notice_period?: string | null

  // --- Context for matching ---
  industries?: string[]
  languages?: ResumeLanguage[]

  // --- Long tail of the document ---
  projects?: ResumeProject[]
  awards?: ResumeAward[]
  publications?: ResumePublication[]
  volunteer?: ResumeVolunteer[]

  /**
   * The resume transcribed in full, in reading order.
   *
   * The structured fields are a summary by construction; this is the guarantee
   * that nothing on the page was silently dropped, and it is what the profile
   * shows under "Full résumé text".
   */
  raw_text?: string | null
  /**
   * How the résumé was read: straight from the PDF's own text layer, or by the
   * model looking at the rendered pages because there was no text to take.
   */
  source?: 'text-layer' | 'vision'
  /** Anything the model saw but could not confidently place in a field. */
  extraction_notes?: string | null
  parser_version?: number
  parsed_at?: string
  parser_model?: string
}

export interface WorkExperience {
  company: string
  title: string
  /**
   * The date range as a formatted string, and a prose summary of the role.
   *
   * Both were dropped from the extractor once every role carried structured
   * dates and its own bullet points — they were the same facts a second time,
   * paid for in output tokens. Still present on profiles parsed before that,
   * so the display falls back to them.
   */
  duration?: string
  description?: string
  location?: string | null
  employment_type?: string | null
  start_date?: string | null
  end_date?: string | null
  is_current?: boolean | null
  /** Bullet points as written, so quantified wins survive the summary. */
  highlights?: string[]
  technologies?: string[]
}

export interface Education {
  institution: string
  degree: string
  field: string
  /** Superseded by start_year/end_year; kept for older profiles. */
  year?: string
  start_year?: string | null
  end_year?: string | null
  gpa?: string | null
  honors?: string | null
  activities?: string | null
  location?: string | null
}

export interface ResumeLanguage {
  language: string
  proficiency: string | null
}

export interface ResumeProject {
  name: string
  description: string | null
  url: string | null
  technologies?: string[]
}

export interface ResumeAward {
  name: string
  issuer: string | null
  year: string | null
  description: string | null
}

export interface ResumePublication {
  title: string
  venue: string | null
  year: string | null
  url: string | null
}

export interface ResumeVolunteer {
  organization: string
  role: string | null
  duration: string | null
  description: string | null
}

export interface MatchScores {
  overall_score: number
  skills_score: number
  experience_score: number
  keywords_score: number
  location_score: number
  salary_score: number
  reasoning: string
}

export type JobFormData = Omit<Job, 'id' | 'created_at' | 'updated_at' | 'user_id'>
export type CandidateFormData = Omit<Candidate, 'id' | 'created_at' | 'updated_at' | 'user_id'>

// Prospect types for external recruiters and talents not yet in Refery
export type ProspectOutreachStatus = 'prospect' | 'cold_reach_email' | 'cold_reach_linkedin' | 'call_scheduled' | 'in_conversation' | 'onboarded' | 'lost' | 'not_interested'
export type ProspectAssessment = 'very_strong' | 'strong' | 'moderate' | 'not_fit' | 'not_interested'
export type RecruiterType = 'partner_recruiter' | 'scout'
export type TalentType = 'engineering' | 'gtm' | 'product' | 'design' | 'operations_strategy'

export const PROSPECT_OUTREACH_STATUSES = {
  prospect: { label: 'Prospect', color: 'bg-slate-100 text-slate-700' },
  cold_reach_email: { label: 'Cold Reach - Email', color: 'bg-blue-100 text-blue-700' },
  cold_reach_linkedin: { label: 'Cold Reach - LinkedIn', color: 'bg-sky-100 text-sky-700' },
  call_scheduled: { label: 'Call Scheduled', color: 'bg-indigo-100 text-indigo-700' },
  in_conversation: { label: 'In Conversation', color: 'bg-amber-100 text-amber-700' },
  onboarded: { label: 'Onboarded', color: 'bg-green-100 text-green-700' },
  lost: { label: 'Lost (No News)', color: 'bg-gray-100 text-gray-500' },
  not_interested: { label: 'Not Interested', color: 'bg-red-100 text-red-700' },
} as const

export const PROSPECT_ASSESSMENTS = {
  very_strong: { label: 'Very Strong', color: 'bg-emerald-100 text-emerald-700' },
  strong: { label: 'Strong', color: 'bg-green-100 text-green-700' },
  moderate: { label: 'Moderate', color: 'bg-amber-100 text-amber-700' },
  not_fit: { label: 'Not Fit', color: 'bg-gray-100 text-gray-500' },
  not_interested: { label: 'Not Interested', color: 'bg-red-100 text-red-700' },
} as const

export const RECRUITER_TYPES = {
  partner_recruiter: { label: 'Partner Recruiter', color: 'bg-purple-100 text-purple-700' },
  scout: { label: 'Scout', color: 'bg-cyan-100 text-cyan-700' },
} as const

export const TALENT_TYPES = {
  engineering: { label: 'Engineering', color: 'bg-blue-100 text-blue-700' },
  gtm: { label: 'GTM', color: 'bg-green-100 text-green-700' },
  product: { label: 'Product', color: 'bg-purple-100 text-purple-700' },
  design: { label: 'Design', color: 'bg-pink-100 text-pink-700' },
  operations_strategy: { label: 'Operations/Strategy', color: 'bg-amber-100 text-amber-700' },
} as const

export interface ProspectRecruiter {
  id: string
  name: string
  email: string | null
  linkedin_url: string | null
  company: string | null
  title: string | null
  location: string | null
  recruiter_type: RecruiterType | null
  overview: string | null
  why_good_fit: string | null
  outreach_status: ProspectOutreachStatus
  assessment: ProspectAssessment | null
  notes: string | null
  source: string | null
  last_contacted_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  // Joined data
  matched_user?: UserAdmin | null
}

export interface ProspectTalent {
  id: string
  name: string
  email: string | null
  linkedin_url: string | null
  current_company: string | null
  current_title: string | null
  location: string | null
  skills: string[] | null
  talent_type: TalentType | null
  overview: string | null
  outreach_status: ProspectOutreachStatus
  assessment: ProspectAssessment | null
  notes: string | null
  source: string | null
  last_contacted_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ProspectRecruiterNote {
  id: string
  recruiter_id: string
  note_type: 'call_notes' | 'feedback' | 'general'
  content: string
  created_by: string | null
  created_at: string
}

export interface ProspectTalentNote {
  id: string
  talent_id: string
  note_type: 'call_notes' | 'feedback' | 'general' | 'email_messages'
  content: string
  created_by: string | null
  created_at: string
}

export interface ProspectStageHistory {
  id: string
  from_status: string | null
  to_status: string
  changed_by: string | null
  changed_at: string
}

export interface CompanyAgreement {
  id: string
  company_id: string
  token: string
  job_title: string | null
  candidate_name: string | null
  fee_amount: number | null
  fee_percentage: number | null
  status: 'pending' | 'signed' | 'expired' | 'revoked'
  signed_by_name: string | null
  signed_by_email: string | null
  signed_at: string | null
  signed_ip: string | null
  expires_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  // Joined data
  company?: Company
}
