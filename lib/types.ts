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
  status: 'new' | 'reviewing' | 'shortlisted' | 'rejected' | 'hired'
  availability_status: 'active' | 'off_market' | 'not_yet_talked' | 'not_qualified' | null
  created_at: string
  updated_at: string
  user_id: string
  // New fields
  linkedin_url: string | null
  last_contacted: string | null
  owner_user_id: string | null
  uploaded_by_user_id: string | null
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

export interface JobCandidatePipeline {
  id: string
  job_id: string
  candidate_id: string
  stage: 'job_matched' | 'job_shared' | 'interest_confirmed' | 'shared_to_hiring_manager' | 'interview' | 'offer' | 'hired' | 'rejected' | 'withdrawn'
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

export interface JobMatch {
  id: string
  job_id: string
  candidate_id: string
  overall_score: number
  skills_score: number | null
  experience_score: number | null
  keywords_score: number | null
  location_score: number | null
  salary_score: number | null
  ai_reasoning: string | null
  created_at: string
  // Joined data
  job?: Job
  candidate?: Candidate
}

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
}

export interface WorkExperience {
  company: string
  title: string
  duration: string
  description: string
}

export interface Education {
  institution: string
  degree: string
  field: string
  year: string
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
