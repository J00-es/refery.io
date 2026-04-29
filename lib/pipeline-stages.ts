import type { PipelineStage } from './types'

// Stage accent hex colors for direct CSS usage
export const STAGE_ACCENT_COLORS: Record<string, string> = {
  sourced: '#888780',
  job_matched: '#185FA5',
  job_shared: '#378ADD',
  interest_confirmed: '#1D9E75',
  hm_shared: '#0F6E56',
  hm_pending: '#0F6E56',
  shared_to_hm: '#0F6E56',
  interview_1: '#534AB7',
  interview_2: '#534AB7',
  interview: '#534AB7',
  offer: '#7F77DD',
  hired: '#3B6D11',
  interest_declined: '#A32D2D',
  rejected: '#A32D2D',
  rejected_no_feedback: '#A32D2D',
  withdrawn: '#A32D2D',
}

// Stage descriptions for drilldown page
export const STAGE_DESCRIPTIONS: Record<string, string> = {
  sourced: 'Candidates added to your talent pool, ready to be matched with open roles',
  job_matched: 'Candidates matched to a role, waiting to be shared with the candidate',
  job_shared: 'Role details shared with candidate, awaiting their interest confirmation',
  interest_confirmed: 'Candidate confirmed interest in the role, ready to be shared with hiring manager',
  shared_to_hm: 'Profile shared with hiring manager, includes candidates awaiting HM feedback',
  interview: 'Candidates in active interview rounds with the hiring team',
  offer: 'Candidates who received an offer, pending their decision',
  hired: 'Successfully placed candidates',
  rejected: 'Candidates who did not progress (declined, rejected, withdrawn)',
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

// All 14 pipeline stages in order
// Stage accent colors from design spec:
// sourced: #888780 (gray), job_matched: #185FA5 (blue), job_shared: #378ADD (light blue)
// interest_confirmed: #1D9E75 (teal), hm_shared/hm_pending: #0F6E56 (dark teal)
// interview_1/interview_2: #534AB7 (purple), offer: #7F77DD (light purple)
// hired: #3B6D11 (green), rejected family: #A32D2D (red)

export const PIPELINE_STAGES: StageConfig[] = [
  // Active stages (1-9)
  { 
    value: 'sourced', 
    label: 'Sourced', 
    color: 'bg-[#F0F0EA] text-[#888780] border-[#888780]/20',
    borderColor: 'bg-[#888780]',
    dotColor: 'bg-[#888780]',
    iconName: 'Search',
    category: 'active',
    order: 1
  },
  { 
    value: 'job_matched', 
    label: 'Job Matched', 
    color: 'bg-[#EAF1FB] text-[#185FA5] border-[#185FA5]/20',
    borderColor: 'bg-[#185FA5]',
    dotColor: 'bg-[#185FA5]',
    iconName: 'TrendingUp',
    category: 'active',
    order: 2
  },
  { 
    value: 'job_shared', 
    label: 'Job Shared', 
    color: 'bg-[#E8F4FC] text-[#378ADD] border-[#378ADD]/20',
    borderColor: 'bg-[#378ADD]',
    dotColor: 'bg-[#378ADD]',
    iconName: 'FileText',
    category: 'active',
    order: 3
  },
  { 
    value: 'interest_confirmed', 
    label: 'Interest Confirmed', 
    color: 'bg-[#E1F5EE] text-[#1D9E75] border-[#1D9E75]/20',
    borderColor: 'bg-[#1D9E75]',
    dotColor: 'bg-[#1D9E75]',
    iconName: 'CheckCircle2',
    category: 'active',
    order: 4
  },
  { 
    value: 'hm_shared', 
    label: 'Shared to HM', 
    color: 'bg-[#E1F5EE] text-[#0F6E56] border-[#0F6E56]/20',
    borderColor: 'bg-[#0F6E56]',
    dotColor: 'bg-[#0F6E56]',
    iconName: 'Send',
    category: 'active',
    order: 5
  },
  { 
    value: 'hm_pending', 
    label: 'Awaiting HM Feedback', 
    color: 'bg-[#E1F5EE] text-[#0F6E56] border-[#0F6E56]/20',
    borderColor: 'bg-[#0F6E56]',
    dotColor: 'bg-[#0F6E56]',
    iconName: 'Clock',
    category: 'active',
    order: 6
  },
  { 
    value: 'interview_1', 
    label: 'Interview – Round 1', 
    color: 'bg-[#EFEDFA] text-[#534AB7] border-[#534AB7]/20',
    borderColor: 'bg-[#534AB7]',
    dotColor: 'bg-[#534AB7]',
    iconName: 'Users',
    category: 'active',
    order: 7
  },
  { 
    value: 'interview_2', 
    label: 'Interview – Round 2', 
    color: 'bg-[#EFEDFA] text-[#534AB7] border-[#534AB7]/20',
    borderColor: 'bg-[#534AB7]',
    dotColor: 'bg-[#534AB7]',
    iconName: 'UserCheck',
    category: 'active',
    order: 8
  },
  { 
    value: 'offer', 
    label: 'Offer', 
    color: 'bg-[#F3F1FC] text-[#7F77DD] border-[#7F77DD]/20',
    borderColor: 'bg-[#7F77DD]',
    dotColor: 'bg-[#7F77DD]',
    iconName: 'Star',
    category: 'active',
    order: 9
  },
  // Terminal positive (10)
  { 
    value: 'hired', 
    label: 'Hired', 
    color: 'bg-[#EBF4EF] text-[#3B6D11] border-[#3B6D11]/20',
    borderColor: 'bg-[#3B6D11]',
    dotColor: 'bg-[#3B6D11]',
    iconName: 'Trophy',
    category: 'terminal_positive',
    order: 10
  },
  // Terminal negative (11-14)
  { 
    value: 'interest_declined', 
    label: 'Not Interested', 
    color: 'bg-[#FDECEC] text-[#A32D2D] border-[#A32D2D]/20',
    borderColor: 'bg-[#A32D2D]',
    dotColor: 'bg-[#A32D2D]',
    iconName: 'ThumbsDown',
    category: 'terminal_negative',
    order: 11
  },
  { 
    value: 'rejected', 
    label: 'Rejected', 
    color: 'bg-[#FDECEC] text-[#A32D2D] border-[#A32D2D]/20',
    borderColor: 'bg-[#A32D2D]',
    dotColor: 'bg-[#A32D2D]',
    iconName: 'XCircle',
    category: 'terminal_negative',
    order: 12
  },
  { 
    value: 'rejected_no_feedback', 
    label: 'Rejected (No Response)', 
    color: 'bg-[#FDECEC] text-[#A32D2D] border-[#A32D2D]/20',
    borderColor: 'bg-[#A32D2D]',
    dotColor: 'bg-[#A32D2D]',
    iconName: 'MessageSquareOff',
    category: 'terminal_negative',
    order: 13
  },
  { 
    value: 'withdrawn', 
    label: 'Withdrawn', 
    color: 'bg-[#FDECEC] text-[#A32D2D] border-[#A32D2D]/20',
    borderColor: 'bg-[#A32D2D]',
    dotColor: 'bg-[#A32D2D]',
    iconName: 'ArrowRight',
    category: 'terminal_negative',
    order: 14
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
  'sourced', 'job_matched', 'job_shared', 'interest_confirmed',
  'hm_shared', 'hm_pending', 'interview_1', 'interview_2', 'offer'
]

export const TERMINAL_NEGATIVE_STAGE_VALUES: PipelineStage[] = [
  'interest_declined', 'rejected', 'rejected_no_feedback', 'withdrawn'
]

// Dashboard grouped buckets configuration
export interface DashboardBucket {
  key: string
  label: string
  stages: PipelineStage[]
  color: string
  borderColor: string
  showSubCounts?: boolean
  subCountLabel?: string
}

export const DASHBOARD_BUCKETS: DashboardBucket[] = [
  { 
    key: 'sourced', 
    label: 'Sourced', 
    stages: ['sourced'],
    color: 'bg-[#F0F0EA] text-[#888780]',
    borderColor: 'bg-[#888780]'
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
    key: 'shared_to_hm', 
    label: 'Shared to HM', 
    stages: ['hm_shared', 'hm_pending'],
    color: 'bg-[#E1F5EE] text-[#0F6E56]',
    borderColor: 'bg-[#0F6E56]',
    showSubCounts: true,
    subCountLabel: 'awaiting'
  },
  { 
    key: 'interview', 
    label: 'Interview', 
    stages: ['interview_1', 'interview_2'],
    color: 'bg-[#EFEDFA] text-[#534AB7]',
    borderColor: 'bg-[#534AB7]',
    showSubCounts: true
  },
  { 
    key: 'offer', 
    label: 'Offer', 
    stages: ['offer'],
    color: 'bg-[#F3F1FC] text-[#7F77DD]',
    borderColor: 'bg-[#7F77DD]'
  },
  { 
    key: 'hired', 
    label: 'Hired', 
    stages: ['hired'],
    color: 'bg-[#EBF4EF] text-[#3B6D11]',
    borderColor: 'bg-[#3B6D11]'
  },
  { 
    key: 'rejected', 
    label: 'Rejected', 
    stages: ['interest_declined', 'rejected', 'rejected_no_feedback', 'withdrawn'],
    color: 'bg-[#FDECEC] text-[#A32D2D]',
    borderColor: 'bg-[#A32D2D]'
  },
]
