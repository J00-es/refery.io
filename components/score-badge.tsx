import { cn } from '@/lib/utils'

interface ScoreBadgeProps {
  score: number
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
}

export function ScoreBadge({ score, size = 'md', showLabel = false }: ScoreBadgeProps) {
  const getColorClass = (score: number) => {
    if (score >= 80) return 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30'
    if (score >= 60) return 'bg-amber-500/15 text-amber-600 border-amber-500/30'
    return 'bg-red-500/15 text-red-600 border-red-500/30'
  }

  const getLabel = (score: number) => {
    if (score >= 80) return 'Excellent Match'
    if (score >= 60) return 'Good Match'
    return 'Low Match'
  }

  const sizeClasses = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-12 w-12 text-sm',
    lg: 'h-16 w-16 text-lg',
  }

  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          'flex items-center justify-center rounded-full border font-bold',
          sizeClasses[size],
          getColorClass(score)
        )}
      >
        {Math.round(score)}
      </div>
      {showLabel && (
        <span className={cn('text-sm font-medium', getColorClass(score).split(' ')[1])}>
          {getLabel(score)}
        </span>
      )}
    </div>
  )
}

interface ScoreBreakdownProps {
  scores: {
    skills_score?: number | null
    experience_score?: number | null
    keywords_score?: number | null
    location_score?: number | null
    salary_score?: number | null
  }
}

export function ScoreBreakdown({ scores }: ScoreBreakdownProps) {
  const items = [
    { label: 'Skills', score: scores.skills_score, weight: '30%' },
    { label: 'Experience', score: scores.experience_score, weight: '25%' },
    { label: 'Keywords', score: scores.keywords_score, weight: '20%' },
    { label: 'Location', score: scores.location_score, weight: '15%' },
    { label: 'Salary', score: scores.salary_score, weight: '10%' },
  ]

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.label} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {item.label} <span className="text-xs">({item.weight})</span>
            </span>
            <span className="font-medium text-foreground">
              {item.score != null ? Math.round(item.score) : '-'}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted">
            <div
              className={cn(
                'h-2 rounded-full transition-all',
                item.score != null && item.score >= 80 && 'bg-emerald-500',
                item.score != null && item.score >= 60 && item.score < 80 && 'bg-amber-500',
                item.score != null && item.score < 60 && 'bg-red-500',
                item.score == null && 'bg-muted'
              )}
              style={{ width: `${item.score ?? 0}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
