import { 
  Search, TrendingUp, FileText, CheckCircle2, Send, Clock, 
  Users, UserCheck, Star, Trophy, XCircle, ThumbsDown, 
  MessageSquareOff, ArrowRight
} from 'lucide-react'
import type { PipelineStage } from './types'

export interface StageConfig {
  value: PipelineStage
  label: string
  color: string // Tailwind classes for badge/card styling
  borderColor: string // Top border color for kanban columns
  dotColor: string // Timeline dot color
  icon: typeof Search
  category: 'active' | 'terminal_positive' | 'terminal_negative'
  order: number
}

// All 14 pipeline stages in order
export const PIPELINE_STAGES: StageConfig[] = [
  // Active stages (1-9)
  { 
    value: 'sourced', 
    label: 'Sourced', 
    color: 'bg-slate-100 text-slate-700 border-slate-200',
    borderColor: 'bg-slate-400',
    dotColor: 'bg-slate-400',
    icon: Search,
    category: 'active',
    order: 1
  },
  { 
    value: 'job_matched', 
    label: 'Job Matched', 
    color: 'bg-slate-100 text-slate-700 border-slate-200',
    borderColor: 'bg-slate-500',
    dotColor: 'bg-slate-500',
    icon: TrendingUp,
    category: 'active',
    order: 2
  },
  { 
    value: 'job_shared', 
    label: 'Job Shared', 
    color: 'bg-blue-100 text-blue-700 border-blue-200',
    borderColor: 'bg-blue-500',
    dotColor: 'bg-blue-500',
    icon: FileText,
    category: 'active',
    order: 3
  },
  { 
    value: 'interest_confirmed', 
    label: 'Interest Confirmed', 
    color: 'bg-cyan-100 text-cyan-700 border-cyan-200',
    borderColor: 'bg-cyan-500',
    dotColor: 'bg-cyan-500',
    icon: CheckCircle2,
    category: 'active',
    order: 4
  },
  { 
    value: 'hm_shared', 
    label: 'Shared to HM', 
    color: 'bg-teal-100 text-teal-700 border-teal-200',
    borderColor: 'bg-teal-500',
    dotColor: 'bg-teal-500',
    icon: Send,
    category: 'active',
    order: 5
  },
  { 
    value: 'hm_pending', 
    label: 'Awaiting HM Feedback', 
    color: 'bg-amber-100 text-amber-700 border-amber-200',
    borderColor: 'bg-amber-500',
    dotColor: 'bg-amber-500',
    icon: Clock,
    category: 'active',
    order: 6
  },
  { 
    value: 'interview_1', 
    label: 'Interview – Round 1', 
    color: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    borderColor: 'bg-indigo-500',
    dotColor: 'bg-indigo-500',
    icon: Users,
    category: 'active',
    order: 7
  },
  { 
    value: 'interview_2', 
    label: 'Interview – Round 2', 
    color: 'bg-purple-100 text-purple-700 border-purple-200',
    borderColor: 'bg-purple-500',
    dotColor: 'bg-purple-500',
    icon: UserCheck,
    category: 'active',
    order: 8
  },
  { 
    value: 'offer', 
    label: 'Offer', 
    color: 'bg-violet-100 text-violet-700 border-violet-200',
    borderColor: 'bg-violet-500',
    dotColor: 'bg-violet-500',
    icon: Star,
    category: 'active',
    order: 9
  },
  // Terminal positive (10)
  { 
    value: 'hired', 
    label: 'Hired', 
    color: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    borderColor: 'bg-emerald-500',
    dotColor: 'bg-emerald-500',
    icon: Trophy,
    category: 'terminal_positive',
    order: 10
  },
  // Terminal negative (11-14)
  { 
    value: 'interest_declined', 
    label: 'Not Interested', 
    color: 'bg-gray-100 text-gray-600 border-gray-200',
    borderColor: 'bg-gray-400',
    dotColor: 'bg-gray-400',
    icon: ThumbsDown,
    category: 'terminal_negative',
    order: 11
  },
  { 
    value: 'rejected', 
    label: 'Rejected', 
    color: 'bg-red-100 text-red-700 border-red-200',
    borderColor: 'bg-red-500',
    dotColor: 'bg-red-500',
    icon: XCircle,
    category: 'terminal_negative',
    order: 12
  },
  { 
    value: 'rejected_no_feedback', 
    label: 'Rejected (No Response)', 
    color: 'bg-red-50 text-red-600 border-red-100',
    borderColor: 'bg-red-400',
    dotColor: 'bg-red-400',
    icon: MessageSquareOff,
    category: 'terminal_negative',
    order: 13
  },
  { 
    value: 'withdrawn', 
    label: 'Withdrawn', 
    color: 'bg-gray-100 text-gray-500 border-gray-200',
    borderColor: 'bg-gray-400',
    dotColor: 'bg-gray-400',
    icon: ArrowRight,
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
    color: 'bg-slate-100 text-slate-700',
    borderColor: 'bg-slate-400'
  },
  { 
    key: 'job_matched', 
    label: 'Job Matched', 
    stages: ['job_matched'],
    color: 'bg-slate-100 text-slate-700',
    borderColor: 'bg-slate-500'
  },
  { 
    key: 'job_shared', 
    label: 'Job Shared', 
    stages: ['job_shared'],
    color: 'bg-blue-100 text-blue-700',
    borderColor: 'bg-blue-500'
  },
  { 
    key: 'interest_confirmed', 
    label: 'Interest Confirmed', 
    stages: ['interest_confirmed'],
    color: 'bg-cyan-100 text-cyan-700',
    borderColor: 'bg-cyan-500'
  },
  { 
    key: 'hm_stages', 
    label: 'Shared to HM', 
    stages: ['hm_shared', 'hm_pending'],
    color: 'bg-teal-100 text-teal-700',
    borderColor: 'bg-teal-500',
    showSubCounts: true,
    subCountLabel: 'awaiting'
  },
  { 
    key: 'interview', 
    label: 'Interview', 
    stages: ['interview_1', 'interview_2'],
    color: 'bg-purple-100 text-purple-700',
    borderColor: 'bg-purple-500',
    showSubCounts: true
  },
  { 
    key: 'offer', 
    label: 'Offer', 
    stages: ['offer'],
    color: 'bg-violet-100 text-violet-700',
    borderColor: 'bg-violet-500'
  },
  { 
    key: 'hired', 
    label: 'Hired', 
    stages: ['hired'],
    color: 'bg-emerald-100 text-emerald-700',
    borderColor: 'bg-emerald-500'
  },
  { 
    key: 'rejected', 
    label: 'Rejected', 
    stages: ['interest_declined', 'rejected', 'rejected_no_feedback', 'withdrawn'],
    color: 'bg-red-100 text-red-700',
    borderColor: 'bg-red-400'
  },
]
