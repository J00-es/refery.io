import type { PipelineStage } from './types'

// Stage accent hex colors for direct CSS usage. Keyed by the real
// job_candidate_pipeline.stage values (plus dashboard bucket keys, which are 1:1).
export const STAGE_ACCENT_COLORS: Record<string, string> = {
  auto_matched: '#6366F1',
  screening: '#0891B2',
  job_matched: '#185FA5',
  job_shared: '#378ADD',
  interest_confirmed: '#1D9E75',
  hm_shared: '#0F6E56',
  auto_passed: '#A32D2D',
  rejected: '#A32D2D',
}

// Stage descriptions for the drilldown page (keyed by stage / bucket key).
export const STAGE_DESCRIPTIONS: Record<string, string> = {
  auto_matched: 'Candidates the AI matched to a role automatically, awaiting your review',
  screening: 'Candidates being screened for fit before advancing in the pipeline',
  job_matched: 'Candidates matched to a role, waiting to be shared with the candidate',
  job_shared: 'Role details shared with candidate, awaiting their interest confirmation',
  interest_confirmed: 'Candidate confirmed interest in the role, ready to be shared with hiring manager',
  hm_shared: 'Profile shared with the hiring manager, awaiting their feedback',
  auto_passed: 'Candidates the AI screened out as not a fit for the role',
  rejected: 'Candidates who did not progress',
}

export interface StageConfig {
  value: PipelineStage
  label: string
  color: string // Tailwind classes for badge/card styling
  borderColor: string // Top border color for kanban columns
  dotColor: string // Timeline dot color
  iconName: string // Icon name for dynamic rendering
  category: 'active' | 'terminal_positive' | 'terminal_negative'
  order: number
}

// Pipeline stages in flow order. These match the job_candidate_pipeline.stage
// DB CHECK constraint exactly — the source of truth. auto_matched/screening are
// set by the AI matching automation; auto_passed/rejected are terminal.
export const PIPELINE_STAGES: StageConfig[] = [
  {
    value: 'auto_matched',
    label: 'AI Matched',
    color: 'bg-[#ECECFB] text-[#6366F1] border-[#6366F1]/20',
    borderColor: 'bg-[#6366F1]',
    dotColor: 'bg-[#6366F1]',
    iconName: 'Sparkles',
    category: 'active',
    order: 1
  },
  {
    value: 'screening',
    label: 'Screening',
    color: 'bg-[#E0F4F8] text-[#0891B2] border-[#0891B2]/20',
    borderColor: 'bg-[#0891B2]',
    dotColor: 'bg-[#0891B2]',
    iconName: 'Search',
    category: 'active',
    order: 2
  },
  {
    value: 'job_matched',
    label: 'Job Matched',
    color: 'bg-[#EAF1FB] text-[#185FA5] border-[#185FA5]/20',
    borderColor: 'bg-[#185FA5]',
    dotColor: 'bg-[#185FA5]',
    iconName: 'TrendingUp',
    category: 'active',
    order: 3
  },
  {
    value: 'job_shared',
    label: 'Job Shared',
    color: 'bg-[#E8F4FC] text-[#378ADD] border-[#378ADD]/20',
    borderColor: 'bg-[#378ADD]',
    dotColor: 'bg-[#378ADD]',
    iconName: 'FileText',
    category: 'active',
    order: 4
  },
  {
    value: 'interest_confirmed',
    label: 'Interest Confirmed',
    color: 'bg-[#E1F5EE] text-[#1D9E75] border-[#1D9E75]/20',
    borderColor: 'bg-[#1D9E75]',
    dotColor: 'bg-[#1D9E75]',
    iconName: 'CheckCircle2',
    category: 'active',
    order: 5
  },
  {
    value: 'hm_shared',
    label: 'Shared to HM',
    color: 'bg-[#E1F5EE] text-[#0F6E56] border-[#0F6E56]/20',
    borderColor: 'bg-[#0F6E56]',
    dotColor: 'bg-[#0F6E56]',
    iconName: 'Send',
    category: 'active',
    order: 6
  },
  {
    value: 'auto_passed',
    label: 'AI Passed',
    color: 'bg-[#FDECEC] text-[#A32D2D] border-[#A32D2D]/20',
    borderColor: 'bg-[#A32D2D]',
    dotColor: 'bg-[#A32D2D]',
    iconName: 'XCircle',
    category: 'terminal_negative',
    order: 7
  },
  {
    value: 'rejected',
    label: 'Rejected',
    color: 'bg-[#FDECEC] text-[#A32D2D] border-[#A32D2D]/20',
    borderColor: 'bg-[#A32D2D]',
    dotColor: 'bg-[#A32D2D]',
    iconName: 'ThumbsDown',
    category: 'terminal_negative',
    order: 8
  },
]

// Helper functions
export function getStageConfig(stage: string): StageConfig {
  return PIPELINE_STAGES.find(s => s.value === stage) || PIPELINE_STAGES[0]
}

export function getStageLabel(stage: string): string {
  return getStageConfig(stage).label
}

export function getActiveStages(): StageConfig[] {
  return PIPELINE_STAGES.filter(s => s.category === 'active')
}

export function getTerminalStages(): StageConfig[] {
  return PIPELINE_STAGES.filter(s => s.category !== 'active')
}

export function getTerminalNegativeStages(): StageConfig[] {
  return PIPELINE_STAGES.filter(s => s.category === 'terminal_negative')
}

// Stage values for filtering/counting
export const ACTIVE_STAGE_VALUES: PipelineStage[] = [
  'auto_matched', 'screening', 'job_matched', 'job_shared',
  'interest_confirmed', 'hm_shared'
]

export const TERMINAL_NEGATIVE_STAGE_VALUES: PipelineStage[] = [
  'auto_passed', 'rejected'
]

// Dashboard grouped buckets configuration
export interface DashboardBucket {
  key: string
  label: string
  stages: string[]
  color: string
  borderColor: string
  showSubCounts?: boolean
  subCountLabel?: string
}

// Buckets mirror the actual stages stored in job_candidate_pipeline.stage. Each
// maps 1:1 to a real stage so no data is silently dropped from the dashboard.
export const DASHBOARD_BUCKETS: DashboardBucket[] = [
  {
    key: 'auto_matched',
    label: 'AI Matched',
    stages: ['auto_matched'],
    color: 'bg-[#ECECFB] text-[#6366F1]',
    borderColor: 'bg-[#6366F1]'
  },
  {
    key: 'screening',
    label: 'Screening',
    stages: ['screening'],
    color: 'bg-[#E0F4F8] text-[#0891B2]',
    borderColor: 'bg-[#0891B2]'
  },
  {
    key: 'job_matched',
    label: 'Job Matched',
    stages: ['job_matched'],
    color: 'bg-[#EAF1FB] text-[#185FA5]',
    borderColor: 'bg-[#185FA5]'
  },
  {
    key: 'job_shared',
    label: 'Job Shared',
    stages: ['job_shared'],
    color: 'bg-[#E8F4FC] text-[#378ADD]',
    borderColor: 'bg-[#378ADD]'
  },
  {
    key: 'interest_confirmed',
    label: 'Interest Confirmed',
    stages: ['interest_confirmed'],
    color: 'bg-[#E1F5EE] text-[#1D9E75]',
    borderColor: 'bg-[#1D9E75]'
  },
  {
    key: 'hm_shared',
    label: 'Shared to HM',
    stages: ['hm_shared'],
    color: 'bg-[#E1F5EE] text-[#0F6E56]',
    borderColor: 'bg-[#0F6E56]'
  },
  {
    key: 'auto_passed',
    label: 'AI Passed',
    stages: ['auto_passed'],
    color: 'bg-[#FDECEC] text-[#A32D2D]',
    borderColor: 'bg-[#A32D2D]'
  },
  {
    key: 'rejected',
    label: 'Rejected',
    stages: ['rejected'],
    color: 'bg-[#FDECEC] text-[#A32D2D]',
    borderColor: 'bg-[#A32D2D]'
  },
]

// Stages that represent active, in-flight pipeline (excludes AI-passed/rejected).
export const DASHBOARD_ACTIVE_BUCKET_KEYS = [
  'auto_matched',
  'screening',
  'job_matched',
  'job_shared',
  'interest_confirmed',
  'hm_shared',
] as const

// Terminal (negative) buckets shown separately from the active journey.
export const DASHBOARD_TERMINAL_BUCKET_KEYS = ['auto_passed', 'rejected'] as const

// ─────────────────────────────────────────────────────────────────────────────
// Scout dashboard display stages (frontend-only naming).
//
// SINGLE SOURCE OF TRUTH for the scout-facing stage names. These are a display
// mapping only — they never rename any DB enum value, column, or anything the
// nightly automation / skills read. Every dashboard component imports from here.
//
// `placed` has no pipeline stage (job_candidate_pipeline.stage has no such
// value); it is sourced from candidates.status = 'hired'. Its `stages` list is
// therefore empty and it is counted separately.
// ─────────────────────────────────────────────────────────────────────────────
export type DisplayStageKey = 'in_review' | 'matched' | 'in_play' | 'placed'

export interface DisplayStage {
  key: DisplayStageKey
  name: string
  description: string
  dotColor: string // segment / legend dot color
  stages: PipelineStage[] // real internal stages this display stage aggregates
}

export const DISPLAY_STAGES: DisplayStage[] = [
  {
    key: 'in_review',
    name: 'In review',
    description: "We're screening them and finding the right roles.",
    dotColor: '#C9D9CF',
    stages: ['auto_matched', 'screening'],
  },
  {
    key: 'matched',
    name: 'Matched to roles',
    description: 'Open roles found. We are sharing them with the candidate.',
    dotColor: '#5E8571',
    stages: ['job_matched', 'job_shared'],
  },
  {
    key: 'in_play',
    name: 'In play with companies',
    description: 'Interested candidates, introduced to hiring teams.',
    dotColor: '#1F4D3A',
    stages: ['interest_confirmed', 'hm_shared'],
  },
  {
    key: 'placed',
    name: 'Placed',
    description: 'Hired. Your payout is on its way.',
    dotColor: '#8A6A1F',
    stages: [], // sourced from candidates.status = 'hired'
  },
]

// Closed / archive display bucket (auto_passed + rejected).
export const CLOSED_STAGE_VALUES: PipelineStage[] = ['auto_passed', 'rejected']
export const CLOSED_DISPLAY_NAME = 'Closed'

// The internal stages counted toward a scout's non-closed ("your candidates")
// total: everything except the closed/archive stages. Mirrors ACTIVE_STAGE_VALUES.
export const NON_CLOSED_STAGE_VALUES: PipelineStage[] = ACTIVE_STAGE_VALUES

// Map a raw internal stage to its scout-facing display name. Used by the
// activity feed so no enum value ever reaches rendered copy.
export function stageDisplayName(stage: string): string {
  const match = DISPLAY_STAGES.find(ds => ds.stages.includes(stage as PipelineStage))
  if (match) return match.name
  return CLOSED_DISPLAY_NAME
}
