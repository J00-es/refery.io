// Outreach Hub Types

// Enums matching database CHECK constraints
export type OutreachPersona = 
  | 'founder_ceo' 
  | 'founder_cto' 
  | 'head_of_talent' 
  | 'hiring_manager' 
  | 'recruiter' 
  | 'investor' 
  | 'advisor' 
  | 'other'

export type OutreachSeniority = 
  | 'c_level' 
  | 'vp' 
  | 'director' 
  | 'manager' 
  | 'individual_contributor'

export type OutreachChannel = 
  | 'email' 
  | 'linkedin_connection' 
  | 'linkedin_dm' 
  | 'twitter_dm' 
  | 'phone' 
  | 'text' 
  | 'whatsapp' 
  | 'other'

export type OutreachPattern = 
  | 'a_candidate_led' 
  | 'b_bench_drop' 
  | 'c_partnership' 
  | 'd_intro_request' 
  | 'e_job_board_follow' 
  | 'f_event_followup' 
  | 'g_content_reply' 
  | 'h_warm_intro' 
  | 'other'

export type ThreadStatus = 
  | 'draft' 
  | 'active' 
  | 'awaiting_reply' 
  | 'replied_positive' 
  | 'replied_neutral' 
  | 'replied_negative' 
  | 'meeting_booked' 
  | 'no_response_following_up' 
  | 'no_response_dead' 
  | 'placement_in_progress' 
  | 'placement_complete' 
  | 'declined' 
  | 'dnr'

export type MessageDirection = 'outbound' | 'inbound'

export type MessageSentiment = 'positive' | 'neutral' | 'negative' | 'unclear'

export type ResponseCategory = 
  | 'interested_meeting' 
  | 'interested_later' 
  | 'questions' 
  | 'not_hiring' 
  | 'wrong_person' 
  | 'unsubscribe' 
  | 'no_response' 
  | 'other'

export type HookType = 
  | 'funding_round' 
  | 'recent_hire' 
  | 'recent_post' 
  | 'mutual_connection' 
  | 'company_news' 
  | 'job_posting' 
  | 'event_mention' 
  | 'portfolio_connection' 
  | 'other'

export type PersonalizationLevel = 'heavy' | 'medium' | 'light' | 'boilerplate'

export type CTAType = 
  | 'ask_for_meeting' 
  | 'ask_for_referral' 
  | 'ask_for_feedback' 
  | 'share_candidate' 
  | 'share_info' 
  | 'soft_close' 
  | 'none'

export type FollowupActionType = 
  | 'send_followup_email' 
  | 'send_linkedin_message' 
  | 'call' 
  | 'research' 
  | 'check_response' 
  | 'other'

export type FollowupStatus = 'pending' | 'completed' | 'snoozed' | 'cancelled'

export type NoteType = 'general' | 'objection' | 'insight' | 'reminder' | 'status_change'

// Interfaces
export interface OutreachRecipient {
  id: string
  name: string
  email: string | null
  linkedin_url: string | null
  current_company_id: string | null
  current_title: string | null
  persona: OutreachPersona | null
  seniority: OutreachSeniority | null
  location: string | null
  inbound_source: string | null
  mutual_connection_name: string | null
  preferred_channel: OutreachChannel | null
  do_not_contact: boolean
  cooldown_until: string | null
  lifetime_touches: number
  lifetime_replies: number
  first_contacted_at: string | null
  last_contacted_at: string | null
  last_replied_at: string | null
  notes: string | null
  tags: string[] | null
  created_at: string
  updated_at: string
  owner_user_id: string | null
  // Joined
  company?: { id: string; name: string; stage?: string }
}

export interface OutreachThread {
  id: string
  recipient_id: string
  company_id: string | null
  outreach_pattern: OutreachPattern | null
  primary_channel: OutreachChannel | null
  channels_used: OutreachChannel[] | null
  subject: string | null
  status: ThreadStatus
  total_touches: number
  outbound_count: number
  inbound_count: number
  first_touch_at: string | null
  last_touch_at: string | null
  first_reply_at: string | null
  time_to_first_reply_hours: number | null
  meeting_booked_at: string | null
  feedback_themes: string[] | null
  resulted_in_placement: boolean
  placement_candidate_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
  owner_user_id: string | null
  // Joined
  recipient?: OutreachRecipient
  company?: { id: string; name: string; stage?: string }
  messages?: OutreachMessage[]
}

export interface OutreachMessage {
  id: string
  thread_id: string
  recipient_id: string
  company_id: string | null
  direction: MessageDirection
  channel: OutreachChannel
  subject: string | null
  body: string | null
  body_word_count: number | null
  hook_used: HookType | null
  hook_detail: string | null
  personalization_level: PersonalizationLevel | null
  cta_type: CTAType | null
  variant_label: string | null
  pattern_used: OutreachPattern | null
  included_calendar_link: boolean
  included_attachment: boolean
  sent_at: string | null
  opened_at: string | null
  clicked_at: string | null
  replied_at: string | null
  bounced_at: string | null
  sentiment: MessageSentiment | null
  response_category: ResponseCategory | null
  notes: string | null
  created_at: string
  updated_at: string
  owner_user_id: string | null
}

export interface OutreachMessageCandidate {
  id: string
  message_id: string
  candidate_id: string
  pipeline_id: string | null
  job_id: string | null
  role_label_in_message: string | null
  position_in_message: number | null
  created_at: string
  // Joined
  candidate?: { id: string; name: string }
}

export interface OutreachFollowup {
  id: string
  thread_id: string
  recipient_id: string
  due_at: string
  action_type: FollowupActionType
  status: FollowupStatus
  draft_subject: string | null
  draft_body: string | null
  notes: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
  owner_user_id: string | null
  // Joined
  thread?: OutreachThread
  recipient?: OutreachRecipient
}

export interface OutreachNote {
  id: string
  thread_id: string | null
  recipient_id: string | null
  message_id: string | null
  note_type: NoteType
  body: string
  created_at: string
  created_by_user_id: string | null
}

// View types for dashboard
export interface RecipientSummary extends OutreachRecipient {
  thread_count: number
  recent_thread_status: ThreadStatus | null
}

export interface StaleThread extends OutreachThread {
  days_since_touch: number
}

// Config for UI display
export const PERSONA_CONFIG: Record<OutreachPersona, { label: string; color: string; bgColor: string }> = {
  founder_ceo: { label: 'Founder/CEO', color: 'text-violet-700', bgColor: 'bg-violet-100' },
  founder_cto: { label: 'Founder/CTO', color: 'text-indigo-700', bgColor: 'bg-indigo-100' },
  head_of_talent: { label: 'Head of Talent', color: 'text-emerald-700', bgColor: 'bg-emerald-100' },
  hiring_manager: { label: 'Hiring Manager', color: 'text-blue-700', bgColor: 'bg-blue-100' },
  recruiter: { label: 'Recruiter', color: 'text-cyan-700', bgColor: 'bg-cyan-100' },
  investor: { label: 'Investor', color: 'text-amber-700', bgColor: 'bg-amber-100' },
  advisor: { label: 'Advisor', color: 'text-orange-700', bgColor: 'bg-orange-100' },
  other: { label: 'Other', color: 'text-stone-600', bgColor: 'bg-stone-100' },
}

export const STATUS_CONFIG: Record<ThreadStatus, { label: string; color: string; bgColor: string }> = {
  draft: { label: 'draft', color: 'text-stone-600', bgColor: 'bg-stone-100' },
  active: { label: 'active', color: 'text-blue-700', bgColor: 'bg-blue-100' },
  awaiting_reply: { label: 'awaiting reply', color: 'text-amber-700', bgColor: 'bg-amber-100' },
  replied_positive: { label: 'replied +', color: 'text-emerald-700', bgColor: 'bg-emerald-100' },
  replied_neutral: { label: 'replied', color: 'text-stone-600', bgColor: 'bg-stone-100' },
  replied_negative: { label: 'replied -', color: 'text-red-700', bgColor: 'bg-red-100' },
  meeting_booked: { label: 'meeting', color: 'text-emerald-700', bgColor: 'bg-emerald-100' },
  no_response_following_up: { label: 'following up', color: 'text-amber-700', bgColor: 'bg-amber-100' },
  no_response_dead: { label: 'dead', color: 'text-stone-500', bgColor: 'bg-stone-100' },
  placement_in_progress: { label: 'placement', color: 'text-emerald-700', bgColor: 'bg-emerald-100' },
  placement_complete: { label: 'placed!', color: 'text-emerald-700', bgColor: 'bg-emerald-200' },
  declined: { label: 'declined', color: 'text-red-700', bgColor: 'bg-red-100' },
  dnr: { label: 'dnr', color: 'text-red-700', bgColor: 'bg-red-100' },
}

export const CHANNEL_CONFIG: Record<OutreachChannel, { label: string; icon: string }> = {
  email: { label: 'Email', icon: 'mail' },
  linkedin_connection: { label: 'LinkedIn Connect', icon: 'linkedin' },
  linkedin_dm: { label: 'LinkedIn DM', icon: 'linkedin' },
  twitter_dm: { label: 'Twitter DM', icon: 'twitter' },
  phone: { label: 'Phone', icon: 'phone' },
  text: { label: 'Text', icon: 'message-square' },
  whatsapp: { label: 'WhatsApp', icon: 'message-circle' },
  other: { label: 'Other', icon: 'more-horizontal' },
}

export const PATTERN_CONFIG: Record<OutreachPattern, { label: string; shortLabel: string }> = {
  a_candidate_led: { label: 'Candidate-led', shortLabel: 'candidate' },
  b_bench_drop: { label: 'Bench Drop', shortLabel: 'bench' },
  c_partnership: { label: 'Partnership', shortLabel: 'partner' },
  d_intro_request: { label: 'Intro Request', shortLabel: 'intro' },
  e_job_board_follow: { label: 'Job Board Follow', shortLabel: 'job' },
  f_event_followup: { label: 'Event Followup', shortLabel: 'event' },
  g_content_reply: { label: 'Content Reply', shortLabel: 'content' },
  h_warm_intro: { label: 'Warm Intro', shortLabel: 'warm' },
  other: { label: 'Other', shortLabel: 'other' },
}
